'use strict';
const assert = require('assert');
const canon = require('./recipe-canonical-display');
const pipeline = require('./recipe-pipeline-v92');

// Legacy baked step strings (what production UI used to show)
const legacyRecipe = {
  title: 'Ragù alla Bolognese',
  finalServings: 1,
  sourceServingsStatus: 'inferred',
  requiresReview: true,
  qualityStatus: 'review',
  finalIngredients: [
    { id: '1', name: 'Olivenöl', amount: 10, unit: 'ml' },
    { id: '2', name: 'Zwiebel', amount: 35, unit: 'g' },
    { id: '3', name: 'Karotte', amount: 25, unit: 'g' },
    { id: '4', name: 'Sellerie', amount: 15, unit: 'g' },
    { id: '5', name: 'Rinderhackfleisch', amount: 135, unit: 'g' },
  ],
  finalNutrition: { kcal: 420, protein_g: 29, fat_g: 30, netto_kh_g: 9, ballaststoffe_g: 2 },
  steps: [
    'Anschwitzen: Stufe 5 von 9. ca. 5 Min. Olivenöl Zwiebel Karotte Sellerie',
    'Fleisch anbraten: Stufe 6 von 9. ca. 10 Min. Rinderhackfleisch',
    'Langsam köcheln lassen und garnieren: Stufe 2 von 9. ca. 120 Min. Petersilie',
  ],
  garnish: 'Rinderhackfleisch',
  nutrition_note: 'self_check ok',
  prep_time: '30 Minuten',
  timing: { totalMinutes: 135, timingStatus: 'calculated' },
};

(function testSanitizeLegacy() {
  const s = canon.sanitizeLegacyStepInstruction(
    'Anschwitzen: Stufe 5 von 9. ca. 5 Min. Olivenöl Zwiebel Karotte Sellerie',
    0, 3
  );
  assert.ok(s.instruction);
  assert.ok(!/Stufe\s+\d+\s+von\s+9/i.test(s.instruction));
  assert.ok(!/Olivenöl\s+Zwiebel\s+Karotte\s+Sellerie/i.test(s.instruction));
  assert.ok(/anschwitz|dünsten|weich/i.test(s.instruction));
  console.log('PASS sanitize legacy step →', s.instruction);
}());

(function testCanonicalDisplay() {
  const d = canon.toCanonicalDisplayRecipe(legacyRecipe);
  assert.ok(d.steps.length >= 2);
  d.steps.forEach(function (step) {
    assert.ok(!('title' in step));
    assert.ok(!('ingredientNames' in step));
    assert.ok(!('ingredients' in step));
    assert.ok(step.instruction);
    assert.ok(!/Stufe\s+\d+\s+von\s+9/i.test(step.instruction));
    assert.ok(!/Olivenöl\s+Zwiebel\s+Karotte\s+Sellerie/i.test(step.instruction));
  });
  assert.strictEqual(d.garnish.length, 0, 'falsche Garnitur Rinderhack verworfen');
  assert.ok(d.finalNutrition);
  assert.ok(d.nutritionSummary);
  assert.strictEqual(d.nutritionSummary.carbs, Math.round(d.nutritionSummary.netCarbs));
  assert.ok(!('self_check' in d));
  assert.ok(!('nutrition_note' in d));
  assert.ok(!('prep_time' in d));

  const visible = canon.buildCanonicalVisibleText(d);
  assert.ok(!/Olivenöl\s+Zwiebel\s+Karotte\s+Sellerie/i.test(visible));
  assert.ok(!/Garnitur:\s*Rinderhackfleisch/i.test(visible));
  assert.ok(!/self_check/i.test(visible));
  assert.ok(!/ai_instruction/i.test(visible));
  assert.ok(/Ragù/i.test(visible));
  assert.ok(d._visibleOutput.status === 'pass', JSON.stringify(d._visibleOutput));
  console.log('PASS canonical display visible text clean');
  console.log('--- VISIBLE TEXT SAMPLE ---\n' + visible.split('\n').slice(0, 12).join('\n'));
}());

