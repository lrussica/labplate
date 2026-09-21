/**
 * Integration: Browser-Overlay-Pfad (API → Portionierung → Display).
 * Spiegelt ensureLiveFinalPortionedRecipe + Display-Vertrag.
 */
'use strict';

const assert = require('assert');
const portions = require('./recipe-portions');

function roundLocalRecipeAmount(amount, unit) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const u = String(unit || '').toLowerCase();
  if (u === 'ml' || u === 'l') return Math.max(1, Math.round(n));
  if (n < 20) return Math.max(1, Math.round(n));
  return Math.max(5, Math.round(n / 5) * 5);
}

function recipeAmountsLookLikeBatch(ings) {
  let meatTotal = 0;
  let massTotal = 0;
  (ings || []).forEach(function (ing) {
    const a = Number(ing && ing.amount) || 0;
    const u = String((ing && ing.unit) || 'g').toLowerCase();
    if (a <= 0) return;
    const g = u === 'kg' ? a * 1000 : (u === 'l' ? a * 1000 : a);
    massTotal += g;
    if (/hack|fleisch|rind|schwein/i.test(String(ing.name || ''))) {
      if (u === 'g' || u === 'kg') meatTotal += g;
    }
  });
  return meatTotal >= 350 || massTotal >= 700;
}

/** Entspricht dem Browser-ensureLiveFinalPortionedRecipe (Kernlogik). */
function simulateBrowserEnsure(recipe) {
  const r = JSON.parse(JSON.stringify(recipe));
  let ings = Array.isArray(r.finalIngredients) && r.finalIngredients.length
    ? r.finalIngredients
    : (r.ingredients || []);
  const looksBatch = recipeAmountsLookLikeBatch(ings);
  const declaredSource = Number(r.sourceServings != null ? r.sourceServings : r.servings);

  if (!looksBatch && Number(r.finalServings) === 1 && (r.livePathNormalized || Number(r.scalingFactor) > 0)) {
    r.ingredients = ings;
    r.finalIngredients = ings;
    r.displayIngredients = ings;
    r.servings = 1;
    r.nutritionSource = 'finalNutrition';
    return r;
  }

  let sourceServings = null;
  let sourceStatus = 'unknown';
  if (Number.isFinite(declaredSource) && declaredSource > 1 && looksBatch) {
    sourceServings = declaredSource;
    sourceStatus = 'explicit';
  } else if (looksBatch) {
    let meatTotal = 0;
    let massTotal = 0;
    ings.forEach(function (ing) {
      const a = Number(ing.amount) || 0;
      const u = String(ing.unit || 'g').toLowerCase();
      const g = u === 'kg' ? a * 1000 : a;
      massTotal += g;
      if (/fleisch|rind|schwein|hack/i.test(String(ing.name || '')) && (u === 'g' || u === 'kg')) {
        meatTotal += g;
      }
    });
    sourceServings = Math.min(12, Math.max(2, Math.round(Math.max(meatTotal, massTotal / 6) / 125)));
    sourceStatus = 'inferred';
  } else {
    r.finalIngredients = ings;
    r.ingredients = ings;
    r.displayIngredients = ings;
    r.finalServings = 1;
    r.servings = 1;
    r.nutritionSource = 'finalNutrition';
    r.livePathNormalized = true;
    return r;
  }

  const factor = 1 / sourceServings;
  const finalIngs = ings.map(function (ing) {
    const next = Object.assign({}, ing);
    const a = Number(ing.amount);
    if (Number.isFinite(a)) next.amount = roundLocalRecipeAmount(a * factor, ing.unit);
    return next;
  });
  r.ingredients = finalIngs;
  r.finalIngredients = finalIngs;
  r.displayIngredients = finalIngs;
  r.sourceServings = sourceServings;
  r.sourceServingsStatus = sourceStatus;
  r.finalServings = 1;
  r.servings = 1;
  r.scalingFactor = factor;
  r.nutritionSource = 'finalNutrition';
  r.livePathNormalized = true;
  r.nutrition = { kcal: 100, protein_g: 10, fat_g: 5, netto_kh_g: 5, ballaststoffe_g: 1 };
  r.finalNutrition = r.nutrition;
  return r;
}

