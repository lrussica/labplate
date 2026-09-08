/**
 * LabPlate – Zentraler Strict-System-Prompt (strict_v2_mengen_qb0_bls)
 * ==================================================================
 * EINZIGE Quelle fuer STRUCTURED/Eigenrezept-Prompt-Regeln.
 * Alle Rezept-Module (core, coach-recipe, nutri-coach, recipe-suggestions)
 * muessen loadStrictPrompt() / verifyStrictPrompt() nutzen.
 */

'use strict';

const STRUCTURED_PROMPT_VERSION = 'strict_v2_mengen_qb0_bls';

const STRUCTURED_UNIT_TABLE =
  'Feste Umrechnungstabelle (nur wenn der Nutzer EL/TL/Stueck OHNE g/ml angibt): ' +
  '1 EL = 15 g/ml, 1 TL = 5 g/ml, 1 Zehe Knoblauch = 5 g, 1 Avocado = 200 g, 1/2 Salatgurke = 200 g, 1 Ei = 60 g. ' +
  'Steht bereits eine g/ml/kg/l-Menge im Input, diese Zahl unveraendert uebernehmen (kg/l nur in g/ml umrechnen).';

const STRICT_RULES_BLOCK = [
  'STRICT_PROMPT_VERSION=' + STRUCTURED_PROMPT_VERSION,
  'VERBINDLICHE STRICT-REGELN (ueberall, keine Ausnahme):',
  '- Keine Makro-Optimierung, keine Anpassung an Tagesziele/Leitlinien.',
  '- Keine erfundenen Portionen (servings nur aus Input, sonst 2).',
  '- Keinen Fantasie-Titel (title nur aus Input, sonst knapper Name OHNE neue Zutaten).',
  '- Keine erfundenen Beschreibungen/Abschnitte; nutrition_note max. 1-2 sachliche Saetze ODER leer.',
  '- Keine Interpretation, Optimierung oder Strukturänderung des Rezepts.',
  '- q.b./nach Geschmack/Prise/etwas → amount = 0 (nie schaetzen).',
  '- Keine erfundenen Mengen, keine Fantasie-Zutaten, keine zusaetzlichen Abschnitte.',
  '- Bereits angegebene g/ml/kg/l-Mengen exakt unveraendert uebernehmen.',
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
 * Baut den Strict-System-Prompt fuer STRUCTURED/Eigenrezept.
 * @param {{ lang?: string, ingredientCount: number }} opts
 */
function loadStrictPrompt(opts) {
  const o = opts || {};
  const n = Math.max(1, Number(o.ingredientCount) || 1);
  const last = String(n).padStart(2, '0');
  const system = [
    'MODUS: EIGENREZEPT / STRUCTURED – nicht kreativ.',
    STRICT_RULES_BLOCK,
    'Du bist mein Rezept-Coach, der Rezepte klar strukturiert, ohne ihren Inhalt zu veraendern.',
    'FIXIERE DIESE DATEN: Zutaten, Mengen und Zubereitungsschritte aus dem Input sind verbindlich.',
    'AUFGABE: Strukturiere das Eigenrezept und berechne fuer JEDE uebergebene Zutat (Keys ing_01 … ing_' +
      last +
      ') realistische Naehrwerte je 100 g/ml (netCarbs, fat, protein, fiber) NUR fuer die genannten Zutaten – BLS/USDA-Referenzwerte, NICHT aus der Rezeptmenge hochrechnen, KEIN Fantasiewert.',
    'VERBOTEN: Zutaten hinzufuegen oder entfernen; bereits angegebene Mengen aendern; Schritte umstellen/kuerzen/zusammenfassen/umschreiben/optimieren; Ersatzprodukte erfinden; Zutaten als optional/wichtig einstufen; freie Mengenschaetzung; Rezept gesünder oder kalorienreduzierter machen; Mengen an Tagesziele, Leitlinien oder Makros anpassen; Makros erfinden; Portionen erfinden; Titel erfinden wenn Input keinen hat (dann knapper Name ohne Fantasie-Zutaten); Beschreibungen ausschmuecken; Interpretationen; Strukturänderungen; zusaetzliche Abschnitte.',
    'ERLAUBT: Namen stilistisch vereinheitlichen (kurz, ohne Mengenangabe im name-Feld); Schritte NUR orthografisch/grammatisch korrigieren – KEIN inhaltliches Umschreiben; Naehrwert-Anreicherung der tatsaechlich genannten Zutaten als BLS/USDA-Referenz je 100 g/ml.',
    STRUCTURED_UNIT_TABLE,
    'Vage Mengenangaben (q.b., qb, nach Geschmack, nach Belieben, etwas, ein wenig, Prise, nach Bedarf, ad libitum, beliebig) haben KEINEN g/ml-Wert und greifen KEINE Tabellen-Regel → amount = 0. Kein Schatzen, kein Erfinden einer Grammzahl.',
    'Fehlt eine Menge und greift KEINE Tabellen-Regel eindeutig: amount = 0 (= nicht angegeben). Schema verlangt eine Zahl – kein null.',
    'Fluessigkeiten (Oel, Essig, Sosse, Bruehe, Dressing, Milch) in ml, sonst g. status: "benoetigt".',
    'steps: Wenn der Input/die Client-Instruction Schritte enthaelt: 1:1 in derselben Reihenfolge uebernehmen. Wenn keine Schritte vorliegen: steps = [] (nichts erfinden).',
    'shopping_list: eine Zeile pro Zutat "Name – Menge Einheit" (bei amount 0: "Name – nicht angegeben").',
    'title: aus Input falls vorhanden, sonst knapper passender Name ohne Fantasie-Zutaten. servings: aus Input, sonst 2. prep_time: aus Input oder "". nutrition_note: 1-2 sachliche Saetze zu den genannten Zutaten ODER "", keine medizinischen Aussagen, keine neuen Zutaten.',
    'Antworte auf ' + langName(o.lang) + '. Ausschliesslich JSON gemaess Schema – kein Begleittext.',
  ].join('\n');
  return system;
}

/**
 * User-Prompt fuer STRUCTURED (Zutaten-Mapping).
 */
function buildStrictUserPrompt(p) {
  const lines = (p && Array.isArray(p.pantry_ingredients)) ? p.pantry_ingredients : [];
  const mapping = lines.map((line, i) => ingKey(i) + ' = "' + line + '"').join('\n');
  return [
    'MENGEN-REGEL (oberste Prioritaet): Jede Menge aus den Eingabezeilen exakt unveraendert uebernehmen – kein Wert darf abweichen, angepasst oder geschaetzt werden.',
    'ANZAHL ZUTATEN: ' + lines.length + ' (genau so viele Keys ing_XX sind zu fuellen – keine mehr, keine weniger)',
    'ZUTATEN-MAPPING (Key = Eingabezeile des Nutzers):',
    mapping,
    p && p.ai_instruction
      ? 'ZUSATZ-INSTRUCTION DES CLIENTS (Schritte/Portionen 1:1 beachten, Inhalt nicht aendern):\n' + p.ai_instruction
      : '',
    p && Array.isArray(p.allergens) && p.allergens.length
      ? 'ALLERGENE (nur Warnhinweis in nutrition_note, Zutaten NICHT entfernen oder ersetzen): ' + p.allergens.join(', ')
      : '',
    'Fuelle jetzt fuer jeden Key ing_01 … ing_' + String(lines.length).padStart(2, '0') + ' ein Objekt aus.',
  ].filter(Boolean).join('\n\n');
}

/** Kurzer Strict-Block fuer generative Calls (Einheiten/Mengen-Disziplin, ohne Eigenrezept-Fix). */
function loadStrictConstraintsForGenerative() {
  return [
    'STRICT_CONSTRAINTS (' + STRUCTURED_PROMPT_VERSION + '):',
    'unit NUR g|ml; q.b./vage Mengen nicht erfinden wenn STRUCTURED – hier generativ Mengen > 0 erlaubt.',
    'Keine medizinischen Heilversprechen. Keine Allergene vorschlagen die gemieden werden sollen.',
  ].join(' ');
}

function verifyStrictPromptText(systemText, userText, schemaText) {
  const sys = String(systemText || '');
  const user = String(userText || '');
  const schema = String(schemaText || '');
  const checks = {
    version: sys.includes(STRUCTURED_PROMPT_VERSION) || sys.includes('MODUS: EIGENREZEPT / STRUCTURED'),
    system_eigenrezept: /MODUS: EIGENREZEPT \/ STRUCTURED/.test(sys),
    system_no_optimize: /gesünder oder kalorienreduzierter|Mengen an Tagesziele|STRICT-REGELN/.test(sys),
    system_vague_qb: /Vage Mengenangaben/.test(sys) && /amount = 0/.test(sys),
    user_mengen_regel: /MENGEN-REGEL/.test(user),
    schema_bls_ref: /BLS\/USDA/.test(schema) || /BLS\/USDA/.test(sys),
  };
  return { ok: Object.values(checks).every(Boolean), checks };
}

/**
 * Modul-Registrierung + Startup-Log.
 * @returns {{ version: string, ok: boolean, module: string }}
 */
function registerStrictModule(moduleName, probe) {
  const name = String(moduleName || 'unknown');
  const p = probe || {};
  const system = p.system != null ? p.system : loadStrictPrompt({ lang: 'de', ingredientCount: 3 });
  const user = p.user != null ? p.user : buildStrictUserPrompt({
    pantry_ingredients: ['100 g Haferflocken', 'Salz q.b.', '1 EL Olivenoel'],
    ai_instruction: '',
    allergens: [],
  });
  const schema = p.schema != null ? p.schema : 'BLS/USDA';
  const verified = verifyStrictPromptText(system, user, schema);
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
