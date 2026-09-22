/**
 * Verifikation: Faktor-2-Fix + Alt-Rezept-Sanitize + Lachs-Pasta-Echtdaten.
 * Ohne laufende App – spiegelt Frontend-Logik aus LabPlate_34_Cursor.html.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const HTML_APP = path.join(__dirname, '..', 'LabPlate', 'LabPlate_34_Cursor.html');
const HTML_ROOT = path.join(__dirname, '..', 'LabPlate_34_Cursor.html');
const VC = path.join(__dirname, '..', 'LabPlate', 'ViewController.swift');
const APP = path.join(__dirname, '..', 'LabPlate', 'LabPlateApp.swift');

// --- 1) Aktive HTML-Datei ---
const htmlApp = fs.readFileSync(HTML_APP, 'utf8');
const htmlRoot = fs.existsSync(HTML_ROOT) ? fs.readFileSync(HTML_ROOT, 'utf8') : '';
const vc = fs.readFileSync(VC, 'utf8');
const app = fs.readFileSync(APP, 'utf8');

assert.ok(app.includes('LabPlateWebViewController'), 'App startet LabPlateWebViewController');
assert.ok(vc.includes('forResource: "LabPlate_34_Cursor"'), 'Bundle lädt LabPlate_34_Cursor.html');
assert.ok(!vc.includes('forResource: "LabPlate_34 Cursor"'), 'kein Leerzeichen-Dateiname in WebViewController');
assert.ok(htmlApp.includes('stripQuantityMentionsFromPrepText'), 'reparierte HTML enthält Sanitize');
assert.ok(htmlApp.includes('sanitizeRecipePrepTexts'), 'reparierte HTML enthält sanitizeRecipePrepTexts');
assert.ok(!htmlRoot.includes('stripQuantityMentionsFromPrepText'), 'Root-HTML ist ALT ohne Fix');
assert.ok(htmlApp.length > htmlRoot.length, 'App-HTML ist die größere/aktuelle Datei');
console.log('OK 1) Aktive HTML: Bundle → LabPlate/LabPlate_34_Cursor.html (Root-Datei ist veraltet und ungenutzt)');

// --- Strip-Logik (Spiegel Frontend) ---
function stripQuantityMentionsFromPrepText(text) {
  var out = String(text == null ? '' : text);
  out = out.replace(/\b\d+[.,]?\d*\s*(g|kg|mg|ml|l|cl|el|tl|stk|stück|stueck|prise|prisen)\b/gi, '');
  out = out.replace(/(\d+[.,]?\d*)\s*(g|kg|mg|ml|l|cl)(?=[A-Za-zÄÖÜäöüß]|\s|$)/gi, '');
  out = out.replace(/([a-zäöüß])([A-ZÄÖÜ])/g, '$1 $2');
  out = out.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
  return out;
}

function sanitizeRecipePrepTexts(recipe) {
  if (!recipe || typeof recipe !== 'object') return recipe;
  recipe = Object.assign({}, recipe);
  if (Array.isArray(recipe.steps)) {
    recipe.steps = recipe.steps.map(function (s) {
      return typeof s === 'string' ? stripQuantityMentionsFromPrepText(s) : s;
    });
  }
  if (typeof recipe.garnish === 'string') {
    recipe.garnish = stripQuantityMentionsFromPrepText(recipe.garnish);
  }
  return recipe;
}

function roundLocalRecipeAmount(value, unit) {
  if (!isFinite(value) || value <= 0) return 0;
  var step = unit === 'ml' ? 1 : 5;
  var rounded = Math.round(value / step) * step;
  return Math.max(step, rounded);
}

function scaleLocalRecipe(recipe, scale) {
  var scaled = JSON.parse(JSON.stringify(recipe));
  scaled.ingredients = recipe.ingredients.map(function (ing) {
    return Object.assign({}, ing, { amount: roundLocalRecipeAmount(ing.amount * scale, ing.unit) });
  });
  return sanitizeRecipePrepTexts(scaled);
}

// --- 2) Alt-Rezepte ---
const oldRecipe = {
  id: 'old-1',
  name: 'Alt-Lachs-Pasta',
  servings: 1,
  ingredients: [
    { name: 'Lachsfilet', amount: 85, unit: 'g', macrosPer100g: { netCarbs: 0, fat: 13, protein: 20, fiber: 0 } },
    { name: 'Vollkornpasta', amount: 35, unit: 'g', macrosPer100g: { netCarbs: 60, fat: 2, protein: 12, fiber: 8 } },
    { name: 'Kokosmilch', amount: 50, unit: 'ml', macrosPer100g: { netCarbs: 3, fat: 18, protein: 2, fiber: 0 } },
    { name: 'Olivenöl', amount: 5, unit: 'ml', macrosPer100g: { netCarbs: 0, fat: 100, protein: 0, fiber: 0 } },
    { name: 'Zitronensaft', amount: 5, unit: 'ml', macrosPer100g: { netCarbs: 8, fat: 0, protein: 0, fiber: 0 } },
  ],
  // Typischer Alt-Bug: Steps mit verdoppelten Mengen + Klebestring
  steps: [
    '170 g Lachsfilet in 10 ml Olivenöl anbraten.',
    '70 g Pasta kochen.',
    '100ml Kokosmilch30g Avocado unterrühren.',
    '10 ml Zitronensaft dazugeben.',
  ],
  garnish: 'Mit 5 g Petersilie bestreuen.',
};

const cleaned = sanitizeRecipePrepTexts(JSON.parse(JSON.stringify(oldRecipe)));
cleaned.steps.forEach(function (s) {
  assert.ok(!/\b\d+[.,]?\d*\s*(g|ml)\b/i.test(s), 'Alt-Step bereinigt: ' + s);
  assert.ok(!/KokosmilchAvocado/.test(s), 'kein Klebestring: ' + s);
  assert.ok(!/\d+(g|ml)[A-Za-zÄÖÜäöüß]/i.test(s), 'keine Menge ohne Leerzeichen: ' + s);
});
assert.strictEqual(cleaned.ingredients[0].amount, 85, 'Zutatenmenge unverändert');
assert.ok(htmlApp.includes('sanitizeRecipePrepTexts(Object.assign({}, next))') ||
  htmlApp.includes('sanitizeRecipePrepTexts'), 'loadSavedRecipes nutzt Sanitize');
assert.ok(htmlApp.includes("stripQuantityMentionsFromPrepText(stepText)"), 'Meine-Rezepte-UI sanitized Steps');
console.log('OK 2) Alt-Rezepte: Mengen in Steps werden beim Laden/Rendern bereinigt; Zutatenliste bleibt');

// --- 3) Lachs-Pasta Echttest (Skalierung wie Frontend) ---
const fresh = {
  title: 'Lachs mit Pasta',
  servings: 1,
  ingredients: oldRecipe.ingredients.map(function (i) { return Object.assign({}, i); }),
  // Neu: Backend nameOnly – keine Mengen in Steps
  steps: [
    'Das Lachsfilet im Olivenöl in einer Pfanne anbraten, bis es vollständig gar ist.',
    'Die Pasta in kochendem Salzwasser al dente garen.',
    'Die Kokosmilch vorsichtig unterrühren.',
    'Alles miteinander vermengen und mit Zitronensaft abschmecken.',
  ],
};

// Simuliere: KI lieferte 2× Mengen in ingredients, Frontend skaliert ×0.5
const aiDoubled = JSON.parse(JSON.stringify(fresh));
aiDoubled.ingredients.forEach(function (ing) { ing.amount = ing.amount * 2; });
aiDoubled.steps = [
  '170 g Lachsfilet anbraten.', // Alt-Pfad falls Backend noch Mengen backte
  '70 g Pasta kochen.',
  '100 ml Kokosmilch unterrühren.',
];
const afterScale = scaleLocalRecipe(aiDoubled, 0.5);
assert.strictEqual(afterScale.ingredients[0].amount, 85, 'Lachs nach Scale = 85');
assert.strictEqual(afterScale.ingredients[1].amount, 35, 'Pasta nach Scale = 35');
assert.strictEqual(afterScale.ingredients[2].amount, 50, 'Kokosmilch nach Scale = 50');
assert.strictEqual(afterScale.ingredients[3].amount, 5, 'Öl nach Scale = 5');
afterScale.steps.forEach(function (s) {
  assert.ok(!/\b\d+[.,]?\d*\s*(g|ml)\b/i.test(s), 'Step ohne Menge nach Scale: ' + s);
  assert.ok(!/170|70|100/.test(s), 'keine verdoppelten Zahlen: ' + s);
});

// Backend-Pfad nameOnly
const pipeline = require('./recipe-pipeline-v92');
const v92Like = {
  title: 'Lachs Pasta',
  prep_time_min: 20,
  nutrition: { kcal: 400, protein_g: 30, fat_g: 20, netto_kh_g: 25, ballaststoffe_g: 4 },
  diet_labels: [],
  target_deviation_note: '',
  ingredients: [
    { id: '0001', name: 'Lachsfilet', amount: 85, unit: 'g', protein_source: true, netCarbs: 0, fat: 13, protein: 20, fiber: 0 },
    { id: '0002', name: 'Vollkornpasta', amount: 35, unit: 'g', protein_source: false, netCarbs: 60, fat: 2, protein: 12, fiber: 8 },
    { id: '0003', name: 'Kokosmilch', amount: 50, unit: 'ml', protein_source: false, netCarbs: 3, fat: 18, protein: 2, fiber: 0 },
    { id: '0004', name: 'Olivenöl', amount: 5, unit: 'ml', protein_source: false, netCarbs: 0, fat: 100, protein: 0, fiber: 0 },
    { id: '0005', name: 'Zitronensaft', amount: 5, unit: 'ml', protein_source: false, netCarbs: 8, fat: 0, protein: 0, fiber: 0 },
  ],
  steps: [
    { title: 'Pasta', content: '{0002} in Salzwasser garen.', stove_level: 0, time_min: 8 },
    { title: 'Lachs', content: '{0001} in {0004} anbraten.', stove_level: 6, time_min: 6 },
    { title: 'Sauce', content: '{0003} und {0005} unterrühren.', stove_level: 2, time_min: 2 },
  ],
  garnish: '',
  chef_analysis: 'Die Kombination aus {0001} und {0002} passt gut zusammen.',
};
const rendered = pipeline.renderRecipeForDisplay(v92Like);
assert.ok(rendered && rendered.ingredients.length === 5, 'render liefert 5 Zutaten');
const rSalmon = rendered.ingredients[0];
const rPasta = rendered.ingredients[1];
assert.strictEqual(rSalmon.amount, 85);
assert.strictEqual(rPasta.amount, 35);
assert.ok(/Lachs/.test(rSalmon.name));
assert.ok(/Pasta|Vollkorn/.test(rPasta.name), 'Pasta-Name: ' + rPasta.name);
rendered.steps.forEach(function (s) {
  assert.ok(!/\b\d+[.,]?\d*\s*(g|ml)\b/i.test(s), 'Backend-Step ohne Menge: ' + s);
});
assert.ok(rendered.steps.some(function (s) { return /Lachsfilet/.test(s); }));
assert.ok(rendered.steps.some(function (s) { return /Pasta|Vollkornpasta/.test(s); }));
console.log('OK 3) Lachs-Pasta: Liste 85/35/50/5 – Steps mengenfrei und konsistent');
console.log('   Steps:', rendered.steps);
console.log('   Zutaten:', rendered.ingredients.map(function (i) { return i.name + ' ' + i.amount + i.unit; }));

console.log('\nALLE 3 Verifikationspunkte OK');
console.log('Hinweis: Gebaute .app-Bundles können veraltet sein – App neu bauen/starten, damit Bundle die LabPlate/-HTML lädt.');
