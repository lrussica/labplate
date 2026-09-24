'use strict';
const assert = require('assert');
const quality = require('./ai-recipe-quality');
const renderer = require('./recipe-ai-renderer');
const db = [
  { id: 'cream', name: 'Sahne', fiber: 0 }, { id: 'egg', name: 'Ei', fiber: 0 },
  { id: 'chicken', name: 'Hähnchen', fiber: 0 }, { id: 'butter', name: 'Butter', fiber: 0 },
  { id: 'parmesan', name: 'Parmesan', fiber: 0 }, { id: 'veg', name: 'Karotte', fiber: 3 },
];
function base(step, ingredients) {
  return { title: 'Test', dishCategory: 'other', servings: 1,
    ingredients: ingredients || [{ id: 'veg', name: 'Karotte', amount: 300, unit: 'g', role: 'vegetable' }],
    steps: [step] };
}
assert.ok(quality.validateHardConstraints(base({ order: 1, ingredientIds: ['cream'], action: 'boil', durationMin: 2, temperatureC: 90 }, [{ id: 'cream', name: 'Sahne', amount: 50, unit: 'ml', role: 'liquid' }]), { ingredientDatabase: db }).violations.some((v) => v.code === 'DAIRY_HEAT_MAX'));
assert.ok(quality.validateHardConstraints(base({ order: 1, ingredientIds: ['egg'], action: 'simmer', durationMin: 2, temperatureC: 90 }, [{ id: 'egg', name: 'Ei', amount: 2, unit: 'piece', role: 'binder' }]), { ingredientDatabase: db }).violations.some((v) => v.code === 'EGG_HOT_SAUCE_MAX'));
assert.ok(quality.validateHardConstraints(base({ order: 1, ingredientIds: ['cream'], action: 'boil', durationMin: 2, temperatureC: null }, [{ id: 'cream', name: 'Sahne', amount: 50, unit: 'ml', role: 'liquid' }]), { ingredientDatabase: db }).violations.some((v) => v.code === 'DAIRY_HEAT_ACTION'));
assert.ok(quality.validateHardConstraints({ title: 'Bake', dishCategory: 'other', servings: 1, ingredients: [{ id: 'veg', name: 'Karotte', amount: 300, unit: 'g', role: 'vegetable' }], steps: [{ order: 1, ingredientIds: ['veg'], action: 'bake', durationMin: 10, temperatureC: 180 }] }, { ingredientDatabase: db }).violations.some((v) => v.code === 'SEQUENCE_PREHEAT_BEFORE_BAKE'));
const badExample = {
  title: 'Bad hot sauce', dishCategory: 'main_meat', servings: 1,
  ingredients: [
    { id: 'chicken', name: 'Hähnchen', amount: 150, unit: 'g', role: 'main_protein' },
    { id: 'egg1', name: 'Ei', amount: 2, unit: 'piece', role: 'main_protein' },
    { id: 'cream', name: 'Sahne', amount: 20, unit: 'ml', role: 'liquid' },
    { id: 'butter', name: 'Butter', amount: 40, unit: 'g', role: 'fat' },
    { id: 'parmesan', name: 'Parmesan', amount: 30, unit: 'g', role: 'main_protein' },
  ],
  steps: [
    { order: 1, ingredientIds: ['chicken'], action: 'fry', durationMin: 5, temperatureC: 180 },
    { order: 2, ingredientIds: ['cream', 'egg1'], action: 'simmer', durationMin: 3, temperatureC: 90 },
  ],
};
const badCodes = quality.validateHardConstraints(badExample, {
  ingredientDatabase: db,
  userRequest: { maxProteinSources: 2 },
}).violations.map((v) => v.code);
assert.ok(badCodes.includes('EGG_HOT_SAUCE_ACTION'));
assert.ok(badCodes.includes('DAIRY_HEAT_ACTION'));
assert.ok(badCodes.includes('FIBER_PROFILE_MIN'));
assert.ok(badCodes.includes('PROTEIN_SOURCE_MAX'));
const eggBeforeHeatRemoval = {
  title: 'Egg sauce', dishCategory: 'other', servings: 1,
  ingredients: [{ id: 'egg', name: 'Ei', amount: 1, unit: 'piece', role: 'main_protein' }],
  steps: [
    { order: 1, ingredientIds: ['egg'], action: 'simmer', durationMin: 2, temperatureC: 90 },
    { order: 2, ingredientIds: ['egg'], action: 'fold_in', durationMin: null, temperatureC: null },
  ],
};
assert.ok(quality.validateHardConstraints(eggBeforeHeatRemoval, { ingredientDatabase: db }).violations.some((v) => v.code === 'EGG_BEFORE_REMOVE_FROM_HEAT'));
assert.ok(renderer.renderRecipe({ servings: 2, title: 'Pasta', ingredients: [{ id: 'x', name: 'Tomate', amount: 100, unit: 'g' }], steps: [{ order: 1, ingredientIds: ['x'], action: 'chop', durationMin: 1, temperatureC: null }] }, { lang: 'it', servings: 4 }).steps[0].label === 'Tagliare');
assert.strictEqual(renderer.renderRecipe({ servings: 2, ingredients: [{ id: 'x', name: 'Tomate', amount: 100, unit: 'g' }], steps: [] }, { lang: 'tr', servings: 4 }).ingredients[0].amount, 200);
const eggText = renderer.renderRecipe({ servings: 1, ingredients: [{ id: 'egg', name: 'Ei', amount: 1, unit: 'piece' }], steps: [{ order: 1, ingredientIds: ['egg'], action: 'whisk', durationMin: null, temperatureC: null }] }, { lang: 'de', servings: 1 }).steps[0].instruction;
assert.ok(eggText.includes('1 Ei') && !eggText.includes('Eier'), eggText);
for (const lang of ['de', 'it', 'fr', 'tr']) {
  const text = renderer.renderRecipe({
    servings: 1, ingredients: [{ id: 'egg', name: { de: 'Ei', it: 'Uovo', fr: 'Œuf', tr: 'Yumurta' }, amount: 1, unit: 'piece' }],
    steps: [{ order: 1, ingredientIds: ['egg'], action: 'whisk', durationMin: null, temperatureC: null }],
  }, { lang, servings: 1 }).steps[0].instruction;
  assert.ok(text && !/\bTeller\b/.test(text), `${lang} renderer produced an empty/invalid instruction`);
}
(async () => {
  const ai = await quality.generateAiRecipe({
    context: {
      dishCategory: 'other',
      ingredientDatabase: [{ id: 'veg', name: 'Karotte', fiber: 3 }],
      allowedIngredients: [{ id: 'veg', name: 'Karotte', fiber: 3 }],
      lang: 'de',
    },
    callGroq: async () => ({ data: {
      title: 'Pipeline test', dishCategory: 'other', servings: 1,
      ingredients: [{ id: 'veg', name: 'Karotte', amount: 300, unit: 'g', role: 'vegetable' }],
      steps: [{ order: 1, ingredientIds: ['veg'], action: 'chop', durationMin: null, temperatureC: null }],
    } }),
  });
  assert.strictEqual(ai.ok, true);
  assert.deepStrictEqual(ai.pipeline, {
    version: 'ai-quality-2026-09-24', renderer: true, validator: true, attempts: 1,
  });
  assert.ok(!('text' in ai.validatedRecipe.steps[0]));
  assert.ok(ai.recipe.steps[0].instruction);
  assert.deepStrictEqual(Object.keys(ai.recipe.steps[0]).sort(), [
    'action', 'durationMin', 'ingredientIds', 'instruction', 'stepNumber', 'temperatureC',
  ]);
  assert.ok(!JSON.stringify(ai.recipe.steps).includes('Provider-Rohtext'));
  console.log('test-ai-quality-rules-renderer: ALL OK');
})().catch((error) => { console.error(error); process.exit(1); });
