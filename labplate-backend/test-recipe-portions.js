/**
 * Tests: Portionsarchitektur (sourceServings → finalIngredients → nutrition → coach).
 */
'use strict';

const assert = require('assert');
const portions = require('./recipe-portions');
const pipeline = require('./recipe-pipeline-v92');
const coach = require('./coach/logic');

function approx(a, b, tol) {
  return Math.abs(Number(a) - Number(b)) <= (tol != null ? tol : 0.05);
}

// ---------- TEST 1: scaleIngredients Ragù 6→1 ----------
const sourceIngredients = [
  { id: 'beef', displayName: 'Rinderhackfleisch', amount: 500, unit: 'g' },
  { id: 'onion', displayName: 'Zwiebel', amount: 150, unit: 'g' },
  { id: 'carrot', displayName: 'Karotte', amount: 100, unit: 'g' },
  { id: 'celery', displayName: 'Sellerie', amount: 80, unit: 'g' },
  { id: 'olive_oil', displayName: 'Olivenöl', amount: 30, unit: 'ml' },
];
const scaledExact = portions.scaleIngredients(sourceIngredients, 6, 1);
assert.ok(approx(scaledExact[0].amount, 500 / 6));
assert.ok(approx(scaledExact[1].amount, 150 / 6));
assert.ok(approx(scaledExact[2].amount, 100 / 6));
assert.ok(approx(scaledExact[3].amount, 80 / 6));
assert.ok(approx(scaledExact[4].amount, 30 / 6));
console.log('OK TEST1 Ragù scale 6→1 exact');

// ---------- TEST 2: keine Skalierung ohne sourceServings ----------
assert.throws(function () {
  portions.scaleIngredients(sourceIngredients, null, 1);
}, /sourceServings/);
assert.throws(function () {
  portions.scaleIngredients(sourceIngredients, 0, 1);
}, /sourceServings/);
console.log('OK TEST2 scale ohne sourceServings wirft');

// ---------- TEST 3: keine doppelte Skalierung ----------
const once = portions.scaleIngredients(sourceIngredients, 6, 1);
const rounded = portions.applyPracticalRounding(once);
assert.ok(rounded[0].amount < 100, 'nach 6→1 unter 100g: ' + rounded[0].amount);
const again = portions.scaleIngredients(rounded, 1, 1);
assert.strictEqual(again[0].amount, rounded[0].amount);
console.log('OK TEST3 keine Doppel-Skalierung');

// ---------- TEST 4: Pipeline Ragù servings=1 → inferred ----------
const raguRaw = {
  title: 'Ragù alla Bolognese',
  servings: 1,
  prep_time_min: 90,
  nutrition: { kcal: 1389, protein_g: 80, fat_g: 90, netto_kh_g: 40, ballaststoffe_g: 8 },
  diet_labels: [],
  target_deviation_note: '',
  ingredients: [
    { id: '0001', name: 'Rinderhackfleisch', amount: 500, unit: 'g', protein_source: true, netCarbs: 0, fat: 15, protein: 20, fiber: 0 },
    { id: '0002', name: 'Zwiebel', amount: 150, unit: 'g', protein_source: false, netCarbs: 7, fat: 0.2, protein: 1, fiber: 2 },
    { id: '0003', name: 'Karotte', amount: 100, unit: 'g', protein_source: false, netCarbs: 7, fat: 0.2, protein: 1, fiber: 3 },
    { id: '0004', name: 'Sellerie', amount: 80, unit: 'g', protein_source: false, netCarbs: 1, fat: 0.2, protein: 1, fiber: 2 },
    { id: '0005', name: 'Olivenöl', amount: 30, unit: 'ml', protein_source: false, netCarbs: 0, fat: 100, protein: 0, fiber: 0 },
    { id: '0006', name: 'passierte Tomaten', amount: 250, unit: 'ml', protein_source: false, netCarbs: 4, fat: 0.2, protein: 1, fiber: 1 },
    { id: '0007', name: 'Tomatenmark', amount: 20, unit: 'g', protein_source: false, netCarbs: 12, fat: 0.5, protein: 4, fiber: 3 },
    { id: '0008', name: 'Rotwein', amount: 100, unit: 'ml', protein_source: false, netCarbs: 0.5, fat: 0, protein: 0, fiber: 0 },
    { id: '0009', name: 'Milch', amount: 100, unit: 'ml', protein_source: false, netCarbs: 5, fat: 3.5, protein: 3.5, fiber: 0 },
  ],
  steps: [
    { title: 'Anbraten', content: '{0005} erhitzen, {0001} krümelig anbraten.', stove_level: 6, time_min: 10 },
    { title: 'Gemüse', content: '{0002}, {0003} und {0004} andünsten.', stove_level: 4, time_min: 8 },
    { title: 'Sauce', content: '{0006}, {0007}, {0008} und {0009} einrühren und köcheln.', stove_level: 3, time_min: 20 },
  ],
  garnish: '',
  chef_analysis: 'Klassisches Ragù mit {0001}.',
};
const rendered = pipeline.renderRecipeForDisplay(raguRaw);
assert.ok(rendered, 'render ok');
assert.ok(rendered.sourceServings >= 4, 'sourceServings inferiert ≥4: ' + rendered.sourceServings);
assert.strictEqual(rendered.sourceServingsStatus, 'inferred');
// Nach erfolgreicher 1-Portions-Normierung: kein Review-/Schätz-Banner mehr
assert.strictEqual(rendered.finalServings, 1);
assert.strictEqual(rendered.servings, 1);
assert.ok(rendered.singlePortionNormalized === true, 'singlePortionNormalized');
assert.strictEqual(rendered.requiresReview, false);
assert.strictEqual(rendered.portionSafe, true);
assert.ok(!rendered.portionDisplayHint || !/geschätzt/i.test(rendered.portionDisplayHint));
const beef = rendered.ingredients.find(function (i) { return /hack|rind/i.test(i.name); });
assert.ok(beef && beef.amount < 200, 'Hack nach Skalierung <200g: ' + (beef && beef.amount));
assert.ok(beef.amount > 50, 'Hack nach Skalierung >50g: ' + beef.amount);
assert.ok(rendered.finalNutrition && rendered.finalNutrition.kcal < 800,
  'kcal aus final <800: ' + (rendered.finalNutrition && rendered.finalNutrition.kcal));
