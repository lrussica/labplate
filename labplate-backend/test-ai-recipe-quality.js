'use strict';

const assert = require('assert');
const quality = require('./ai-recipe-quality');

const db = [
  { id: 'beef', name: 'Rindfleisch', kcal: 250, protein: 26, fat: 15, carbs: 0, fiber: 0 },
  { id: 'water', name: 'Wasser', kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 },
  { id: 'oil', name: 'Öl', kcal: 884, protein: 0, fat: 100, carbs: 0, fiber: 0 },
  { id: 'salt', name: 'Salz', kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 },
  { id: 'vanilla', name: 'Vanille', kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 },
  { id: 'carrot', name: 'Karotte', kcal: 41, protein: 1, fat: 0, carbs: 10, fiber: 3 },
];

function recipe(overrides) {
  return Object.assign({
    title: 'Testgericht',
    dishCategory: 'main_meat',
    servings: 1,
    ingredients: [
      { id: 'beef', name: 'Rindfleisch', amount: 150, unit: 'g', role: 'main_protein' },
      { id: 'carrot', name: 'Karotte', amount: 50, unit: 'g', role: 'vegetable' },
    ],
    steps: [
      { order: 1, ingredientIds: ['beef', 'carrot'], action: 'fry', durationMin: 8, text: 'Rindfleisch und Karotte braten.' },
    ],
  }, overrides || {});
}

function invalidWith(change) {
  return quality.validateHardConstraints(Object.assign(recipe(), change), { ingredientDatabase: db });
}

assert.strictEqual(invalidWith({ ingredients: [
  { id: 'beef', name: 'Rindfleisch', amount: 20, unit: 'g', role: 'main_protein' },
], steps: [{ order: 1, ingredientIds: ['beef'], action: 'fry', durationMin: 3, text: 'Rindfleisch braten.' }] }).valid, false);
assert.strictEqual(quality.validateHardConstraints(recipe(), { ingredientDatabase: db }).valid, true);

const soup = recipe({
  dishCategory: 'soup',
  ingredients: [
    { id: 'water', name: 'Wasser', amount: 100, unit: 'ml', role: 'liquid' },
    { id: 'carrot', name: 'Karotte', amount: 50, unit: 'g', role: 'vegetable' },
  ],
  steps: [{ order: 1, ingredientIds: ['water', 'carrot'], action: 'boil', durationMin: 10, text: 'Wasser und Karotte kochen.' }],
});
assert.ok(invalidWith.call(null, soup).violations.some((v) => v.code === 'LIQUID_MIN'));
soup.ingredients[0].amount = 300;
assert.strictEqual(quality.validateHardConstraints(soup, { ingredientDatabase: db }).valid, true);

const dessert = recipe({
  dishCategory: 'dessert',
  ingredients: [{ id: 'vanilla', name: 'Vanille', amount: 3, unit: 'piece', role: 'spice' }],
  steps: [{ order: 1, ingredientIds: ['vanilla'], action: 'mix', durationMin: 1, text: 'Vanille mischen.' }],
});
assert.ok(quality.validateHardConstraints(dessert, { ingredientDatabase: db }).violations.some((v) => v.code === 'SPICE_MAX'));

const oilSalt = recipe({
  ingredients: [
    { id: 'beef', name: 'Rindfleisch', amount: 150, unit: 'g', role: 'main_protein' },
    { id: 'oil', name: 'Öl', amount: 500, unit: 'ml', role: 'fat' },
    { id: 'salt', name: 'Salz', amount: 5, unit: 'g', role: 'spice' },
  ],
  steps: [{ order: 1, ingredientIds: ['beef', 'oil', 'salt'], action: 'fry', durationMin: 5, text: 'Rindfleisch mit Öl braten und Salz würzen.' }],
});
const oilSaltResult = quality.validateHardConstraints(oilSalt, { ingredientDatabase: db });
assert.ok(oilSaltResult.violations.some((v) => v.code === 'FAT_MAX'));
assert.ok(oilSaltResult.violations.some((v) => v.code === 'SPICE_MAX'));

assert.ok(invalidWith({ steps: [{ order: 1, ingredientIds: ['unknown'], action: 'fry', durationMin: 3, text: 'Rindfleisch braten.' }] }).violations.some((v) => v.code === 'STEP_UNKNOWN_INGREDIENT'));
assert.ok(invalidWith({ steps: [{ order: 1, ingredientIds: ['beef', 'carrot'], action: 'fry', durationMin: 3, text: 'Rindfleisch Minuten braten.' }] }).violations.some((v) => v.code === 'STEP_TEXT_INVALID'));
assert.ok(invalidWith({ ingredients: [{ id: 'x', name: 'Unbekannt', amount: 150, unit: 'g', role: 'main_protein' }] }).violations.some((v) => v.code === 'INGREDIENT_NOT_RESOLVED'));
assert.ok(quality.validateHardConstraints(recipe(), { ingredientDatabase: db, userRequest: { vegetarian: true } }).violations.some((v) => v.code === 'DIET_VIOLATION'));

assert.strictEqual(quality.checkFeasibility({ kcal: 250 }, 'main_meat', 'Rindfleisch').adjusted, true);
assert.strictEqual(quality.checkFeasibility({ kcal: 500 }, 'main_meat', 'Rindfleisch').adjusted, false);

async function integration() {
  const outputs = [
    '```json\\nnot json\\n```',
    { title: 'bad', dishCategory: 'main_meat', servings: 1, ingredients: [{ id: 'beef', name: 'Rindfleisch', amount: 20, unit: 'g', role: 'main_protein' }], steps: [{ order: 1, ingredientIds: ['beef'], action: 'fry', durationMin: 2, text: 'Rindfleisch braten.' }] },
    recipe(),
  ];
  const requests = [];
  const result = await quality.generateAiRecipe({
    model: 'test',
    context: { dishCategory: 'main_meat', mainIngredient: 'Rindfleisch', targets: { kcal: 500 }, ingredientDatabase: db, allowedIngredients: db, userRequest: {} },
    callGroq: async (request) => {
      requests.push(request);
      return { data: outputs.shift() };
    },
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.attempts, 3);
  assert.strictEqual(result.nutrition.kcal, 395.5);
  assert.ok(JSON.stringify(requests[2].messages).includes('MAIN_PROTEIN_MIN'));

  let calls = 0;
  const fallback = await quality.generateAiRecipe({
    model: 'test',
    context: { dishCategory: 'main_meat', mainIngredient: 'Rindfleisch', ingredientDatabase: db },
    callGroq: async () => { calls += 1; return { data: '{} trailing' }; },
  });
  assert.strictEqual(fallback.error, 'ai_recipe_unavailable');
  assert.strictEqual(calls, 3);
  console.log('test-ai-recipe-quality: ALL OK');
}

integration().catch((error) => { console.error(error); process.exit(1); });
