'use strict';
/**
 * Tests: Laktose-Ehrlichkeit + QualityGate Sahne/Creme ohne False Positives.
 */
const assert = require('assert');
const lactoseHonesty = require('./lactose-honesty');
const gate = require('./recipe-quality-gate');
const portions = require('./recipe-portions');
const displayFixes = require('./recipe-display-fixes');

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function basePasta(overrides) {
  return Object.assign({
    title: 'Pasta mit Sahnesauce',
    sourceServings: 4,
    targetServings: 1,
    finalServings: 1,
    sourceServingsStatus: 'explicit',
    servingsStatus: 'ok',
    singlePortionNormalized: true,
    finalIngredients: [
      { id: 'pasta', displayName: 'Pasta', name: 'Pasta', amount: 80, unit: 'g' },
      { id: 'cream', displayName: 'Hafercreme', name: 'Hafercreme', amount: 50, unit: 'ml' },
    ],
    steps: [
      {
        instruction: 'Die Pasta kochen und mit der Hafercreme vermengen.',
        durationMinutes: 12,
        ingredientIds: ['pasta', 'cream'],
        actionId: 'mix',
      },
    ],
    finalNutrition: { kcal: 400, protein: 12, fat: 10, netCarbs: 50, fiber: 3 },
  }, overrides || {});
}

// —— 1: Nachrichten-Texte ——
(function testMessages() {
  const m1 = lactoseHonesty.buildLactoseHonestyMessage('adapted', 'Sahnesauce');
  assert.ok(/laktosefreien Alternativen/i.test(m1));
  assert.ok(/Sahnesauce/.test(m1));
  const m2 = lactoseHonesty.buildLactoseHonestyMessage('alternative_available', 'Tiramisu');
  assert.ok(/kein klassisches Rezept ohne Laktose/i.test(m2));
  assert.ok(/Alternative/i.test(m2));
  const m3 = lactoseHonesty.buildLactoseHonestyMessage('impossible', 'Käsefondue');
  assert.ok(/kulinarischen Qualitätsstandards/i.test(m3));
  console.log('PASS messages');
}());

// —— 2: Dairy-Klassifikation ——
(function testDairyNames() {
  assert.strictEqual(lactoseHonesty.isAnimalDairyName('Sahne'), true);
  assert.strictEqual(lactoseHonesty.isAnimalDairyName('Milch'), true);
  assert.strictEqual(lactoseHonesty.isAnimalDairyName('Hafercreme'), false);
  assert.strictEqual(lactoseHonesty.isAnimalDairyName('laktosefreie Butter'), false);
  assert.strictEqual(lactoseHonesty.isAnimalDairyName('Kokosmilch'), false);
  assert.strictEqual(lactoseHonesty.isAnimalDairyName('Sojajoghurt'), false);
  assert.strictEqual(lactoseHonesty.isPlantOrLactoseFreeDairyName('Pflanzensahne'), true);
  console.log('PASS dairy name classification');
}());

// —— 3: Creme im Text ≠ False Positive bei Hafercreme ——
(function testSahneConsistency() {
  assert.strictEqual(
    lactoseHonesty.textMentionsRealDairyCream('Pasta mit Kokoscreme und Curry'),
    false
  );
  assert.strictEqual(
    lactoseHonesty.textMentionsRealDairyCream('Mit Sahne ablöschen'),
    true
  );
  assert.strictEqual(
    lactoseHonesty.ingredientSatisfiesSahneSlot([
      { name: 'Hafercreme' },
      { name: 'Pasta' },
    ]),
    true
  );
  const tokens = portions.extractMentionedFoodTokens
    ? portions.extractMentionedFoodTokens('Mit der Creme vermengen und Sahnesauce anrichten')
    : [];
  // Wenn exportiert – sonst indirekt über Consistency
  const cons = portions.validateRecipeConsistency(basePasta());
  assert.ok(
    !(cons.warnings || []).some(function (w) { return /sahne/i.test(w) && /fehlt|keine/i.test(w); }),
    'keine Sahne-Warnung bei Hafercreme: ' + JSON.stringify(cons.warnings)
  );
  console.log('PASS sahne consistency with Hafercreme', tokens);
}());