function simulateOverlayInput(apiResponse) {
  // raw → preserve sourceServings → ensure → display
  const before = JSON.parse(JSON.stringify(apiResponse));
  if (before.sourceServings == null && Number(before.servings) > 1) {
    before.sourceServings = Number(before.servings);
  }
  const afterPortioning = simulateBrowserEnsure(before);
  const displayRecipe = Object.assign({}, afterPortioning, {
    ingredients: afterPortioning.finalIngredients,
    displayIngredients: afterPortioning.finalIngredients,
    nutrition: afterPortioning.finalNutrition,
    nutritionSource: 'finalNutrition',
    servings: afterPortioning.finalServings,
  });
  return { afterPortioning: afterPortioning, displayRecipe: displayRecipe };
}

const rawApi = {
  title: 'Ragù alla Bolognese',
  servings: 6,
  ingredients: [
    { id: 'beef', name: 'Rindfleisch (Hackfleisch)', amount: 300, unit: 'g' },
    { id: 'pork', name: 'Schweinefleisch (Hackfleisch)', amount: 200, unit: 'g' },
    { id: 'onion', name: 'Zwiebel', amount: 100, unit: 'g' },
    { id: 'carrot', name: 'Karotte', amount: 50, unit: 'g' },
    { id: 'celery', name: 'Sellerie', amount: 50, unit: 'g' },
    { id: 'olive_oil', name: 'Olivenöl', amount: 30, unit: 'ml' },
  ],
  steps: ['Das Olivenöl erhitzen und Zwiebel, Karotte und Sellerie darin anschwitzen.'],
  nutrition: { kcal: 2400, protein_g: 200, fat_g: 150, netto_kh_g: 40, ballaststoffe_g: 10 },
};

const { afterPortioning, displayRecipe } = simulateOverlayInput(rawApi);

assert.strictEqual(displayRecipe.finalServings, 1);
assert.strictEqual(displayRecipe.ingredients, displayRecipe.finalIngredients);
const beef = displayRecipe.ingredients.find(function (i) { return /Rindfleisch/i.test(i.name); });
const pork = displayRecipe.ingredients.find(function (i) { return /Schweinefleisch/i.test(i.name); });
const onion = displayRecipe.ingredients.find(function (i) { return /Zwiebel/i.test(i.name); });
const oil = displayRecipe.ingredients.find(function (i) { return /Olivenöl/i.test(i.name); });
assert.ok(beef && Math.abs(beef.amount - 50) <= 2, 'beef≈50 got ' + (beef && beef.amount));
assert.ok(pork && Math.abs(pork.amount - 33.33) <= 3, 'pork≈33 got ' + (pork && pork.amount));
assert.ok(onion && Math.abs(onion.amount - 17) <= 2, 'onion≈17 got ' + (onion && onion.amount));
assert.ok(oil && Math.abs(oil.amount - 5) <= 1, 'oil≈5 got ' + (oil && oil.amount));
assert.strictEqual(displayRecipe.nutritionSource, 'finalNutrition');
assert.deepStrictEqual(displayRecipe.nutrition, displayRecipe.finalNutrition);
assert.ok(beef.amount !== 300 && pork.amount !== 200);

// Idempotent: zweite Ensure darf nicht erneut skalieren
const again = simulateBrowserEnsure(afterPortioning);
const beef2 = again.ingredients.find(function (i) { return /Rindfleisch/i.test(i.name); });
assert.ok(Math.abs(beef2.amount - beef.amount) < 0.01, 'no double scale');

// Pipeline v92 live path still ok
const live = portions.runActualLiveRecipePipeline(Object.assign({}, rawApi, { targetServings: 1 }));
assert.strictEqual(live.finalServings, 1);
assert.strictEqual(live.sourceServings, 6);
const liveBeef = (live.finalIngredients || live.ingredients).find(function (i) {
  return /Rindfleisch|beef/i.test(String(i.name || i.id));
});
assert.ok(liveBeef && Math.abs(liveBeef.amount - 50) <= 2);

console.log('OK overlay path Ragù beef=' + beef.amount + ' pork=' + pork.amount + ' oil=' + oil.amount);
console.log('OK overlay idempotent');
console.log('OK live pipeline still 6→1');
console.log('\nAlle Overlay-Pfad-Tests OK');
