/**
 * LabPlate – Kernlogik /api/nutri-recipe (dependency-frei, testbar)
 * ==================================================================
 * PRODUKTIVE Quelle fuer Render: dieses File (labplate-backend/nutri-recipe-core.js).
 * Die Root-Datei ../nutri-recipe-core.js re-exportiert DIESES Modul – dort keine
 * eigenen Prompt-Regeln pflegen.
 *
 * Zwei getrennte KI-Modi (nicht vermischen!):
 *  1) STRUCTURED / Eigenrezept (looksStructured): reiner Passthrough –
 *     title, servings (0 wenn nicht im Text), Zutaten + Schritte 1:1.
 *     KEINE Makros (App: lookupNutriMacrosPer100g + Portions-Stepper).
 *  2) GENERATIV / Freisuche / Shopping: kreativ – Zutaten/Mengen duerfen
 *     vorgeschlagen und an Tagesziele angepasst werden (Chef-Framework).
 *
 * Generativ: temperature 0.85 (Variation); Eigenrezept/structured: temperature 0.
 * reasoning_effort: "low"
 *
 * Client-Vertrag (LabPlate_34_Cursor.html, validateNutriRecipeSchema):
 *   { title, servings:number, prep_time, nutrition_note, garnish?,
 *     ingredients:[{ name, amount:number, unit:'g'|'ml', status:'benoetigt'|'vorhanden',
 *                    macrosPer100g:{ netCarbs, fat, protein, fiber } }],
 *     shopping_list:[string], steps:[string] }
 * Generativ intern: v9.2 JSON (Platzhalter) → renderRecipeForDisplay → Client-Vertrag.
 * garnish: nur GENERATIV; STRUCTURED immer "". self_check entfernt (v9.2).
 */

'use strict';

const strictPrompt = require('./strict-prompt');
const recipePipeline = require('./recipe-pipeline-v92');
const recipeValidator = require('./recipe-validator');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-120b';
const MAX_INGREDIENTS = 100;
const MAX_STEPS = 50;
const MAX_INSTRUCTION_LEN = 8000;
const MAX_LINE_LEN = 160;
const TEAM_HANDOFF_BRIEF_MAX = 400;
const HANDOFF_SENTINEL_TITLE = '__TEAM_HANDOFF_COACH__';
const ING_FIELDS = ['name', 'amount', 'unit', 'status', 'netCarbs', 'fat', 'protein', 'fiber'];
const STRUCTURED_UNIT_TABLE = strictPrompt.STRUCTURED_UNIT_TABLE;

/**
 * Chef-Framework v9.2 – Struktur-Zwang: Mengen nur als {ingredient_id}-Platzhalter (nur GENERATIV).
 * Self-Check-Freitext ENTFERNT. Validierung: recipe-validator.validateRecipeV2 (deterministisch).
 * Eigenrezept/STRUCTURED und Originalmodus: NICHT einbinden.
 * Docs: docs/Chef-KI-System-Prompt-v9.2.md
 */
const CHEF_FRAMEWORK_RULES = [
  'CHEF-FRAMEWORK v9.2 (verbindlich – Struktur-Zwang, KEIN Self-Check-Freitext):',
  'Rolle: System-Chefkoch + Ernaehrungs-Wissenschaftler. Food-Pairing, Sensorik, molekulare Hitzebestaendigkeit, exakte Naehrwert-Mathematik.',
  'WARUM: Fruehere Self-Check-Bloecke halluzinierten Zahlen. Jetzt existiert jede Zahl genau EINMAL (nutrition / ingredients.amount). content/garnish/chef_analysis nur {0001}-Platzhalter – keine freien g/ml/kcal.',
  'REGEL 0 / 0a — BOTTOM-UP, kein Zielwert-Rueckwaertsdenken. Ziel verfehlt → target_deviation_note ehrlich, Zahlen nicht erfinden.',
  '1) Naehrwert-Verbindlichkeit: chef_analysis ohne eigene Zahlen; siehe nutrition.',
  '2) GERINNUNGSSCHUTZ: Quark/Joghurt/Huettenkaese/Creme fraiche/Frischkaese/Mascarpone/Schmand/Kokosjoghurt → stove_level 0 beim Einruehren, Herd vorher AUS.',
  '3) Mengen nur {ingredient_id} in content/garnish – nie "15 ml Olivenoel" als Freitext.',
  '4) MAXIMUM 2 protein_source:true (PROTEIN-HARMONIE / kein Zutaten-Salat). ' +
  'VERBOTEN: Haehnchen + Tofu + Ei gleichzeitig (3 Proteinquellen), auch wenn eine davon ' +
  'protein_source:false gesetzt wird — das Flag aendert nichts an der tatsaechlichen ' +
  'Zusammensetzung des Gerichts. Waehle stattdessen NUR 2 der 3 Zutaten aus und erhoehe ' +
  'die Menge der gewaehlten Hauptzutat, um das Proteinziel zu erreichen ' +
  '(z. B. 220g Haehnchen + 1 Ei statt 150g Haehnchen + 100g Tofu + 2 Eier). ' +
  'Jede Zutat mit protein_source:true UND jede Zutat, die de facto eine Proteinquelle ' +
  'ist (Fleisch, Fisch, Ei, Tofu, Huelsenfruechte, Milchprodukte mit >10g Protein/100g), ' +
  'zaehlt in die 2er-Grenze — unabhaengig vom gesetzten Flag.',
  '5) DIÄT- & KETO-EHRLEICHKEIT: diet_labels keto nur bei netto_kh_g <10; high_protein nur ab protein_g ≥25; vegan ohne Ei/Milch.',
  '6) Eier: unit "stk", amount Stueckzahl, name "Ei (Groesse M, ca. 60 g)". Inhalt nur via {id}.',
  '7) VOLLSTAENDIGKEIT: jede {id} in steps/garnish existiert in ingredients; jede Zutat mind. 1x referenziert. Auch Fluessigkeiten (Wasser).',
  '8) HERD-STUFEN: stove_level 1-9 nur bei Hitze; kalt = 0. Mise en Place zuerst; Zeit + Sensorik.',
  '9) GEWUERZE: unit prise|messerspitze, amount 0 – nie unit g fuer Salz/Pfeffer (ABSOLUTES GRAMM-VERBOT).',
  '10) Kalorien-Plausibilitaet: kcal ≈ Protein×4 + Netto-KH×4 + Fett×9 + Ballaststoffe×2 (±10 %).',
  '11) Zeit-Realismus: prep_time_min ≈ Summe steps[].time_min.',
  '12–16) Einheiten/Allergene/Skalierung/Grenzfaelle/Rundung (kcal 5er, Gramm ganz).',
  '17) TEXTUR & FOOD PAIRING: mind. 3 Texturen (cremig + bissfest + crunchy); garnish Pflicht; herzhaft Saeure.',
  '18) BEZEICHNUNGS-KONSISTENZ / Namensgleichheit. garnish + chef_analysis Pflicht.',
  '19) KEIN [SELF-CHECK]-Block. Backend validiert deterministisch (validateRecipeV2).',
  '20) NEGATIV-VERBOT: freie Mengen in content; eigene g/kcal in chef_analysis; ungelistete garnish-Zutaten; >2 protein_source.',
].join('\n');

