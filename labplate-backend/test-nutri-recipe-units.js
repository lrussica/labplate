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

// 1) Generativ-Schema v9.2 + Prompt
const genReq = core.buildGroqRequest(genPayload(), 'test-model');
const unitEnum = genReq.response_format.json_schema.schema.properties.ingredients.items.properties.unit.enum;
assert.deepStrictEqual(unitEnum, ['g', 'ml', 'prise', 'messerspitze', 'stk'], 'Generativ-Schema unit enum v9.2');
const sys = genReq.messages[0].content;
assert(/CHEF-FRAMEWORK v9\.2|v9\.2/i.test(sys), 'Generativ-Prompt braucht Chef-Framework v9.2');
assert(/\{0001\}|ingredient_id|Platzhalter/i.test(sys), 'Generativ-Prompt: Platzhalter-Zwang');
assert(/KEIN self_check|kein Self-Check|KEIN \[SELF-CHECK\]/i.test(sys), 'Generativ-Prompt: kein Self-Check-Freitext');
assert(/BOTTOM-UP|Regel 0|0a/i.test(sys), 'Generativ-Prompt: Bottom-Up / 0a');
assert(/protein_source|MAXIMUM 2|PROTEIN-HARMONIE|Zutaten-Salat|VERBOTEN: Haehnchen \+ Tofu \+ Ei|etwas Oel anbraten|Basis-Zutaten/i.test(sys), 'Generativ-Prompt: max 2 Proteine inkl. Beispiel + Regel7 Basiszutaten');
assert(/KETO-EHRLEICHKEIT|netto_kh_g <10|<10/i.test(sys), 'Generativ-Prompt: Keto-Ehrlichkeit');
assert(/GERINNUNGSSCHUTZ|Mascarpone|Schmand|Creme fraiche/i.test(sys), 'Generativ-Prompt: Gerinnungsschutz');
assert(/prise|ABSOLUTES GRAMM-VERBOT|GEWUERZ/i.test(sys), 'Generativ-Prompt: Gewuerz ohne Gramm');
assert(/Kalorien-Plausibilitaet|Protein×4|Ballaststoffe×2/i.test(sys), 'Generativ-Prompt: Kalorien-Plausibilitaet');
assert(/Food-Pairing|FOOD PAIRING|3 Texturen|cremig \+ bissfest/i.test(sys), 'Generativ-Prompt: Food Pairing / Textur');
assert(/System-Chefkoch|Ernaehrungs-Wissenschaftler/i.test(sys), 'Generativ-Prompt: System-Chef-Rolle');
assert(/garnish/i.test(sys), 'Generativ-Prompt erwaehnt garnish');
assert(/chef_analysis/i.test(sys), 'Generativ-Prompt: chef_analysis');
assert(/SPRACHE \(verbindlich\)|komplett auf/i.test(sys), 'Generativ-Prompt: verbindliche Ausgabesprache');
assert.strictEqual(genReq.response_format.json_schema.schema.required.includes('garnish'), true);
assert.strictEqual(genReq.response_format.json_schema.schema.required.includes('chef_analysis'), true);
assert.strictEqual(genReq.response_format.json_schema.schema.required.includes('nutrition'), true);
assert.strictEqual(!!genReq.response_format.json_schema.schema.properties.self_check, false, 'kein self_check im Schema');
assert.strictEqual(genReq.response_format.json_schema.name, 'nutri_recipe_v92');
// Originalmodus: kein Chef-Framework
const origReq = core.buildGroqRequest(genPayload({
  ai_instruction: 'MODUS ORIGINALREZEPT (Italien): Gib die klassische Version von "Bolognese" zurück.',
}), 'test-model');
assert(!/CHEF-FRAMEWORK/i.test(origReq.messages[0].content), 'Originalmodus ohne Chef-Framework');
console.log('OK generative schema+prompt v9.2');

// 2) Generativ v9.2 → Client via toClientRecipe (Placeholder-Resolve)
const eggOil = core.toClientRecipe({
  title: 'Spinat-Omelett',
  prep_time_min: 10,
  nutrition: { kcal: 300, protein_g: 20, fat_g: 20, netto_kh_g: 2, ballaststoffe_g: 1 },
  diet_labels: [],
  target_deviation_note: '',
  ingredients: [
    { id: '0001', name: 'Ei (Größe M, ca. 60 g)', amount: 2, unit: 'stk', protein_source: true, netCarbs: 0.7, fat: 10, protein: 13, fiber: 0 },
    { id: '0002', name: 'Olivenoel', amount: 15, unit: 'ml', protein_source: false, netCarbs: 0, fat: 100, protein: 0, fiber: 0 },
  ],
  steps: [
    { title: 'Mix', content: '{0001} verquirlen, mit {0002} braten.', stove_level: 5, time_min: 5 },
  ],
  garnish: 'Ohne Extra',
  chef_analysis: 'Siehe nutrition – hohe Proteinmenge aus {0001}.',
}, genPayload());
assert.strictEqual(eggOil.ingredients[0].unit, 'g');
assert.strictEqual(eggOil.ingredients[0].amount, 120);
assert.strictEqual(eggOil.ingredients[1].unit, 'ml');
assert.strictEqual(eggOil.ingredients[1].amount, 15);
assert.ok(eggOil.steps[0].indexOf('Olivenoel') >= 0 || eggOil.steps[0].indexOf('15') >= 0);
assert.strictEqual(eggOil.self_check, '');
assert.strictEqual(eggOil.recipe_schema_version, 'v9.2');
console.log('OK generative egg/g + oil/ml via v9.2 render');

// 2b) Generativ: Gewuerz amount=0 bleibt 0 (Prise) — Legacy-Pfad ohne prep_time_min
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
