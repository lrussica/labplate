'use strict';

const assert = require('assert');
const validator = require('./recipe-validator');

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log('OK', msg);
}

// ---- A: Nüsse + Joghurt keine primären Proteinquellen ----
const snack = [
  { id: '0001', name: 'Soja-Joghurt (griechischer Stil, laktosefrei)', amount: 200, unit: 'g', protein_source: true },
  { id: '0002', name: 'Gemischte Nüsse', amount: 35, unit: 'g', protein_source: true },
];
const a = validator.validateMaxProteinSourcesByKeywords(snack);
ok(a.ok, 'A: ≤2 primary nach Korrektur');
ok(a.found.length === 0, 'A: found leer, got ' + a.found.join(','));
ok(snack[0].culinaryRole === 'base', 'A: Joghurt = base');
ok(snack[1].culinaryRole === 'topping', 'A: Nüsse = topping');
ok(snack[0].countsAsPrimaryProteinSource === false, 'A: Joghurt not primary');
ok(snack[1].countsAsPrimaryProteinSource === false, 'A: Nüsse not primary');

// ---- B: Zwei echte Proteinquellen ----
const two = [
  { name: 'Hähnchenbrustfilet', amount: 150, unit: 'g', protein_source: true },
  { name: 'Erbsen-Protein-Pulver', amount: 20, unit: 'g', protein_source: true },
];
const b = validator.validateMaxProteinSourcesByKeywords(two);
ok(b.ok && b.found.length === 2, 'B: genau 2 primary: ' + b.found.join(', '));
ok(two[0].culinaryRole === 'main_protein', 'B: Hähnchen main');
ok(two[1].culinaryRole === 'protein_supplement', 'B: Pulver supplement');

// ---- C: Drei echte Proteinquellen ----
const three = [
  { name: 'Hähnchenbrustfilet', amount: 120, unit: 'g' },
  { name: 'Erbsen-Protein-Pulver', amount: 15, unit: 'g' },
  { name: 'Tofu natur', amount: 100, unit: 'g' },
];
const c = validator.validateMaxProteinSourcesByKeywords(three);
ok(!c.ok && c.found.length === 3, 'C: 3 primary → fail: ' + c.found.join(', '));

// ---- D: Placeholder Referenz erlaubt ----
const d = validator.validateChefAnalysisPlaceholderMisuse('{0003} bildet die cremige Basis.');
ok(d.ok, 'D: Referenz erlaubt');

// ---- E: Placeholder als Nährwert verboten ----
const e = validator.validateChefAnalysisPlaceholderMisuse('{0003} kcal und {0007} g Protein.');
ok(!e.ok, 'E: Nährwert-Missbrauch fail');
ok(e.problems.some(function (p) { return /0003/.test(p); }), 'E: 0003 genannt');
ok(e.problems.some(function (p) { return /0007/.test(p); }), 'E: 0007 genannt');

// ---- F: Unbekannter Placeholder ----
const fProblems = validator.validatePlaceholdersInText(
  '{9999} verwenden.',
  'chef_analysis',
  { '0001': true }
);
ok(fProblems.some(function (p) { return /unbekannte Zutat.*9999/.test(p); }), 'F: unknown id: ' + fProblems.join('; '));

// ---- G: Optionale / seasoning unreferenziert OK ----
const gRecipe = {
  title: 'Snack',
  servings: 1,
  prep_time_min: 5,
  nutrition: { kcal: 200, protein_g: 15, fat_g: 8, netto_kh_g: 10, ballaststoffe_g: 2 },
  ingredients: [
    { id: '0001', name: 'Soja-Joghurt', amount: 150, unit: 'g', protein_source: false, netCarbs: 4, fat: 2, protein: 6, fiber: 0 },
    { id: '0002', name: 'Mandeln, gehackt', amount: 25, unit: 'g', protein_source: false, netCarbs: 5, fat: 50, protein: 20, fiber: 10 },
    { id: '0003', name: 'Zimt', amount: 0, unit: 'prise', protein_source: false, netCarbs: 0, fat: 0, protein: 0, fiber: 0 },
    { id: '0004', name: 'Optionaler Sirup', amount: 5, unit: 'ml', protein_source: false, optional: true, netCarbs: 80, fat: 0, protein: 0, fiber: 0 },
  ],
  steps: [
    { title: 'Mix', content: '{0001} mit {0002} verrühren.', stove_level: 0, time_min: 5 },
  ],
  garnish: '',
  chef_analysis: '{0001} und {0002} ergeben einen knackig-cremigen Snack.',
  diet_labels: [],
};
const g = validator.validateRecipeV2(gRecipe, { dishQuery: 'Proteinreicher Snack mit Joghurt und Nüssen' });
ok(g.ok, 'G: seasoning/optional unreferenziert OK: ' + g.errors.join('; '));

