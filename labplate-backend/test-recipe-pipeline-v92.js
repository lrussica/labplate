/**
 * Unit-Tests: recipe-validator v2 + pipeline v9.2 (Render, Retry).
 */
'use strict';

const assert = require('assert');
const validator = require('./recipe-validator');
const pipeline = require('./recipe-pipeline-v92');

const gutesBeispiel = {
  title: 'Schnelles High-Protein Pfannen-Hähnchen mit Ei-Spinat',
  prep_time_min: 20,
  nutrition: { kcal: 460, protein_g: 55, fat_g: 25, netto_kh_g: 3, ballaststoffe_g: 1 },
  diet_labels: ['high_protein'],
  target_deviation_note: '',
  ingredients: [
    { id: '0001', name: 'Hähnchenbrustfilet', amount: 150, unit: 'g', protein_source: true, netCarbs: 0, fat: 3.6, protein: 31, fiber: 0 },
    { id: '0002', name: 'Ei (Größe M, ca. 60 g)', amount: 2, unit: 'stk', protein_source: true, netCarbs: 0.7, fat: 10, protein: 13, fiber: 0 },
    { id: '0003', name: 'Spinat frisch', amount: 30, unit: 'g', protein_source: false, netCarbs: 1, fat: 0.3, protein: 2.5, fiber: 2 },
    { id: '0004', name: 'Olivenöl', amount: 8, unit: 'ml', protein_source: false, netCarbs: 0, fat: 100, protein: 0, fiber: 0 },
    { id: '0005', name: 'Pinienkerne', amount: 5, unit: 'g', protein_source: false, netCarbs: 10, fat: 68, protein: 14, fiber: 4 },
    { id: '0006', name: 'Salz', amount: 0, unit: 'prise', protein_source: false, netCarbs: 0, fat: 0, protein: 0, fiber: 0 },
  ],
  steps: [
    { title: 'Mise en Place', content: '{0001} in Streifen schneiden, {0002} verquirlen.', stove_level: 0, time_min: 5 },
    { title: 'Anbraten', content: '{0004} erhitzen, {0001} goldbraun braten.', stove_level: 6, time_min: 6 },
    { title: 'Ei & Spinat', content: '{0002} dazugeben, stocken lassen, {0003} unterheben, mit {0006} würzen.', stove_level: 4, time_min: 3 },
  ],
  garnish: 'Mit gerösteten {0005} bestreuen.',
  chef_analysis: 'Die Kombination aus {0001} und {0002} liefert eine hohe Proteinmenge bei wenig Kohlenhydraten, siehe nutrition.',
};

// TEST 2: valid
const result2 = validator.validateRecipeV2(gutesBeispiel);
assert.strictEqual(result2.ok, true, 'gutes Beispiel muss ok sein: ' + result2.errors.join('; '));
const rendered = pipeline.renderRecipeForDisplay(gutesBeispiel);
assert.ok(rendered, 'render liefert Rezept');
assert.ok(rendered.steps.some(function (s) { return /8ml Olivenöl|8 ml|8ml/.test(s) || s.indexOf('Olivenöl') >= 0; }), 'Placeholder aufgelöst: ' + rendered.steps.join(' | '));
assert.strictEqual(rendered.self_check, '');
assert.ok(rendered.nutrition_note.indexOf('siehe nutrition') >= 0 || rendered.nutrition_note.length > 10);
assert.strictEqual(rendered.recipe_schema_version, 'v9.2');
// Ei stk → 120 g
const egg = rendered.ingredients.find(function (i) { return /ei/i.test(i.name); });
assert.ok(egg && egg.amount === 120 && egg.unit === 'g', 'Ei stk→g');
console.log('OK validate+render valid v9.2');

