/**
 * Live-Pfad-Integration: Ragù 6→1 über denselben Pfad wie die App
 * (renderRecipeForDisplay / runActualLiveRecipePipeline).
 */
'use strict';

const assert = require('assert');
const portions = require('./recipe-portions');
const core = require('./nutri-recipe-core');

const rawRecipe = {
  title: 'Ragù alla Bolognese',
  servings: 6,
  targetServings: 1,
  ingredients: [
    { id: 'beef', name: 'Rindfleisch (Hackfleisch)', amount: 300, unit: 'g', protein: 20, fat: 15, netCarbs: 0, fiber: 0 },
    { id: 'pork', name: 'Schweinefleisch (Hackfleisch)', amount: 200, unit: 'g', protein: 18, fat: 20, netCarbs: 0, fiber: 0 },
    { id: 'onion', name: 'Zwiebel', amount: 100, unit: 'g', protein: 1, fat: 0.2, netCarbs: 7, fiber: 2 },
    { id: 'carrot', name: 'Karotte', amount: 50, unit: 'g', protein: 1, fat: 0.2, netCarbs: 7, fiber: 3 },
    { id: 'celery', name: 'Sellerie', amount: 50, unit: 'g', protein: 1, fat: 0.2, netCarbs: 1, fiber: 2 },
    { id: 'olive_oil', name: 'Olivenöl', amount: 30, unit: 'ml', protein: 0, fat: 100, netCarbs: 0, fiber: 0 },
    { id: 'passata', name: 'Passierte Tomaten', amount: 250, unit: 'ml', protein: 1, fat: 0.2, netCarbs: 4, fiber: 1 },
    { id: 'tomato_paste', name: 'Tomatenmark', amount: 15, unit: 'g', protein: 4, fat: 0.5, netCarbs: 12, fiber: 3 },
    { id: 'red_wine', name: 'Rotwein (trocken)', amount: 100, unit: 'ml', protein: 0, fat: 0, netCarbs: 0.5, fiber: 0 },
  ],
};

function approx(a, b, tol) {
  return Math.abs(Number(a) - Number(b)) <= (tol != null ? tol : 1.5);
}

function findIng(list, idOrName) {
  return (list || []).find(function (i) {
    return i.id === idOrName || i._v92_id === idOrName ||
      new RegExp(idOrName, 'i').test(String(i.name || i.displayName || ''));
  });
}

(async function main() {
  const result = portions.runActualLiveRecipePipeline(rawRecipe);

  assert.strictEqual(result.finalServings, 1, 'finalServings=1');
  assert.strictEqual(result.sourceServings, 6, 'sourceServings=6');
  assert.ok(approx(result.scalingFactor, 1 / 6, 1e-9), 'scalingFactor≈1/6');
  assert.strictEqual(result.sourceServingsStatus, 'explicit');
  assert.strictEqual(result.nutritionSource, 'finalIngredients');

  const beef = findIng(result.finalIngredients || result.ingredients, 'beef') ||
    findIng(result.ingredients, 'Rind');
  const pork = findIng(result.finalIngredients || result.ingredients, 'pork') ||
    findIng(result.ingredients, 'Schwein');
  const oil = findIng(result.finalIngredients || result.ingredients, 'olive_oil') ||
    findIng(result.ingredients, 'Olivenöl');

  assert.ok(beef, 'beef found');
  assert.ok(pork, 'pork found');
  assert.ok(oil, 'oil found');
  assert.ok(approx(beef.amount, 50, 2), 'beef≈50 got ' + beef.amount);
  assert.ok(approx(pork.amount, 33.33, 2), 'pork≈33 got ' + pork.amount);
  assert.ok(approx(oil.amount, 5, 1), 'oil≈5 got ' + oil.amount);
  assert.ok(beef.amount !== 300, 'beef not batch 300');
  assert.ok(pork.amount !== 200, 'pork not batch 200');

  const display = result.displayIngredients || result.ingredients;
  assert.strictEqual(display.length, (result.finalIngredients || result.ingredients).length);
  display.forEach(function (d, i) {
    const f = (result.finalIngredients || result.ingredients)[i];
    assert.ok(approx(d.amount, f.amount, 0.01), 'display===final at ' + i);
  });

  (result.steps || []).forEach(function (step) {
    const instruction = typeof step === 'string' ? step : String((step && step.instruction) || '');
    assert.ok(
      !/\b\d+(?:[.,]\d+)?\s*(g|kg|mg|ml|l|cl|el|tl|stk|stück)\b/i.test(instruction),
      'no amounts in step: ' + instruction
    );
    assert.ok(
      instruction.indexOf('Zwiebel Karotte Sellerie Olivenöl') < 0,
      'no bare name dump: ' + instruction
    );
  });

  // toClientRecipe Live-Pfad (Legacy-Formular ohne prep_time_min)
  const legacyClient = core.toClientRecipe({
    title: rawRecipe.title,
    servings: 6,
    prep_time: '90 Minuten',
    nutrition_note: '',
    ingredients: rawRecipe.ingredients.map(function (i) {
      return {
        name: i.name,
        amount: i.amount,
        unit: i.unit,
        macrosPer100g: {
          protein: i.protein, fat: i.fat, netCarbs: i.netCarbs, fiber: i.fiber,
        },
      };
    }),
    steps: ['Anbraten.', 'Köcheln.'],
    shopping_list: [],
  }, { structured: false });
  assert.ok(legacyClient);
  assert.strictEqual(legacyClient.finalServings, 1);
  assert.strictEqual(legacyClient.sourceServings, 6);
  const legacyBeef = findIng(legacyClient.ingredients, 'Rind');
  assert.ok(legacyBeef && approx(legacyBeef.amount, 50, 2), 'legacy beef≈50: ' + (legacyBeef && legacyBeef.amount));

  // Batch als servings=1 (Live-Bug-Repro)
  const batchAsOne = portions.runActualLiveRecipePipeline({
    title: 'Ragù alla Bolognese',
    servings: 1,
    targetServings: 1,
    ingredients: rawRecipe.ingredients,
  });
  assert.strictEqual(batchAsOne.sourceServingsStatus, 'inferred');
  assert.ok(batchAsOne.sourceServings >= 4, 'inferred source ≥4');
  const beef2 = findIng(batchAsOne.ingredients, 'Rind');
  assert.ok(beef2 && beef2.amount < 120, 'batch-as-1 beef scaled: ' + (beef2 && beef2.amount));
  assert.ok(beef2.amount !== 300);

  console.log('OK live Ragù 6→1 beef=' + beef.amount + ' pork=' + pork.amount + ' oil=' + oil.amount);
  console.log('OK live batch-as-1 inferred source=' + batchAsOne.sourceServings);
  console.log('OK live toClientRecipe legacy path');
  console.log('\nAlle Live-Pfad-Tests OK');
})().catch(function (err) {
  console.error('FAIL', err);
  process.exit(1);
});