// —— 4: QualityGate blockiert nicht bei Hafercreme + Laktose-Profil ——
(function testGateHafercreme() {
  const r = basePasta();
  r.ingredients = r.finalIngredients;
  const q = gate.evaluateRecipeQuality(clone(r), {
    allergens: ['Laktose / Milchprodukte'],
  });
  assert.notStrictEqual(q.qualityStatus, 'blocked', 'status=' + q.qualityStatus + ' errors=' + JSON.stringify(q.qualityErrors));
  assert.strictEqual(q.qualityChecks.allergens.status, 'pass');
  console.log('PASS gate hafercreme + lactose allergen → not blocked', q.qualityStatus);
}());

// —— 5: QualityGate blockiert echte Milch bei Laktose ——
(function testGateRealMilk() {
  const r = basePasta({
    finalIngredients: [
      { id: 'pasta', displayName: 'Pasta', name: 'Pasta', amount: 80, unit: 'g' },
      { id: 'milk', displayName: 'Milch', name: 'Milch', amount: 100, unit: 'ml' },
    ],
  });
  r.ingredients = r.finalIngredients;
  const q = gate.evaluateRecipeQuality(clone(r), {
    allergens: ['Laktose'],
  });
  assert.strictEqual(q.qualityStatus, 'blocked');
  assert.strictEqual(q.qualityChecks.allergens.status, 'fail');
  console.log('PASS gate real milk + lactose → blocked');
}());

// —— 6: Adaptation-Banner (adapted) ——
(function testAdaptationNote() {
  const recipe = {
    title: 'Pasta mit Sahnesauce',
    finalIngredients: [
      { name: 'Pasta', amount: 80, unit: 'g' },
      { name: 'Hafercreme', amount: 80, unit: 'ml' },
    ],
    steps: ['Creme unterrühren.'],
    allergens: ['Laktose'],
  };
  displayFixes.applyDairyFreeAdaptation(recipe, {
    allergens: ['Laktose'],
    dairyFreeAdaptation: true,
  });
  assert.strictEqual(recipe.lactoseHonestyStatus, 'adapted');
  assert.ok(/laktosefreien Alternativen/i.test(recipe.adaptationNote || ''));
  assert.ok(!/milchfrei angepasst/i.test(recipe.title || ''));
  assert.ok(recipe.adaptationFlags.indexOf('dairy_free_adaptation') >= 0);
  console.log('PASS adaptation note', recipe.adaptationNote.slice(0, 80) + '…');
}());

// —— 7: Sentinel Alternative / Impossible ——
(function testSentinels() {
  const alt = lactoseHonesty.extractLactoseHonestyFromParsed(
    { title: lactoseHonesty.SENTINEL_ALTERNATIVE, chef_analysis: 'Tomaten-Pesto-Pasta' },
    ['Laktose'],
    'Tiramisu'
  );
  assert.strictEqual(alt.status, 'alternative_available');
  assert.ok(/Alternative/i.test(alt.message));
  assert.strictEqual(alt.suggestedAlternative, 'Tomaten-Pesto-Pasta');

  const imp = lactoseHonesty.extractLactoseHonestyFromParsed(
    { title: lactoseHonesty.SENTINEL_IMPOSSIBLE, chef_analysis: 'Fondue braucht Käse' },
    ['Laktose / Milchprodukte'],
    'Käsefondue'
  );
  assert.strictEqual(imp.status, 'impossible');
  assert.ok(/Qualitätsstandards/i.test(imp.message));

  const none = lactoseHonesty.extractLactoseHonestyFromParsed(
    { title: lactoseHonesty.SENTINEL_IMPOSSIBLE },
    [],
    'Käsefondue'
  );
  assert.strictEqual(none.status, 'none');
  console.log('PASS sentinels');
}());

