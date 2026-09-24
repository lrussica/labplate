'use strict';

const assert = require('assert');
const core = require('./nutri-recipe-core');
const { validateRecipeMode } = require('./recipe-request-mode');

const exactLoggedPayload = {
  mode: 'ai',
  original_mode: false,
  dishCategory: 'main_meat',
  allowedIngredients: [],
  mainIngredient: 'Proteinreiches Keto-Hauptgericht unter 10 g Netto-Kohlenhydrate, maximal 2 Proteinquellen.',
  pantry_ingredients: ['Proteinreiches Keto-Hauptgericht unter 10 g Netto-Kohlenhydrate, maximal 2 Proteinquellen.'],
  ai_instruction: 'x'.repeat(1850),
};
const currentLoggedPayload = {
  mode: 'ai',
  original_mode: false,
  lang: 'de',
  dishCategory: 'main_meat',
  mainIngredient: null,
  allowedIngredients: [],
  userRequest: { text: 'Proteinreiches Keto-Hauptgericht' },
  targets: { kcal: 600, protein_g: 40 },
  macros: {},
  micronutrient_gaps: [],
};

assert.ok(core.validateIncoming(exactLoggedPayload),
  'AI payload must be accepted by the shared validator');
assert.deepStrictEqual(validateRecipeMode(exactLoggedPayload), { ok: true });
assert.ok(core.validateIncoming(currentLoggedPayload),
  'Current AI payload without recipeId or pantry_ingredients must be accepted');
assert.deepStrictEqual(validateRecipeMode(currentLoggedPayload), { ok: true });
assert.deepStrictEqual(validateRecipeMode({
  mode: 'ai',
  original_mode: true,
}), {
  ok: false,
  error: 'mode_conflict',
  field: 'original_mode',
  rule: 'oneOf',
  expected: 'false when mode is ai',
  actual: 'boolean',
  errors: [{
    field: 'original_mode',
    rule: 'oneOf',
    expected: 'false when mode is ai',
    actual: 'boolean',
  }],
});
assert.deepStrictEqual(validateRecipeMode({
  mode: 'original',
}), {
  ok: false,
  error: 'original_recipe_id_required',
  field: 'recipeId',
  rule: 'required',
});
assert.deepStrictEqual(validateRecipeMode({
  mode: 'original',
  recipeId: 'lasagne_classica',
}), { ok: true });
assert.deepStrictEqual(validateRecipeMode({
  mode: 'ai',
  allowedIngredients: [],
  mainIngredient: null,
}), { ok: true });
assert.deepStrictEqual(validateRecipeMode({
  mode: 'ai',
  targets: { kcal: 'not-a-number' },
}), {
  ok: false,
  error: 'invalid_payload',
  field: 'targets.kcal',
  rule: 'type',
  expected: 'number',
  actual: 'string',
  errors: [{
    field: 'targets.kcal',
    rule: 'type',
    expected: 'number',
    actual: 'string',
  }],
});
assert.deepStrictEqual(validateRecipeMode({
  mode: 'ai',
  dishCategory: 'not-a-category',
}), {
  ok: false,
  error: 'invalid_payload',
  field: 'dishCategory',
  rule: 'enum',
  expected: 'one of AI dish categories',
  actual: 'string',
  errors: [{
    field: 'dishCategory',
    rule: 'enum',
    expected: 'one of AI dish categories',
    actual: 'string',
  }],
});

console.log('test-ai-mode-regression: ALL OK');
