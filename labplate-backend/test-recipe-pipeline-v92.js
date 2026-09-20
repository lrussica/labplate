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
const fbCold = pipeline.buildRetryFeedbackMessage([
  "Gerinnungsschutz: 'Frischkäse' ({0003}) wurde in Step 3 eingearbeitet; danach folgt Step 4 ('Rührei kochen') mit stove_level=5 — Hitze nach Einrühren verboten (auch wenn die Zutat nur noch als 'Mischung' vorkommt)",
]);
assert.ok(/Verschiebe das Einrühren von 'Frischkäse'/i.test(fbCold), 'Gerinnung directive: ' + fbCold);
assert.ok(/Herd ausgeschaltet|stove_level 0/i.test(fbCold), 'Gerinnung directive Herd AUS');
console.log('OK errorsToDirectives Fix B + staple + Gerinnung');

// TEST 3d: Fall 9 — Frischkäse kalt einrühren, danach Hitze (muss failen)
const fall9 = {
  title: 'Schnelles Rührei mit Räucherlachs und Frischkäse',
  prep_time_min: 14,
  nutrition: { kcal: 579, protein_g: 47, fat_g: 42, netto_kh_g: 3, ballaststoffe_g: 0 },
  diet_labels: ['keto', 'high_protein'],
  target_deviation_note: '',
  ingredients: [
    { id: '0001', name: 'Ei (Größe M, ca. 60 g)', amount: 3, unit: 'stk', protein_source: true, netCarbs: 1, fat: 10, protein: 13, fiber: 0 },
    { id: '0002', name: 'Räucherlachs', amount: 100, unit: 'g', protein_source: true, netCarbs: 0, fat: 5, protein: 20, fiber: 0 },
    { id: '0003', name: 'Frischkäse', amount: 50, unit: 'g', protein_source: false, netCarbs: 2, fat: 20, protein: 8, fiber: 0 },
    { id: '0004', name: 'Olivenöl', amount: 10, unit: 'ml', protein_source: false, netCarbs: 0, fat: 100, protein: 0, fiber: 0 },
    { id: '0005', name: 'Salz', amount: 0, unit: 'prise', protein_source: false, netCarbs: 0, fat: 0, protein: 0, fiber: 0 },
    { id: '0006', name: 'Pfeffer', amount: 0, unit: 'prise', protein_source: false, netCarbs: 0, fat: 0, protein: 0, fiber: 0 },
    { id: '0007', name: 'Frischer Dill', amount: 5, unit: 'g', protein_source: false, netCarbs: 2, fat: 0, protein: 1, fiber: 2 },
  ],
  steps: [
    { title: 'Zutaten vorbereiten', content: 'Alle Zutaten abwiegen: {0001}, {0002}, {0003}, {0004}, {0005}, {0006}, {0007}.', stove_level: 0, time_min: 5 },
    { title: 'Pfanne erhitzen', content: 'Pfanne auf mittlere Hitze stellen und {0004} hinzufügen.', stove_level: 6, time_min: 1 },
    { title: 'Eier verquirlen', content: '{0001} in einer Schüssel verquirlen, {0003} einrühren bis eine homogene Masse entsteht.', stove_level: 0, time_min: 2 },
    { title: 'Rührei kochen', content: 'Verquirlte Mischung in die Pfanne geben, kurz stocken lassen, dann {0002} hinzufügen und mit {0005} und {0006} abschmecken.', stove_level: 5, time_min: 4 },
    { title: 'Fertigstellen', content: 'Sorgfältig rühren bis das Rührei cremig-bissfest ist.', stove_level: 5, time_min: 2 },
  ],
  garnish: 'Mit {0007} bestreuen und sofort servieren.',
  chef_analysis: 'Siehe nutrition — cremige Textur und keto-Profil.',
};
const resultFall9 = validator.validateRecipeV2(fall9);
assert.strictEqual(resultFall9.ok, false, 'Fall 9 muss Gerinnung failen');
assert.ok(resultFall9.errors.some(function (e) {
  return /Gerinnungsschutz/i.test(e) && /Frischkäse/i.test(e) && /stove_level=5/i.test(e);
}), 'erwartet Gerinnung nach Einrühren: ' + resultFall9.errors.join('; '));
console.log('OK Fall 9 Gerinnung fail');

// TEST 3e: korrekt — Hitze zuerst, Frischkäse erst nach Herd AUS
const fall9ok = JSON.parse(JSON.stringify(fall9));
fall9ok.steps = [
  { title: 'Zutaten vorbereiten', content: 'Alle Zutaten abwiegen: {0001}, {0002}, {0003}, {0004}, {0005}, {0006}, {0007}.', stove_level: 0, time_min: 5 },
  { title: 'Pfanne erhitzen', content: 'Pfanne auf mittlere Hitze stellen und {0004} hinzufügen.', stove_level: 6, time_min: 1 },
  { title: 'Eier stocken', content: '{0001} in die Pfanne geben, stocken lassen, {0002} unterheben, mit {0005} und {0006} würzen.', stove_level: 5, time_min: 4 },
  { title: 'Herd aus', content: 'Herd vollständig ausschalten, Pfanne vom Herd nehmen.', stove_level: 0, time_min: 1 },
  { title: 'Frischkäse unterheben', content: '{0003} unter das Rührei heben bis cremig.', stove_level: 0, time_min: 1 },
];
fall9ok.garnish = 'Mit {0007} bestreuen.';
const resultFall9ok = validator.validateRecipeV2(fall9ok);
assert.strictEqual(resultFall9ok.ok, true, 'korrektes Rührei muss ok sein: ' + resultFall9ok.errors.join('; '));
console.log('OK Fall 9 Gegentest (Frischkäse nach Herd AUS)');

// TEST 3f: direkte Hitze mit {id} im selben Step
const directHeat = JSON.parse(JSON.stringify(fall9));
directHeat.steps = [
  { title: 'Mise', content: '{0001} verquirlen.', stove_level: 0, time_min: 2 },
  { title: 'Garen', content: '{0001} stocken lassen, {0003} bei Hitze unterrühren.', stove_level: 4, time_min: 3 },
];
const resultDirect = validator.validateColdIngredientHeatSequence(directHeat);
assert.strictEqual(resultDirect.ok, false, 'direkte Hitze mit Frischkäse muss failen');
console.log('OK direkte Gerinnung Hitze+id');

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