/** @deprecated Alias – gleicher Inhalt wie CHEF_FRAMEWORK_RULES (Export-Kompatibilitaet). */
const CULINARY_KITCHEN_RULES = CHEF_FRAMEWORK_RULES;

// Phase 2 KI-Team: emotionale Blockade (Koch → Coach). String-Matches + LLM-Sentinel.
const EMOTIONAL_BLOCKADE_PATTERNS = [
  // Resignation
  { kind: 'resignation', re: /schaff(e)?\s+ich\s+((eh|sowieso)\s+)?nicht/i },
  { kind: 'resignation', re: /bringt\s+(mir\s+)?nichts/i },
  { kind: 'resignation', re: /lohnt\s+sich\s+nicht/i },
  { kind: 'resignation', re: /hat\s+(eh|sowieso)\s+keinen\s+sinn/i },
  { kind: 'resignation', re: /\bi\s+can'?t\s+(do\s+)?(this|it)\b/i },
  { kind: 'resignation', re: /\bwhat'?s\s+the\s+point\b/i },
  { kind: 'resignation', re: /\bnot\s+worth\s+it\b/i },
  // Überforderung
  { kind: 'overwhelmed', re: /zu\s+kompliziert/i },
  { kind: 'overwhelmed', re: /keine\s+zeit/i },
  { kind: 'overwhelmed', re: /zu\s+viel\s+aufwand/i },
  { kind: 'overwhelmed', re: /überforder|ueberforder/i },
  { kind: 'overwhelmed', re: /\btoo\s+complicated\b/i },
  { kind: 'overwhelmed', re: /\bno\s+time\b/i },
  { kind: 'overwhelmed', re: /\btoo\s+much\s+(effort|work)\b/i },
  // Frust
  { kind: 'frustration', re: /schon\s+wieder\s+kein\s+rezept/i },
  { kind: 'frustration', re: /\bnervt\b/i },
  { kind: 'frustration', re: /immer\s+das\s+gleiche/i },
  { kind: 'frustration', re: /\bfrustrating\b|\bthis\s+sucks\b/i },
  { kind: 'frustration', re: /\balways\s+the\s+same\b/i },
  // Emotion
  { kind: 'emotion', re: /f[üu]hl(e)?\s+mich\s+schlecht/i },
  { kind: 'emotion', re: /bin\s+enttäuscht|bin\s+enttaeuscht/i },
  { kind: 'emotion', re: /(hab(e)?\s+)?keine\s+energie/i },
  { kind: 'emotion', re: /\bfeel(ing)?\s+(bad|awful|down)\b/i },
  { kind: 'emotion', re: /\bi'?m\s+disappointed\b/i },
  { kind: 'emotion', re: /\bno\s+energy\b/i },
];

function truncateTeamBrief(text, maxLen) {
  let s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  const cap = (typeof maxLen === 'number' && maxLen > 0) ? maxLen : TEAM_HANDOFF_BRIEF_MAX;
  if (s.length <= cap) return s;
  return s.slice(0, cap).trim();
}

/**
 * Erkennt Resignation / Überforderung / Frust / Emotion im Nutzertext.
 * @returns {{ kind: string, match: string } | null}
 */
function detectEmotionalBlockade(text) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return null;
  for (let i = 0; i < EMOTIONAL_BLOCKADE_PATTERNS.length; i++) {
    const p = EMOTIONAL_BLOCKADE_PATTERNS[i];
    const m = raw.match(p.re);
    if (m) return { kind: p.kind, match: String(m[0] || '').slice(0, 80) };
  }
  return null;
}

function buildCoachHandoffPayload(userText, detected) {
  const quote = truncateTeamBrief((detected && detected.match) || String(userText || '').slice(0, 60), 80);
  const kind = (detected && detected.kind) || 'emotion';
  const label = kind === 'resignation' ? 'resigniert'
    : kind === 'overwhelmed' ? 'überfordert'
      : kind === 'frustration' ? 'frustriert'
        : 'emotional belastet';
  const brief = truncateTeamBrief(
    'Nutzer ' + label + ': \'' + quote + '\'. Rezept abgelehnt / emotionale Blockade.',
    TEAM_HANDOFF_BRIEF_MAX
  );
  return {
    handoff: {
      from: 'koch',
      to: 'coach',
      reason: 'emotionale_blockade',
      brief: brief,
      suggestedPrefill: truncateTeamBrief(userText, 200),
    },
  };
}

/**
 * Früher String-Match-Handoff (kein Groq). Structured/Eigenrezept: nie.
 * team_ai: Default an; false/'0' = aus.
 */
function tryEmotionalHandoffEarly(payload) {
  if (!payload || payload.structured) return null;
  if (payload.team_ai === false) return null;
  const text = Array.isArray(payload.pantry_ingredients)
    ? payload.pantry_ingredients.join(' ')
    : '';
  const detected = detectEmotionalBlockade(text);
  if (!detected) return null;
  return buildCoachHandoffPayload(text, detected);
}

/**
 * LLM-Sentinel: title === __TEAM_HANDOFF_COACH__ → Handoff statt Rezept.
 */
function extractHandoffFromParsed(parsed, userText) {
  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.handoff && typeof parsed.handoff === 'object') {
    const to = String(parsed.handoff.to || '').toLowerCase();
    if (to === 'coach') {
      return buildCoachHandoffPayload(
        userText || parsed.handoff.brief || '',
        { kind: 'emotion', match: truncateTeamBrief(parsed.handoff.brief || userText || '', 80) }
      ).handoff;
    }
  }
  const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
  if (title !== HANDOFF_SENTINEL_TITLE) return null;
  const note = typeof parsed.nutrition_note === 'string' ? parsed.nutrition_note.trim()
    : (typeof parsed.chef_analysis === 'string' ? parsed.chef_analysis.trim() : '');
  const brief = truncateTeamBrief(note || ('Nutzer emotional blockiert. Rezept abgelehnt. Kontext: ' + String(userText || '')), TEAM_HANDOFF_BRIEF_MAX);
  return {
    from: 'koch',
    to: 'coach',
    reason: 'emotionale_blockade',
    brief: brief,
    suggestedPrefill: truncateTeamBrief(userText, 200),
  };
}

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
  return strictPrompt.ingKey(i);
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

  const teamAiRaw = body.team_ai;
  const team_ai = !(teamAiRaw === false || teamAiRaw === 0 || teamAiRaw === '0' || teamAiRaw === 'false');

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
    team_ai,
    theme: null,
    handoff_brief: null,
  };

  // Supplement→Koch: strukturierter Themen-Brief { theme, source }
  if (body.handoff_brief && typeof body.handoff_brief === 'object' && !Array.isArray(body.handoff_brief)) {
    const t = String(body.handoff_brief.theme || '').toLowerCase().trim();
    const s = String(body.handoff_brief.source || '').toLowerCase().trim();
    out.handoff_brief = {
      theme: t || null,
      source: s || null,
    };
    if (t) out.theme = t;
  }
  if (typeof body.theme === 'string' && body.theme.trim()) {
    out.theme = body.theme.toLowerCase().trim();
  }

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
          : 'Menge in g oder ml. Stueck/EL/TL vorher umrechnen. Gewuerze (Salz/Pfeffer/Schaerfe): amount=0 mit Name "1 Prise"/"nach Geschmack". Sonst Zahl > 0.',
      },
      unit: {
        type: 'string',
        enum: ['g', 'ml'],
        description: 'NUR "g" oder "ml". Keine anderen Einheiten.',
      },
      status: { type: 'string', enum: ['benoetigt', 'vorhanden'] },
      netCarbs: { type: 'number', description: strictAmounts ? 'Immer 0 – Makros berechnet die App, nicht die KI' : 'Netto-KH-Referenzwert je 100 g/ml' },
      fat: { type: 'number', description: strictAmounts ? 'Immer 0 – Makros berechnet die App, nicht die KI' : 'Fett-Referenzwert je 100 g/ml' },
      protein: { type: 'number', description: strictAmounts ? 'Immer 0 – Makros berechnet die App, nicht die KI' : 'Protein-Referenzwert je 100 g/ml' },
      fiber: { type: 'number', description: strictAmounts ? 'Immer 0 – Makros berechnet die App, nicht die KI' : 'Ballaststoff-Referenzwert je 100 g/ml' },
    },
  };
}

