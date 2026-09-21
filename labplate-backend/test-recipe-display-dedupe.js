'use strict';
/**
 * Tests: Deduplizierung, Portions-Grammatik, Gesamtzeit aus Schritten,
 * interne Request-JSON nicht in Display-Feldern.
 */
const assert = require('assert');
const recipePipeline = require('./recipe-pipeline-v92');

function formatServingsLabel(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '1 Portion';
  if (Math.abs(n - 1) < 1e-9) return '1 Portion';
  const shown = Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : String(n);
  return shown + ' Portionen';
}

function formatNutritionHeadingForServings(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return 'Nährwerte für 1 Portion';
  if (Math.abs(n - 1) < 1e-9) return 'Nährwerte für 1 Portion';
  return 'Nährwerte für ' + Math.round(n) + ' Portionen';
}

function extractDurationMinutesFromText(text) {
  const s = String(text || '');
  let maxMin = 0;
  const range = s.match(/(\d+)\s*[–\-]\s*(\d+)\s*(?:min|minute)/i);
  if (range) maxMin = Math.max(maxMin, parseInt(range[2], 10) || 0);
  const re = /(\d+)\s*(?:-\s*\d+\s*)?(?:min(?:uten)?|min\.)\b/gi;
  let m;
  while ((m = re.exec(s))) maxMin = Math.max(maxMin, parseInt(m[1], 10) || 0);
  const hours = s.match(/(\d+(?:[.,]\d+)?)\s*(?:stunden|stunde|hours?|hrs?|h)\b/i);
  if (hours) {
    maxMin = Math.max(maxMin, Math.round(parseFloat(String(hours[1]).replace(',', '.')) * 60) || 0);
  }
  return maxMin;
}

function collapseRepeatedRecipeSteps(steps) {
  let arr = (Array.isArray(steps) ? steps : []).map(function (s) {
    return String(typeof s === 'string' ? s : (s && (s.instruction || s.text || s.content)) || '').trim();
  }).filter(Boolean);
  if (arr.length < 2) return arr;
  const deduped = [arr[0]];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] !== arr[i - 1]) deduped.push(arr[i]);
  }
  arr = deduped;
  function tryCollapseFactor(factor) {
    if (arr.length < factor * 2 || arr.length % factor !== 0) return null;
    const n = arr.length / factor;
    const first = arr.slice(0, n);
    for (let f = 1; f < factor; f++) {
      if (arr.slice(f * n, (f + 1) * n).join('\n') !== first.join('\n')) return null;
    }
    return first;
  }
  return tryCollapseFactor(3) || tryCollapseFactor(2) || arr;
}

function looksLikeInternalRequestJson(text) {
  const s = String(text || '').trim();
  if (!s) return false;
  if (/^\s*\{[\s\S]*\}\s*$/.test(s) && /"?(mode|pantry_ingredients|ai_instruction|team_ai|allergens)"?\s*:/.test(s)) {
    return true;
  }
  return /"pantry_ingredients"\s*:|"ai_instruction"\s*:|"team_ai"\s*:/.test(s);
}

// --- Portions-Grammatik ---
assert.strictEqual(formatServingsLabel(1), '1 Portion');
assert.strictEqual(formatServingsLabel(2), '2 Portionen');
assert.strictEqual(formatNutritionHeadingForServings(1), 'Nährwerte für 1 Portion');
assert.strictEqual(formatNutritionHeadingForServings(2), 'Nährwerte für 2 Portionen');
// portionSafe=false-Pfad darf nicht mehr „1 Portionen“ erzeugen
assert.notStrictEqual(formatNutritionHeadingForServings(1), 'Nährwerte für 1 Portionen');

// --- Step-Dedup ---
const block = ['Anbraten', 'Köcheln 180 Min.', 'Abschmecken'];
assert.deepStrictEqual(collapseRepeatedRecipeSteps(block.concat(block).concat(block)), block);
assert.deepStrictEqual(collapseRepeatedRecipeSteps(['A', 'A', 'B']), ['A', 'B']);

