/**
 * LabPlate – Nutri-Coach Rezept-Flow (Strict Eigenrezept)
 * Identische Strict-Regeln wie Core/Coach – zentrale Utility.
 */
'use strict';

const core = require('./nutri-recipe-core');
const strictPrompt = require('./strict-prompt');
const coachRecipe = require('./coach-recipe');

const MODULE = 'nutri-coach';

function buildRequest(payload, model) {
  return coachRecipe.buildRequest(payload, model);
}

async function run(payload, opts) {
  const result = await coachRecipe.run(payload, opts);
  if (result && result.data) result.module = MODULE;
  return result;
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
