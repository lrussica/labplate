/**
 * LabPlate – Kernlogik /api/nutri-recipe (dependency-frei, testbar)
 * ==================================================================
 * PRODUKTIVE Quelle fuer Render: dieses File (labplate-backend/nutri-recipe-core.js).
 * Die Root-Datei ../nutri-recipe-core.js re-exportiert DIESES Modul – dort keine
 * eigenen Prompt-Regeln pflegen.
 *
 * Zwei getrennte KI-Modi (nicht vermischen!):
 *  1) STRUCTURED / Eigenrezept (looksStructured): Rezept-Coach – Inhalt fix,
 *     nur Struktur + Naehrwert-Anreicherung der genannten Zutaten.
 *  2) GENERATIV / Freisuche / Shopping: kreativ – Zutaten/Mengen duerfen
 *     vorgeschlagen und an Tagesziele angepasst werden.
 *
 * Strict JSON-Schema unveraendert (Feldnamen/API-Vertrag bleiben stabil).
 * temperature: 0, reasoning_effort: "low"
 *
 * Client-Vertrag (LabPlate_34_Cursor.html, validateNutriRecipeSchema):
 *   { title, servings:number, prep_time, nutrition_note,
 *     ingredients:[{ name, amount:number, unit:'g'|'ml', status:'benoetigt'|'vorhanden',
 *                    macrosPer100g:{ netCarbs, fat, protein, fiber } }],
 *     shopping_list:[string], steps:[string] }
 */

'use strict';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-120b';
const MAX_INGREDIENTS = 100;
const MAX_STEPS = 50;
const MAX_INSTRUCTION_LEN = 8000;
const MAX_LINE_LEN = 160;
const ING_FIELDS = ['name', 'amount', 'unit', 'status', 'netCarbs', 'fat', 'protein', 'fiber'];