// —— 8: Titel „Sahnesauce“ ohne Echt-Sahne, mit Pflanzensahne → Consistency ok ——
(function testTitleSahnesauce() {
  const r = {
    title: 'Tagliatelle in Sahnesauce',
    sourceServings: 4,
    targetServings: 1,
    finalServings: 1,
    sourceServingsStatus: 'explicit',
    singlePortionNormalized: true,
    finalIngredients: [
      { id: 'pasta', name: 'Tagliatelle', displayName: 'Tagliatelle', amount: 80, unit: 'g' },
      { id: 'cream', name: 'laktosefreie Pflanzensahne', displayName: 'laktosefreie Pflanzensahne', amount: 100, unit: 'ml' },
    ],
    steps: [
      {
        instruction: 'Die Tagliatelle kochen und die Pflanzensahne leicht köcheln lassen.',
        durationMinutes: 15,
        ingredientIds: ['pasta', 'cream'],
        actionId: 'simmer',
      },
    ],
    finalNutrition: { kcal: 400, protein: 12, fat: 12, netCarbs: 48, fiber: 2 },
  };
  r.ingredients = r.finalIngredients;
  const cons = portions.validateRecipeConsistency(r);
  const sahneWarn = (cons.warnings || []).filter(function (w) {
    return /sahne/i.test(w) && /fehlt|keine/i.test(w);
  });
  assert.strictEqual(sahneWarn.length, 0, JSON.stringify(cons.warnings));
  const q = gate.evaluateRecipeQuality(clone(r), { allergens: ['Laktose'] });
  assert.notStrictEqual(q.qualityStatus, 'blocked', JSON.stringify(q.qualityErrors));
  console.log('PASS title Sahnesauce + Pflanzensahne');
}());

// —— 9: Ragù/Carbonara + Laktose ohne Ersatz → nicht adapted ——
(function testNoFalseAdapted() {
  const ragu = {
    title: 'Ragù alla Bolognese',
    finalIngredients: [
      { name: 'Rinderhackfleisch', amount: 100, unit: 'g' },
      { name: 'Passierte Tomaten', amount: 80, unit: 'ml' },
    ],
    steps: ['Hack anbraten, Tomaten dazu.'],
    allergens: ['Laktose'],
  };
  displayFixes.applyDairyFreeAdaptation(ragu, {
    allergens: ['Laktose'],
    dairyFreeAdaptation: true,
  });
  assert.ok(!ragu.adaptationNote, 'Ragù ohne Ersatz: ' + ragu.adaptationNote);
  assert.ok(!ragu.lactoseHonestyStatus || ragu.lactoseHonestyStatus === 'none');

  const carbonara = {
    title: 'Spaghetti Carbonara',
    finalIngredients: [
      { name: 'Spaghetti', amount: 80, unit: 'g' },
      { name: 'Guanciale', amount: 40, unit: 'g' },
      { name: 'Ei', amount: 60, unit: 'g' },
    ],
    steps: ['Pasta kochen, mit Ei und Guanciale vermengen.'],
  };
  displayFixes.applyDairyFreeAdaptation(carbonara, {
    allergens: ['Milch / Laktose'],
    dairyFreeAdaptation: true,
  });
  assert.ok(!carbonara.adaptationNote);
  assert.ok(!carbonara.adaptationFlags || carbonara.adaptationFlags.indexOf('dairy_free_adaptation') < 0);
  console.log('PASS no false adapted for Ragù/Carbonara');
}());

// —— 10: Sentinel in Steps/Analyse (nicht nur Titel) ——
(function testSentinelHaystack() {
  const alt = lactoseHonesty.extractLactoseHonestyFromParsed(
    {
      title: 'Tiramisu-Versuch',
      chef_analysis: 'Kurz',
      ingredients: [{ name: 'Kaffee' }],
      steps: [{ content: '__LACTOSE_HONESTY_ALTERNATIVE__: Beeren-Schoko-Dessert' }],
    },
    ['Laktose'],
    'Tiramisu'
  );
  assert.strictEqual(alt.status, 'alternative_available');
  assert.ok(/Beeren-Schoko/.test(alt.suggestedAlternative || ''));

  const empty = lactoseHonesty.extractLactoseHonestyFromParsed(
    { title: 'Käsefondue', ingredients: [], steps: [] },
    ['Laktose'],
    'Käsefondue'
  );
  assert.strictEqual(empty.status, 'impossible');
  assert.strictEqual(empty.inferredEmpty, true);
  console.log('PASS sentinel haystack + empty ingredients');
}());

