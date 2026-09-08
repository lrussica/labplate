/**
 * LabPlate – Recipe-Suggestions-Flow
 * STRUCTURED Input → Strict-Prompt; sonst Generativ mit Strict-Constraints.
 */
'use strict';

const core = require('./nutri-recipe-core');
const strictPrompt = require('./strict-prompt');

const MODULE = 'recipe-suggestions';

function buildRequest(payload, model) {
  const p = Object.assign({}, payload);
  // Strukturierte Eigenrezepte immer Strict – nie generative Vermischung.
  if (p.structured || core.looksStructured(p.pantry_ingredients)) {
    p.structured = true;
  }
  const req = core.buildGroqRequest(p, model);
  // Garantie: System-Prompt beginnt mit Strict-Version-Marker (structured)
  // bzw. Strict-Constraints (generativ).
  if (req.messages && req.messages[0] && req.messages[0].role === 'system') {
    const sys = String(req.messages[0].content || '');
    if (p.structured) {
      if (!sys.includes(strictPrompt.STRUCTURED_PROMPT_VERSION) && !sys.includes('MODUS: EIGENREZEPT')) {
        req.messages[0].content = strictPrompt.loadStrictPrompt({
          lang: p.lang,
          ingredientCount: (p.pantry_ingredients || []).length || 1,
        }) + '\n' + sys;
      }
    } else if (!sys.includes(strictPrompt.STRUCTURED_PROMPT_VERSION) && !sys.includes('STRICT_CONSTRAINTS')) {
      req.messages[0].content = strictPrompt.loadStrictConstraintsForGenerative() + '\n' + sys;
    }
  }
  return req;
}

async function run(payload, opts) {
  const p = Object.assign({}, payload);
  if (p.structured || core.looksStructured(p.pantry_ingredients)) p.structured = true;
  const requestBody = buildRequest(p, opts && opts.model);
  const result = await core.callGroq(requestBody, opts || {});
  if (result.error) return result;
  const recipe = core.toClientRecipe(result.data, p);
  if (!recipe) return { error: 'recipe_unavailable' };
  return { data: recipe, module: MODULE, strict: !!p.structured };
}

(function startup() {
  const probe = ['200 g Haferflocken', 'Salz q.b.', '1 EL Olivenoel', '100 g Spinat'];
  const msgs = core.buildEnrichmentMessages({
    lang: 'de', pantry_ingredients: probe, ai_instruction: '', allergens: [],
  });
  // Suggestions-Modul muss denselben Strict-Prompt fuer STRUCTURED laden.
  const status = strictPrompt.registerStrictModule(MODULE, {
    system: msgs[0] && msgs[0].content,
    user: msgs[1] && msgs[1].content,
    schema: JSON.stringify(core.buildEnrichmentSchema(probe)),
  });
  // Zusaetzlich: generative Constraints enthalten Versions-Marker
  const genConstraints = strictPrompt.loadStrictConstraintsForGenerative();
  if (!genConstraints.includes(strictPrompt.STRUCTURED_PROMPT_VERSION)) {
    console.error('[Konfiguration] FEHLER: recipe-suggestions generative constraints ohne Version');
  }
  if (status && status.ok) {
    // already logged by registerStrictModule
  }
})();

module.exports = {
  MODULE,
  buildRequest,
  run,
  isStrictActive: () => !!strictPrompt.getModuleStrictStatus(MODULE).ok,
  getStrictStatus: () => strictPrompt.getModuleStrictStatus(MODULE),
};