function baseRecipeProperties(opts) {
  const structured = !!(opts && opts.structured);
  return {
    title: { type: 'string', description: structured ? 'Titel aus Input oder knapper Name' : undefined },
    servings: {
      type: 'number',
      description: structured
        ? 'Personen/Portionen aus dem Text, sonst 0 (= nicht angegeben, leer lassen)'
        : undefined,
    },
    prep_time: { type: 'string', description: structured ? 'Immer leerer String ""' : undefined },
    nutrition_note: {
      type: 'string',
      description: structured
        ? 'Immer leerer String ""'
        : 'Chef-Analyse: 2–3 Saetze Food-Pairing/Textur/Physiologie; Zahlen 1:1 aus Bottom-Up-Tabelle. Nie leer.',
    },
    garnish: {
      type: 'string',
      description: structured
        ? 'Immer leerer String ""'
        : 'Garnitur/Topping fuer Textur und Anrichten (z.B. gerostete Nuesse, Kraeuter, Kakaonibs). Nie leer.',
    },
    self_check: {
      type: 'string',
      description: structured
        ? 'Immer leerer String ""'
        : 'KOPIER-Pruefung (Anti-Halluzination): Zahlen wortwoertlich aus Tabelle+ingredients. Zeilen: Kalorien (Tabelle), Mengen-Abgleich Text↔Liste, Vollstaendigkeit (inkl. garnish), Proteinquellen, Herd AUS, Numerus Ei, Diät-Label, Zeit-Summe. Nie leer.',
    },
    shopping_list: { type: 'array', items: { type: 'string' }, description: structured ? 'Immer [] – App baut die Liste' : undefined },
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
  const properties = baseRecipeProperties({ structured: true });
  properties.ingredients = {
    type: 'object',
    additionalProperties: false,
    required,
    properties: props,
    description: 'Genau ' + lines.length + ' Zutaten. Jeder Key ist PFLICHT. Makros immer 0.',
  };
  return {
    name: 'nutri_recipe_enrichment',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'servings', 'prep_time', 'nutrition_note', 'garnish', 'ingredients', 'shopping_list', 'steps'],
      properties,
    },
  };
}

