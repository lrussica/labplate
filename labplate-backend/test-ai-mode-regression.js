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

assert.strictEqual(core.validateIncoming(exactLoggedPayload), null,
  'legacy core validator documents the original regression: mode ai was not accepted');
assert.deepStrictEqual(validateRecipeMode(exactLoggedPayload), { ok: true });
assert.deepStrictEqual(validateRecipeMode({
  mode: 'ai',
  original_mode: true,
}), {
  ok: false,
  error: 'mode_conflict',
  field: 'original_mode',
  rule: 'conflicts_with_mode',
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

console.log('test-ai-mode-regression: ALL OK');