// ---------------------------------------------------------------------------
// Sanitizing
// ---------------------------------------------------------------------------
function sanitizeLine(raw) {
  if (typeof raw !== 'string') return '';
  let t = raw.replace(/<[^>]*>/g, ' ');
  t = t.replace(/[\x00-\x1f\x7f]/g, ' ');
  t = t.replace(/[^\p{L}\p{N}\s,.\-/&()']/gu, '');
  t = t.replace(/\s+/g, ' ').trim();
  return t.slice(0, MAX_LINE_LEN);
}

function sanitizeText(raw, max) {
  if (typeof raw !== 'string') return '';
  let t = raw.replace(/<[^>]*>/g, ' ');
  t = t.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ' ');
  t = t.replace(/[ \t]+/g, ' ').trim();
  return t.slice(0, max || MAX_INSTRUCTION_LEN);
}

function ingKey(i) {
  return 'ing_' + String(i + 1).padStart(2, '0');
}

/**
 * Eigenrezept-Erkennung: Client sendet bei strukturierter Eingabe jede Zutat als
 * eigenen Array-Eintrag (>= 3) ODER einen Eintrag mit >= 3 Mengenangaben.
 */
function looksStructured(pantry) {
  if (!Array.isArray(pantry) || !pantry.length) return false;
  if (pantry.length >= 3) return true;
  const text = pantry.join('\n');
  const qty = text.match(/\d+(?:[.,]\d+)?\s*(?:g|ml|kg|l|el|tl)\b/gi);
  return Boolean(qty && qty.length >= 3);
}

// ---------------------------------------------------------------------------
// Payload-Validierung (Client -> Server)
// ---------------------------------------------------------------------------
function validateIncoming(body) {
  if (!body || typeof body !== 'object') return null;
  const mode = body.mode === 'pantry' ? 'pantry' : body.mode === 'shopping' ? 'shopping' : null;
  if (!mode) return null;

  const out = {
    mode,
    lang: typeof body.lang === 'string' && /^[a-z]{2}$/.test(body.lang) ? body.lang : 'de',
    macros: body.macros && typeof body.macros === 'object' ? body.macros : {},
    micronutrient_gaps: Array.isArray(body.micronutrient_gaps) ? body.micronutrient_gaps.slice(0, 20) : [],
    lab_guideline_constraints: body.lab_guideline_constraints && typeof body.lab_guideline_constraints === 'object'
      ? body.lab_guideline_constraints : null,
    ai_instruction: sanitizeText(body.ai_instruction, MAX_INSTRUCTION_LEN),
    allergens: Array.isArray(body.allergens) ? body.allergens.map((a) => sanitizeLine(a)).filter(Boolean).slice(0, 30) : [],
    pantry_ingredients: [],
  };

  if (mode === 'pantry') {
    const raw = Array.isArray(body.pantry_ingredients) ? body.pantry_ingredients : [];
    out.pantry_ingredients = raw.map(sanitizeLine).filter(Boolean).slice(0, MAX_INGREDIENTS);
    if (!out.pantry_ingredients.length) return null;
  }
  out.structured = mode === 'pantry' && looksStructured(out.pantry_ingredients);
  return out;
}

// ---------------------------------------------------------------------------
// Strict-Schemas
// ---------------------------------------------------------------------------
function ingredientObjectSchema(description, opts) {
  const strictAmounts = !!(opts && opts.strictAmounts);
  return {
    type: 'object',
    additionalProperties: false,
    required: ING_FIELDS.slice(),
    properties: {
      name: { type: 'string', description: description || 'Kurzname der Zutat' },
      amount: {
        type: 'number',
        description: strictAmounts
          ? 'Menge in g oder ml. Nur Nutzerangabe oder feste Umrechnungstabelle. Fehlt die Menge: 0 (= nicht angegeben). Keine freie Schaetzung.'
          : 'Menge in g oder ml (realistisch waehlbar; EL=15, TL=5, Stueckgewichte ok)',
      },
      unit: { type: 'string', enum: ['g', 'ml'] },
      status: { type: 'string', enum: ['benoetigt', 'vorhanden'] },
      netCarbs: { type: 'number', description: 'Netto-Kohlenhydrate je 100 g/ml' },
      fat: { type: 'number', description: 'Fett je 100 g/ml' },
      protein: { type: 'number', description: 'Protein je 100 g/ml' },
      fiber: { type: 'number', description: 'Ballaststoffe je 100 g/ml' },
    },
  };
}

function baseRecipeProperties() {
  return {
    title: { type: 'string' },
    servings: { type: 'number' },
    prep_time: { type: 'string' },
    nutrition_note: { type: 'string' },
    shopping_list: { type: 'array', items: { type: 'string' } },
    steps: { type: 'array', items: { type: 'string' } },
  };
}

/** Anreicherung: ingredients = Objekt mit einem Pflicht-Key pro Nutzer-Zutat. */
function buildEnrichmentSchema(lines) {
  const props = {};
  const required = [];
  lines.forEach((line, i) => {
    const k = ingKey(i);
    required.push(k);
    props[k] = ingredientObjectSchema('Zutat fuer Eingabe: "' + line + '"', { strictAmounts: true });
  });
  const properties = baseRecipeProperties();
  properties.ingredients = {
    type: 'object',
    additionalProperties: false,
    required,
    properties: props,
    description: 'Genau ' + lines.length + ' Zutaten. Jeder Key ist PFLICHT.',
  };
  return {
    name: 'nutri_recipe_enrichment',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'servings', 'prep_time', 'nutrition_note', 'ingredients', 'shopping_list', 'steps'],
      properties,
    },
  };
}

/** Generativ (Shopping / freie Idee): ingredients = Array. */
function buildGenerativeSchema() {
  const properties = baseRecipeProperties();
  properties.ingredients = { type: 'array', items: ingredientObjectSchema(undefined, { strictAmounts: false }) };
  return {
    name: 'nutri_recipe_generative',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'servings', 'prep_time', 'nutrition_note', 'ingredients', 'shopping_list', 'steps'],
      properties,
    },
  };
}

