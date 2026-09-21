'use strict';
/**
 * Culinary usability – Market-Drive Gates (Tests A–F)
 */
const assert = require('assert');
const culinary = require('./culinary-usability');
const validator = require('./recipe-validator');
const qualityGate = require('./recipe-quality-gate');

function baseNutrition() {
  return { kcal: 350, protein_g: 28, fat_g: 18, netto_kh_g: 12, ballaststoffe_g: 3 };
}

/** Live-Blamage: Kokosjoghurt + Ei, generische Steps, 8 ml Wasser */
const liveShame = {
  title: 'Proteinreicher Snack mit Kokosjoghurt und Ei',
  servings: 1,
  prep_time_min: 10,
  nutrition: baseNutrition(),
  ingredients: [
    { id: '0001', name: 'Kokosjoghurt (laktosefrei)', amount: 150, unit: 'g', protein_source: false, netCarbs: 6, fat: 12, protein: 2, fiber: 0 },
    { id: '0002', name: 'Eier (Größe M, ca. 60 g je)', amount: 3, unit: 'stk', protein_source: true, netCarbs: 1, fat: 10, protein: 13, fiber: 0 },
    { id: '0003', name: 'Haferflocken', amount: 30, unit: 'g', protein_source: false, netCarbs: 55, fat: 7, protein: 13, fiber: 10 },
    { id: '0004', name: 'Wasser', amount: 8, unit: 'ml', protein_source: false, netCarbs: 0, fat: 0, protein: 0, fiber: 0 },
  ],
  steps: [
    { title: 'Wasser', content: 'Wasser bereitstellen.', stove_level: 0, time_min: 1 },
    { title: 'Hafer', content: 'Haferflocken einrühren.', stove_level: 0, time_min: 1 },
    { title: 'Mix', content: 'Die Zutaten gründlich vermengen.', stove_level: 0, time_min: 1 },
    { title: 'Joghurt', content: 'Joghurt unterheben.', stove_level: 0, time_min: 1 },
    { title: 'Serve', content: 'Anrichten und sofort servieren.', stove_level: 0, time_min: 1 },
  ],
  garnish: '',
  chef_analysis: '{0002} liefern Protein.',
  diet_labels: [],
};

// ---- Live-Beispiel muss blocked sein ----
const shameCu = culinary.evaluateCulinaryUsability(liveShame);
assert.strictEqual(shameCu.qualityStatus, 'blocked', 'Live-Beispiel qualityStatus: ' + shameCu.qualityStatus);
assert.ok(shameCu.errors.some(function (e) { return /Eier sind nicht/i.test(e); }),
  'Eier-Fehler: ' + shameCu.errors.join('; '));
assert.ok(shameCu.errors.some(function (e) { return /Generische Zubereitung|Rezeptart|Flüssigkeitsmenge/i.test(e); }),
  'weitere Fehler: ' + shameCu.errors.join('; '));
const shameV2 = validator.validateRecipeV2(JSON.parse(JSON.stringify(liveShame)));
assert.strictEqual(shameV2.ok, false, 'validateRecipeV2 muss failen');
const shameQ = qualityGate.evaluateRecipeQuality(JSON.parse(JSON.stringify(liveShame)));
assert.strictEqual(shameQ.qualityStatus, 'blocked', 'quality gate blocked: ' + shameQ.qualityStatus);
console.log('OK Live-Blamage blocked:', shameCu.errors.slice(0, 4).join(' | '));

// ---- Test A: Unverwendete Hauptzutat (Ei) ----
const testA = {
  title: 'Warmer Haferflocken-Ei-Snack mit Kokosjoghurt',
  servings: 1,
  prep_time_min: 15,
  nutrition: baseNutrition(),
  dishPlan: {
    dishType: 'protein_porridge',
    texture: 'soft',
    servingMode: 'warm',
    cookingMethod: 'boil',
    requiredActions: ['boil_water', 'cook_oats', 'whisk_eggs', 'fold_yogurt', 'serve'],
  },
  ingredients: liveShame.ingredients.slice(),
  steps: [
    { title: 'Kochen', content: '{0004} erhitzen, {0003} einrühren und weich kochen.', stove_level: 4, time_min: 5 },
    { title: 'Joghurt', content: '{0001} unterheben.', stove_level: 0, time_min: 1 },
    { title: 'Serve', content: 'Anrichten und servieren.', stove_level: 0, time_min: 1 },
  ],
  garnish: '',
  chef_analysis: 'Brei mit {0001}.',
  diet_labels: [],
};
const a = culinary.evaluateCulinaryUsability(testA);
assert.strictEqual(a.qualityStatus, 'blocked', 'A blocked');
assert.ok(a.errors.some(function (e) { return /Eier sind nicht/i.test(e); }), 'A Eier: ' + a.errors.join('; '));
console.log('OK Test A unused egg → blocked');

