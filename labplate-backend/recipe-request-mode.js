'use strict';

const AI_CATEGORIES = [
  'main_meat', 'main_fish', 'main_vegetarian', 'soup',
  'stew_braise', 'dessert', 'salad', 'other',
];

function valueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function validateAiPayload(body) {
  const errors = [];
  const add = (field, rule, expected, actual) => {
    errors.push({ field, rule, expected, actual: valueType(actual) });
  };
  if (body.dishCategory != null && !AI_CATEGORIES.includes(body.dishCategory)) {
    add('dishCategory', 'enum', 'one of AI dish categories', body.dishCategory);
  }
  if (body.allowedIngredients != null && !Array.isArray(body.allowedIngredients)) {
    add('allowedIngredients', 'type', 'array', body.allowedIngredients);
  }
  if (body.mainIngredient != null && typeof body.mainIngredient !== 'string') {
    add('mainIngredient', 'type', 'string|null', body.mainIngredient);
  }
  if (body.pantry_ingredients != null && !Array.isArray(body.pantry_ingredients)) {
    add('pantry_ingredients', 'type', 'array', body.pantry_ingredients);
  }
  if (body.userRequest != null && (!body.userRequest || typeof body.userRequest !== 'object' || Array.isArray(body.userRequest))) {
    add('userRequest', 'type', 'object', body.userRequest);
  }
  if (body.targets != null && (!body.targets || typeof body.targets !== 'object' || Array.isArray(body.targets))) {
    add('targets', 'type', 'object', body.targets);
  }
  if (body.targets && body.targets.kcal != null && typeof body.targets.kcal !== 'number') {
    add('targets.kcal', 'type', 'number', body.targets.kcal);
  }
  if (!errors.length) return { ok: true };
  return {
    ok: false,
    error: 'invalid_payload',
    field: errors[0].field,
    rule: errors[0].rule,
    expected: errors[0].expected,
    actual: errors[0].actual,
    errors,
  };
}

function validateRecipeMode(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'invalid_payload', field: 'mode', rule: 'required' };
  }
  const mode = body.mode;
  if (!['ai', 'original', 'pantry', 'shopping'].includes(mode)) {
    return { ok: false, error: 'invalid_payload', field: 'mode', rule: 'enum' };
  }
  if (mode === 'ai' && body.original_mode === true) {
    return {
      ok: false,
      error: 'mode_conflict',
      field: 'original_mode',
      rule: 'oneOf',
      expected: 'false when mode is ai',
      actual: valueType(body.original_mode),
      errors: [{
        field: 'original_mode',
        rule: 'oneOf',
        expected: 'false when mode is ai',
        actual: valueType(body.original_mode),
      }],
    };
  }
  if (mode === 'ai') return validateAiPayload(body);
  if (mode === 'original' && !body.recipeId) {
    return { ok: false, error: 'original_recipe_id_required', field: 'recipeId', rule: 'required' };
  }
  return { ok: true };
}

module.exports = { validateRecipeMode, validateAiPayload, valueType };