// —— 11: i18n EN ohne DE-Override ——
(function testI18nEn() {
  const m = lactoseHonesty.buildLactoseHonestyMessage('adapted', 'Cream sauce', '', 'en');
  assert.ok(/Because you avoid lactose/i.test(m));
  assert.ok(!/Weil du Laktose/i.test(m));
  const alt = lactoseHonesty.extractLactoseHonestyFromParsed(
    { title: lactoseHonesty.SENTINEL_IMPOSSIBLE },
    ['Lactose'],
    'Fondue',
    { lang: 'en' }
  );
  assert.strictEqual(alt.status, 'impossible');
  assert.ok(/unfortunately cannot offer/i.test(alt.message));
  assert.ok(!/Weil du Laktose/i.test(alt.message));
  console.log('PASS i18n EN messages');
}());

// —— 12: Klassifikator-Kanten ——
(function testClassifierEdges() {
  assert.strictEqual(lactoseHonesty.isAnimalDairyName('Milchersatz'), true);
  assert.strictEqual(lactoseHonesty.isPlantOrLactoseFreeDairyName('Milchersatz'), false);
  assert.strictEqual(lactoseHonesty.isPlantOrLactoseFreeDairyName('pflanzlicher Milchersatz'), true);
  assert.strictEqual(lactoseHonesty.isNutOrPeanutCreamName('Erdnusscreme'), true);
  assert.strictEqual(lactoseHonesty.isPlantOrLactoseFreeDairyName('Erdnusscreme'), false);
  assert.strictEqual(
    lactoseHonesty.ingredientSatisfiesSahneSlot([{ name: 'Haferdrink' }], 'Pasta mit Tomatensauce'),
    false
  );
  assert.strictEqual(
    lactoseHonesty.ingredientSatisfiesSahneSlot([{ name: 'Haferdrink' }], 'Mit Sahne ablöschen'),
    true
  );
  console.log('PASS classifier edges Milchersatz/Erdnusscreme/Haferdrink');
}());

// —— 13: Eigenrezept-Policy-Hinweis ——
(function testEigenrezeptNote() {
  const note = lactoseHonesty.eigenrezeptAllergenPassthroughNote(['Laktose / Milchprodukte']);
  assert.ok(/keine Ersetzung/i.test(note));
  assert.ok(/Laktose/i.test(note));
  assert.ok(/kein Sentinel/i.test(note));
  console.log('PASS eigenrezept passthrough note');
}());

// —— 14: P2 Wortlaut + i18n alle App-Sprachen ——
(function testP2WordingAndI18n() {
  const fallbackSrc = require('fs').readFileSync(
    require('path').join(__dirname, 'recipe-display-fixes.js'),
    'utf8'
  );
  assert.ok(!/Laktoseunverträglichkeit/i.test(fallbackSrc));
  assert.ok(/Weil du Laktose meidest/i.test(fallbackSrc));

  const langs = ['de', 'en', 'es', 'it', 'pt', 'fr', 'tr'];
  langs.forEach(function (lang) {
    const adapted = lactoseHonesty.buildLactoseHonestyMessage('adapted', 'Pasta', '', lang);
    const impossible = lactoseHonesty.buildLactoseHonestyMessage('impossible', 'Fondue', '', lang);
    const alternative = lactoseHonesty.buildLactoseHonestyMessage('alternative_available', 'Tiramisu', 'Pesto', lang);
    assert.ok(adapted && adapted.length > 10, 'adapted ' + lang);
    assert.ok(impossible && impossible.length > 10, 'impossible ' + lang);
    assert.ok(alternative && alternative.length > 10, 'alternative ' + lang);
    assert.ok(!/Laktoseunverträglichkeit|unverträglichkeit|intolerance|intolerancia|intolleranza/i.test(adapted + impossible));
    if (lang === 'de') assert.ok(/Weil du Laktose meidest/i.test(adapted));
    if (lang === 'en') assert.ok(/Because you avoid lactose/i.test(adapted));
    if (lang === 'en') assert.ok(!/Weil du Laktose/i.test(adapted));
  });
  console.log('PASS P2 wording + i18n langs=' + langs.join(','));
}());

console.log('\nAll lactose-honesty tests passed.');