// TEST 3: broken
const kaputt = JSON.parse(JSON.stringify(gutesBeispiel));
kaputt.steps = [
  { title: 'Anbraten', content: '15 ml Olivenöl erhitzen, Hähnchen goldbraun braten.', stove_level: 6, time_min: 6 },
];
kaputt.chef_analysis = 'Liefert ca. 64 g Protein und 30 g Fett pro Portion.';
const result3 = validator.validateRecipeV2(kaputt);
assert.strictEqual(result3.ok, false, 'kaputtes Beispiel muss failen');
assert.ok(result3.errors.some(function (e) { return /freie Mengen-Zahl|15 ml/i.test(e); }), 'erwartet free number error');
assert.ok(result3.errors.some(function (e) { return /chef_analysis|64 g|Protein/i.test(e); }), 'erwartet chef_analysis number error');
console.log('OK validate broken v9.2');

// TEST 3b: Klartext-Basiszutat ohne ingredients-Eintrag ("etwas Öl")
const ohneOel = JSON.parse(JSON.stringify(gutesBeispiel));
ohneOel.ingredients = ohneOel.ingredients.filter(function (i) { return !/öl|oel/i.test(i.name); });
ohneOel.steps = [
  { title: 'Anbraten', content: 'Brate {0001} in etwas Öl bei mittlerer Hitze.', stove_level: 6, time_min: 6 },
  { title: 'Ei', content: '{0002} dazugeben, mit {0006} würzen.', stove_level: 4, time_min: 3 },
];
ohneOel.garnish = 'Mit gerösteten {0005} bestreuen.';
const resultOel = validator.validateRecipeV2(ohneOel);
assert.strictEqual(resultOel.ok, false, 'etwas Öl ohne Listen-Eintrag muss failen');
assert.ok(resultOel.errors.some(function (e) {
  return /Zutat 'Öl' im Text erwähnt, aber nicht in ingredients/i.test(e);
}), 'erwartet unlisted staple Öl: ' + resultOel.errors.join('; '));
console.log('OK unlisted staple Öl');

// TEST 3c: Fix B errorsToDirectives Protein
const fb = pipeline.buildRetryFeedbackMessage([
  'Mehr als 2 Proteinquellen (Keyword-Heuristik): Hähnchen, Tofu, Ei',
  'Modell hat protein_source falsch gesetzt für: [Tofu]',
]);
assert.ok(/KONKRETE KORREKTUR: Du hast 3 Proteinquellen/i.test(fb), 'Fix B Protein-Directive');
assert.ok(/entferne sie stattdessen ganz/i.test(fb), 'Fix B remove-not-hide');
const fb2 = pipeline.buildRetryFeedbackMessage([
  "Zutat 'Öl' im Text erwähnt, aber nicht in ingredients gelistet (Step 1 ('Anbraten'))",
]);
assert.ok(/KONKRETE KORREKTUR:.*Öl/i.test(fb2), 'Fix B staple directive');
console.log('OK errorsToDirectives Fix B + staple');

// Retry: first fail, second ok
let calls = 0;
async function mockCallGroq() {
  calls += 1;
  if (calls === 1) return { data: kaputt };
  return { data: gutesBeispiel };
}
(async function () {
  const out = await pipeline.generateValidatedRecipe({
    payload: {},
    callGroq: mockCallGroq,
    buildRequestBody: function () { return { messages: [{ role: 'system', content: 'x' }] }; },
  });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.attempts, 2);
  assert.ok(out.recipe && out.recipe.title);
  console.log('OK retry succeeds on 2nd attempt');

  // Exhausted
  calls = 0;
  const fail = await pipeline.generateValidatedRecipe({
    payload: {},
    callGroq: async function () { calls += 1; return { data: kaputt }; },
    buildRequestBody: function () { return { messages: [] }; },
  });
  assert.strictEqual(fail.error, 'validation_exhausted');
  assert.strictEqual(fail.attempts, 3);
  assert.ok(!fail.recipe);
  assert.ok(fail.errors && fail.errors.length);
  console.log('OK exhausted after 3 attempts');

  console.log('\nAll recipe-v92 pipeline tests passed.');
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
