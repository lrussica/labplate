/**
 * LabPlate – Coach-Rezept-Flow (Strict Eigenrezept)
 * Nutzt zentral loadStrictPrompt() aus strict-prompt.js.
 */
'use strict';

const core = require('./nutri-recipe-core');
const strictPrompt = require('./strict-prompt');

const MODULE = 'coach-recipe';

function buildRequest(payload, model) {
  // Coach-Flow ist immer STRUCTURED/Strict – nie kreativ umschreiben.
  const p = Object.assign({}, payload, { structured: true });
  if (!p.pantry_ingredients || !p.pantry_ingredients.length) {
    throw new Error(MODULE + ': pantry_ingredients required');
  }
  return core.buildGroqRequest(p, model);
}

async function run(payload, opts) {
  const requestBody = buildRequest(payload, opts && opts.model);
  const result = await core.callGroq(requestBody, opts || {});
  if (result.error) return result;
  const recipe = core.toClientRecipe(result.data, Object.assign({}, payload, { structured: true }));
  if (!recipe) return { error: 'recipe_unavailable' };
  return { data: recipe, module: MODULE, strict: true };
}

(function startup() {
  const probe = ['200 g Haferflocken', 'Salz q.b.', '1 EL Olivenoel', '100 g Spinat'];
  const msgs = core.buildEnrichmentMessages({
    lang: 'de', pantry_ingredients: probe, ai_instruction: '', allergens: [],
  });
  strictPrompt.registerStrictModule(MODULE, {
    system: msgs[0] && msgs[0].content,
    user: msgs[1] && msgs[1].content,
    schema: JSON.stringify(core.buildEnrichmentSchema(probe)),
  });
})();

module.exports = {
  MODULE,
  buildRequest,
  run,
  isStrictActive: () => !!strictPrompt.getModuleStrictStatus(MODULE).ok,
  getStrictStatus: () => strictPrompt.getModuleStrictStatus(MODULE),
};