// ---- Test B: Generische Zubereitung ----
const testB = {
  title: 'Protein-Pancakes mit Kokosjoghurt',
  servings: 1,
  prep_time_min: 10,
  nutrition: baseNutrition(),
  dishPlan: {
    dishType: 'oat_egg_pancake',
    texture: 'soft',
    servingMode: 'warm',
    cookingMethod: 'pan',
    requiredActions: ['whisk_eggs', 'mix_oats', 'cook_pan', 'serve'],
  },
  ingredients: liveShame.ingredients.slice(),
  steps: [
    { title: 'Mix', content: 'Die Zutaten gründlich vermengen.', stove_level: 0, time_min: 2 },
    { title: 'Serve', content: 'Anrichten und sofort servieren.', stove_level: 0, time_min: 1 },
  ],
  garnish: '',
  chef_analysis: 'Snack.',
  diet_labels: [],
};
const b = culinary.evaluateCulinaryUsability(testB);
assert.strictEqual(b.qualityStatus, 'blocked', 'B blocked');
assert.ok(b.errors.some(function (e) { return /Generische Zubereitung/i.test(e); }), 'B generic: ' + b.errors.join('; '));
console.log('OK Test B generic steps → blocked');

// ---- Test C: Unplausible Flüssigkeit ----
const testC = {
  title: 'Warmer Haferbrei mit Kokosjoghurt',
  servings: 1,
  prep_time_min: 12,
  nutrition: baseNutrition(),
  dishPlan: {
    dishType: 'protein_porridge',
    texture: 'soft',
    servingMode: 'warm',
    cookingMethod: 'boil',
    requiredActions: ['boil_water', 'cook_oats', 'fold_yogurt', 'serve'],
  },
  ingredients: [
    { id: '0001', name: 'Kokosjoghurt', amount: 80, unit: 'g', protein_source: false, netCarbs: 6, fat: 12, protein: 2, fiber: 0 },
    { id: '0003', name: 'Haferflocken', amount: 30, unit: 'g', protein_source: false, netCarbs: 55, fat: 7, protein: 13, fiber: 10 },
    { id: '0004', name: 'Wasser', amount: 8, unit: 'ml', protein_source: false, netCarbs: 0, fat: 0, protein: 0, fiber: 0 },
  ],
  steps: [
    { title: 'Kochen', content: '{0004} erhitzen, {0003} einrühren und weich kochen.', stove_level: 4, time_min: 6 },
    { title: 'Joghurt', content: '{0001} unterheben.', stove_level: 0, time_min: 1 },
  ],
  garnish: '',
  chef_analysis: 'Porridge.',
  diet_labels: [],
};
const c = culinary.validateOatsLiquidRatio(testC);
assert.ok(c.errors.length || c.warnings.length, 'C liquid issue: ' + JSON.stringify(c));
console.log('OK Test C oats/water ratio →', c.errors[0] || c.warnings[0]);

// ---- Test D: Gültige Pancakes ----
const testD = {
  title: 'Protein-Pancakes mit Kokosjoghurt',
  servings: 1,
  prep_time_min: 20,
  nutrition: { kcal: 420, protein_g: 32, fat_g: 22, netto_kh_g: 18, ballaststoffe_g: 4 },
  dishPlan: {
    dishType: 'oat_egg_pancake',
    texture: 'soft',
    servingMode: 'warm',
    cookingMethod: 'pan',
    requiredActions: ['whisk_eggs', 'mix_oats', 'cook_pan', 'fold_yogurt', 'serve'],
  },
  ingredients: [
    { id: '0001', name: 'Kokosjoghurt (laktosefrei)', amount: 80, unit: 'g', protein_source: false, netCarbs: 6, fat: 12, protein: 2, fiber: 0 },
    { id: '0002', name: 'Eier (Größe M, ca. 60 g je)', amount: 2, unit: 'stk', protein_source: true, netCarbs: 1, fat: 10, protein: 13, fiber: 0 },
    { id: '0003', name: 'Haferflocken', amount: 40, unit: 'g', protein_source: false, netCarbs: 55, fat: 7, protein: 13, fiber: 10 },
    { id: '0004', name: 'Wasser', amount: 40, unit: 'ml', protein_source: false, netCarbs: 0, fat: 0, protein: 0, fiber: 0 },
  ],
  steps: [
    { title: 'Verquirlen', content: '{0002} in einer Schüssel verquirlen.', stove_level: 0, time_min: 2 },
    { title: 'Teig', content: '{0003} und {0004} einrühren und kurz quellen lassen.', stove_level: 0, time_min: 3 },
    { title: 'Backen', content: 'Die Masse portionsweise in einer beschichteten Pfanne ausbacken.', stove_level: 5, time_min: 8 },
    { title: 'Servieren', content: '{0001} dazu servieren.', stove_level: 0, time_min: 1 },
  ],
  garnish: '',
  chef_analysis: '{0002} und {0003} ergeben fluffige Pancakes.',
  diet_labels: [],
};
const d = culinary.evaluateCulinaryUsability(testD);
assert.ok(d.qualityStatus === 'ready' || d.qualityStatus === 'review',
  'D status: ' + d.qualityStatus + ' ' + d.errors.join('; '));