(function testPipelineThenCanonical() {
  const raw = {
    title: 'Ragù alla Bolognese',
    servings: 1,
    prep_time_min: 150,
    nutrition: { kcal: 400, protein_g: 30, fat_g: 20, netto_kh_g: 10, ballaststoffe_g: 2 },
    ingredients: [
      { id: '0001', name: 'Olivenöl', amount: 10, unit: 'ml', protein_source: false, netCarbs: 0, fat: 100, protein: 0, fiber: 0 },
      { id: '0002', name: 'Zwiebel', amount: 35, unit: 'g', protein_source: false, netCarbs: 7, fat: 0.1, protein: 1, fiber: 1.5 },
      { id: '0003', name: 'Karotte', amount: 25, unit: 'g', protein_source: false, netCarbs: 7, fat: 0.2, protein: 1, fiber: 2 },
      { id: '0004', name: 'Sellerie', amount: 15, unit: 'g', protein_source: false, netCarbs: 1, fat: 0.2, protein: 0.7, fiber: 1.5 },
      { id: '0005', name: 'Rinderhackfleisch', amount: 135, unit: 'g', protein_source: true, netCarbs: 0, fat: 15, protein: 20, fiber: 0 },
      { id: '0006', name: 'Passierte Tomaten', amount: 83, unit: 'ml', protein_source: false, netCarbs: 3.5, fat: 0.2, protein: 1, fiber: 1 },
    ],
    steps: [
      { title: 'Anschwitzen', content: '{0001} {0002} {0003} {0004}', stove_level: 5, time_min: 5 },
      { title: 'Fleisch anbraten', content: '{0005}', stove_level: 6, time_min: 10 },
      { title: 'Langsam köcheln lassen und garnieren', content: '{0005}', stove_level: 2, time_min: 120 },
    ],
    garnish: '{0005}',
    chef_analysis: 'Test',
    diet_labels: [],
    target_deviation_note: '',
  };
  const rendered = pipeline.renderRecipeForDisplay(raw, {
    noHerbs: true,
    isOriginalBolognese: true,
  });
  rendered.finalIngredients = rendered.ingredients;
  rendered.finalNutrition = rendered.finalNutrition || rendered.nutrition;
  const d = canon.toCanonicalDisplayRecipe(rendered);
  const visible = canon.buildCanonicalVisibleText(d);
  assert.ok(!/Olivenöl\s+Zwiebel\s+Karotte\s+Sellerie/i.test(visible), visible);
  assert.ok(!/Garnitur:\s*Rinderhackfleisch/i.test(visible), visible);
  assert.ok(!/Stufe\s+\d+\s+von\s+9/i.test(visible), visible);
  assert.strictEqual((visible.match(/data-recipe-card/g) || []).length, 0);
  // Simulate one card
  assert.ok(d.steps.every(function (s) { return s.instruction && s.instruction.length > 10; }));
  console.log('PASS pipeline→canonical visible', {
    steps: d.steps.length,
    garnish: d.garnish,
    quality: d.qualityStatus,
  });
}());

(function testForbiddenPatterns() {
  const bad = canon.toCanonicalDisplayRecipe({
    title: 'X',
    finalIngredients: [{ name: 'A', amount: 1, unit: 'g' }],
    finalNutrition: { kcal: 1, protein_g: 1, fat_g: 1, netto_kh_g: 1, ballaststoffe_g: 0 },
    steps: ['Olivenöl Zwiebel Karotte Sellerie'],
  });
  // bare list should be replaced or blocked
  const visible = canon.buildCanonicalVisibleText(bad);
  assert.ok(
    !/Olivenöl\s+Zwiebel\s+Karotte\s+Sellerie/i.test(visible) || bad.qualityStatus === 'blocked',
    'raw list must not appear as ready'
  );
  console.log('PASS forbidden pattern handling', bad.qualityStatus);
}());

console.log('\nAll canonical visible-output tests passed.');
