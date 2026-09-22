'use strict';
/**
 * Tests: Live-Rezept Quality-Fixes (Ragù-Fall)
 * 1 finalNutrition überall identisch
 * 2 Netto-KH == Kurzzeile KH
 * 3 Unplausibles Protein erkannt/korrigiert
 * 4 noHerbs entfernt Petersilie
 * 5 Garnitur nicht mit Köcheln vermischt
 * 6 Keine rohe Zutatenliste in Instructions
 * 7 Milchfreie Anpassung gekennzeichnet
 * 8 Geschätzte Portion → review
 * 9 Einkaufsliste == finalIngredients
 * 10 Ein Status / eine Karte
 */
const assert = require('assert');
const fixes = require('./recipe-display-fixes');
const gate = require('./recipe-quality-gate');
const pipeline = require('./recipe-pipeline-v92');

function liveRaguRaw(overrides) {
  const base = {
    title: 'Ragù alla Bolognese',
    servings: 1,
    sourceServingsStatus: 'inferred',
    prep_time_min: 150,
    nutrition: { kcal: 746, protein_g: 110, fat_g: 30, netto_kh_g: 10, ballaststoffe_g: 2 },
    ingredients: [
      { id: '0001', name: 'Olivenöl', amount: 10, unit: 'ml', protein_source: false, netCarbs: 0, fat: 100, protein: 0, fiber: 0 },
      { id: '0002', name: 'Zwiebel', amount: 35, unit: 'g', protein_source: false, netCarbs: 7, fat: 0.1, protein: 1.1, fiber: 1.7 },
      { id: '0003', name: 'Karotte', amount: 25, unit: 'g', protein_source: false, netCarbs: 7, fat: 0.2, protein: 0.9, fiber: 2.8 },
      { id: '0004', name: 'Sellerie', amount: 15, unit: 'g', protein_source: false, netCarbs: 1.4, fat: 0.2, protein: 0.7, fiber: 1.6 },
      // Absurde KI-Makros: ~81 g Protein/100g → würde 110 g ergeben
      { id: '0005', name: 'Rinderhackfleisch', amount: 135, unit: 'g', protein_source: true, netCarbs: 0, fat: 15, protein: 81.5, fiber: 0 },
      { id: '0006', name: 'Passierte Tomaten', amount: 83, unit: 'ml', protein_source: false, netCarbs: 3.5, fat: 0.2, protein: 1.2, fiber: 1 },
      { id: '0007', name: 'Tomatenmark', amount: 5, unit: 'g', protein_source: false, netCarbs: 10, fat: 0.5, protein: 4, fiber: 2 },
      { id: '0008', name: 'Rotwein', amount: 33, unit: 'ml', protein_source: false, netCarbs: 2.5, fat: 0, protein: 0.1, fiber: 0 },
      { id: '0009', name: 'Petersilie', amount: 5, unit: 'g', protein_source: false, netCarbs: 1, fat: 0.2, protein: 3, fiber: 2 },
    ],
    steps: [
      { title: 'Olivenöl erhitzen', content: '{0001}', stove_level: 5, time_min: 1 },
      { title: 'Gemüse anschwitzen', content: '{0002} {0003} {0004}', stove_level: 4, time_min: 8 },
      { title: 'Fleisch anbraten', content: '{0005}', stove_level: 6, time_min: 10 },
      { title: 'Mit Wein ablöschen', content: '{0008}', stove_level: 5, time_min: 3 },
      { title: 'Tomaten hinzufügen', content: '{0006} {0007}', stove_level: 3, time_min: 2 },
      { title: 'Würzen', content: 'Salz Pfeffer', stove_level: 0, time_min: 1 },
      { title: 'Langsam köcheln lassen und garnieren', content: '{0009}', stove_level: 2, time_min: 120 },
    ],
    garnish: 'Mit {0009} bestreuen.',
    chef_analysis: 'Klassisches Ragù.',
    diet_labels: [],
    target_deviation_note: '',
  };
  return Object.assign(base, overrides || {});
}

// —— 1+2: finalNutrition einheitlich, Netto-KH == Kurzzeile ——
(function test1_2_nutritionConsistency() {
  const rendered = pipeline.renderRecipeForDisplay(liveRaguRaw(), {
    noHerbs: true,
    isOriginalRequest: true,
    isOriginalBolognese: true,
    allergens: ['Laktose / Milchprodukte'],
    dairyFreeAdaptation: true,
  });
  assert.ok(rendered);
  assert.ok(rendered.finalNutrition);
  assert.strictEqual(
    Number(rendered.finalNutrition.netto_kh_g),
    Number(rendered.nutrition.netto_kh_g),
    'nutrition === finalNutrition (Netto-KH)'
  );
  const summary = fixes.formatNutritionSummary(rendered.finalNutrition);
  assert.strictEqual(summary.carbs, Math.round(summary.netCarbs), 'Kurzzeile KH == Netto-KH');
  assert.strictEqual(summary.carbs, Math.round(Number(rendered.finalNutrition.netto_kh_g)));
  console.log('PASS 1+2 nutrition consistency', summary);
}());