// ---------------------------------------------------------------------------
// Prompts – STRUCTURED vs. GENERATIV strikt getrennt
// ---------------------------------------------------------------------------
/** Feste Umrechnungstabelle (Eigenrezept): nur diese Umrechnungen, keine freie Schaetzung. */
const STRUCTURED_UNIT_TABLE =
  'Feste Umrechnungstabelle (nur wenn der Nutzer EL/TL/Stueck OHNE g/ml angibt): ' +
  '1 EL = 15 g/ml, 1 TL = 5 g/ml, 1 Zehe Knoblauch = 5 g, 1 Avocado = 200 g, 1/2 Salatgurke = 200 g, 1 Ei = 60 g. ' +
  'Steht bereits eine g/ml/kg/l-Menge im Input, diese Zahl unveraendert uebernehmen (kg/l nur in g/ml umrechnen).';

function buildEnrichmentMessages(p) {
  const lines = p.pantry_ingredients;
  const mapping = lines.map((line, i) => ingKey(i) + ' = "' + line + '"').join('\n');
  const system = [
    'MODUS: EIGENREZEPT / STRUCTURED – nicht kreativ.',
    'Du bist mein Rezept-Coach, der Rezepte klar strukturiert, ohne ihren Inhalt zu veraendern.',
    'FIXIERE DIESE DATEN: Zutaten, Mengen und Zubereitungsschritte aus dem Input sind verbindlich.',
    'AUFGABE: Strukturiere das Eigenrezept und berechne fuer JEDE uebergebene Zutat (Keys ing_01 … ing_' +
      String(lines.length).padStart(2, '0') +
      ') realistische Naehrwerte je 100 g/ml (netCarbs, fat, protein, fiber) NUR fuer die genannten Zutaten.',
    'VERBOTEN: Zutaten hinzufuegen oder entfernen; bereits angegebene Mengen aendern; Schritte umstellen/kuerzen/zusammenfassen; Ersatzprodukte erfinden; Zutaten als optional/wichtig einstufen; freie Mengenschaetzung.',
    'ERLAUBT: Namen stilistisch vereinheitlichen (kurz, ohne Mengenangabe im name-Feld); Inhalt der Schritte klarer formulieren, ohne Sinn zu aendern; Naehrwert-Anreicherung der tatsaechlich genannten Zutaten.',
    STRUCTURED_UNIT_TABLE,
    'Fehlt eine Menge und greift KEINE Tabellen-Regel eindeutig: amount = 0 (= nicht angegeben). Schema verlangt eine Zahl – kein null.',
    'Fluessigkeiten (Oel, Essig, Sosse, Bruehe, Dressing, Milch) in ml, sonst g. status: "benoetigt".',
    'steps: Wenn der Input/die Client-Instruction Schritte enthaelt: 1:1 in derselben Reihenfolge uebernehmen. Wenn keine Schritte vorliegen: steps = [] (nichts erfinden).',
    'shopping_list: eine Zeile pro Zutat "Name – Menge Einheit" (bei amount 0: "Name – nicht angegeben").',
    'title: aus Input falls vorhanden, sonst knapper passender Name ohne Fantasie-Zutaten. servings: aus Input, sonst 2. prep_time: aus Input oder "". nutrition_note: 1-2 sachliche Saetze zu den genannten Zutaten, keine medizinischen Aussagen, keine neuen Zutaten.',
    'Antworte auf ' + langName(p.lang) + '. Ausschliesslich JSON gemaess Schema – kein Begleittext.',
  ].join('\n');

  const user = [
    'ANZAHL ZUTATEN: ' + lines.length + ' (genau so viele Keys ing_XX sind zu fuellen – keine mehr, keine weniger)',
    'ZUTATEN-MAPPING (Key = Eingabezeile des Nutzers):',
    mapping,
    p.ai_instruction
      ? 'ZUSATZ-INSTRUCTION DES CLIENTS (Schritte/Portionen 1:1 beachten, Inhalt nicht aendern):\n' + p.ai_instruction
      : '',
    p.allergens.length
      ? 'ALLERGENE (nur Warnhinweis in nutrition_note, Zutaten NICHT entfernen oder ersetzen): ' + p.allergens.join(', ')
      : '',
    'Fuelle jetzt fuer jeden Key ing_01 … ing_' + String(lines.length).padStart(2, '0') + ' ein Objekt aus.',
  ].filter(Boolean).join('\n\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

function buildGenerativeMessages(p) {
  const system = [
    'MODUS: GENERATIV / FREISUCHE / SHOPPING – bewusst kreativ (NICHT Eigenrezept-Modus).',
    'Du bist ein kreativer Rezept-Coach in einer Ernaehrungs-App. Erstelle EINE alltagstaugliche Rezeptidee als JSON gemaess Schema.',
    'ERLAUBT: Zutaten vorschlagen, Mengen waehlen und an Tagesziele/Leitlinien anpassen, Schritte neu formulieren.',
    'Jede Zutat: name, amount (Zahl > 0), unit (g|ml), status (vorhanden|benoetigt), netCarbs/fat/protein/fiber je 100 g/ml.',
    'steps: 4-8 kurze Schritte. shopping_list: benoetigte Zutaten als "Name – Menge Einheit".',
    'Keine medizinischen Diagnosen oder Heilversprechen. Antworte auf ' + langName(p.lang) + '. Nur JSON.',
  ].join('\n');
  const user = [
    'Modus: ' + (p.mode === 'pantry' ? 'Rezept mit vorhandenen Zutaten / Suchbegriff' : 'Rezeptidee mit Einkaufsliste'),
    p.pantry_ingredients.length ? 'Vorhandene Zutaten / Suchbegriff: ' + p.pantry_ingredients.join(', ') : '',
    'Aggregierte Tages-Makrowerte (Wert / Ziel): ' + JSON.stringify(p.macros),
    p.micronutrient_gaps.length ? 'Mikronaehrstoffe unter 70% des Tagesziels: ' + JSON.stringify(p.micronutrient_gaps) : '',
    p.lab_guideline_constraints ? 'Leitlinien-Vorgaben: ' + JSON.stringify(p.lab_guideline_constraints) : '',
    p.ai_instruction ? 'Zusatz-Instruction (darf Mengen/Zutaten an Tagesziele anpassen): ' + p.ai_instruction : '',
    p.allergens.length ? 'Allergene strikt meiden: ' + p.allergens.join(', ') : '',
    'Erstelle jetzt das JSON-Objekt.',
  ].filter(Boolean).join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

function langName(code) {
  return { de: 'Deutsch', en: 'Englisch', es: 'Spanisch', it: 'Italienisch', pt: 'Portugiesisch', fr: 'Franzoesisch', tr: 'Tuerkisch' }[code] || 'Deutsch';
}

// ---------------------------------------------------------------------------
// Groq-Request-Body
// ---------------------------------------------------------------------------
function buildGroqRequest(p, model) {
  const structured = p.structured;
  return {
    model: model || DEFAULT_MODEL,
    temperature: 0,
    reasoning_effort: 'low',
    max_tokens: 8192,
    response_format: {
      type: 'json_schema',
      json_schema: structured ? buildEnrichmentSchema(p.pantry_ingredients) : buildGenerativeSchema(),
    },
    messages: structured ? buildEnrichmentMessages(p) : buildGenerativeMessages(p),
  };
}

// ---------------------------------------------------------------------------
// Antwort -> Client-Vertrag
// ---------------------------------------------------------------------------
function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeIng(item, fallbackName, opts) {
  const src = item && typeof item === 'object' ? item : {};
  const m = src.macrosPer100g && typeof src.macrosPer100g === 'object' ? src.macrosPer100g : src;
  const amount = num(src.amount, 0);
  // STRUCTURED: amount 0 = "nicht angegeben" (KI soll fehlende Mengen nicht erfinden).
  // GENERATIV: fehlende/ungueltige Menge weiterhin auf 1 setzen, damit Rezeptideen nutzbar bleiben.
  const preserveMissing = !!(opts && opts.preserveMissingAmount);
  const normalizedAmount = amount > 0
    ? Math.round(amount * 10) / 10
    : (preserveMissing ? 0 : 1);
  return {
    name: (typeof src.name === 'string' && src.name.trim()) ? src.name.trim().slice(0, 200) : (fallbackName || 'Zutat'),
    amount: normalizedAmount,
    unit: src.unit === 'ml' ? 'ml' : 'g',
    status: src.status === 'vorhanden' ? 'vorhanden' : 'benoetigt',
    macrosPer100g: {
      netCarbs: Math.max(0, num(m.netCarbs, 0)),
      fat: Math.max(0, num(m.fat, 0)),
      protein: Math.max(0, num(m.protein, 0)),
      fiber: Math.max(0, num(m.fiber, 0)),
    },
  };
}

function formatClientAmountLine(ing) {
  const name = ing && ing.name ? String(ing.name) : 'Zutat';
  const amount = ing && Number(ing.amount);
  if (!Number.isFinite(amount) || amount <= 0) return name + ' – nicht angegeben';
  const unit = ing.unit === 'ml' ? 'ml' : 'g';
  return name + ' – ' + amount + ' ' + unit;
}

function stripQty(line) {
  return String(line || '').replace(/^\s*[\d.,/½¼¾-]+\s*(g|gr|kg|ml|l|el|tl|zehen?|stueck|stk|prise|bund)?\.?\s*/i, '').trim() || line;
}

function toClientRecipe(parsed, p) {
  if (!parsed || typeof parsed !== 'object') return null;
  let ingredients;
  if (p.structured) {
    const obj = parsed.ingredients && typeof parsed.ingredients === 'object' && !Array.isArray(parsed.ingredients)
      ? parsed.ingredients : {};
    ingredients = p.pantry_ingredients.map((line, i) =>
      normalizeIng(obj[ingKey(i)], stripQty(line), { preserveMissingAmount: true }));
  } else {
    ingredients = (Array.isArray(parsed.ingredients) ? parsed.ingredients : [])
      .map((it) => normalizeIng(it, undefined, { preserveMissingAmount: false }))
      .slice(0, MAX_INGREDIENTS);
  }
  if (!ingredients.length) return null;

  let shopping = Array.isArray(parsed.shopping_list) ? parsed.shopping_list.map((s) => String(s || '')).filter(Boolean) : [];
  if (shopping.length < ingredients.length) {
    shopping = ingredients.map(formatClientAmountLine);
  }
  const steps = (Array.isArray(parsed.steps) ? parsed.steps : []).map((s) => String(s || '').trim()).filter(Boolean).slice(0, MAX_STEPS);
  const servings = num(parsed.servings, 0);
  return {
    title: (typeof parsed.title === 'string' && parsed.title.trim()) ? parsed.title.trim().slice(0, 200) : 'Rezept',
    servings: servings > 0 ? servings : 2,
    prep_time: typeof parsed.prep_time === 'string' ? parsed.prep_time.slice(0, 60) : '',
    nutrition_note: typeof parsed.nutrition_note === 'string' ? parsed.nutrition_note.slice(0, 600) : '',
    ingredients,
    shopping_list: shopping.slice(0, MAX_INGREDIENTS),
    steps,
  };
}

// ---------------------------------------------------------------------------
// Groq-Call (fetchImpl injizierbar fuer Tests)
// ---------------------------------------------------------------------------
async function callGroq(requestBody, opts) {
  const o = opts || {};
  const fetchImpl = o.fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), o.timeoutMs || 55000);
  try {
    const res = await fetchImpl(GROQ_API_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + o.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) return { error: 'provider_error', status: res.status, body: text.slice(0, 400) };
    let data;
    try { data = JSON.parse(text); } catch (e) { return { error: 'provider_error', status: 502, body: 'invalid provider json' }; }
    const content = data && data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : null;
    if (typeof content !== 'string' || !content.trim()) return { error: 'empty_response' };
    try { return { data: JSON.parse(content) }; } catch (e) { return { error: 'json_parse_failed', body: content.slice(0, 200) }; }
  } catch (err) {
    return { error: 'request_failed', reason: err && err.name ? err.name : 'unknown' };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  GROQ_API_URL,
  DEFAULT_MODEL,
  MAX_INGREDIENTS,
  validateIncoming,
  looksStructured,
  buildEnrichmentSchema,
  buildGenerativeSchema,
  buildEnrichmentMessages,
  buildGenerativeMessages,
  buildGroqRequest,
  toClientRecipe,
  callGroq,
  ingKey,
};
