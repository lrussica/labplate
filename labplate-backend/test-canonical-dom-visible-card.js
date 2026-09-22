'use strict';
/**
 * E2E-ähnlicher Test für den sichtbaren Rezeptkarten-Text.
 * Baut denselben sichtbaren Text wie der kanonische Renderer und prüft verbotene Muster.
 * (Kein Playwright im Projekt – prüft buildCanonicalVisibleText + Display-Whitelist.)
 */
const assert = require('assert');
const canonical = require('./recipe-canonical-display');
const displayFixes = require('./recipe-display-fixes');
const portions = require('./recipe-portions');
const gate = require('./recipe-quality-gate');

const FORBIDDEN = [
  /Olivenöl\s+Zwiebel\s+Karotte\s+Sellerie/i,
  /Rinderhackfleisch\s+Schweinehackfleisch/i,
  /Passierte Tomaten\s+Tomatenmark/i,
  /Garnitur:\s*(Rinderhackfleisch|Zwiebel|Karotte|Sellerie)/i,
  /\bself_check\b/i,
  /\bai_instruction\b/i,
  /\bpantry_ingredients\b/i,
  /\brawIngredients\b/i,
  /\bnutritionSource\b/i,
  /\boperationId\b/i,
  /\bStufe\s+\d+\s+von\s+9\b/i,
  /Anschwitzen:\s*Stufe/i,
];

function buildFakeDomCardHtml(display) {
  // Spiegelt die sichtbaren Blöcke von renderNutriRecipeBody (kanonisch)
  const stepsHtml = (display.steps || []).map(function (s) {
    return '<li class="recipe-step"><p class="recipe-step-instruction">' +
      String(s.instruction || '').replace(/</g, '&lt;') + '</p></li>';
  }).join('');
  const ingsHtml = (display.finalIngredients || []).map(function (i) {
    return '<li>' + String(i.displayName || '') + ' ' + (i.amount || '') + ' ' + (i.unit || '') + '</li>';
  }).join('');
  const garnishHtml = (display.garnish && display.garnish.length)
    ? ('<p><strong>Garnitur:</strong> ' + display.garnish.map(function (g) { return g.displayName; }).join(', ') + '</p>')
    : '';
  const n = display.finalNutrition || {};
  return (
    '<div class="nutri-recipe-result" id="nutri-recipe-recipe-overlay" data-recipe-card="1" data-renderer="canonical">' +
      '<h3>' + (display.title || '') + '</h3>' +
      '<p>Zeit: ' + ((display.timing && display.timing.label) || '') + '</p>' +
      '<div>' + (n.kcal || 0) + ' kcal</div>' +
      '<ul class="ingredients-list">' + ingsHtml + '</ul>' +
      '<ol class="nutri-recipe-steps instructions-list">' + stepsHtml + '</ol>' +
      garnishHtml +
    '</div>'
  );
}

function stripTags(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
    .replace(/\n+/g, '\n')
    .trim();
}

// —— Legacy-Rohdaten wie früher im UI sichtbar ——
const legacyRaw = {
  title: 'Ragù alla Bolognese',
  servings: 1,
  sourceServings: 1,
  sourceServingsStatus: 'explicit',
  finalServings: 1,
  finalIngredients: [
    { id: '0001', displayName: 'Olivenöl', name: 'Olivenöl', amount: 10, unit: 'ml' },
    { id: '0002', displayName: 'Zwiebel', name: 'Zwiebel', amount: 35, unit: 'g' },
    { id: '0003', displayName: 'Karotte', name: 'Karotte', amount: 25, unit: 'g' },
    { id: '0004', displayName: 'Sellerie', name: 'Sellerie', amount: 15, unit: 'g' },
    { id: '0005', displayName: 'Rinderhackfleisch', name: 'Rinderhackfleisch', amount: 135, unit: 'g' },
    { id: '0006', displayName: 'Passierte Tomaten', name: 'Passierte Tomaten', amount: 83, unit: 'ml' },
  ],
  ingredients: null, // set below
  finalNutrition: { kcal: 420, protein_g: 28, fat_g: 30, netto_kh_g: 8, ballaststoffe_g: 2 },
  nutritionSource: 'finalIngredients',
  steps: [
    {
      title: 'Anschwitzen',
      content: '{0001} {0002} {0003} {0004}',
      ingredientNames: ['Olivenöl', 'Zwiebel', 'Karotte', 'Sellerie'],
      stove_level: 5,
      time_min: 5,
    },
    {
      title: 'Fleisch anbraten',
      content: '{0005}',
      ingredientNames: ['Rinderhackfleisch'],
      stove_level: 6,
      time_min: 10,
    },
    {
      title: 'Langsam köcheln lassen und garnieren',
      content: '{0005}',
      ingredientNames: ['Rinderhackfleisch'],
      stove_level: 2,
      time_min: 180,
    },
  ],
  garnish: 'Rinderhackfleisch',
  self_check: 'self_check ok',
  nutrition_note: 'ai_instruction dump',
  qualityStatus: 'ready',
};
legacyRaw.ingredients = legacyRaw.finalIngredients.map(function (i) {
  return Object.assign({}, i);
});