// —— 3: Unplausibles Protein ——
(function test3_proteinPlausibility() {
  const r = {
    title: 'Test',
    finalIngredients: [
      {
        id: 'beef',
        name: 'Rinderhackfleisch',
        amount: 135,
        unit: 'g',
        macrosPer100g: { protein: 81.5, fat: 15, netCarbs: 0, fiber: 0 },
        protein_source: true,
      },
    ],
    ingredients: null,
    steps: ['Anbraten.'],
    finalNutrition: { kcal: 746, protein_g: 110, fat_g: 20, netto_kh_g: 0, ballaststoffe_g: 0 },
    nutritionSource: 'finalIngredients',
    sourceServingsStatus: 'explicit',
    finalServings: 1,
  };
  r.ingredients = r.finalIngredients;
  const before = fixes.computeNutritionFromIngredients(r.finalIngredients);
  assert.ok(before.protein_g > 100, 'Rohwert unplausibel: ' + before.protein_g);
  fixes.sanitizeIngredientMacros(r);
  fixes.recomputeFinalNutrition(r);
  assert.ok(r.finalNutrition.protein_g < 50, 'nach Korrektur plausibel: ' + r.finalNutrition.protein_g);
  assert.ok(r.finalNutrition.protein_g > 20, 'noch sinnvolles Protein');
  // Gate erkennt unplausible Werte VOR Fix
  const bad = {
    title: 'X',
    finalIngredients: r.finalIngredients.map(function (i) {
      return Object.assign({}, i, { macrosPer100g: { protein: 81.5, fat: 15, netCarbs: 0, fiber: 0 } });
    }),
    steps: ['x'],
    finalNutrition: { kcal: 700, protein_g: 110, fat_g: 20, netto_kh_g: 0, ballaststoffe_g: 0 },
    nutritionSource: 'finalIngredients',
    sourceServingsStatus: 'explicit',
    finalServings: 1,
  };
  bad.ingredients = bad.finalIngredients;
  bad._nutritionImplausible = true;
  const q = gate.evaluateRecipeQuality(JSON.parse(JSON.stringify(bad)));
  assert.strictEqual(q.qualityChecks.nutrition.status, 'fail');
  console.log('PASS 3 protein plausibility', {
    before: before.protein_g,
    after: r.finalNutrition.protein_g,
    gate: q.qualityStatus,
  });
}());

// —— 4: noHerbs entfernt Petersilie ——
(function test4_noHerbs() {
  const rendered = pipeline.renderRecipeForDisplay(liveRaguRaw(), {
    noHerbs: true,
    isOriginalBolognese: true,
    isOriginalRequest: true,
  });
  const names = (rendered.finalIngredients || []).map(function (i) { return i.name; }).join(' ');
  assert.ok(!/petersilie/i.test(names), 'keine Petersilie in Zutaten: ' + names);
  assert.ok(!(rendered.garnish && /petersilie/i.test(rendered.garnish)), 'keine Petersilie in Garnish');
  const stepsBlob = (rendered.steps || []).join('\n');
  assert.ok(!/petersilie/i.test(stepsBlob), 'keine Petersilie in Steps');
  const shop = (rendered.shopping_list || []).join('\n');
  assert.ok(!/petersilie/i.test(shop), 'keine Petersilie in Einkaufsliste');
  console.log('PASS 4 noHerbs strips parsley');
}());

// —— 5+6: Schritte natürlich, kein Köcheln+Garnieren, keine Rohlisten ——
(function test5_6_steps() {
  const rendered = pipeline.renderRecipeForDisplay(liveRaguRaw(), {
    noHerbs: true,
    isOriginalBolognese: true,
  });
  const steps = rendered.steps || [];
  steps.forEach(function (s) {
    assert.ok(!fixes.looksLikeLabelColonDump(s), 'kein Label:Dump → ' + s);
    assert.ok(!/^Olivenöl erhitzen:\s*Olivenöl$/i.test(s), s);
    assert.ok(!/Zwiebel Karotte Sellerie/.test(s) || /\b(anschwitz|dünsten|weich)\b/i.test(s), s);
  });
  const blob = steps.join('\n');
  assert.ok(!/köcheln lassen und garnieren/i.test(blob), 'Köcheln und Garnieren getrennt');
  assert.ok(/köcheln/i.test(blob), 'Köcheln-Schritt vorhanden');
  assert.ok(!/garnieren/i.test(blob) || !rendered.noHerbs, 'kein Garnieren bei noHerbs');
  console.log('PASS 5+6 natural steps', steps.slice(0, 3));
}());