assert.ok(rendered.nutritionBasis === 'finalIngredients');
assert.ok(rendered.servingsStatus === 'inferred');
assert.ok(rendered.yield && rendered.yield.yieldStatus === 'unknown');
assert.ok(rendered.yield.rawBatchWeight > 0);
console.log('OK TEST4 Ragù inferred→normalized: source=' + rendered.sourceServings +
  ' beef=' + beef.amount + 'g kcal=' + rendered.finalNutrition.kcal);

// ---------- TEST 5–8: consistency ----------
const pastaWarn = portions.validateRecipeConsistency({
  title: 'Ragù',
  finalIngredients: [{ id: 'beef', displayName: 'Rinderhackfleisch', amount: 80, unit: 'g' }],
  steps: ['Das Ragù auf die Pasta geben.'],
});
assert.ok(pastaWarn.warnings.some(function (w) { return /pasta/i.test(w); }));
console.log('OK TEST5 Pasta-Warnung');

const qtyErr = portions.validateRecipeConsistency({
  title: 'Test',
  finalIngredients: [{ id: 'beef', displayName: 'Hack', amount: 80, unit: 'g' }],
  steps: [{ stepNumber: 1, instruction: '500 g Rinderhackfleisch anbraten.' }],
});
assert.ok(qtyErr.errors.some(function (e) { return /Mengenangabe|Quantity/i.test(e); }));
console.log('OK TEST6 Mengen in instruction');

assert.ok(!rendered.steps.some(function (s) {
  return /[A-Za-zÄÖÜäöüß]\d/.test(s) && /\d+(g|ml)/i.test(s);
}), 'keine Mengen-Klebestrings in Steps');
console.log('OK TEST7 keine Klebestrings');

const titleWarn = portions.validateRecipeConsistency({
  title: 'Pasta mit Lachs',
  finalIngredients: [{ id: 'pasta', displayName: 'Pasta', amount: 80, unit: 'g' }],
  steps: ['Die Pasta garen.'],
});
assert.ok(titleWarn.warnings.some(function (w) { return /Lachs|salmon/i.test(w); }));
console.log('OK TEST8 Titel/Zutaten');

// ---------- TEST 9: Plausibilität mutiert nicht ----------
const plausIng = [{ displayName: 'Rinderhackfleisch', amount: 500, unit: 'g' }];
const plaus = portions.validatePortionPlausibility({
  finalServings: 1,
  servingsStatus: 'validated',
  finalIngredients: plausIng,
});
assert.ok(plaus.warnings.some(function (w) { return /Fleisch|Einzelportions-Maximum/i.test(w); }));
assert.strictEqual(plausIng[0].amount, 500, 'Plausibilität darf Mengen nicht ändern');
console.log('OK TEST9 Plausibilität ohne Mutation');

