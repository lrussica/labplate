'use strict';

const assert = require('assert');
const portions = require('./recipe-portions');

const B = portions.SINGLE_PORTION_BASE;

// Eier max. 3
{
  const r = portions.enforceSinglePortionBaseAmounts([
    { id: 'e', displayName: 'Ei (Größe M, ca. 60 g)', amount: 5, unit: 'stk' },
  ]);
  assert.strictEqual(r.ingredients[0].amount, B.eggMaxPieces);
  assert.ok(r.warnings.some(function (w) { return /Eier/i.test(w); }));
  console.log('OK egg clamp 5→3');
}

// Regression: „10 Eier“ als Name + 600 g (umgeht alten stk-only Clamp)
{
  const r = portions.enforceSinglePortionBaseAmounts([
    { id: 'e', name: '10 Eier (Größe M, ca. 60 g je)', amount: 600, unit: 'g' },
  ]);
  assert.ok(r.clamps.length >= 1, 'clamp expected');
  assert.strictEqual(r.ingredients[0].amount, B.eggMaxPieces * 60);
  assert.ok(/3 Eier/i.test(r.ingredients[0].name || r.ingredients[0].displayName));
  console.log('OK egg clamp 600g/10 Eier → 3');
}

// Fleisch max. 180 g
{
  const r = portions.enforceSinglePortionBaseAmounts([
    { id: 'm', displayName: 'Rinderhackfleisch', amount: 320, unit: 'g' },
  ]);
  assert.strictEqual(r.ingredients[0].amount, B.meatMaxG);
  console.log('OK meat clamp 320→180');
}

// Öl max. 15 ml
{
  const r = portions.enforceSinglePortionBaseAmounts([
    { id: 'o', displayName: 'Olivenöl', amount: 40, unit: 'ml' },
  ]);
  assert.strictEqual(r.ingredients[0].amount, B.fatMaxG);
  console.log('OK oil clamp 40→15');
}

// Speck unter 80 g nicht hochsetzen
{
  const r = portions.enforceSinglePortionBaseAmounts([
    { id: 's', displayName: 'Speck', amount: 25, unit: 'g' },
  ]);
  assert.strictEqual(r.ingredients[0].amount, 25);
  console.log('OK speck garnish untouched');
}

// kcal-Rahmen
{
  const bad = portions.validateSinglePortionKcal({ kcal: 950 }, {});
  assert.strictEqual(bad.status, 'out_of_range');
  const ok = portions.validateSinglePortionKcal({ kcal: 520 }, {});
  assert.strictEqual(ok.status, 'ok');
  const keto = portions.validateSinglePortionKcal({ kcal: 900 }, {
    dietLabels: ['extreme_keto'],
  });
  assert.strictEqual(keto.status, 'exempt');
  console.log('OK kcal range + exempt');
}

// Batch 500g + servings=1 → skaliert + geklemmt auf ≤180
{
  const built = portions.buildFinalPortionedRecipe({
    sourceIngredients: [
      { id: '0001', displayName: 'Rinderhackfleisch', amount: 500, unit: 'g' },
      { id: '0002', displayName: 'Olivenöl', amount: 40, unit: 'ml' },
    ],
    sourceServings: 1,
    targetServings: 1,
  });
  assert.ok(built.finalIngredients);
  const meat = built.finalIngredients.find(function (i) {
    return /hack/i.test(i.displayName || i.name || '');
  });
  const oil = built.finalIngredients.find(function (i) {
    return /öl/i.test(i.displayName || i.name || '');
  });
  assert.ok(meat && meat.amount <= B.meatMaxG, 'meat=' + (meat && meat.amount));
  assert.ok(oil && oil.amount <= B.fatMaxG, 'oil=' + (oil && oil.amount));
  console.log('OK batch-as-1 → inferred scale + clamp', {
    meat: meat.amount,
    oil: oil.amount,
    source: built.sourceServings,
  });
}

console.log('All single-portion-base tests passed.');
