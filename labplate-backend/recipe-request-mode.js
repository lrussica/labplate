'use strict';

function validateRecipeMode(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'invalid_payload', field: 'mode', rule: 'required' };
  }
  const mode = body.mode;
  if (!['ai', 'original', 'pantry', 'shopping'].includes(mode)) {
    return { ok: false, error: 'invalid_payload', field: 'mode', rule: 'enum' };
  }
  if (mode === 'ai' && body.original_mode === true) {
    return { ok: false, error: 'mode_conflict', field: 'original_mode', rule: 'conflicts_with_mode' };
  }
  if (mode === 'original' && !body.recipeId) {
    return { ok: false, error: 'original_recipe_id_required', field: 'recipeId', rule: 'required' };
  }
  return { ok: true };
}

module.exports = { validateRecipeMode };