// ---------- TEST 10: unknown ----------
const unknown = portions.buildFinalPortionedRecipe({
  sourceIngredients: [{ id: 'x', displayName: 'Salz', amount: 0, unit: 'prise' }],
  sourceServings: null,
  targetServings: 1,
});
assert.strictEqual(unknown.servingsStatus, 'unknown');
assert.strictEqual(unknown.sourceServingsStatus, 'unknown');
assert.strictEqual(unknown.sourceServings, null);
assert.strictEqual(unknown.ok, false);
assert.strictEqual(unknown.requiresReview, true);
assert.ok((unknown.warnings || []).some(function (w) { return /nicht bekannt|unknown|Safe scaling/i.test(w); }));
assert.ok(!portions.canDisplayAsSafeSinglePortion({
  finalServings: 1,
  servingsStatus: 'unknown',
  sourceServingsStatus: 'unknown',
  portionWarnings: unknown.warnings,
}));
console.log('OK TEST10 unknown');

// ---------- TEST 11: explicit Ragù 6→1 Pipeline ----------
const raguExplicit = Object.assign({}, raguRaw, { servings: 6 });
const rendered6 = pipeline.renderRecipeForDisplay(raguExplicit);
assert.strictEqual(rendered6.sourceServings, 6);
assert.strictEqual(rendered6.sourceServingsStatus, 'explicit');
assert.strictEqual(rendered6.sourceServingsConfidence, 1);
assert.strictEqual(rendered6.servingsStatus, 'validated');
assert.strictEqual(rendered6.requiresReview, false);
assert.strictEqual(rendered6.finalServings, 1);
assert.ok(approx(rendered6.scalingFactor, 1 / 6, 1e-9));
assert.strictEqual(rendered6.portionSafe, true);
assert.ok(!rendered6.portionDisplayHint);
const beef6 = rendered6.ingredients.find(function (i) { return /hack|rind/i.test(i.name); });
const onion6 = rendered6.ingredients.find(function (i) { return /zwiebel/i.test(i.name); });
const carrot6 = rendered6.ingredients.find(function (i) { return /karotte/i.test(i.name); });
const celery6 = rendered6.ingredients.find(function (i) { return /sellerie/i.test(i.name); });
const oil6 = rendered6.ingredients.find(function (i) { return /öl|oel/i.test(i.name); });
assert.ok(beef6 && Math.abs(beef6.amount - portions.roundPracticalAmount(500 / 6, 'g')) <= 5,
  'beef≈83: ' + beef6.amount);
assert.ok(onion6 && Math.abs(onion6.amount - portions.roundPracticalAmount(150 / 6, 'g')) <= 5);
assert.ok(carrot6 && Math.abs(carrot6.amount - portions.roundPracticalAmount(100 / 6, 'g')) <= 5);
assert.ok(celery6 && Math.abs(celery6.amount - portions.roundPracticalAmount(80 / 6, 'g')) <= 5);
assert.ok(oil6 && Math.abs(oil6.amount - portions.roundPracticalAmount(30 / 6, 'ml')) <= 2);
assert.ok(beef6.amount < 200 && beef6.amount !== 500, 'keine Batch-Menge');
assert.ok(!(rendered6.portionWarnings || []).some(function (w) { return /geschätzt|nicht bekannt|estimated|unknown/i.test(w); }),
  'keine falsche Warnung bei explicit: ' + (rendered6.portionWarnings || []).join('; '));
assert.ok(rendered6.finalNutrition && rendered6.nutritionBasis === 'finalIngredients');
assert.ok(rendered6.yield.yieldStatus === 'unknown');
assert.ok(rendered6.yield.cookedBatchWeight == null);
console.log('OK TEST11 explicit 6→1 beef=' + beef6.amount + 'g kcal=' + rendered6.finalNutrition.kcal);

