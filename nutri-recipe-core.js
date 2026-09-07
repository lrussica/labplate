/**
 * LabPlate – Kernlogik /api/nutri-recipe (dependency-frei, testbar)
 * ==================================================================
 * FIX Zutaten-Vollstaendigkeit:
 *  - Modell openai/gpt-oss-120b (statt 20b)
 *  - Strict JSON-Schema (json_schema, strict:true) mit DYNAMISCHEN Pflicht-Keys:
 *    jede Nutzer-Zutat = eigener required-Key (ing_01 … ing_N). Constrained Decoding
 *    kann dadurch keinen Eintrag weglassen.
 *  - Aufgabe als ANREICHERUNG formuliert ("fuer jede Zutat berechne Naehrwerte"),
 *    nicht als freie Rezept-Generierung.
 *  - temperature: 0, reasoning_effort: "low"
 *
 * Client-Vertrag (LabPlate_34_Cursor.html, validateNutriRecipeSchema):
 *   { title, servings:number, prep_time, nutrition_note,
 *     ingredients:[{ name, amount:number, unit:'g'|'ml', status:'benoetigt'|'vorhanden',
 *                    macrosPer100g:{ netCarbs, fat, protein, fiber } }],
 *     shopping_list:[string], steps:[string] }
 */
'use strict';
const express = require('express');
const router = express.Router();

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-120b';
const MAX_INGREDIENTS = 100;
const MAX_STEPS = 50;
const MAX_INSTRUCTION_LEN = 8000;
const MAX_LINE_LEN = 160;
const ING_FIELDS = ['name', 'amount', 'unit', 'status', 'netCarbs', 'fat', 'protein', 'fiber'];

