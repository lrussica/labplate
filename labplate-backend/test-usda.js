/**
 * Kurzer Live-Test fuer USDA FoodData Central.
 * Voraussetzung: Server laeuft, .env mit USDA_API_KEY.
 *
 *   PORT=3001 node test-usda.js
 */

'use strict';

const BASE = 'http://127.0.0.1:' + (process.env.PORT || 3000);

async function getJson(path) {
  const res = await fetch(BASE + path);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (_) {}
  return { ok: res.ok, status: res.status, data, text: text.slice(0, 240) };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async () => {
  console.log('USDA Live-Test gegen ' + BASE + '\n');

  const health = await getJson('/health');
  assert(health.ok, 'health fehlgeschlagen: ' + health.status);
  assert(health.data.usdaConfigured === true, 'usdaConfigured muss true sein');
  console.log('OK  /health usdaConfigured=' + health.data.usdaConfigured);

  const search = await getJson('/api/usda/search?q=' + encodeURIComponent('banana') + '&pageSize=3');
  assert(search.ok, 'search fehlgeschlagen: ' + search.status + ' ' + search.text);
  assert(search.data && Array.isArray(search.data.results) && search.data.results.length > 0, 'search: keine Treffer');
  const first = search.data.results[0];
  console.log('OK  /api/usda/search?q=banana → ' + search.data.results.length + ' Treffer, first="' + first.name + '" fdcId=' + first.fdcId);

  const detail = await getJson('/api/usda/food/' + encodeURIComponent(String(first.fdcId)));
  assert(detail.ok, 'food detail fehlgeschlagen: ' + detail.status + ' ' + detail.text);
  assert(detail.data && detail.data.macrosPer100g, 'food: macrosPer100g fehlt');
  const m = detail.data.macrosPer100g;
  assert(
    (m.protein > 0 || m.fat > 0 || m.netCarbs > 0 || m.fiber > 0 || detail.data.calories > 0),
    'food: erwartete Naehrwerte > 0 (Foundation/SR Legacy)'
  );
  console.log('OK  /api/usda/food/' + first.fdcId + ' → protein=' + m.protein + ' fat=' + m.fat +
    ' netCarbs=' + m.netCarbs + ' fiber=' + m.fiber + ' kcal=' + detail.data.calories);

  // Offline-Normalize-Check (Modul direkt)
  const usda = require('./api/usda');
  const sample = usda.normalizeNutrition({
    fdcId: 1,
    description: 'Test Food',
    dataType: 'SR Legacy',
    foodNutrients: [
      { nutrient: { id: 1003, number: '203', name: 'Protein', unitName: 'g' }, amount: 10 },
      { nutrient: { id: 1004, number: '204', name: 'Fat', unitName: 'g' }, amount: 5 },
      { nutrient: { id: 1005, number: '205', name: 'Carbs', unitName: 'g' }, amount: 20 },
      { nutrient: { id: 1079, number: '291', name: 'Fiber', unitName: 'g' }, amount: 4 },
      { nutrient: { id: 1008, number: '208', name: 'Energy', unitName: 'kcal' }, amount: 150 },
    ],
  });
  assert(sample && sample.macrosPer100g.netCarbs === 16, 'normalizeNutrition netCarbs erwartet 16');
  assert(sample.macrosPer100g.protein === 10, 'normalizeNutrition protein');
  console.log('OK  normalizeNutrition (offline) netCarbs=16 protein=10');

  console.log('\nAlle USDA-Tests bestanden.');
})().catch((err) => {
  console.error('\nFEHLER:', err && err.message ? err.message : err);
  process.exit(1);
});