// ---- H: Nicht referenzierte Hauptzutat ----
const hRecipe = JSON.parse(JSON.stringify(gRecipe));
hRecipe.ingredients.push({
  id: '0005', name: 'Hähnchenbrustfilet', amount: 80, unit: 'g', protein_source: true,
  netCarbs: 0, fat: 2, protein: 30, fiber: 0,
});
const h = validator.validateRecipeV2(hRecipe, { dishQuery: 'Proteinreicher Snack mit Joghurt und Nüssen' });
ok(!h.ok, 'H: unreferenzierte Hauptzutat fail');
ok(h.errors.some(function (err) { return /nie referenziert.*0005|Gerichtskonzept/i.test(err); }),
  'H: Fehler nennt 0005 oder Konzept: ' + h.errors.join('; '));

// ---- I: Produktionsfall Yogurt+Nuts+Chicken würde Primary korrigieren ----
const prodLike = {
  title: 'Proteinreicher Snack mit laktosefreiem Soja-Joghurt und Nüssen',
  servings: 1,
  prep_time_min: 10,
  nutrition: { kcal: 350, protein_g: 28, fat_g: 18, netto_kh_g: 12, ballaststoffe_g: 4 },
  ingredients: [
    { id: '0001', name: 'Soja-Joghurt (griechischer Stil, laktosefrei)', amount: 180, unit: 'g', protein_source: true, netCarbs: 4, fat: 3, protein: 8, fiber: 0 },
    { id: '0002', name: 'Gemischte Nüsse', amount: 30, unit: 'g', protein_source: true, netCarbs: 7, fat: 50, protein: 18, fiber: 7 },
    { id: '0003', name: 'Zimt', amount: 0, unit: 'prise', protein_source: false, netCarbs: 0, fat: 0, protein: 0, fiber: 0 },
  ],
  steps: [
    { title: 'Anrichten', content: '{0001} in eine Schale, {0002} darüber, mit {0003} würzen.', stove_level: 0, time_min: 8 },
  ],
  garnish: '',
  chef_analysis: '{0001} bildet die cremige Basis, {0002} liefert Crunch.',
  diet_labels: [],
};
const i = validator.validateRecipeV2(prodLike, {
  dishQuery: 'Proteinreicher Snack mit griechischem Joghurt und Nüssen',
});
ok(i.ok, 'I: Snack nach Rollen-Korrektur valid: ' + i.errors.join('; '));
ok(prodLike.ingredients[0].protein_source === false, 'I: Joghurt protein_source false');
ok(prodLike.ingredients[1].protein_source === false, 'I: Nüsse protein_source false');

// ---- J: 3 primary mit Pulver+Nüssen+Joghurt — Nüsse/Joghurt droppen → 1 primary OK ----
const withPowder = [
  { name: 'laktosefreier griechischer Soja-Joghurt', amount: 180, unit: 'g', protein_source: true },
  { name: 'Mandeln, gehackt', amount: 30, unit: 'g', protein_source: true },
  { name: 'Erbsen-Protein-Pulver', amount: 15, unit: 'g', protein_source: true },
];
const j = validator.validateMaxProteinSourcesByKeywords(withPowder);
ok(j.ok && j.found.length === 1, 'J: nur Pulver primary: ' + j.found.join(', '));
ok(/protein|pulver/i.test(j.found[0]), 'J: found = Pulver');

console.log('All culinary-protein-role tests passed.');