// ---------- TEST 12: Frontend-Stepper MODEL B (source 6 → final 1) ----------
const finalBase = portions.applyPracticalRounding(
  portions.scaleIngredients(sourceIngredients, 6, 1)
);
const step1 = portions.scaleDisplayFromFinalBase(finalBase, 1, 1);
const step2 = portions.scaleDisplayFromFinalBase(finalBase, 1, 2);
const stepHalf = portions.scaleDisplayFromFinalBase(finalBase, 1, 0.5);
assert.ok(approx(step1[0].amount, finalBase[0].amount), 'Stepper 1 unverändert');
assert.ok(approx(step2[0].amount, finalBase[0].amount * 2), 'Stepper 2 = doppelte 1-Portion');
assert.ok(approx(stepHalf[0].amount, finalBase[0].amount * 0.5), 'Stepper 0.5 = halbe 1-Portion');
// Keine relative Skalierung zu sourceServings=6 auf finalBase
assert.ok(!approx(step2[0].amount, 500 * (2 / 6)), 'nicht source-relativ');
console.log('OK TEST12 Stepper MODEL B 1/2/0.5');

// ---------- TEST 13: Coach nur finalNutrition ----------
(async function () {
  const coachInput = portions.buildCoachInput(rendered6);
  assert.ok(coachInput.finalNutrition);
  assert.ok(Array.isArray(coachInput.finalIngredients));
  assert.ok(!Object.prototype.hasOwnProperty.call(coachInput, 'sourceIngredients'));
  assert.ok(!Object.prototype.hasOwnProperty.call(coachInput, 'sourceNutrition'));
  assert.ok(!Object.prototype.hasOwnProperty.call(coachInput, 'rawIngredients'));

  const coachOk = await coach.analyzeRecipe(coachInput, { enrichUsda: false });
  assert.ok(coachOk.data, 'coach data');
  assert.strictEqual(coachOk.data.nutritionSource, 'finalNutrition');
  assert.ok(approx(coachOk.data.perServing.calories, rendered6.finalNutrition.kcal, 1));

  const coachUnknown = await coach.analyzeRecipe({
    title: 'X',
    finalServings: 1,
    servingsStatus: 'unknown',
    sourceServingsStatus: 'unknown',
    requiresReview: true,
    finalIngredients: [],
    finalNutrition: null,
    validationWarnings: [portions.UNKNOWN_WARNING],
  }, { enrichUsda: false });
  assert.strictEqual(coachUnknown.error, 'coach_unavailable');

  const coachInferred = await coach.analyzeRecipe(portions.buildCoachInput(rendered), { enrichUsda: false });
  assert.ok(coachInferred.data, 'inferred darf nach 1-Portions-Normierung analysiert werden');
  // Kein Portions-Schätz-Banner mehr, wenn finalServings=1 / singlePortionNormalized
  assert.ok(!(coachInferred.data.warnings || []).some(function (w) {
    return w && (w.code === 'portion_estimated' || /Portionsgröße geschätzt|Portion size estimated/i.test(w.message || ''));
  }), 'kein Portions-Schätz-Hinweis nach Normierung');

  // resolveSourceServings: Heuristik nie explicit
  const resolvedInfer = portions.resolveSourceServings({
    servings: 1,
    ingredients: sourceIngredients,
  });
  assert.strictEqual(resolvedInfer.sourceServingsStatus, 'inferred');
  assert.notStrictEqual(resolvedInfer.sourceServingsStatus, 'explicit');

  const resolvedExplicit = portions.resolveSourceServings({
    servings: 6,
    ingredients: sourceIngredients,
  });
  assert.strictEqual(resolvedExplicit.sourceServingsStatus, 'explicit');
  assert.strictEqual(resolvedExplicit.sourceServingsConfidence, 1);

  const resolvedAi = portions.resolveSourceServings({
    servings: 4,
    sourceServingsMethod: 'ai_estimate',
    ingredients: sourceIngredients,
  });
  assert.strictEqual(resolvedAi.sourceServingsStatus, 'inferred');
  assert.strictEqual(resolvedAi.requiresReview, true);

  console.log('OK TEST13 Coach finalNutrition + status Trennung');
  console.log('\nAlle Portions-Architektur-Tests OK');
  console.log('Beispiel Ragù explicit 6→1:', JSON.stringify({
    sourceServings: rendered6.sourceServings,
    sourceServingsStatus: rendered6.sourceServingsStatus,
    finalServings: rendered6.finalServings,
    requiresReview: rendered6.requiresReview,
    scalingFactor: rendered6.scalingFactor,
    beef_g: beef6.amount,
    onion_g: onion6.amount,
    carrot_g: carrot6.amount,
    celery_g: celery6.amount,
    oil_ml: oil6.amount,
    kcal: rendered6.finalNutrition.kcal,
    yieldStatus: rendered6.yield.yieldStatus,
  }, null, 2));
})().catch(function (err) {
  console.error('FAIL', err);
  process.exit(1);
});
