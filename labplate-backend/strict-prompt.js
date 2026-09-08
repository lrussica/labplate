/**
 * LabPlate – Zentraler Strict-System-Prompt (Eigenrezept-Passthrough)
 * ==================================================================
 * Version: strict_v3_passthrough_no_macros
 *
 * KI liefert NUR: title, servings (0 wenn nicht im Text), ingredients, steps.
 * KEINE Makros, KEINE nutrition_note, KEINE erfundenen Mengen/Schritte.
 * Makros berechnet die App lokal (lookupNutriMacrosPer100g) und skaliert bei Portionswechsel.
 */

'use strict';

const STRUCTURED_PROMPT_VERSION = 'strict_v3_passthrough_no_macros';

const STRUCTURED_UNIT_TABLE =
  'Feste Umrechnungstabelle (nur wenn der Nutzer EL/TL/Stueck OHNE g/ml angibt): ' +
  '1 EL = 15 g/ml, 1 TL = 5 g/ml, 1 Zehe Knoblauch = 5 g, 1 Avocado = 200 g, 1/2 Salatgurke = 200 g, 1 Ei = 60 g. ' +
  'Steht bereits eine g/ml/kg/l-Menge im Input, diese Zahl unveraendert uebernehmen (kg/l nur in g/ml umrechnen).';

const STRICT_RULES_BLOCK = [
  'STRICT_PROMPT_VERSION=' + STRUCTURED_PROMPT_VERSION,
  'AUSGABE NUR: title, servings, ingredients, steps. Mehr nicht.',
  'VERBINDLICHE STRICT-REGELN:',
  '- Zutaten und Schritte 1:1 aus dem Input uebernehmen – nichts aendern, nichts erfinden, nichts weglassen.',
  '- KEINE Makros berechnen: netCarbs/fat/protein/fiber IMMER 0 (die App berechnet spaeter).',
  '- servings: nur wenn im Text klar angegeben (Personen/Portionen), sonst 0 (= leer / nicht angegeben). Nie erfinden.',
  '- title: nur wenn im Text vorhanden, sonst knapper Name OHNE Fantasie-Zutaten.',
  '- prep_time: immer "". nutrition_note: immer "". shopping_list: [] (App baut sie selbst).',
  '- Keine Interpretation, Optimierung, Strukturänderung, keine zusaetzlichen Abschnitte.',
  '- q.b./nach Geschmack/Prise/etwas → amount = 0.',
].join('\n');

const _moduleStatus = Object.create(null);

function langName(code) {
  return {
    de: 'Deutsch', en: 'Englisch', es: 'Spanisch', it: 'Italienisch',
    pt: 'Portugiesisch', fr: 'Franzoesisch', tr: 'Tuerkisch',
  }[code] || 'Deutsch';
}

function ingKey(i) {
  return 'ing_' + String(i + 1).padStart(2, '0');
}

/**
 * Strict-System-Prompt fuer STRUCTURED/Eigenrezept (Passthrough, keine Makros).
 */
function loadStrictPrompt(opts) {
  const o = opts || {};
  const n = Math.max(1, Number(o.ingredientCount) || 1);
  const last = String(n).padStart(2, '0');
  const system = [
    'MODUS: EIGENREZEPT / STRUCTURED – reiner Passthrough, nicht kreativ.',
    STRICT_RULES_BLOCK,
    'Du strukturierst NUR das Eigenrezept. Inhalt unveraenderlich.',
    'AUFGABE: Fuer JEDE Zutat (Keys ing_01 … ing_' + last + ') name/amount/unit/status setzen. netCarbs=fat=protein=fiber = 0.',
    'VERBOTEN: Zutaten hinzufuegen/entfernen; Mengen aendern; Schritte umschreiben/kuerzen/erfinden; Makros berechnen oder schaetzen; Portionen erfinden; Beschreibungen; Optimierungen.',
    'ERLAUBT: Namen kurz ohne Mengenangabe im name-Feld; Orthografie in Schritten ohne Sinnänderung.',
    STRUCTURED_UNIT_TABLE,
    'Vage Mengenangaben (q.b., qb, nach Geschmack, nach Belieben, etwas, ein wenig, Prise, nach Bedarf) → amount = 0.',
    'Fehlt eine Menge und greift KEINE Tabellen-Regel: amount = 0.',
    'Fluessigkeiten (Oel, Essig, Sosse, Bruehe, Dressing, Milch) in ml, sonst g. status: "benoetigt".',
    'steps: 1:1 aus Input in gleicher Reihenfolge. Keine Schritte im Input → steps = [].',
    'servings: Zahl aus Input (Personen/Portionen) oder 0 wenn nicht angegeben.',
    'title: aus Input oder knapper Name. prep_time "". nutrition_note "". shopping_list [].',
    'Antworte auf ' + langName(o.lang) + '. Ausschliesslich JSON gemaess Schema – kein Begleittext.',
  ].join('\n');
  return system;
}

