'use strict';
const assert = require('assert');
const store = require('./classic-master-store');
const pipeline = require('./recipe-pipeline-v92');

function ok(c, m) { assert.ok(c, m); console.log('OK', m); }

// Multi-lang resolver → lasagne_classica
const cases = [
  ['Lasagne', 'de'],
  ['Classic Lasagna', 'en'],
  ['Lasagnes classiques', 'fr'],
  ['Lasagne classiche', 'it'],
  ['Klasik Lazanya', 'tr'],
  ['klassische italienische Lasagne', 'de'],
];
cases.forEach(function (pair) {
  const hit = store.resolveClassic(pair[0], pair[1]);
  ok(hit && hit.id === 'lasagne_classica', 'resolve "' + pair[0] + '" → lasagne_classica');
});

ok(store.resolveClassic('Bowl mit Linsen') === null, 'kein HIT für freie Bowl');
ok(store.resolveClassic('kalorienarme Lasagne light version') === null, 'Low-Cal kein Master-HIT');

// International IDs
['ragu_bolognese', 'carbonara', 'coq_au_vin', 'wiener_schnitzel', 'karniyarik', 'koefte'].forEach(function (id) {
  ok(store.listMasterIds().indexOf(id) >= 0, 'Master enthält ' + id);
});
ok(!!store.resolveClassic('Spaghetti Carbonara'), 'Carbonara Alias');
ok(!!store.resolveClassic('Wiener Schnitzel'), 'Schnitzel Alias');
ok(!!store.resolveClassic('Karnıyarık'), 'Karnıyarık Alias');
ok(!!store.resolveClassic('Köfte'), 'Köfte Alias');
ok(!!store.resolveClassic('Coq au Vin'), 'Coq au Vin Alias');
ok(!!store.resolveClassic('Bolognaise'), 'FR Bolognese Alias');

// Build DE Lasagne — Béchamel components present
const built = store.buildFromMaster({
  pantry_ingredients: ['Klassische Lasagne'],
  lang: 'de',
  allergens: [],
});
ok(built.ok, 'buildFromMaster Lasagne ok');
ok(built.recipe.recipeSource === 'master-classic', 'recipeSource master-classic');
ok(built.recipe.immutableCore === true, 'immutableCore');
const names = built.recipe.ingredients.map(function (i) { return i.name; }).join(' | ');
ok(/Butter/i.test(names) && /Mehl/i.test(names) && /Milch/i.test(names), 'Béchamel-Rohzutaten: ' + names);
ok(/Mozzarella/i.test(names) && /Parmigiano|Parmesan/i.test(names), 'Käse vorhanden');
ok(/Lasagneplatte|Lasagna sheet|Lazanya/i.test(names), 'Platten vorhanden');
ok(/Hack|beef|Boeuf|manzo|kıyma/i.test(names), 'Hack vorhanden');

// EN localization
const en = store.buildFromMaster({
  pantry_ingredients: ['Classic Lasagna'],
  lang: 'en',
});
ok(en.ok && /Classic Italian Lasagna/i.test(en.recipe.title), 'EN title: ' + en.recipe.title);
ok(en.recipe.ingredients.some(function (i) { return /Ground beef/i.test(i.name); }), 'EN ingredient names');

// TR localization
const tr = store.buildFromMaster({
  pantry_ingredients: ['Klasik Lazanya'],
  lang: 'tr',
});
ok(tr.ok && /Lazanya/i.test(tr.recipe.title), 'TR title: ' + tr.recipe.title);

// Honest lactose swap (Lasagne)
const lf = store.buildFromMaster({
  pantry_ingredients: ['Lasagne'],
  lang: 'de',
  allergens: ['Laktose'],
});
ok(lf.ok, 'Lasagne + Laktose adapted');
ok(lf.recipe.lactoseHonestyStatus === 'adapted', 'status adapted');
ok(lf.recipe.ingredients.some(function (i) { return /laktosefreie Milch/i.test(i.name); }), 'Milch geswappt');
ok(lf.recipe.ingredients.some(function (i) { return /Rinderhack/i.test(i.name); }), 'Hack unverändert');

// Carbonara + Laktose → impossible (Pecorino)
const carb = store.buildFromMaster({
  pantry_ingredients: ['Carbonara'],
  lang: 'de',
  allergens: ['Laktose'],
});
ok(!carb.ok && carb.error === 'lactose_impossible_for_classic', 'Carbonara Laktose impossible');

// Pipeline HIT without Groq
(async function () {
  const res = await pipeline.generateValidatedRecipe({
    payload: {
      pantry_ingredients: ['Classic Lasagna'],
      lang: 'en',
      allergens: [],
      mode: 'pantry',
      original_mode: true,
    },
    buildRequestBody: function () { throw new Error('LLM must not be called on master HIT'); },
    callGroq: function () { throw new Error('LLM must not be called on master HIT'); },
  });
  ok(res.ok && res.recipeSource === 'master-classic', 'Pipeline Master-HIT ohne LLM');
  ok(res.recipe && res.recipe.finalIngredients, 'rendered finalIngredients');
  const blob = (res.recipe.finalIngredients || []).map(function (i) {
    return i.name || i.displayName;
  }).join(' ');
  ok(/butter|Butter|milk|Milk|flour|Flour|Mehl|Milch/i.test(blob), 'Rendered enthält Béchamel-Zutaten');

  let generativeCalled = false;
  const generative = await pipeline.generateValidatedRecipe({
    payload: {
      pantry_ingredients: ['Classic Lasagna'],
      lang: 'en',
      allergens: [],
      mode: 'pantry',
      original_mode: false,
    },
    buildRequestBody: function () { generativeCalled = true; return {}; },
    callGroq: function () {
      generativeCalled = true;
      return Promise.resolve({ error: 'provider_error', status: 503, body: '' });
    },
  });
  ok(generativeCalled && generative.error === 'provider_error', 'Generative Anfrage umgeht Master-HIT');

  const originalMiss = await pipeline.generateValidatedRecipe({
    payload: {
      pantry_ingredients: ['Unbekanntes Originalgericht'],
      lang: 'de',
      allergens: [],
      mode: 'pantry',
      original_mode: true,
    },
    buildRequestBody: function () { throw new Error('Originalmodus darf keine KI-Anfrage bauen'); },
    callGroq: function () { throw new Error('Originalmodus darf Groq nicht aufrufen'); },
  });
  ok(originalMiss.error === 'original_recipe_unavailable', 'Originalmodus ohne Master bricht ohne KI ab');
  console.log('test-classic-master-store: ALL OK');
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
