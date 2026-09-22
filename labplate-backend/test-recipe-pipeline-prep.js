/**
 * Unit-Tests: Prep-Assistent v1 (nur Steps, keine Mengen in der KI-Ausgabe).
 */
'use strict';

const assert = require('assert');
const prep = require('./recipe-pipeline-prep');
const core = require('./nutri-recipe-core');

const sampleInput = {
  prep_mode: true,
  lang: 'de',
  title: 'Lachs mit Ei',
  baseServings: 1,
  targetServings: 1,
  ingredients: [
    {
      ingredientId: 'ing_salmon',
      displayName: 'Lachsfilet',
      amount: 150,
      unit: 'g',
      status: 'vorhanden',
      macrosPer100g: { netCarbs: 0, fat: 13, protein: 20, fiber: 0 },
    },
    {
      ingredientId: 'ing_oil',
      displayName: 'Olivenöl',
      amount: 10,
      unit: 'ml',
      status: 'benoetigt',
      macrosPer100g: { netCarbs: 0, fat: 100, protein: 0, fiber: 0 },
    },
    {
      ingredientId: 'ing_egg',
      displayName: 'Ei (Größe M, ca. 60 g)',
      amount: 1,
      unit: 'stk',
      status: 'vorhanden',
      macrosPer100g: { netCarbs: 0.7, fat: 10, protein: 13, fiber: 0 },
    },
  ],
  plannedActions: [
    {
      actionId: 'act_sear_salmon',
      action: 'braten',
      ingredientIds: ['ing_salmon', 'ing_oil'],
      heatLevel: 6,
    },
    {
      actionId: 'act_fry_egg',
      action: 'braten',
      ingredientIds: ['ing_egg'],
      durationMinutes: 3,
    },
  ],
};

const parsedIn = prep.parsePrepIncoming(sampleInput);
assert.ok(parsedIn);
assert.strictEqual(parsedIn.titleHint, 'Lachs mit Ei');
assert.strictEqual(parsedIn.plannedActions[0].actionId, 'act_sear_salmon');
console.log('OK parsePrepIncoming');

const msgs = prep.buildPrepAssistantMessages(parsedIn);
assert.ok(/niemals Mengenangaben/i.test(msgs[0].content));
assert.ok(/ing_salmon/.test(msgs[1].content));
assert.ok(!/"amount"\s*:/.test(msgs[1].content), 'KI-Userpayload darf keine amount-Felder enthalten');
assert.ok(!/servings/i.test(msgs[1].content), 'KI-Userpayload ohne servings');
const schema = prep.buildPrepOutputSchema();
assert.deepStrictEqual(schema.schema.required, ['steps']);
assert.ok(!schema.schema.properties.title);
assert.ok(!schema.schema.properties.valid);
assert.deepStrictEqual(
  schema.schema.properties.steps.items.required.slice().sort(),
  ['actionId', 'ingredientIds', 'instruction', 'stepNumber'].sort()
);
console.log('OK messages + schema (nur steps)');

const goodAi = {
  steps: [
    {
      stepNumber: 1,
      actionId: 'act_sear_salmon',
      ingredientIds: ['ing_salmon', 'ing_oil'],
      instruction: 'Das Olivenöl in einer Pfanne erhitzen und den Lachs darin von allen Seiten anbraten.',
    },
    {
      stepNumber: 2,
      actionId: 'act_fry_egg',
      ingredientIds: ['ing_egg'],
      instruction: 'Das Ei daneben braten, bis das Eigelb stockt.',
    },
  ],
};
const vOk = prep.validatePrepAssistantOutput(goodAi, parsedIn);
assert.strictEqual(vOk.ok, true, vOk.errors.join('; '));
console.log('OK validate valid');

const withAmount = JSON.parse(JSON.stringify(goodAi));
withAmount.steps[0].instruction = '200g Lachs anbraten.';
const vAmt = prep.validatePrepAssistantOutput(withAmount, parsedIn);
assert.strictEqual(vAmt.ok, false);
assert.ok(vAmt.errors.some(function (e) { return /Menge|Einheit/i.test(e); }));
console.log('OK reject amount');

