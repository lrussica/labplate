'use strict';
/**
 * Lokaler Regressionstest (ohne Groq-API):
 * - Generativ: Schema nur g|ml; Prompt verbietet Stueck/EL/TL
 * - Generativ Ei/Stueck -> g und Oel -> ml via toClientRecipe
 * - Structured: amount 0 (= q.b. / nicht angegeben) bleibt erhalten
 * - Retry-Policy: 400 nicht retryable (gespiegelte Client-Logik)
 */
const assert = require('assert');
const core = require('./nutri-recipe-core');

function isNutriRecipeChatRetryableStatus(status) {
  return status === 408 || status === 429 || status === 503 || status === 504;
}

function genPayload(extra) {
  return Object.assign({
    mode: 'pantry',
    lang: 'de',
    pantry_ingredients: ['Ei', 'Spinat', 'Olivenoel'],
    macros: { netCarbs: { value: 50, goal: 100 }, fat: { value: 40, goal: 70 }, protein: { value: 60, goal: 120 } },
    micronutrient_gaps: [],
    lab_guideline_constraints: null,
    ai_instruction: '',
    allergens: [],
    structured: false,
  }, extra || {});
}

// 1) Generativ-Schema + Prompt
const genReq = core.buildGroqRequest(genPayload(), 'test-model');
const unitEnum = genReq.response_format.json_schema.schema.properties.ingredients.items.properties.unit.enum;
assert.deepStrictEqual(unitEnum, ['g', 'ml'], 'Generativ-Schema unit enum muss g|ml sein');
const sys = genReq.messages[0].content;
assert(/NUR "g" oder "ml"/i.test(sys) || /unit-Feld: NUR/i.test(sys), 'Generativ-Prompt muss g|ml erzwingen');
assert(/VERBOTEN.*Stueck|Stueck.*VERBOTEN|Nie unit Stueck/i.test(sys) || /VERBOTEN als unit/i.test(sys), 'Generativ-Prompt muss Stueck verbieten');
assert(/1 Ei = 60 g/i.test(sys), 'Generativ-Prompt braucht Ei->g Tabelle');
assert(/CHEF-FRAMEWORK/i.test(sys), 'Generativ-Prompt braucht Chef-Framework');
assert(/FOOD PAIRING|Food-Pairing|molekulares Food-Pairing/i.test(sys), 'Generativ-Prompt: Food Pairing');
assert(/3-TEXTUREN|3 Texturen|Mindestens 3 Texturen|cremig \+ bissfest \+ crunchy/i.test(sys), 'Generativ-Prompt: 3-Texturen-Standard');
assert(/pro 30 g Proteinpulver 200 ml|200 ml.*30 g Proteinpulver/i.test(sys), 'Generativ-Prompt: Proteinpulver-Fluessigkeitsregel');
assert(/Minimum 300 ml/i.test(sys), 'Generativ-Prompt: Shake Mindestfluessigkeit');
assert(/MOLEKULARE HITZE|gerinnen |>70/i.test(sys), 'Generativ-Prompt: molekulare Hitze-Regel');
assert(/PROTEIN-HARMONIE|Mini-Protein|Zutaten-Salat/i.test(sys), 'Generativ-Prompt: Protein-Harmonie');
assert(/ABSOLUTES GRAMM-VERBOT|amount = 0.*Prise|1 Prise|GEWUERZ-DOSIERUNG/i.test(sys), 'Generativ-Prompt: Gewuerz ohne Gramm');
assert(/Salmonellen|rohes Ei NIEMALS|HYGIENE & EIER/i.test(sys), 'Generativ-Prompt: Ei-Hygiene');
assert(/anroesten|quellen NICHT|QUELL- UND FLUESSIGKEITS/i.test(sys), 'Generativ-Prompt: Quell-Dynamik');
assert(/BEZEICHNUNGS-KONSISTENZ|Namensgleichheit/i.test(sys), 'Generativ-Prompt: Namensgleichheit');
assert(/SELF-CHECK|nach dem AUSSCHALTEN|AUSSCHALTEN der Herdplatte/i.test(sys), 'Generativ-Prompt: Self-Check/Hitze');
assert(/KETO-EHRLEICHKEIT|Fake-Labels|<10 g/i.test(sys), 'Generativ-Prompt: Keto-Ehrlichkeit');
assert(/MAXIMUM 2 HAUPT-PROTEIN|Hoechstens 2 primaere/i.test(sys), 'Generativ-Prompt: max 2 Proteine');
assert(/VOLLSTAENDIGKEIT VON FLUESSIGKEITEN|auch Wasser/i.test(sys), 'Generativ-Prompt: Fluessigkeiten vollstaendig');
assert(/MENGEN-SYNCHRONISATION|100% mit ingredients|ABSOLUTE ZUTATEN/i.test(sys), 'Generativ-Prompt: Mengen-Sync');
assert(/HERD-STUFEN-LOGIK|kalten Schritten|Herd-Stufe STRIKT VERBOTEN/i.test(sys), 'Generativ-Prompt: Herd-Stufen-Logik');
assert(/EIERS?-STUECKZAHL|1 Ei \(Groesse M|das Ei/i.test(sys), 'Generativ-Prompt: Ei-Stueckzahl-Regel');
assert(/Mise en Place/i.test(sys), 'Generativ-Prompt: Mise en Place');
assert(/sensorische Signale|Sensorik|Zeit \+ Sensorik/i.test(sys), 'Generativ-Prompt: sensorische Signale');
assert(/Chef-Analyse/i.test(sys), 'Generativ-Prompt: Chef-Analyse in nutrition_note');
assert(/System-Chefkoch|Ernaehrungs-Wissenschaftler/i.test(sys), 'Generativ-Prompt: System-Chef-Rolle');
assert(/garnish/i.test(sys), 'Generativ-Prompt erwaehnt garnish');
assert(/SPRACHE \(verbindlich\)|komplett auf/i.test(sys), 'Generativ-Prompt: verbindliche Ausgabesprache');
assert.strictEqual(
  genReq.response_format.json_schema.schema.required.includes('garnish'),
  true,
  'Generativ-Schema muss garnish require'
);
assert.strictEqual(
  !!genReq.response_format.json_schema.schema.properties.garnish,
  true,
  'Generativ-Schema braucht garnish property'
);
assert(/BOTTOM-UP|Regel 0|NIEMALS Top-Down/i.test(sys), 'Generativ-Prompt: Bottom-Up Regel 0');
assert(/GERINNUNGSSCHUTZ|Creme fraiche|Mascarpone|Schmand|VOLLSTAENDIG AUSGESCHALTET/i.test(sys), 'Generativ-Prompt: erweiterter Gerinnungsschutz');
assert(/Kalorien-Plausibilitaet|Protein×4|Ballaststoffe×2|P×4/i.test(sys), 'Generativ-Prompt: Kalorien-Plausibilitaet');
assert(/Zeit-Realismus|Zeit-Summe/i.test(sys), 'Generativ-Prompt: Zeit-Realismus');
assert(/high-protein|≥25|>=25/i.test(sys), 'Generativ-Prompt: high-protein Ehrlichkeit');
assert(/PFLICHT-FELD self_check|self_check: sichtbarer/i.test(sys), 'Generativ-Prompt: sichtbarer self_check');
assert.strictEqual(
  genReq.response_format.json_schema.schema.required.includes('self_check'),
  true,
  'Generativ-Schema muss self_check require'
);
assert.strictEqual(
  !!genReq.response_format.json_schema.schema.properties.self_check,
  true,
  'Generativ-Schema braucht self_check property'
);
// Originalmodus: kein Chef-Framework
const origReq = core.buildGroqRequest(genPayload({
  ai_instruction: 'MODUS ORIGINALREZEPT (Italien): Gib die klassische Version von "Bolognese" zurück.',
}), 'test-model');
assert(!/CHEF-FRAMEWORK/i.test(origReq.messages[0].content), 'Originalmodus ohne Chef-Framework');
assert(!/3-TEXTUREN|DREI Texturen|Mindestens 3 Texturen/i.test(origReq.messages[0].content), 'Originalmodus ohne 3-Texturen-Standard');
console.log('OK generative schema+prompt');

// 2) Generativ: Ei als g, Oel als ml (simulierte Modell-Antwort nach korrekter Umrechnung)
const eggOil = core.toClientRecipe({
  title: 'Spinat-Omelett',
  servings: 1,
  prep_time: '10 Min',
  nutrition_note: 'Test',
  garnish: 'gerostete Mandeln',
  self_check: 'Kalorien-Rechnung: ok ✓',
  ingredients: [
    { name: 'Ei', amount: 120, unit: 'g', status: 'vorhanden', netCarbs: 0.7, fat: 10, protein: 13, fiber: 0 },
    { name: 'Olivenoel', amount: 15, unit: 'ml', status: 'vorhanden', netCarbs: 0, fat: 100, protein: 0, fiber: 0 },
  ],
  shopping_list: [],
  steps: ['Eier verquirlen', 'Braten'],
}, genPayload());
assert.strictEqual(eggOil.ingredients[0].unit, 'g');
assert.strictEqual(eggOil.ingredients[0].amount, 120);
assert.strictEqual(eggOil.ingredients[1].unit, 'ml');
assert.strictEqual(eggOil.ingredients[1].amount, 15);
assert.strictEqual(eggOil.garnish, 'gerostete Mandeln');
assert.strictEqual(eggOil.self_check, 'Kalorien-Rechnung: ok ✓');
console.log('OK generative egg/g + oil/ml');

// 2b) Generativ: Gewuerz amount=0 bleibt 0 (Prise)
const spiceZero = core.toClientRecipe({
  title: 'Test',
  servings: 1,
  prep_time: '5 Min',
  nutrition_note: 'x',
  garnish: 'Kraeuter',
  ingredients: [
    { name: 'Salz (1 Prise)', amount: 0, unit: 'g', status: 'benoetigt', netCarbs: 0, fat: 0, protein: 0, fiber: 0 },
    { name: 'Tofu', amount: 200, unit: 'g', status: 'benoetigt', netCarbs: 1, fat: 5, protein: 12, fiber: 1 },
  ],
  shopping_list: [],
  steps: ['Wuerzen'],
}, genPayload());
assert.strictEqual(spiceZero.ingredients[0].amount, 0, 'Gewuerz amount 0 muss bleiben');
assert.strictEqual(spiceZero.ingredients[1].amount, 200);
console.log('OK generative spice amount=0');

// 3) Structured: q.b. / fehlende Menge = 0 bleibt 0
const structLines = ['Basilikum q.b.', 'Olivenoel 20 ml', 'Salz'];
const structPayload = Object.assign(genPayload({
  pantry_ingredients: structLines,
  structured: true,
  mode: 'pantry',
}), {});
const enrichReq = core.buildGroqRequest(structPayload, 'test-model');
assert(/amount = 0/i.test(enrichReq.messages[0].content), 'Structured-Prompt muss amount=0 fuer fehlende Menge fordern');
assert(!/CHEF-FRAMEWORK/i.test(enrichReq.messages[0].content), 'Structured/Eigenrezept darf kein Chef-Framework haben');
assert(!/3-TEXTUREN|DREI Texturen|Mindestens 3 Texturen/i.test(enrichReq.messages[0].content), 'Structured: kein 3-Texturen-Standard');
assert.strictEqual(
  enrichReq.response_format.json_schema.schema.required.includes('garnish'),
  true,
  'Structured-Schema hat garnish (immer "")'
);
const structOut = core.toClientRecipe({
  title: 'Pesto-Test',
  servings: 2,
  prep_time: '',
  nutrition_note: '',
  garnish: 'soll weg',
  ingredients: {
    ing_01: { name: 'Basilikum', amount: 0, unit: 'g', status: 'benoetigt', netCarbs: 1, fat: 0.5, protein: 2, fiber: 1 },
    ing_02: { name: 'Olivenoel', amount: 20, unit: 'ml', status: 'benoetigt', netCarbs: 0, fat: 100, protein: 0, fiber: 0 },
    ing_03: { name: 'Salz', amount: 0, unit: 'g', status: 'benoetigt', netCarbs: 0, fat: 0, protein: 0, fiber: 0 },
  },
  shopping_list: [],
  steps: [],
}, structPayload);
assert.strictEqual(structOut.ingredients[0].amount, 0, 'q.b. muss amount 0 bleiben');
assert.strictEqual(structOut.ingredients[1].amount, 20);
assert.strictEqual(structOut.ingredients[1].unit, 'ml');
assert.strictEqual(structOut.ingredients[2].amount, 0);
assert.ok(structOut.shopping_list[0].includes('nicht angegeben'));
assert.strictEqual(structOut.ingredients[0].macrosPer100g.netCarbs, 0, 'Structured: Makros immer 0 (App berechnet)');
assert.strictEqual(structOut.ingredients[1].macrosPer100g.fat, 0, 'Structured: Makros immer 0');
assert.strictEqual(structOut.garnish, '', 'Structured: garnish leer');
console.log('OK structured qb/missing amount=0');

// 3b) Structured: servings 0 bleibt 0 (nicht auf 2 erzwingen); Prompt ohne Makro-Berechnung
const structNoServings = core.toClientRecipe({
  title: 'Ohne Portionen',
  servings: 0,
  prep_time: 'soll weg',
  nutrition_note: 'soll weg',
  garnish: 'soll weg',
  ingredients: {
    ing_01: { name: 'Basilikum', amount: 0, unit: 'g', status: 'benoetigt', netCarbs: 9, fat: 9, protein: 9, fiber: 9 },
    ing_02: { name: 'Olivenoel', amount: 20, unit: 'ml', status: 'benoetigt', netCarbs: 0, fat: 100, protein: 0, fiber: 0 },
    ing_03: { name: 'Salz', amount: 0, unit: 'g', status: 'benoetigt', netCarbs: 0, fat: 0, protein: 0, fiber: 0 },
  },
  shopping_list: ['x'],
  steps: ['Mischen'],
}, structPayload);
assert.strictEqual(structNoServings.servings, 0, 'servings 0 muss erhalten bleiben');
assert.strictEqual(structNoServings.prep_time, '', 'prep_time leer bei structured');
assert.strictEqual(structNoServings.nutrition_note, '', 'nutrition_note leer bei structured');
assert.strictEqual(structNoServings.garnish, '', 'garnish leer bei structured');
assert.strictEqual(structNoServings.ingredients[0].macrosPer100g.protein, 0);
assert(/MAKRO-REGEL|IMMER 0|Makros/i.test(enrichReq.messages[0].content), 'Structured-Prompt: keine Makro-Berechnung');
assert(/servings.*0|sonst 0/i.test(enrichReq.messages[0].content), 'Structured-Prompt: servings 0 wenn fehlend');
console.log('OK structured servings=0 + no macros');

// 4) Retry-Policy
assert.strictEqual(isNutriRecipeChatRetryableStatus(400), false);
assert.strictEqual(isNutriRecipeChatRetryableStatus(502), false);
assert.strictEqual(isNutriRecipeChatRetryableStatus(500), false);
assert.strictEqual(isNutriRecipeChatRetryableStatus(429), true);
assert.strictEqual(isNutriRecipeChatRetryableStatus(503), true);
console.log('OK retry policy (no 400/502 auto-retry)');

console.log('\nAll nutri-recipe unit tests passed.');