let recipe = JSON.parse(JSON.stringify(legacyRaw));
recipe = displayFixes.applyRecipeDisplayFixes(recipe, {});
// Display-Fixes benötigen ingredients; finalIngredients spiegeln
if (!recipe.finalIngredients || !recipe.finalIngredients.length) {
  recipe.finalIngredients = (recipe.ingredients || []).slice();
}
recipe.ingredients = (recipe.finalIngredients || recipe.ingredients || []).slice();
recipe = portions.normalizeRecipeToFinalModel(recipe, { targetServings: 1 });
const q = gate.evaluateRecipeQuality(recipe);
assert.ok(q.qualityStatus === 'ready' || q.qualityStatus === 'review',
  'Quality Gate Status: ' + q.qualityStatus + ' errors=' + JSON.stringify(q.qualityErrors));

const display = canonical.toCanonicalDisplayRecipe(recipe);
assert.ok(display.steps.length >= 2, 'Schritte vorhanden');
display.steps.forEach(function (s) {
  assert.ok(!('title' in s), 'kein step.title im Display');
  assert.ok(!('ingredientNames' in s), 'kein step.ingredientNames im Display');
  assert.ok(!('ingredients' in s), 'kein step.ingredients im Display');
  assert.ok(s.instruction && s.instruction.length > 10, 'instruction Pflicht');
});
assert.ok(!('self_check' in display) || !display.self_check);
assert.ok(!('nutrition_note' in display) || !display.nutrition_note);
assert.strictEqual((display.garnish || []).length, 0, 'falsche Garnitur Rinderhackfleisch entfernt');

const visibleText = canonical.buildCanonicalVisibleText(display);
const cardHtml = buildFakeDomCardHtml(display);
const domText = stripTags(cardHtml);

assert.ok(cardHtml.indexOf('data-recipe-card="1"') >= 0);
assert.ok(cardHtml.indexOf('data-renderer="canonical"') >= 0);
assert.strictEqual((cardHtml.match(/data-recipe-card="1"/g) || []).length, 1, 'genau eine Karte');
assert.ok(cardHtml.indexOf('recipe-step-instruction') >= 0);

[visibleText, domText].forEach(function (text, idx) {
  FORBIDDEN.forEach(function (re) {
    assert.ok(!re.test(text), 'verbotenes Muster in Text#' + idx + ': ' + re + ' → ' + text.slice(0, 200));
  });
});

assert.ok(/Rag[uù]/i.test(domText), 'Titel sichtbar');
assert.ok(/anschwitzen|erhitzen|braten|köcheln/i.test(domText), 'natürliche Instruction sichtbar');

// Expliziter Legacy-String als step.instruction → muss sanitizen oder blocken
const dirty = canonical.toCanonicalDisplayRecipe({
  title: 'Test',
  finalIngredients: legacyRaw.finalIngredients,
  finalNutrition: legacyRaw.finalNutrition,
  steps: [
    'Anschwitzen: Stufe 5 von 9. ca. 5 Min. Olivenöl Zwiebel Karotte Sellerie',
    'Fleisch anbraten: Stufe 6 von 9. ca. 10 Min. Rinderhackfleisch',
  ],
});
const dirtyText = canonical.buildCanonicalVisibleText(dirty);
FORBIDDEN.forEach(function (re) {
  assert.ok(!re.test(dirtyText), 'dirty input cleaned: ' + re);
});
if (dirty._visibleOutput && dirty._visibleOutput.status === 'fail') {
  assert.strictEqual(dirty.qualityStatus, 'blocked');
}

console.log('PASS canonical DOM visible card');
console.log('Sample visible:\n' + domText.split('\n').slice(0, 12).join('\n'));
console.log('\nAll canonical DOM visible-card tests passed.');