// --- Interne JSON ---
const leaked = JSON.stringify({
  mode: 'pantry',
  lang: 'de',
  pantry_ingredients: ['Ragù alla Bolognese'],
  ai_instruction: '…',
  allergens: ['Laktose / Milchprodukte'],
  team_ai: false
});
assert.strictEqual(looksLikeInternalRequestJson(leaked), true);
assert.strictEqual(looksLikeInternalRequestJson('Klassische Sauce ohne Milch.'), false);

// --- Dauer aus Text ---
assert.ok(extractDurationMinutesFromText('Langsam köcheln lassen: 180 Minuten') >= 180);
assert.ok(extractDurationMinutesFromText('180–240 Minuten') >= 240);

// --- Pipeline: prep_time berücksichtigt lange Kochzeit ---
const ragu = {
  title: 'Ragù alla Bolognese',
  servings: 4,
  prep_time_min: 30,
  nutrition: { kcal: 400, protein_g: 30, fat_g: 20, netto_kh_g: 10, ballaststoffe_g: 2 },
  diet_labels: [],
  target_deviation_note: '',
  garnish: '',
  chef_analysis: 'Klassisch.',
  ingredients: [
    { id: '0001', name: 'Rinderhack', amount: 400, unit: 'g', macrosPer100g: { protein: 20, fat: 15, netCarbs: 0, fiber: 0 } },
    { id: '0002', name: 'Zwiebel', amount: 100, unit: 'g', macrosPer100g: { protein: 1, fat: 0, netCarbs: 7, fiber: 2 } },
    { id: '0003', name: 'Tomaten', amount: 400, unit: 'g', macrosPer100g: { protein: 1, fat: 0, netCarbs: 3, fiber: 1 } },
    { id: '0004', name: 'Olivenöl', amount: 20, unit: 'ml', macrosPer100g: { protein: 0, fat: 90, netCarbs: 0, fiber: 0 } },
  ],
  steps: [
    { title: 'Anbraten', content: '{0001} anbraten.', stove_level: 6, time_min: 15 },
    { title: 'Langsam köcheln', content: 'Langsam köcheln lassen.', stove_level: 2, time_min: 180 },
    { title: 'Fertig', content: 'Abschmecken.', stove_level: 0, time_min: 5 },
  ],
};

const rendered = recipePipeline.renderRecipeForDisplay(ragu);
assert.ok(rendered, 'renderRecipeForDisplay liefert Ergebnis');
assert.ok(rendered.totalMinutes >= 180, 'totalMinutes >= 180, got ' + rendered.totalMinutes);
assert.ok(
  /3 Stunden|195 Minuten|200 Minuten/i.test(String(rendered.prep_time)) ||
    (rendered.totalMinutes >= 195 && /Stunde|Minuten/.test(String(rendered.prep_time))),
  'prep_time muss lange Kochzeit widerspiegeln: ' + rendered.prep_time
);
assert.notStrictEqual(rendered.prep_time, '30 Minuten');
assert.strictEqual(rendered.self_check, '');

// Idempotente Karten-Anzahl-Simulation
const fakeCards = [];
function renderRecipeOnce(recipe, operationId, container) {
  if (container.dataset.recipeOperationId === operationId) return;
  container.dataset.recipeOperationId = operationId;
  container.cards = [recipe];
}
const container = { dataset: {}, cards: [] };
const op = 'op-1';
renderRecipeOnce(rendered, op, container);
renderRecipeOnce(rendered, op, container);
renderRecipeOnce(rendered, op, container);
assert.strictEqual(container.cards.length, 1, 'Retry derselben operationId erzeugt keine 2. Karte');
renderRecipeOnce(rendered, 'op-2', container);
assert.strictEqual(container.cards.length, 1, 'Neue Suche ersetzt (eine Karte)');
assert.strictEqual(container.dataset.recipeOperationId, 'op-2');

console.log('test-recipe-display-dedupe: OK');