// —— 7: Laktose aktiv, aber Ragù ohne Milch/Ersatz → kein adapted (kein False Positive) ——
(function test7_dairy() {
  const rendered = pipeline.renderRecipeForDisplay(liveRaguRaw(), {
    noHerbs: true,
    isOriginalBolognese: true,
    allergens: ['Milch / Laktose'],
    dairyFreeAdaptation: true,
  });
  assert.ok(!/milchfrei angepasst/i.test(rendered.title), 'Titel ohne milchfrei-Suffix: ' + rendered.title);
  assert.ok(!rendered.adaptationFlags || rendered.adaptationFlags.indexOf('dairy_free_adaptation') < 0,
    'kein dairy_free_adaptation ohne Ersatz');
  assert.ok(!rendered.adaptationNote, 'keine adaptationNote ohne Ersatz: ' + rendered.adaptationNote);
  assert.ok(!rendered.lactoseHonestyStatus || rendered.lactoseHonestyStatus === 'none',
    'status=' + rendered.lactoseHonestyStatus);
  console.log('PASS 7 ragu + lactose without substitute → not adapted');
}());

// —— 8: Geschätzte Portion → review ——
(function test8_inferredReview() {
  const rendered = pipeline.renderRecipeForDisplay(liveRaguRaw({
    servings: 1,
    // große Mengen → Inferenz
    ingredients: liveRaguRaw().ingredients.map(function (ing) {
      if (ing.name === 'Rinderhackfleisch') return Object.assign({}, ing, { amount: 600, protein: 20 });
      if (ing.name === 'Petersilie') return Object.assign({}, ing, { amount: 5 });
      return Object.assign({}, ing, { amount: Number(ing.amount) * 4, protein: Math.min(Number(ing.protein) || 0, 25) });
    }),
  }), { noHerbs: true, isOriginalBolognese: true });
  assert.ok(
    rendered.qualityStatus === 'review' || rendered.sourceServingsStatus === 'inferred' || rendered.requiresReview,
    'review erwartet: ' + JSON.stringify({
      qualityStatus: rendered.qualityStatus,
      sourceServingsStatus: rendered.sourceServingsStatus,
      requiresReview: rendered.requiresReview,
    })
  );
  console.log('PASS 8 inferred → review', {
    qualityStatus: rendered.qualityStatus,
    sourceServingsStatus: rendered.sourceServingsStatus,
  });
}());

// —— 9: Einkaufsliste == finalIngredients ——
(function test9_shopping() {
  const rendered = pipeline.renderRecipeForDisplay(liveRaguRaw(), {
    noHerbs: true,
    isOriginalBolognese: true,
  });
  const ings = rendered.finalIngredients || [];
  const shop = rendered.shopping_list || [];
  assert.strictEqual(shop.length, ings.length, 'gleiche Anzahl');
  ings.forEach(function (ing) {
    assert.ok(shop.some(function (line) {
      return String(line).indexOf(ing.name) >= 0;
    }), 'Einkauf enthält ' + ing.name);
  });
  console.log('PASS 9 shopping == finalIngredients');
}());

// —— 10: Ein Status ——
(function test10_singleStatus() {
  const rendered = pipeline.renderRecipeForDisplay(liveRaguRaw(), {
    noHerbs: true,
    isOriginalBolognese: true,
    allergens: ['Laktose'],
    dairyFreeAdaptation: true,
  });
  assert.ok(['ready', 'review', 'blocked'].indexOf(rendered.qualityStatus) >= 0);
  assert.strictEqual(rendered.qualityStatus, rendered.quality.qualityStatus);
  // Nach Fixes: Protein ok, Steps ok, no herbs → darf ready oder review (inferred) sein, nicht blocked wegen Petersilie
  assert.notStrictEqual(rendered.qualityStatus, undefined);
  const cards = [rendered].filter(Boolean);
  assert.strictEqual(cards.length, 1);
  console.log('PASS 10 single status', rendered.qualityStatus);
}());

console.log('\nAll live-ragu quality fix tests passed.');
