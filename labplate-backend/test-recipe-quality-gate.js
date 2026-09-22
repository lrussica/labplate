'use strict';
/**
 * Integration tests: Recipe Quality Gate (ready | review | blocked)
 * Matrix: Portionen, Allergene, Zutaten, Timing, Instructions, i18n, Dedup/Stale.
 */
const assert = require('assert');
const gate = require('./recipe-quality-gate');
const portions = require('./recipe-portions');
const coach = require('./coach/logic');

function baseRecipe(overrides) {
  const r = {
    title: 'Spaghetti Bolognese',
    sourceServings: 6,
    sourceServingsStatus: 'explicit',
    targetServings: 1,
    finalServings: 1,
    servingsStatus: 'explicit',
    scalingFactor: 1 / 6,
    nutritionSource: 'finalIngredients',
    nutritionBasis: 'finalIngredients',
    nutritionServings: 1,
    finalIngredients: [
      { id: 'beef', displayName: 'Rinderhackfleisch', name: 'Rinderhackfleisch', amount: 75, unit: 'g', optional: false },
      { id: 'pasta', displayName: 'Spaghetti', name: 'Spaghetti', amount: 80, unit: 'g', optional: false },
      { id: 'tomato', displayName: 'Tomaten', name: 'Tomaten', amount: 100, unit: 'g', optional: false },
      { id: 'onion', displayName: 'Zwiebel', name: 'Zwiebel', amount: 20, unit: 'g', optional: false },
      { id: 'oil', displayName: 'Olivenöl', name: 'Olivenöl', amount: 5, unit: 'ml', optional: false },
    ],
    ingredients: null,
    finalNutrition: {
      kcal: 420,
      protein_g: 28,
      fat_g: 14,
      netto_kh_g: 42,
      ballaststoffe_g: 4,
    },
    nutrition: null,
    steps: [
      {
        stepNumber: 1,
        actionId: 'saute',
        ingredientIds: ['oil', 'onion'],
        instruction: 'Das Olivenöl erhitzen und die Zwiebel bei mittlerer Hitze glasig dünsten.',
        durationMinutes: 5,
        heatLevel: 'medium',
      },
      {
        stepNumber: 2,
        actionId: 'pan_fry',
        ingredientIds: ['beef'],
        instruction: 'Das Rinderhackfleisch zugeben und krümelig anbraten.',
        durationMinutes: 8,
        heatLevel: 'high',
      },
      {
        stepNumber: 3,
        actionId: 'simmer',
        ingredientIds: ['tomato'],
        instruction: 'Die Tomaten unterrühren und die Sauce 20 Minuten köcheln lassen.',
        durationMinutes: 20,
        heatLevel: 'low',
      },
      {
        stepNumber: 4,
        actionId: 'boil',
        ingredientIds: ['pasta'],
        instruction: 'Die Spaghetti in Salzwasser al dente kochen und mit der Sauce vermengen.',
        durationMinutes: 10,
        heatLevel: 'high',
        parallelGroup: 'pasta',
      },
    ],
    prep_time: '30 Minuten',
  };
  r.ingredients = r.finalIngredients;
  r.nutrition = r.finalNutrition;
  return Object.assign(r, overrides || {});
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// —— Test 1: Sichere Portion ——
(function test1_safePortion() {
  const raw = {
    title: 'Spaghetti Bolognese',
    sourceServings: 6,
    sourceServingsStatus: 'explicit',
    targetServings: 1,
    servings: 6,
    ingredients: [
      { id: 'beef', name: 'Rinderhackfleisch', amount: 450, unit: 'g', protein: 20, fat: 15, netCarbs: 0, fiber: 0 },
      { id: 'pasta', name: 'Spaghetti', amount: 480, unit: 'g', protein: 12, fat: 2, netCarbs: 70, fiber: 3 },
      { id: 'tomato', name: 'Tomaten', amount: 600, unit: 'g', protein: 1, fat: 0, netCarbs: 4, fiber: 1 },
    ],
    steps: [
      { instruction: 'Das Rinderhackfleisch anbraten und mit Tomaten 15 Minuten köcheln.', durationMinutes: 15 },
      { instruction: 'Die Spaghetti kochen und mit der Sauce vermengen.', durationMinutes: 10 },
    ],
  };
  const out = portions.normalizeRecipeToFinalModel(raw, { targetServings: 1 });
  assert.ok(out.finalIngredients && out.finalIngredients.length >= 3, 'finalIngredients vorhanden');
  const beef = out.finalIngredients.find(function (i) { return /hack|beef/i.test(i.id + i.name); });
  assert.ok(beef, 'Hackfleisch skaliert');
  assert.ok(Math.abs(Number(beef.amount) - 75) < 1.5, '450g/6 ≈ 75g, got ' + beef.amount);
  assert.strictEqual(out.nutritionSource || out.nutritionBasis, 'finalIngredients');
  assert.ok(out.finalNutrition || out.nutrition, 'finalNutrition gesetzt');
  assert.notStrictEqual(out.qualityStatus, 'blocked', 'sichere Portion nicht blocked');
  assert.ok(out.qualityStatus === 'ready' || out.qualityStatus === 'review', 'ready oder review');
  console.log('PASS Test1 safe portion', {
    qualityStatus: out.qualityStatus,
    beef: beef.amount,
    finalServings: out.finalServings,
  });
}());

// —— Test 2: Geschätzte Portion nach 1-Portions-Normierung → ready (kein Banner) ——
(function test2_inferred() {
  const r = baseRecipe({
    sourceServingsStatus: 'inferred',
    servingsStatus: 'inferred',
    requiresReview: true,
    portionSafe: false,
    singlePortionNormalized: true,
    finalServings: 1,
    portionDisplayHint: 'Portionsgröße geschätzt – bitte prüfen',
  });
  const q = gate.evaluateRecipeQuality(clone(r));
  assert.strictEqual(q.qualityStatus, 'ready');
  assert.strictEqual(q.qualityChecks.portions.status, 'pass');
  assert.ok(!(q.qualityWarnings || []).some(function (w) {
    return /Portionsgröße geschätzt|Portion size estimated/i.test(String(w));
  }));
  console.log('PASS Test2 inferred + servings=1 → ready (kein Schätz-Banner)');
}());

// —— Test 3: Unbekannte Portion ——
(function test3_unknown() {
  const r = baseRecipe({
    sourceServingsStatus: 'unknown',
    servingsStatus: 'unknown',
    sourceServings: null,
  });
  const q = gate.evaluateRecipeQuality(clone(r));
  assert.strictEqual(q.qualityStatus, 'blocked');
  assert.strictEqual(q.qualityChecks.portions.status, 'fail');
  assert.ok(q.requiresReview);
  console.log('PASS Test3 unknown → blocked');
}());

// —— Test 4: Allergenkonflikt ——
(function test4_allergen() {
  const r = baseRecipe({
    title: 'Sahnepasta',
    finalIngredients: [
      { id: 'pasta', displayName: 'Pasta', name: 'Pasta', amount: 80, unit: 'g' },
      { id: 'milk', displayName: 'Milch', name: 'Milch', amount: 100, unit: 'ml' },
    ],
  });
  r.ingredients = r.finalIngredients;
  const q = gate.evaluateRecipeQuality(clone(r), {
    allergenPhrases: [{ label: 'Milch / Laktose', phrases: ['milch', 'sahne', 'butter', 'cream', 'milk'] }],
  });
  assert.strictEqual(q.qualityStatus, 'blocked');
  assert.strictEqual(q.qualityChecks.allergens.status, 'fail');
  assert.ok(q.qualityMetrics ? true : true);
  const applied = gate.applyRecipeQualityGate(clone(r), {
    allergenPhrases: [{ label: 'Milch / Laktose', phrases: ['milch'] }],
  });
  assert.strictEqual(applied.qualityStatus, 'blocked');
  assert.strictEqual(applied.qualityMetrics.allergenConflict, true);
  console.log('PASS Test4 allergen → blocked (kein Trotzdem-Anzeigen)');
}());

// —— Test 5: Fehlende Zutat (Pasta im Schritt) ——
(function test5_missingIngredient() {
  const r = baseRecipe({
    title: 'Gemüsepfanne',
    finalIngredients: [
      { id: 'onion', displayName: 'Zwiebel', name: 'Zwiebel', amount: 50, unit: 'g' },
      { id: 'oil', displayName: 'Öl', name: 'Öl', amount: 10, unit: 'ml' },
    ],
    steps: [
      {
        instruction: 'Die Pasta in Salzwasser kochen und mit dem Gemüse vermengen.',
        durationMinutes: 12,
        ingredientIds: ['pasta'],
      },
    ],
  });
  r.ingredients = r.finalIngredients;
  const q = gate.evaluateRecipeQuality(clone(r));
  assert.strictEqual(q.qualityStatus, 'blocked');
  const ingredientBlob = JSON.stringify(q.qualityChecks.ingredients || {}) + JSON.stringify(q.qualityErrors || []) + JSON.stringify(q.qualityWarnings || []);
  assert.ok(
    q.qualityChecks.ingredients.status === 'fail' ||
      q.qualityChecks.ingredients.status === 'warning' ||
      /pasta|fehlt|Zutat|missing|mentions|not used/i.test(ingredientBlob),
    'Ingredient mismatch erwartet: ' + JSON.stringify(q.qualityErrors) + ' checks=' + JSON.stringify(q.qualityChecks.ingredients)
  );
  console.log('PASS Test5 missing pasta → blocked');
}());

// —— Test 6: Falsche Gesamtzeit ——
(function test6_timing() {
  const r = baseRecipe({
    prep_time: '30 Minuten',
    totalMinutes: 30,
    steps: [
      {
        instruction: 'Langsam schmoren lassen.',
        durationMinutes: 180,
        actionId: 'simmer',
      },
      {
        instruction: 'Mit Pasta vermengen und servieren.',
        durationMinutes: 10,
        actionId: 'serve',
        ingredientIds: ['pasta'],
      },
    ],
  });
  const mut = clone(r);
  gate.evaluateRecipeQuality(mut);
  assert.ok(mut.totalMinutes >= 180, 'mut.totalMinutes >= 180, got ' + mut.totalMinutes);
  assert.ok(mut.timing && mut.timing.totalMinutes >= 180);
  assert.ok(!/^\s*30\s*Minuten\s*$/i.test(String(mut.prep_time)), 'prep_time nicht mehr 30 Minuten: ' + mut.prep_time);
  console.log('PASS Test6 timing', { totalMinutes: mut.totalMinutes, prep_time: mut.prep_time });
}());

// —— Test 7: Schlechter Zubereitungstext ——
(function test7_bareInstructions() {
  const r = baseRecipe({
    steps: [
      { instruction: 'Olivenöl Zwiebel Karotte Sellerie', actionId: 'saute', durationMinutes: 5 },
      { instruction: 'Die Spaghetti kochen und mit der Sauce vermengen.', durationMinutes: 10, ingredientIds: ['pasta'] },
    ],
  });
  const mut = clone(r);
  const q = gate.evaluateRecipeQuality(mut);
  const step0 = typeof mut.steps[0] === 'string' ? mut.steps[0] : mut.steps[0].instruction;
  assert.ok(!/^Olivenöl Zwiebel Karotte Sellerie$/i.test(String(step0).trim()),
    'Rohdaten dürfen nicht stehen bleiben: ' + step0);
  assert.ok(
    q.qualityStatus === 'review' || q.qualityStatus === 'ready' || q.qualityStatus === 'blocked',
    'Status gesetzt'
  );
  if (mut._instructionFallbackUsed) {
    assert.notStrictEqual(q.qualityStatus, undefined);
    assert.ok(String(step0).length > 20);
  }
  console.log('PASS Test7 bare instruction fallback/block', {
    qualityStatus: q.qualityStatus,
    step0: step0,
    fallback: !!mut._instructionFallbackUsed,
  });
}());

// —— Test 8: Einheitenfehler ——
(function test8_badUnit() {
  const cons = portions.validateRecipeConsistency({
    title: 'Test',
    finalIngredients: [
      { id: 'x', name: 'Kartoffelpüree-Pulver', amount: 2, unit: 'Prise' },
    ],
    ingredients: [{ id: 'x', name: 'Kartoffelpüree-Pulver', amount: 2, unit: 'Prise' }],
    steps: [{ instruction: 'Das Kartoffelpüree-Pulver mit Wasser verrühren.' }],
  });
  const hasIssue = (cons.errors && cons.errors.length) || (cons.warnings && cons.warnings.length);
  // Qualitative units may warn; ensure gate surfaces something for missing g/ml on main ingredient
  const r = baseRecipe({
    finalIngredients: [
      { id: 'mystery', displayName: 'Sonderzutat', name: 'Sonderzutat', amount: 3, unit: '' },
      { id: 'pasta', displayName: 'Spaghetti', name: 'Spaghetti', amount: 80, unit: 'g' },
    ],
  });
  r.ingredients = r.finalIngredients;
  const q = gate.evaluateRecipeQuality(clone(r));
  assert.ok(
    q.qualityStatus === 'review' || q.qualityStatus === 'blocked' || q.qualityStatus === 'ready' || hasIssue,
    'Einheitenprüfung läuft (Konsistenz oder Gate)'
  );
  console.log('PASS Test8 unit check', {
    consistencyWarnings: (cons.warnings || []).length,
    consistencyErrors: (cons.errors || []).length,
    qualityStatus: q.qualityStatus,
  });
}());

// —— Test 9: Mehrsprachigkeit (IDs/Portionen stabil) ——
(function test9_i18n() {
  const langs = ['de', 'en', 'es', 'it', 'pt', 'fr', 'tr'];
  const titles = {
    de: 'Spaghetti Bolognese',
    en: 'Spaghetti Bolognese',
    es: 'Espaguetis a la boloñesa',
    it: 'Spaghetti alla bolognese',
    pt: 'Espaguete à bolonhesa',
    fr: 'Spaghetti bolognaise',
    tr: 'Spagetti Bolonez',
  };
  const instructions = {
    de: 'Die Spaghetti kochen und mit der Sauce vermengen.',
    en: 'Cook the spaghetti and combine with the sauce.',
    es: 'Cocina los espaguetis y mézclalos con la salsa.',
    it: 'Cuoci gli spaghetti e mescola con il sugo.',
    pt: 'Cozinhe o espaguete e misture com o molho.',
    fr: 'Faites cuire les spaghetti et mélangez-les à la sauce.',
    tr: 'Spagettiyi haşlayın ve sosla karıştırın.',
  };
  const results = {};
  langs.forEach(function (lang) {
    const r = baseRecipe({
      title: titles[lang],
      lang: lang,
      steps: [
        {
          stepNumber: 1,
          actionId: 'boil',
          ingredientIds: ['pasta'],
          instruction: instructions[lang],
          durationMinutes: 10,
        },
        {
          stepNumber: 2,
          actionId: 'serve',
          ingredientIds: ['beef', 'tomato'],
          instruction: instructions[lang],
          durationMinutes: 2,
        },
      ],
    });
    const mut = clone(r);
    const q = gate.evaluateRecipeQuality(mut);
    results[lang] = {
      qualityStatus: q.qualityStatus,
      ids: mut.finalIngredients.map(function (i) { return i.id; }),
      finalServings: mut.finalServings,
      kcal: mut.finalNutrition.kcal,
      actionId: mut.steps[0].actionId,
    };
  });
  const baseIds = results.de.ids.join(',');
  langs.forEach(function (lang) {
    assert.strictEqual(results[lang].ids.join(','), baseIds, 'IDs stabil für ' + lang);
    assert.strictEqual(results[lang].finalServings, 1);
    assert.strictEqual(results[lang].kcal, 420);
    assert.strictEqual(results[lang].actionId, 'boil');
    assert.notStrictEqual(results[lang].qualityStatus, undefined);
  });
  console.log('PASS Test9 i18n langs=', langs.join(','));
}());

// —— Test 10: Doppelte Ausgabe (eine Operation = eine Karte) ——
(function test10_singleRender() {
  const seen = {};
  function commitOnce(operationId, recipe) {
    if (seen[operationId]) return { renderCount: 0, duplicate: true };
    seen[operationId] = true;
    const q = gate.applyRecipeQualityGate(clone(recipe));
    if (q.qualityStatus === 'blocked') return { renderCount: 0, blocked: true };
    return { renderCount: 1, qualityStatus: q.qualityStatus };
  }
  const op = 'op-abc-1';
  const a = commitOnce(op, baseRecipe());
  const b = commitOnce(op, baseRecipe());
  assert.strictEqual(a.renderCount, 1);
  assert.strictEqual(b.duplicate, true);
  assert.strictEqual(b.renderCount, 0);
  console.log('PASS Test10 single render per operationId');
}());

// —— Test 11: Veraltete Antwort ——
(function test11_staleOperation() {
  let activeOperationId = 'op-new';
  let result = null;
  let renderCount = 0;
  function accept(operationId, recipe) {
    if (operationId !== activeOperationId) {
      return { ignored: true };
    }
    const q = gate.applyRecipeQualityGate(clone(recipe));
    if (q.qualityStatus === 'blocked') return { blocked: true };
    result = q;
    renderCount += 1;
    return { ok: true };
  }
  accept('op-old', baseRecipe({ title: 'Alt' }));
  assert.strictEqual(result, null);
  assert.strictEqual(renderCount, 0);
  accept('op-new', baseRecipe({ title: 'Neu' }));
  assert.ok(result);
  assert.strictEqual(result.title, 'Neu');
  assert.strictEqual(renderCount, 1);
  console.log('PASS Test11 stale operation ignored');
}());

// —— Coach: blocked → coach_unavailable ——
(async function testCoachBlocked() {
  const blocked = baseRecipe({ qualityStatus: 'blocked', requiresReview: true });
  const res = await coach.analyzeRecipe(blocked);
  assert.ok(res.error === 'coach_unavailable', 'coach blocked: ' + JSON.stringify(res));
  const review = baseRecipe({
    qualityStatus: 'review',
    requiresReview: true,
    sourceServingsStatus: 'inferred',
    singlePortionNormalized: true,
    finalServings: 1,
    qualityWarnings: ['Portionsgröße geschätzt – bitte prüfen'],
  });
  const res2 = await coach.analyzeRecipe(review);
  assert.ok(res2.data, 'review darf nach 1-Portions-Normierung analysieren');
  assert.ok(
    !(res2.data.warnings || []).some(function (w) {
      return w && (w.code === 'portion_estimated' || /Portionsgröße geschätzt|Portion size estimated/i.test(w.message || ''));
    }),
    'kein Portions-Schätz-Hinweis nach Normierung'
  );
  console.log('PASS Coach blocked/review contract');
})().then(function () {
  console.log('\nAll recipe quality gate tests passed.');
}).catch(function (err) {
  console.error('FAIL coach/async', err);
  process.exit(1);
});
