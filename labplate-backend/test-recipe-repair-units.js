'use strict';

const assert = require('assert');
const repair = require('./recipe-repair');
const unitModel = require('./recipe-unit-model');
const validator = require('./recipe-validator');

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log('OK', msg);
}

// --- Typed Units ---
ok(unitModel.inferUnitKind({ unit: 'prise' }) === 'pinch', 'prise → pinch');
ok(unitModel.inferUnitKind({ unit: 'stk', name: 'Ei' }) === 'discrete', 'Ei stk → discrete');
ok(unitModel.inferUnitKind({ unit: 'stk', name: 'Lorbeerblatt' }) === 'discrete', 'Lorbeer stk → discrete');
ok(unitModel.resolvePieceMassG({ unit: 'stk', name: 'Ei' }) === 60, 'Ei pieceMassG 60');
ok(unitModel.resolvePieceMassG({ unit: 'stk', name: 'Lorbeerblatt' }) === 0, 'Lorbeer pieceMassG 0');
ok(unitModel.ingredientAmountGrams({ amount: 2, unit: 'stk', name: 'Ei' }) === 120, '2 Eier = 120 g');
ok(unitModel.ingredientAmountGrams({ amount: 2, unit: 'stk', name: 'Lorbeerblatt' }) === 0, '2 Lorbeer = 0 g macros');
ok(unitModel.ingredientAmountGrams({ amount: 1, unit: 'prise', name: 'Salz' }) === 0, 'prise = 0 g');

const bay = { name: 'Lorbeerblatt', amount: 2, unit: 'stk', protein: 10, fat: 0, netCarbs: 0, fiber: 0 };
const egg = { name: 'Ei', amount: 2, unit: 'stk', protein: 13, fat: 10, netCarbs: 0.7, fiber: 0 };
const nutBay = validator.computeNutritionFromIngredients([bay]);
const nutEgg = validator.computeNutritionFromIngredients([egg]);
ok(nutBay.protein_g === 0, 'Lorbeer trägt keine Makros trotz stk: ' + nutBay.protein_g);
ok(nutEgg.protein_g > 10 && nutEgg.protein_g < 30, 'Eier tragen Makros: ' + nutEgg.protein_g);

// --- Staple inject parity (Öl, nicht nur Salz) ---
(function () {
  const recipe = {
    title: 'Test',
    ingredients: [
      { id: '0001', name: 'Hähnchen', amount: 200, unit: 'g', protein: 22, fat: 5, netCarbs: 0, fiber: 0, protein_source: true, culinaryRole: 'main_protein' },
    ],
    steps: [
      { title: 'Braten', content: 'Öl in der Pfanne erhitzen und Hähnchen anbraten.', stove_level: 6, time_min: 10 },
    ],
    garnish: '',
    chef_analysis: 'Einfach.',
    nutrition: { kcal: 0, protein_g: 0, fat_g: 0, netto_kh_g: 0, ballaststoffe_g: 0 },
  };
  const before = repair.findMissingStaples(recipe.steps, '', recipe.ingredients);
  ok(before.some(function (g) { return g.label === 'Öl'; }), 'Öl als missing erkannt');

  const injected = repair.injectMissingStaples(recipe);
  ok(injected.indexOf('Öl') >= 0, 'Öl injiziert: ' + injected.join(','));
  ok(recipe.ingredients.some(function (i) { return /[öo]l/i.test(i.name); }), 'Öl in Liste');
  const oil = recipe.ingredients.find(function (i) { return /[öo]l/i.test(i.name); });
  ok(oil && /\{/.test(recipe.steps[0].content) || recipe.steps[0].content.indexOf('{' + oil.id + '}') >= 0,
    'Placeholder verknüpft: ' + recipe.steps[0].content);
  ok(Array.isArray(recipe.steps[0].ingredientIds) && recipe.steps[0].ingredientIds.indexOf(oil.id) >= 0,
    'ingredientIds abgeleitet');

  const after = repair.findMissingStaples(recipe.steps, '', recipe.ingredients);
  ok(!after.some(function (g) { return g.label === 'Öl'; }), 'Öl nicht mehr missing');
})();

// --- repairRecipeV2 end-to-end + validate ---
(function () {
  const recipe = {
    title: 'Gedünstetes Gemüse',
    servings: 4,
    ingredients: [
      { id: '0001', name: 'Zucchini', amount: 400, unit: 'g', protein: 1, fat: 0.3, netCarbs: 2, fiber: 1 },
      { id: '0002', name: 'Lorbeerblatt', amount: 2, unit: 'stk', protein: 0, fat: 0, netCarbs: 0, fiber: 0 },
    ],
    steps: [
      {
        title: 'Dünsten',
        content: 'Wasser mit Lorbeerblatt aufkochen, Zwiebel und Knoblauch anschwitzen, Zucchini darin dünsten. Mit Salz und Pfeffer abschmecken.',
        stove_level: 4,
        time_min: 20,
      },
    ],
    garnish: '',
    chef_analysis: 'Leicht und aromatisch.',
    nutrition: { kcal: 100, protein_g: 5, fat_g: 2, netto_kh_g: 8, ballaststoffe_g: 2 },
    diet_labels: [],
  };

  const out = repair.repairRecipeV2(recipe);
  ok(out.repairs.length > 0, 'Repairs gelaufen: ' + out.repairs.join('; '));
  const names = recipe.ingredients.map(function (i) { return i.name; }).join(', ');
  ok(/Wasser/i.test(names), 'Wasser injiziert: ' + names);
  ok(/Salz|Pfeffer/i.test(names), 'Salz/Pfeffer injiziert: ' + names);
  ok(/Zwiebel/i.test(names), 'Zwiebel injiziert: ' + names);
  ok(/Knoblauch/i.test(names), 'Knoblauch injiziert: ' + names);

  const lorbeer = recipe.ingredients.find(function (i) { return /Lorbeer/i.test(i.name); });
  ok(lorbeer && lorbeer.unitKind === 'discrete', 'Lorbeer unitKind discrete');
  ok(lorbeer && Number(lorbeer.pieceMassG) === 0, 'Lorbeer pieceMassG 0');

  const v = validator.validateRecipeV2(recipe, { dishQuery: 'Gedünstetes Gemüse' });
  ok(v.ok, 'validate nach Repair OK: ' + (v.errors || []).join(' | '));
})();

// --- Wasser-only classic fail pattern ---
(function () {
  const recipe = {
    title: 'Sud',
    servings: 4,
    ingredients: [
      { id: '0001', name: 'Kalbfleisch', amount: 600, unit: 'g', protein: 22, fat: 5, netCarbs: 0, fiber: 0, protein_source: true, culinaryRole: 'main_protein' },
    ],
    steps: [
      { title: 'Kochen', content: 'Wasser in einem Topf zum Kochen bringen und Kalbfleisch hineingeben.', stove_level: 5, time_min: 40 },
    ],
    garnish: '',
    chef_analysis: 'Klassisch.',
    nutrition: { kcal: 400, protein_g: 40, fat_g: 10, netto_kh_g: 0, ballaststoffe_g: 0 },
    diet_labels: [],
  };
  repair.repairRecipeV2(recipe);
  const v = validator.validateRecipeV2(recipe, { dishQuery: 'Kalbfleisch kochen' });
  ok(v.ok, 'Wasser-Pattern ohne 422: ' + (v.errors || []).join(' | '));
  ok(recipe.ingredients.some(function (i) { return /Wasser/i.test(i.name); }), 'Wasser vorhanden');
})();

console.log('test-recipe-repair-units: ALL OK');