/** Generativ (Shopping / freie Idee): v9.2 JSON-Schema mit Platzhaltern. */
function buildGenerativeSchema() {
  return recipePipeline.buildV92GenerativeSchema();
}

// ---------------------------------------------------------------------------
// Prompts – STRUCTURED nutzt zentrale strict-prompt.js Utility
// ---------------------------------------------------------------------------

function buildEnrichmentMessages(p) {
  const lines = p.pantry_ingredients;
  const system = strictPrompt.loadStrictPrompt({
    lang: p.lang,
    ingredientCount: lines.length,
  });
  const user = strictPrompt.buildStrictUserPrompt(p);
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/**
 * Themenbasierte Rezepte (Supplement-Brief → passende Lebensmittel).
 * Keine medizinischen Aussagen – nur alltagstaugliche Zutatenlisten.
 */
const NUTRIENT_THEME_FOODS = [
  {
    key: 'eisen',
    label: 'Eisen',
    re: /\beisen\b|\biron\b|eisenmangel|eisenreich/i,
    foods: ['Linsen', 'Spinat', 'Kichererbsen', 'Haferflocken', 'Rote Bete', 'Sesam', 'Kürbiskerne'],
  },
  {
    key: 'vitamin_d',
    label: 'Vitamin D',
    re: /vitamin\s*-?\s*d\b|\bvit\.?\s*d\b/i,
    foods: ['Fetter Fisch', 'Eier', 'Angereicherte Lebensmittel', 'Tageslicht'],
  },
  {
    key: 'vitamin_e',
    label: 'Vitamin E',
    re: /vitamin\s*-?\s*e\b|\bvit\.?\s*e\b|tocopherol/i,
    foods: ['Nüsse', 'Samen', 'Pflanzenöle', 'Avocado'],
  },
  {
    key: 'vitamin_b12',
    label: 'Vitamin B12',
    re: /vitamin\s*-?\s*b\s*12\b|\bb12\b|cobalamin/i,
    foods: ['Eier', 'Milchprodukte', 'Fisch', 'Angereicherte Pflanzenmilch'],
  },
  {
    key: 'folat',
    label: 'Folat (B9)',
    re: /\bfolat\b|\bfolsäure\b|\bfolsaeure\b|vitamin\s*-?\s*b\s*9\b|\bb9\b/i,
    foods: ['Grünes Blattgemüse', 'Hülsenfrüchte', 'Vollkorn', 'Spargel'],
  },
  {
    key: 'vitamin_k2',
    label: 'Vitamin K2',
    re: /vitamin\s*-?\s*k\s*2\b|\bk2\b|menachinon/i,
    foods: ['Fermentierte Lebensmittel', 'Käse', 'Eier', 'Fleisch in Maßen'],
  },
  {
    key: 'vitamin_b6',
    label: 'Vitamin B6',
    re: /vitamin\s*-?\s*b\s*6\b|\bb6\b|pyridoxin/i,
    foods: ['Kartoffeln', 'Banane', 'Geflügel', 'Vollkorn'],
  },
  {
    key: 'vitamin_b',
    label: 'Vitamin B',
    re: /vitamin\s*-?\s*b\b|b\-?vitamine?|thiamin|riboflavin|niacin/i,
    foods: ['Hülsenfrüchte', 'Vollkorn', 'grünes Blattgemüse', 'Nüsse', 'Haferflocken', 'Kartoffeln', 'Hähnchen'],
  },
  {
    key: 'magnesium',
    label: 'Magnesium',
    re: /\bmagnesium\b/i,
    foods: ['Kürbiskerne', 'Mandeln', 'Vollkorn', 'Spinat', 'Bananen', 'Haferflocken'],
  },
  {
    key: 'protein',
    label: 'Protein',
    re: /\bprotein\b|\beiweiss\b|eiweiß|high\s*-?\s*protein/i,
    foods: ['Hülsenfrüchte', 'Haferflocken', 'Eier', 'Hähnchen', 'Quark', 'Tofu'],
  },
  {
    key: 'ballast',
    label: 'Ballaststoffe',
    re: /ballast|fiber|vollkorn/i,
    foods: ['Haferflocken', 'Hülsenfrüchte', 'Vollkorn', 'Äpfel', 'Brokkoli', 'Chiasamen'],
  },
];

function detectNutrientTheme(text) {
  const raw = String(text == null ? '' : text);
  if (!raw.trim()) return null;
  for (let i = 0; i < NUTRIENT_THEME_FOODS.length; i++) {
    const theme = NUTRIENT_THEME_FOODS[i];
    if (theme.re.test(raw)) {
      return {
        key: theme.key,
        label: theme.label,
        foods: theme.foods.slice(),
      };
    }
  }
  return null;
}

/** Thema per Key aus dem strukturierten Supplement-Brief (z. B. "eisen", "vitamin_b"). */
function getThemeByKey(key) {
  const k = String(key == null ? '' : key).toLowerCase().trim();
  if (!k) return null;
  for (let i = 0; i < NUTRIENT_THEME_FOODS.length; i++) {
    const theme = NUTRIENT_THEME_FOODS[i];
    if (theme.key === k) {
      return {
        key: theme.key,
        label: theme.label,
        foods: theme.foods.slice(),
      };
    }
  }
  return null;
}

/**
 * Liest brief.theme aktiv (Supplement→Koch) und fällt sonst auf Text-Erkennung zurück.
 * @param {string|{ theme?: string, source?: string }|null} brief
 * @param {string} [fallbackText]
 */
function resolveThemeFromBrief(brief, fallbackText) {
  if (brief && typeof brief === 'object' && !Array.isArray(brief)) {
    const byKey = getThemeByKey(brief.theme);
    if (byKey) return byKey;
  }
  const blob = [
    typeof brief === 'string' ? brief : '',
    brief && typeof brief === 'object' ? String(brief.theme || '') : '',
    fallbackText || '',
  ].filter(Boolean).join(' ');
  return detectNutrientTheme(blob);
}

function themeGuidanceFromTheme(theme) {
  if (!theme) return null;
  const foodList = theme.foods.join(', ');
  return {
    key: theme.key,
    label: theme.label,
    foods: theme.foods,
    instruction: truncateTeamBrief(
      'THEMEN-REZEPT: Brief/Kontext nennt ' + theme.label + '. ' +
      'Erstelle ein einfaches Alltaggericht (ca. 30 Minuten, 1 Portion). ' +
      'Nutze passende Lebensmittel aus: ' + foodList + '. ' +
      'Keine Dosierungen, keine Diagnosen, keine medizinischen Aussagen – nur Rezept.',
      TEAM_HANDOFF_BRIEF_MAX
    ),
  };
}

/**
 * Baut eine kurze Themen-Anweisung für den generativen Koch (ohne Medizin/Dosierung).
 * Akzeptiert Text (Legacy) oder { theme, brief, text, ai_instruction }.
 * @returns {{ key: string, label: string, foods: string[], instruction: string } | null}
 */
function buildThemeRecipeGuidance(textOrOpts) {
  if (textOrOpts && typeof textOrOpts === 'object' && !Array.isArray(textOrOpts)) {
    const byKey = getThemeByKey(textOrOpts.theme);
    if (byKey) return themeGuidanceFromTheme(byKey);
    const fromBrief = resolveThemeFromBrief(
      textOrOpts.brief || textOrOpts.handoff_brief || null,
      [textOrOpts.text, textOrOpts.ai_instruction].filter(Boolean).join(' ')
    );
    return themeGuidanceFromTheme(fromBrief);
  }
  return themeGuidanceFromTheme(detectNutrientTheme(textOrOpts));
}

function buildGenerativeMessages(p) {
  const teamOn = p.team_ai !== false;
  const themeBlob = [p.ai_instruction, ...(Array.isArray(p.pantry_ingredients) ? p.pantry_ingredients : [])].join(' ');
  // brief.theme hat Vorrang vor freier Text-Erkennung.
  const themeGuide = buildThemeRecipeGuidance({
    theme: p.theme,
    brief: p.handoff_brief,
    text: themeBlob,
    ai_instruction: p.ai_instruction,
  });
  // Original/klassisch: keine Fitness-Shake-Regeln (wuerden Tradition/Passthrough stoeren).
  const isOriginalMode = /MODUS ORIGINALREZEPT|MODE ORIGINAL RECIPE/i.test(String(p.ai_instruction || ''));
  const emotionRules = teamOn ? [
    'TEAM-HANDOFF AN DEN MENTAL-COACH (Phase 2): Wenn der Nutzer klar resigniert, ueberfordert, frustriert oder emotional blockiert ist',
    '(z.B. "schaff ich eh nicht", "zu kompliziert", "nervt", "keine Energie") UND kein konkretes Rezept/Gericht verlangt:',
    'KEIN Coaching, KEINE Motivation, KEINE Tipps, KEIN Rezept.',
    'Dann setze title exakt auf "' + HANDOFF_SENTINEL_TITLE + '", chef_analysis = kurzer Handoff-Brief (max ' + TEAM_HANDOFF_BRIEF_MAX + ' Zeichen),',
    'garnish="", prep_time_min=0, ingredients=[], steps=[], nutrition alle 0, diet_labels=[].',
    'Sonst normales Rezept wie unten. Bei gemischter Anfrage (Emotion + klares Gericht) → normales Rezept.',
  ].join(' ') : '';
  const themeRules = themeGuide
    ? [
      'THEMEN-REZEPT (vom Kollegen-Brief / Suchkontext):',
      'Thema erkannt: ' + themeGuide.label + '.',
      'Waehle alltagstaugliche Zutaten aus dieser Liste (mind. 2-3 davon zentral nutzen): ' + themeGuide.foods.join(', ') + '.',
      'Ziel: einfaches Gericht, ca. 30 Minuten, 1 Portion (servings=1), Alltagssprache in title/steps/nutrition_note.',
      'VERBOTEN: medizinische Aussagen, Dosierungen (mg/IE), Diagnosen, Heilversprechen, Supplement-Empfehlungen.',
      'Kein Coaching-Text – nur Rezept-JSON.',
    ].join(' ')
    : 'Wenn kein Naehrstoff-Thema im Brief/Suchbegriff steht: normales Standardrezept wie bisher.';
  const system = [
    strictPrompt.loadStrictConstraintsForGenerative(),
    'MODUS: GENERATIV / FREISUCHE / SHOPPING – bewusst kreativ (NICHT Eigenrezept-Modus).',
    isOriginalMode
      ? 'Du bist ein Rezept-Koch fuer klassische Originalrezepte. Erstelle EINE landestypische Rezeptidee als JSON gemaess Schema.'
      : 'Du bist ein hyper-intelligenter System-Chefkoch und Ernaehrungs-Wissenschaftler der Spitzenklasse. Rezepte vereinen Food-Pairing, Sensorik, makellose Konsistenz und exakte Naehrwert-Mathematik – an Tages-Makros angepasst, ohne Halluzinationen. JSON gemaess Schema.',
    'VARIATION: Liefere bei gleichen Suchbegriffen bewusst unterschiedliche Gerichte (andere Hauptzutat, Kueche oder Zubereitung). Wiederhole keine frueheren Titel aus der Zusatz-Instruction.',
    'ERLAUBT: Zutaten vorschlagen, Mengen waehlen und an Tagesziele/Leitlinien anpassen, Schritte neu formulieren.',
    'KRITISCH – Schema v9.2: ingredients[].unit NUR "g"|"ml"|"stk"|"prise"|"messerspitze". content/garnish ohne freie Mengen-Zahlen – nur {0001}-Platzhalter.',
    'Mengen in ingredients: Eier unit=stk; Gewuerze amount=0 unit=prise|messerspitze; Fluessigkeiten ml; Festes g. netCarbs/fat/protein/fiber je 100 g/ml.',
    'Beispiel Ei: {"id":"0002","name":"Ei (Groesse M, ca. 60 g)","amount":2,"unit":"stk","protein_source":true}. Olivenoel: unit ml. Salz: unit prise, amount 0.',
    'steps: Objekte {title, content mit {id}-Platzhaltern, stove_level 0|1-9, time_min}. garnish + chef_analysis Pflicht.',
    'Schema v9.2: nutrition{kcal,protein_g,fat_g,netto_kh_g,ballaststoffe_g}, ingredients[{id,name,amount,unit,protein_source,macros}], steps[{title,content,stove_level,time_min}], garnish, chef_analysis, diet_labels, target_deviation_note, prep_time_min.',
    'content/garnish/chef_analysis: Mengen NUR als {0001}-Platzhalter – KEINE freien g/ml/kcal-Zahlen. KEIN self_check-Feld.',
    'Eier unit=stk; Gewuerze unit=prise|messerspitze amount=0; sonst g|ml. stove_level 0=kalt, 1-9=Hitze.',
    'chef_analysis: qualitativ / Platzhalter, Verweis auf nutrition – keine eigenen Gramm-/kcal-Zahlen.',
    isOriginalMode ? '' : CHEF_FRAMEWORK_RULES,
    emotionRules,
    themeRules,
    'HANDOFF: Lies brief.theme (z.B. eisen, vitamin_b) aus dem Supplement-Handoff aktiv. Wenn ai_instruction mit "HANDOFF VOM MENTAL-COACH" oder "HANDOFF VOM SUPPLEMENT-COACH" beginnt, priorisiere passende Lebensmittel – trotzdem nur Rezept-JSON, kein Coaching.',
    'Keine medizinischen Diagnosen oder Heilversprechen. Antworte auf ' + strictPrompt.langName(p.lang) + '. Nur JSON.',
    'SPRACHE (verbindlich): title, garnish, chef_analysis, ingredients[].name, steps[].title/content komplett auf ' +
      strictPrompt.langName(p.lang) + ' – keine Mischsprache, keine deutschen Restworte wenn die App-Sprache eine andere ist.',
  ].filter(Boolean).join('\n');
  const user = [
    'Modus: ' + (p.mode === 'pantry' ? 'Rezept mit vorhandenen Zutaten / Suchbegriff' : 'Rezeptidee mit Einkaufsliste'),
    p.pantry_ingredients.length ? 'Vorhandene Zutaten / Suchbegriff: ' + p.pantry_ingredients.join(', ') : '',
    'Aggregierte Tages-Makrowerte (Wert / Ziel): ' + JSON.stringify(p.macros),
    p.micronutrient_gaps.length ? 'Mikronaehrstoffe unter 70% des Tagesziels: ' + JSON.stringify(p.micronutrient_gaps) : '',
    p.lab_guideline_constraints ? 'Leitlinien-Vorgaben: ' + JSON.stringify(p.lab_guideline_constraints) : '',
    p.ai_instruction ? 'Zusatz-Instruction (Mengen/Zutaten an Tagesziele anpassen; Schema v9.2 mit Platzhaltern): ' + p.ai_instruction : '',
    themeGuide
      ? ('THEMEN-HINWEIS: Baue ein einfaches 30-Minuten-Rezept (1 Portion) mit Fokus auf ' + themeGuide.label +
        ' unter Nutzung von: ' + themeGuide.foods.slice(0, 6).join(', ') + '.')
      : '',
    p.allergens.length ? 'Allergene strikt meiden: ' + p.allergens.join(', ') : '',
    teamOn
      ? 'Wenn emotionale Blockade (siehe System): Sentinel-Titel + kurzer chef_analysis-Brief. Sonst normales v9.2-JSON.'
      : 'Erstelle jetzt ausschliesslich das v9.2-JSON-Objekt (keine Markdown-Fences, kein Self-Check).',
  ].filter(Boolean).join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

function langName(code) {
  return strictPrompt.langName(code);
}

// ---------------------------------------------------------------------------
// Groq-Request-Body
// ---------------------------------------------------------------------------
function buildGroqRequest(p, model) {
  const structured = p.structured;
  return {
    model: model || DEFAULT_MODEL,
    // Eigenrezept: deterministisch (0). Generativ: hoehere Temperatur fuer unendliche Variationen.
    temperature: structured ? 0 : 0.85,
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
  const preserveMissing = !!(opts && opts.preserveMissingAmount);
  const zeroMacros = !!(opts && opts.zeroMacros);
  // Explizite Menge 0 (Gewuerz "1 Prise"/"nach Geschmack") nicht auf 1 erzwingen.
  const hasExplicitAmount = src.amount != null && src.amount !== '' && Number.isFinite(Number(src.amount));
  const amount = hasExplicitAmount ? num(src.amount, 0) : NaN;
  let normalizedAmount;
  if (hasExplicitAmount) {
    normalizedAmount = amount > 0 ? Math.round(amount * 10) / 10 : 0;
  } else {
    normalizedAmount = preserveMissing ? 0 : 1;
  }
  return {
    name: (typeof src.name === 'string' && src.name.trim()) ? src.name.trim().slice(0, 200) : (fallbackName || 'Zutat'),
    amount: normalizedAmount,
    unit: src.unit === 'ml' ? 'ml' : 'g',
    status: src.status === 'vorhanden' ? 'vorhanden' : 'benoetigt',
    macrosPer100g: zeroMacros
      ? { netCarbs: 0, fat: 0, protein: 0, fiber: 0 }
      : {
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
  // v9.2 generatives JSON → Client-Vertrag via Placeholder-Resolve
  if (!(p && p.structured) && parsed.prep_time_min != null && parsed.nutrition && Array.isArray(parsed.steps)
      && parsed.steps[0] && typeof parsed.steps[0] === 'object') {
    return recipePipeline.renderRecipeForDisplay(parsed);
  }
  const structured = !!(p && p.structured);
  let ingredients;
  if (structured) {
    const obj = parsed.ingredients && typeof parsed.ingredients === 'object' && !Array.isArray(parsed.ingredients)
      ? parsed.ingredients : {};
    ingredients = p.pantry_ingredients.map((line, i) =>
      normalizeIng(obj[ingKey(i)], stripQty(line), { preserveMissingAmount: true, zeroMacros: true }));
  } else {
    ingredients = (Array.isArray(parsed.ingredients) ? parsed.ingredients : [])
      .map((it) => normalizeIng(it, undefined, { preserveMissingAmount: false }))
      .slice(0, MAX_INGREDIENTS);
  }
  if (!ingredients.length) return null;

  // STRUCTURED: shopping_list immer aus Zutaten; prep_time/nutrition_note/garnish leer.
  let shopping = ingredients.map(formatClientAmountLine);
  if (!structured) {
    shopping = Array.isArray(parsed.shopping_list) ? parsed.shopping_list.map((s) => String(s || '')).filter(Boolean) : [];
    if (shopping.length < ingredients.length) shopping = ingredients.map(formatClientAmountLine);
  }
  const steps = (Array.isArray(parsed.steps) ? parsed.steps : []).map((s) => String(s || '').trim()).filter(Boolean).slice(0, MAX_STEPS);
  const servings = num(parsed.servings, 0);
  const garnish = structured
    ? ''
    : (typeof parsed.garnish === 'string' ? parsed.garnish.trim().slice(0, 200) : '');
  const selfCheck = structured
    ? ''
    : (typeof parsed.self_check === 'string' ? parsed.self_check.trim().slice(0, 2000) : '');
  return {
    title: (typeof parsed.title === 'string' && parsed.title.trim()) ? parsed.title.trim().slice(0, 200) : 'Rezept',
    // STRUCTURED: 0 = Portionen nicht angegeben (App laesst leer). GENERATIV: Fallback 2.
    servings: servings > 0 ? servings : (structured ? 0 : 2),
    prep_time: structured ? '' : (typeof parsed.prep_time === 'string' ? parsed.prep_time.slice(0, 60) : ''),
    nutrition_note: structured ? '' : (typeof parsed.nutrition_note === 'string' ? parsed.nutrition_note.slice(0, 800) : ''),
    garnish,
    self_check: selfCheck,
    ingredients,
    shopping_list: shopping.slice(0, MAX_INGREDIENTS),
    steps,
  };
}

// ---------------------------------------------------------------------------
// Groq-Call (fetchImpl injizierbar fuer Tests)
// ---------------------------------------------------------------------------
const GROQ_RATE_LIMIT_HEADER_KEYS = [
  'retry-after',
  'x-ratelimit-limit-requests',
  'x-ratelimit-remaining-requests',
  'x-ratelimit-reset-requests',
  'x-ratelimit-limit-tokens',
  'x-ratelimit-remaining-tokens',
  'x-ratelimit-reset-tokens',
  'x-ratelimit-limit-requests-day',
  'x-ratelimit-remaining-requests-day',
  'x-ratelimit-limit-tokens-day',
  'x-ratelimit-remaining-tokens-day',
];

function collectGroqResponseHeaders(res) {
  const out = {};
  if (!res || !res.headers || typeof res.headers.get !== 'function') return out;
  GROQ_RATE_LIMIT_HEADER_KEYS.forEach(function (key) {
    const v = res.headers.get(key);
    if (v != null && v !== '') out[key] = v;
  });
  // Alle x-ratelimit-* / retry-after mitschneiden (falls Groq neue Namen nutzt)
  if (typeof res.headers.forEach === 'function') {
    res.headers.forEach(function (value, key) {
      const k = String(key || '').toLowerCase();
      if (k === 'retry-after' || k.indexOf('ratelimit') >= 0 || k.indexOf('rate-limit') >= 0) {
        out[k] = value;
      }
    });
  }
  return out;
}

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
    if (!res.ok) {
      const headers = collectGroqResponseHeaders(res);
      const bodyFull = text.slice(0, 4000);
      console.log('[groq] provider_error status=' + res.status +
        ' headers=' + JSON.stringify(headers) +
        ' body=' + bodyFull);
      return {
        error: 'provider_error',
        status: res.status,
        body: bodyFull,
        headers: headers,
      };
    }
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
  TEAM_HANDOFF_BRIEF_MAX,
  HANDOFF_SENTINEL_TITLE,
  CULINARY_KITCHEN_RULES,
  CHEF_FRAMEWORK_RULES,
  validateIncoming,
  looksStructured,
  detectEmotionalBlockade,
  buildCoachHandoffPayload,
  tryEmotionalHandoffEarly,
  extractHandoffFromParsed,
  truncateTeamBrief,
  detectNutrientTheme,
  getThemeByKey,
  resolveThemeFromBrief,
  buildThemeRecipeGuidance,
  NUTRIENT_THEME_FOODS,
  buildEnrichmentSchema,
  buildGenerativeSchema,
  buildEnrichmentMessages,
  buildGenerativeMessages,
  buildGroqRequest,
  toClientRecipe,
  collectGroqResponseHeaders,
  callGroq,
  recipePipeline,
  recipeValidator,
  generateValidatedRecipe: recipePipeline.generateValidatedRecipe,
  renderRecipeForDisplay: recipePipeline.renderRecipeForDisplay,
  validateRecipeV2: recipeValidator.validateRecipeV2,
  ingKey,
  STRUCTURED_PROMPT_VERSION: strictPrompt.STRUCTURED_PROMPT_VERSION,
};

// Startup-Check: Core nutzt denselben Strict-Prompt.
(function registerCoreStrictPrompt() {
  const probeLines = ['100 g Haferflocken', 'Salz q.b.', '1 EL Olivenoel'];
  const msgs = buildEnrichmentMessages({
    lang: 'de',
    pantry_ingredients: probeLines,
    ai_instruction: '',
    allergens: [],
  });
  strictPrompt.registerStrictModule('core', {
    system: msgs[0] && msgs[0].content,
    user: msgs[1] && msgs[1].content,
  });
})();