assert.strictEqual(d.errors.length, 0, 'D errors: ' + d.errors.join('; '));
const dV2 = validator.validateRecipeV2(JSON.parse(JSON.stringify(testD)));
assert.ok(dV2.ok, 'D validateRecipeV2: ' + dV2.errors.join('; '));
console.log('OK Test D valid pancakes →', d.qualityStatus);

// ---- Test E: Gültiger warmer Haferbrei ----
const testE = {
  title: 'Warmer Haferflocken-Ei-Brei mit Kokosjoghurt',
  servings: 1,
  prep_time_min: 15,
  nutrition: { kcal: 400, protein_g: 30, fat_g: 20, netto_kh_g: 16, ballaststoffe_g: 4 },
  dishPlan: {
    dishType: 'protein_porridge',
    texture: 'soft',
    servingMode: 'warm',
    cookingMethod: 'boil',
    requiredActions: ['heat_water', 'cook_oats', 'whisk_eggs', 'fold_yogurt', 'serve'],
  },
  ingredients: [
    { id: '0001', name: 'Kokosjoghurt (laktosefrei)', amount: 80, unit: 'g', protein_source: false, netCarbs: 6, fat: 12, protein: 2, fiber: 0 },
    { id: '0002', name: 'Eier (Größe M, ca. 60 g je)', amount: 2, unit: 'stk', protein_source: true, netCarbs: 1, fat: 10, protein: 13, fiber: 0 },
    { id: '0003', name: 'Haferflocken', amount: 35, unit: 'g', protein_source: false, netCarbs: 55, fat: 7, protein: 13, fiber: 10 },
    { id: '0004', name: 'Wasser', amount: 120, unit: 'ml', protein_source: false, netCarbs: 0, fat: 0, protein: 0, fiber: 0 },
  ],
  steps: [
    { title: 'Wasser', content: '{0004} erhitzen.', stove_level: 6, time_min: 2 },
    { title: 'Hafer', content: '{0003} einrühren und weich kochen.', stove_level: 4, time_min: 5 },
    { title: 'Ei', content: '{0002} verquirlen und unter ständigem Rühren vorsichtig einarbeiten, stocken lassen.', stove_level: 3, time_min: 3 },
    { title: 'Joghurt', content: 'Herd aus. {0001} unterheben.', stove_level: 0, time_min: 1 },
  ],
  garnish: '',
  chef_analysis: 'Warmer Brei mit {0002} und {0001}.',
  diet_labels: [],
};
const e = culinary.evaluateCulinaryUsability(testE);
assert.ok(e.qualityStatus === 'ready' || e.qualityStatus === 'review',
  'E status: ' + e.qualityStatus + ' ' + e.errors.join('; '));
assert.strictEqual(e.errors.length, 0, 'E errors: ' + e.errors.join('; '));
console.log('OK Test E valid porridge →', e.qualityStatus);

// ---- Test F: Keine Rohdatenanzeige ----
const dumpStep = {
  title: 'Mix',
  content: 'Kokosjoghurt 3 Eier Haferflocken Wasser',
  stove_level: 0,
  time_min: 1,
};
assert.ok(
  /Kokosjoghurt\s+3\s+Eier\s+Haferflocken\s+Wasser/i.test(dumpStep.content),
  'F fixture'
);
// Quality gate / canonical should block bare dumps — mirror culinary: no concrete technique
const testF = Object.assign({}, testD, {
  steps: [dumpStep, { title: 'Serve', content: 'Anrichten und sofort servieren.', stove_level: 0, time_min: 1 }],
});
const f = culinary.evaluateCulinaryUsability(testF);
assert.strictEqual(f.qualityStatus, 'blocked', 'F dump blocked: ' + f.errors.join('; '));
console.log('OK Test F ingredient dump → blocked');

console.log('\nAll culinary-usability market-drive tests A–F passed.');
