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
console.log('OK generative schema+prompt');

// 2) Generativ: Ei als g, Oel als ml (simulierte Modell-Antwort nach korrekter Umrechnung)
const eggOil = core.toClientRecipe({
  title: 'Spinat-Omelett',
  servings: 1,
  prep_time: '10 Min',
  nutrition_note: 'Test',
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
console.log('OK generative egg/g + oil/ml');

// 3) Structured: q.b. / fehlende Menge = 0 bleibt 0
const structLines = ['Basilikum q.b.', 'Olivenoel 20 ml', 'Salz'];
const structPayload = Object.assign(genPayload({
  pantry_ingredients: structLines,
  structured: true,
  mode: 'pantry',
}), {});
const enrichReq = core.buildGroqRequest(structPayload, 'test-model');
assert(/amount = 0/i.test(enrichReq.messages[0].content), 'Structured-Prompt muss amount=0 fuer fehlende Menge fordern');
const structOut = core.toClientRecipe({
  title: 'Pesto-Test',
  servings: 2,
  prep_time: '',
  nutrition_note: '',
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
console.log('OK structured qb/missing amount=0');

// 3b) Structured: servings 0 bleibt 0 (nicht auf 2 erzwingen); Prompt ohne Makro-Berechnung
const structNoServings = core.toClientRecipe({
  title: 'Ohne Portionen',
  servings: 0,
  prep_time: 'soll weg',
  nutrition_note: 'soll weg',
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