function buildStrictUserPrompt(p) {
  const lines = (p && Array.isArray(p.pantry_ingredients)) ? p.pantry_ingredients : [];
  const mapping = lines.map((line, i) => ingKey(i) + ' = "' + line + '"').join('\n');
  return [
    'MENGEN-REGEL (oberste Prioritaet): Jede Menge aus den Eingabezeilen exakt unveraendert uebernehmen.',
    'MAKRO-REGEL: netCarbs/fat/protein/fiber fuer jede Zutat = 0 (App berechnet spaeter).',
    'PORTIONS-REGEL: servings nur wenn im Input klar, sonst 0.',
    'ANZAHL ZUTATEN: ' + lines.length + ' (genau so viele Keys ing_XX)',
    'ZUTATEN-MAPPING (Key = Eingabezeile des Nutzers):',
    mapping,
    p && p.ai_instruction
      ? 'ZUSATZ-INSTRUCTION DES CLIENTS (Schritte/Portionen 1:1, Inhalt nicht aendern):\n' + p.ai_instruction
      : '',
    p && Array.isArray(p.allergens) && p.allergens.length
      ? 'ALLERGENE (nur merken, Zutaten NICHT entfernen/ersetzen): ' + p.allergens.join(', ')
      : '',
    'Fuelle jetzt fuer jeden Key ing_01 … ing_' + String(lines.length).padStart(2, '0') + ' ein Objekt aus (Makros = 0).',
  ].filter(Boolean).join('\n\n');
}

function loadStrictConstraintsForGenerative() {
  return [
    'STRICT_CONSTRAINTS (' + STRUCTURED_PROMPT_VERSION + '):',
    'unit NUR g|ml. Keine medizinischen Heilversprechen.',
  ].join(' ');
}

function verifyStrictPromptText(systemText, userText) {
  const sys = String(systemText || '');
  const user = String(userText || '');
  const checks = {
    version: sys.includes(STRUCTURED_PROMPT_VERSION) || sys.includes('passthrough'),
    system_eigenrezept: /MODUS: EIGENREZEPT \/ STRUCTURED/.test(sys),
    system_no_macros: /Makros|netCarbs.*=.*0|IMMER 0/.test(sys),
    system_servings_empty: /servings.*0|sonst 0/.test(sys),
    system_passthrough: /1:1|Passthrough|unveränderlich|unveraenderlich/.test(sys),
    user_mengen_regel: /MENGEN-REGEL/.test(user),
    user_makro_regel: /MAKRO-REGEL/.test(user),
  };
  return { ok: Object.values(checks).every(Boolean), checks };
}

function registerStrictModule(moduleName, probe) {
  const name = String(moduleName || 'unknown');
  const p = probe || {};
  const system = p.system != null ? p.system : loadStrictPrompt({ lang: 'de', ingredientCount: 3 });
  const user = p.user != null ? p.user : buildStrictUserPrompt({
    pantry_ingredients: ['100 g Haferflocken', 'Salz q.b.', '1 EL Olivenoel'],
    ai_instruction: '',
    allergens: [],
  });
  const verified = verifyStrictPromptText(system, user);
  _moduleStatus[name] = {
    version: STRUCTURED_PROMPT_VERSION,
    ok: verified.ok,
    checks: verified.checks,
  };
  if (!verified.ok) {
    console.error('[Konfiguration] FEHLER strict_prompt module=' + name, verified.checks);
  } else {
    console.log(
      'strict_prompt=' + STRUCTURED_PROMPT_VERSION +
      ' markers_ok=true module=' + name
    );
  }
  return _moduleStatus[name];
}

function getModuleStrictStatus(moduleName) {
  return _moduleStatus[moduleName] || { version: STRUCTURED_PROMPT_VERSION, ok: false };
}

function getAllModuleStrictStatus() {
  return Object.assign({}, _moduleStatus);
}

module.exports = {
  STRUCTURED_PROMPT_VERSION,
  STRUCTURED_UNIT_TABLE,
  STRICT_RULES_BLOCK,
  loadStrictPrompt,
  buildStrictUserPrompt,
  loadStrictConstraintsForGenerative,
  verifyStrictPromptText,
  registerStrictModule,
  getModuleStrictStatus,
  getAllModuleStrictStatus,
  langName,
  ingKey,
};
