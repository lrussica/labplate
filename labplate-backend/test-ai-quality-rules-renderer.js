'use strict';
const assert = require('assert');
const quality = require('./ai-recipe-quality');
const renderer = require('./recipe-ai-renderer');
const db = [
  { id: 'cream', name: 'Sahne', fiber: 0 }, { id: 'egg', name: 'Ei', fiber: 0 },
  { id: 'veg', name: 'Karotte', fiber: 3 },
];
function base(step, ingredients) {
  return { title: 'Test', dishCategory: 'other', servings: 1,
    ingredients: ingredients || [{ id: 'veg', name: 'Karotte', amount: 300, unit: 'g', role: 'vegetable' }],
    steps: [step] };
}
assert.ok(quality.validateHardConstraints(base({ order: 1, ingredientIds: ['cream'], action: 'boil', durationMin: 2, temperatureC: 90 }, [{ id: 'cream', name: 'Sahne', amount: 50, unit: 'ml', role: 'liquid' }]), { ingredientDatabase: db }).violations.some((v) => v.code === 'DAIRY_HEAT_MAX'));
assert.ok(quality.validateHardConstraints(base({ order: 1, ingredientIds: ['egg'], action: 'simmer', durationMin: 2, temperatureC: 90 }, [{ id: 'egg', name: 'Ei', amount: 2, unit: 'piece', role: 'binder' }]), { ingredientDatabase: db }).violations.some((v) => v.code === 'EGG_HOT_SAUCE_MAX'));
assert.ok(quality.validateHardConstraints(base({ order: 1, ingredientIds: ['cream'], action: 'boil', durationMin: 2, temperatureC: null }, [{ id: 'cream', name: 'Sahne', amount: 50, unit: 'ml', role: 'liquid' }]), { ingredientDatabase: db }).violations.some((v) => v.code === 'DAIRY_HEAT_ACTION'));
assert.ok(quality.validateHardConstraints({ title: 'Bake', dishCategory: 'other', servings: 1, ingredients: [{ id: 'veg', name: 'Karotte', amount: 300, unit: 'g', role: 'vegetable' }], steps: [{ order: 1, ingredientIds: ['veg'], action: 'bake', durationMin: 10, temperatureC: 180 }] }, { ingredientDatabase: db }).violations.some((v) => v.code === 'SEQUENCE_PREHEAT_BEFORE_BAKE'));
assert.ok(renderer.renderRecipe({ servings: 2, title: 'Pasta', ingredients: [{ id: 'x', name: 'Tomate', amount: 100, unit: 'g' }], steps: [{ order: 1, ingredientIds: ['x'], action: 'chop', durationMin: 1, temperatureC: null }] }, { lang: 'it', servings: 4 }).steps[0].label === 'Tagliare');
assert.strictEqual(renderer.renderRecipe({ servings: 2, ingredients: [{ id: 'x', name: 'Tomate', amount: 100, unit: 'g' }], steps: [] }, { lang: 'tr', servings: 4 }).ingredients[0].amount, 200);
const eggText = renderer.renderRecipe({ servings: 1, ingredients: [{ id: 'egg', name: 'Ei', amount: 1, unit: 'piece' }], steps: [{ order: 1, ingredientIds: ['egg'], action: 'whisk', durationMin: null, temperatureC: null }] }, { lang: 'de', servings: 1 }).steps[0].instruction;
assert.ok(eggText.includes('1 Ei') && !eggText.includes('Eier'), eggText);
console.log('test-ai-quality-rules-renderer: ALL OK');
