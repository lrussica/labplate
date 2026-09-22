/**
 * Kurzer Live-Test fuer TheMealDB-Integration.
 * Voraussetzung: Server laeuft auf PORT (Standard 3000), .env mit THEMEALDB_API_KEY.
 *
 *   node test-themealdb.js
 */

'use strict';

const BASE = 'http://127.0.0.1:' + (process.env.PORT || 3000);

async function getJson(path) {
  const res = await fetch(BASE + path);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (_) {}
  return { ok: res.ok, status: res.status, data, text: text.slice(0, 200) };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async () => {
  console.log('TheMealDB Live-Test gegen ' + BASE + '\n');

  const health = await getJson('/health');
  assert(health.ok, 'health fehlgeschlagen: ' + health.status);
  assert(health.data.themealdbConfigured === true, 'themealdbConfigured muss true sein');
  console.log('OK  /health themealdbConfigured=' + health.data.themealdbConfigured);

  const random = await getJson('/api/themealdb/random');
  assert(random.ok, 'random fehlgeschlagen: ' + random.status + ' ' + random.text);
  assert(random.data && random.data.title && Array.isArray(random.data.ingredients), 'random: ungültiges Rezeptformat');
  console.log('OK  /api/themealdb/random → "' + random.data.title + '" (' + random.data.ingredients.length + ' Zutaten, ' + random.data.steps.length + ' Schritte)');

  const mealId = String(random.data.id || '52772');
  const meal = await getJson('/api/themealdb/meal/' + encodeURIComponent(mealId));
  assert(meal.ok, 'meal fehlgeschlagen: ' + meal.status + ' ' + meal.text);
  assert(meal.data && meal.data.id === mealId, 'meal: ID stimmt nicht');
  console.log('OK  /api/themealdb/meal/' + mealId + ' → "' + meal.data.title + '"');

  const category = await getJson('/api/themealdb/category/Seafood');
  assert(category.ok, 'category fehlgeschlagen: ' + category.status + ' ' + category.text);
  assert(category.data && Array.isArray(category.data.results) && category.data.results.length > 0, 'category: keine Treffer');
  console.log('OK  /api/themealdb/category/Seafood → ' + category.data.results.length + ' Treffer (z.B. "' + category.data.results[0].title + '")');

  const area = await getJson('/api/themealdb/area/Italian');
  assert(area.ok, 'area fehlgeschlagen: ' + area.status + ' ' + area.text);
  assert(area.data && Array.isArray(area.data.results) && area.data.results.length > 0, 'area: keine Treffer');
  console.log('OK  /api/themealdb/area/Italian → ' + area.data.results.length + ' Treffer (z.B. "' + area.data.results[0].title + '")');

  console.log('\nAlle TheMealDB-Tests bestanden.');
})().catch((err) => {
  console.error('\nFEHLER:', err && err.message ? err.message : err);
  process.exit(1);
});