// ---------------------------------------------------------------------------
// Hilfsfunktionen (Sanitizing)
// ---------------------------------------------------------------------------
function sanitizeLine(raw) {
  if (typeof raw !== 'string') return '';
  let t = raw.replace(/<[^>]*>/g, ' ');
  t = t.replace(/[\x00-\x1f\x7f]/g, ' ');
  t = t.replace(/[^\p{L}\p{N}\s,.\-/&()]/gu, '');
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

function looksStructured(pantry) {
  if (!Array.isArray(pantry) || !pantry.length) return false;
  if (pantry.length >= 3) return true;
  const text = pantry.join('\n');
  const qty = text.match(/\d+(?:[.,]\d+)?\s*(?:g|ml|kg|l|el|tl)\b/gi);
  return Boolean(qty && qty.length >= 3);
}

function langName(lang) {
  return lang === 'de' ? 'Deutsch' : 'Englisch';
}

// ---------------------------------------------------------------------------
// Validierung des eingehenden Payloads
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
// JSON‑Schemas (strict)
// ---------------------------------------------------------------------------
function ingredientObjectSchema(description) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ING_FIELDS.slice(),
    properties: {
      name: { type: 'string', description: description || 'Kurzname der Zutat' },
      amount: { type: 'number', description: 'Menge in g oder ml (EL=15, TL=5, Zehe=5 g, Stueck realistisch in g)' },
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

function buildEnrichmentSchema(lines) {
  const props = {};
  const required = [];
  lines.forEach((line, i) => {
    const k = ingKey(i);
    required.push(k);
    props[k] = ingredientObjectSchema('Zutat fuer Eingabe: "' + line + '"');
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

function buildGenerativeSchema() {
  const properties = baseRecipeProperties();
  properties.ingredients = { type: 'array', items: ingredientObjectSchema() };
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
// Prompts
// ---------------------------------------------------------------------------
function buildEnrichmentMessages(p) {
  const lines = p.pantry_ingredients;
  const mapping = lines.map((line, i) => ingKey(i) + ' = "' + line + '"').join('\n');
  const system = [
    'Du bist ein Naehrwert-Anreicherungsdienst in einer Ernaehrungs-App. Du bist KEIN Rezept-Generator.',
    'AUFGABE: Fuer JEDE uebergebene Zutat (Keys ing_01 … ing_' + String(lines.length).padStart(2, '0') + ') berechne realistische Naehrwerte je 100 g/ml (netCarbs, fat, protein, fiber) und normalisiere die Menge auf g oder ml.',
    'Du darfst KEINE Zutat weglassen, KEINE hinzufuegen, KEINE Mengen aendern, die im Input stehen. Fehlt eine Menge, schaetze realistisch.',
    'Umrechnung: 1 EL = 15 g/ml, 1 TL = 5 g/ml, 1 Zehe Knoblauch = 5 g, 1 Avocado = 200 g, 1/2 Salatgurke = 200 g, 1 Ei = 60 g.',
    'Fluessigkeiten (Oel, Essig, Soße, Bruehe, Dressing, Milch) in ml, alles andere in g. status: "benoetigt".',
    'name: kurzer, sauberer Zutatenname ohne Mengenangabe.',
    'steps: Falls im Input Zubereitungsschritte enthalten sind, 1:1 uebernehmen (kein Kuerzen, kein Zusammenfassen). Sonst 4-8 kurze Schritte nur aus den gegebenen Zutaten.',
    'shopping_list: eine Zeile pro Zutat im Format "Name – Menge Einheit".',
    'title: passender Rezeptname. servings: aus Input, sonst 2. prep_time: z.B. "25 Min.". nutrition_note: 1-2 sachliche Saetze, keine medizinischen Aussagen.',
    'Antworte auf ' + langName(p.lang) + '. Antworte ausschliesslich mit dem JSON-Objekt gemaess Schema.',
  ].join('\n');

  const user = [
    'ANZAHL ZUTATEN: ' + lines.length + ' (genau so viele Keys ing_XX sind zu fuellen)',
    'ZUTATEN-LISTE:',
    mapping,
    '',
    'Gib jetzt das vollstaendige JSON-Objekt mit allen Pflichtfeldern zurueck.'
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
}

function buildGenerativeMessages(p) {
  const system = [
    'Du bist ein kreativer Koch-Assistent. Erstelle ein Rezept basierend auf den vorhandenen Zutaten oder Einkaufswünschen.',
    'Gib realistische Nährwerte pro 100 g/ml an. Verwende das vorgegebene JSON‑Schema.',
    'Antworte auf ' + langName(p.lang) + '. Kein zusätzlicher Text, nur das JSON-Objekt.'
  ].join('\n');
  const user = [
    'Mode: ' + p.mode,
    'Verfügbare Zutaten / Wünsche:',
    p.pantry_ingredients.join(', ') || 'Keine spezifischen Angaben',
    p.ai_instruction ? 'Zusätzliche Anweisung: ' + p.ai_instruction : '',
    'Erstelle ein vollständiges Rezept (Titel, Portionen, Zeit, Nährwert‑Hinweis, Zutatenliste mit Nährwerten, Einkaufsliste, Schritte).'
  ].filter(Boolean).join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
}

// ---------------------------------------------------------------------------
// Hauptfunktion: Aufruf der Groq‑API
// ---------------------------------------------------------------------------
async function callGroq(messages, schema, apiKey) {
  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || DEFAULT_MODEL,
      messages,
      temperature: 0,
      response_format: {
        type: 'json_schema',
        json_schema: schema
      }
    })
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error('Groq API error: ' + response.status + ' ' + errText);
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Leere Antwort von Groq');
  return JSON.parse(content);
}

// ---------------------------------------------------------------------------
// Express‑Route
// ---------------------------------------------------------------------------
router.post('/api/nutri-recipe', async (req, res) => {
  try {
    const validated = validateIncoming(req.body);
    if (!validated) {
      return res.status(400).json({ error: 'Ungültige Eingabe' });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GROQ_API_KEY fehlt' });
    }

    let messages, schema;
    if (validated.mode === 'pantry' && validated.structured) {
      messages = buildEnrichmentMessages(validated);
      schema = buildEnrichmentSchema(validated.pantry_ingredients);
    } else {
      messages = buildGenerativeMessages(validated);
      schema = buildGenerativeSchema();
    }

    const result = await callGroq(messages, schema, apiKey);
    res.json(result);
  } catch (err) {
    console.error('Fehler in /api/nutri-recipe:', err);
    res.status(500).json({ error: 'Interner Serverfehler', detail: err.message });
  }
});

module.exports = router;