const glued = JSON.parse(JSON.stringify(goodAi));
glued.steps[0].instruction = '30ml Kokoscreme30g Avocado unterrühren.';
const vGlued = prep.validatePrepAssistantOutput(glued, parsedIn);
assert.strictEqual(vGlued.ok, false);
console.log('OK reject glued amounts');

const badId = JSON.parse(JSON.stringify(goodAi));
badId.steps[0].ingredientIds = ['ing_unknown'];
assert.strictEqual(prep.validatePrepAssistantOutput(badId, parsedIn).ok, false);
console.log('OK reject unknown ingredientId');

const wrongIng = JSON.parse(JSON.stringify(goodAi));
wrongIng.steps[0].ingredientIds = ['ing_egg'];
assert.ok(prep.validatePrepAssistantOutput(wrongIng, parsedIn).errors.some(function (e) {
  return /gehört nicht zu actionId/i.test(e);
}));
console.log('OK reject ingredient not in action');

const client = prep.renderPrepClientRecipe(parsedIn, goodAi);
assert.strictEqual(client.title, 'Lachs mit Ei');
assert.strictEqual(client.prep_mode, true);
assert.strictEqual(client.ingredients.length, 3);
assert.strictEqual(client.ingredients.find(function (i) { return i._prep_ingredient_id === 'ing_salmon'; }).amount, 150);
assert.strictEqual(client.steps.length, 2);
assert.ok(!/\d+\s*g\b/i.test(client.steps.join(' ')));
assert.strictEqual(client.prep_steps[0].actionId, 'act_sear_salmon');
console.log('OK render (Titel aus App, Mengen aus App)');

(async function () {
  const gen = await prep.generatePrepRecipe({
    prepInput: parsedIn,
    callGroq: async function () { return { data: goodAi }; },
    model: 'test-model',
  });
  assert.strictEqual(gen.ok, true);
  assert.strictEqual(gen.recipe.title, 'Lachs mit Ei');
  assert.strictEqual(core.PREP_PROMPT_VERSION, 'prep_assistant_v1');
  console.log('OK generatePrepRecipe mock');

  // Fallback: unbekannte actionId → Retry → Template
  let calls = 0;
  const genFail = await prep.generatePrepRecipe({
    prepInput: parsedIn,
    callGroq: async function () {
      calls += 1;
      return {
        data: {
          steps: [{
            stepNumber: 1,
            actionId: 'act_unknown_xyz',
            ingredientIds: ['ing_salmon'],
            instruction: 'Das Lachsfilet anbraten.',
          }],
        },
      };
    },
    model: 'test-model',
  });
  assert.strictEqual(genFail.ok, true, 'Fallback liefert ok');
  assert.strictEqual(genFail.usedFallback, true, 'usedFallback gesetzt');
  assert.ok(Array.isArray(genFail.recipe.steps) && genFail.recipe.steps.length >= 1);
  assert.ok(!(genFail.recipe.steps || []).some(function (s) {
    return /\b\d+\s*g\b/i.test(s);
  }), 'Fallback ohne Mengen: ' + (genFail.recipe.steps || []).join(' | '));
  assert.ok(calls >= 2, 'Retry vor Fallback: calls=' + calls);
  console.log('OK prep fallback ohne Mengen');

  assert.strictEqual(typeof prep.buildFallbackSteps, 'function');
  const fb = prep.buildFallbackSteps(parsedIn);
  assert.strictEqual(fb.length, 2);
  const fbText = fb.map(function (s) { return s.instruction; }).join(' ');
  assert.strictEqual(/\d+\s*(g|ml)\b/i.test(fbText), false, 'Fallback-Text ohne Mengen: ' + fbText);
  console.log('OK buildFallbackSteps');

  console.log('ALLE Prep-Assistent-Tests OK');
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
