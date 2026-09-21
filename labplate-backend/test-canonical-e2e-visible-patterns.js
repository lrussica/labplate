'use strict';
/**
 * E2E-ähnlicher Sichtbarkeitstest ohne Browser:
 * Pipeline → Quality Gate → Canonical Display → sichtbarer Klartext.
 * Prüft dieselben verbotenen Muster wie ein Playwright DOM-innerText-Test.
 */
const assert = require('assert');
const canon = require('./recipe-canonical-display');
const pipeline = require('./recipe-pipeline-v92');

function simulateVisibleCard(recipe) {
  const display = canon.toCanonicalDisplayRecipe(recipe);
  const text = canon.buildCanonicalVisibleText(display);
  return { display, text, cardCount: 1 };
}

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
  /\bStufe\s+\d+\s+von\s+9\b/i,
];

(function e2eRaguVisible() {
  const raw = {
    title: 'Ragù alla Bolognese',
    servings: 1,
    prep_time_min: 150,
    nutrition: { kcal: 400, protein_g: 30, fat_g: 20, netto_kh_g: 10, ballaststoffe_g: 2 },
    ingredients: [
      { id: '0001', name: 'Olivenöl', amount: 10, unit: 'ml', protein_source: false, netCarbs: 0, fat: 100, protein: 0, fiber: 0 },
      { id: '0002', name: 'Zwiebel', amount: 35, unit: 'g', protein_source: false, netCarbs: 7, fat: 0.1, protein: 1, fiber: 1.5 },
      { id: '0003', name: 'Karotte', amount: 25, unit: 'g', protein_source: false, netCarbs: 7, fat: 0.2, protein: 1, fiber: 2 },
      { id: '0004', name: 'Sellerie', amount: 15, unit: 'g', protein_source: false, netCarbs: 1, fat: 0.2, protein: 0.7, fiber: 1.5 },
      { id: '0005', name: 'Rinderhackfleisch', amount: 135, unit: 'g', protein_source: true, netCarbs: 0, fat: 15, protein: 20, fiber: 0 },
      { id: '0006', name: 'Passierte Tomaten', amount: 83, unit: 'ml', protein_source: false, netCarbs: 3.5, fat: 0.2, protein: 1, fiber: 1 },
      { id: '0007', name: 'Tomatenmark', amount: 5, unit: 'g', protein_source: false, netCarbs: 10, fat: 0, protein: 3, fiber: 1 },
    ],
    steps: [
      { title: 'Anschwitzen', content: '{0001} {0002} {0003} {0004}', stove_level: 5, time_min: 5 },
      { title: 'Fleisch anbraten', content: '{0005}', stove_level: 6, time_min: 10 },
      { title: 'Tomaten hinzufügen', content: '{0006} {0007}', stove_level: 3, time_min: 2 },
      { title: 'Langsam köcheln lassen und garnieren', content: '{0005}', stove_level: 2, time_min: 180 },
    ],
    garnish: '{0005}',
    chef_analysis: 'ok',
    diet_labels: [],
    target_deviation_note: '',
  };

  const rendered = pipeline.renderRecipeForDisplay(raw, {
    noHerbs: true,
    isOriginalBolognese: true,
    allergens: ['Laktose'],
    dairyFreeAdaptation: true,
  });
  rendered.finalIngredients = rendered.ingredients;
  rendered.finalNutrition = rendered.finalNutrition || rendered.nutrition;

  // Simuliere auch Legacy-Strings, falls Backend alt antwortet
  const withLegacy = Object.assign({}, rendered, {
    steps: (rendered.steps || []).concat([
      'Anschwitzen: Stufe 5 von 9. ca. 5 Min. Olivenöl Zwiebel Karotte Sellerie',
    ]),
  });

  const { display, text, cardCount } = simulateVisibleCard(withLegacy);
  assert.strictEqual(cardCount, 1);

  FORBIDDEN.forEach(function (re) {
    assert.ok(!re.test(text), 'forbidden visible: ' + re + ' in:\n' + text);
  });

  assert.ok(/Rag[uù]/i.test(text));
  assert.ok(display.steps.length > 0);
  display.steps.forEach(function (s) {
    assert.ok(s.instruction);
    assert.ok(!('title' in s));
    assert.ok(!('ingredientNames' in s));
  });
  assert.ok(display.finalNutrition);
  assert.strictEqual(display.garnish.length, 0);

  // Zeit: Schritt 180 Min → Kopf nicht 30
  if (display.timing && display.timing.totalMinutes) {
    assert.ok(display.timing.totalMinutes >= 180 || /Stunde/i.test(display.timing.label || ''));
  }

  console.log('PASS e2e visible patterns for Ragù');
  console.log('cardCount=1 steps=' + display.steps.length + ' quality=' + display.qualityStatus);
}());

console.log('All e2e-visible pattern tests passed.');
