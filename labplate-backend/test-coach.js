/**
 * Live-Test fuer Coach-Logik (/coach/logic.js + /api/coach/*).
 *
 *   PORT=3003 node test-coach.js
 */

'use strict';

const BASE = 'http://127.0.0.1:' + (process.env.PORT || 3000);

async function postJson(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (_) {}
  return { ok: res.ok, status: res.status, data, text: text.slice(0, 300) };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async () => {
  console.log('Coach Live-Test gegen ' + BASE + '\n');

  // Offline: normalizeRecipeInput + analyzeRecipe ohne USDA-Netz (Makros bereits gesetzt)
  const coach = require('./coach/logic');
  const sampleRecipe = {
    source: 'spoonacular',
    title: 'Lachs mit Quinoa und Brokkoli',
    servings: 2,
    ingredients: [
      {
        name: 'Atlantic salmon',
        amount: 200,
        unit: 'g',
        caloriesPer100g: 208,
        macrosPer100g: { protein: 20, fat: 13, netCarbs: 0, fiber: 0 },
      },
      {
        name: 'Quinoa, cooked',
        amount: 300,
        unit: 'g',
        caloriesPer100g: 120,
        macrosPer100g: { protein: 4.4, fat: 1.9, netCarbs: 18.5, fiber: 2.8 },
      },
      {
        name: 'Broccoli, raw',
        amount: 200,
        unit: 'g',
        caloriesPer100g: 34,
        macrosPer100g: { protein: 2.8, fat: 0.4, netCarbs: 4.0, fiber: 2.6 },
      },
      {
        name: 'Olive oil',
        amount: 10,
        unit: 'ml',
        caloriesPer100g: 884,
        macrosPer100g: { protein: 0, fat: 100, netCarbs: 0, fiber: 0 },
      },
    ],
    steps: ['Quinoa kochen', 'Brokkoli dämpfen', 'Lachs braten', 'Anrichten'],
  };

  const local = await coach.analyzeRecipe(sampleRecipe, { enrichUsda: false });
  assert(!local.error, 'analyzeRecipe lokal fehlgeschlagen: ' + (local.error || ''));
  assert(local.data.perServing.calories > 0, 'perServing.calories erwartet');
  assert(local.data.healthScore >= 0 && local.data.healthScore <= 100, 'healthScore 0–100');
  console.log('OK  analyzeRecipe (lokal) → "' + local.data.recipe.title + '"');
  console.log('    kcal/Portion=' + local.data.perServing.calories +
    ' P/F/KH/B=' + [local.data.perServing.protein, local.data.perServing.fat, local.data.perServing.netCarbs, local.data.perServing.fiber].join('/') +
    ' HealthScore=' + local.data.healthScore);

  const planLocal = coach.generateDailyPlan({
    calories: 2200,
    protein: 140,
    fat: 70,
    carbs: 220,
  });
  assert(!planLocal.error && planLocal.data.meals.length === 4, 'daily plan 4 Mahlzeiten');
  console.log('OK  generateDailyPlan → ' + planLocal.data.meals.map((m) => m.label + ' ' + m.targets.calories + 'kcal').join(' · '));

  // HTTP-Endpunkte
  const analyzed = await postJson('/api/coach/analyze-recipe', {
    enrichUsda: false,
    recipe: sampleRecipe,
  });
  assert(analyzed.ok, 'analyze-recipe HTTP ' + analyzed.status + ' ' + analyzed.text);
  assert(analyzed.data.healthScore != null, 'HTTP healthScore fehlt');
  console.log('OK  POST /api/coach/analyze-recipe → HealthScore=' + analyzed.data.healthScore +
    ' kcal/Portion=' + analyzed.data.perServing.calories);

  const ings = await postJson('/api/coach/analyze-ingredients', {
    ingredients: [
      {
        name: 'Bananas, raw',
        fdcId: 173944,
        amount: 120,
        unit: 'g',
        calories: 89,
        macrosPer100g: { protein: 1.1, fat: 0.3, netCarbs: 20.2, fiber: 2.6 },
        per100g: { calories: 89, protein: 1.1, fat: 0.3, netCarbs: 20.2, fiber: 2.6, vitaminC: 8.7, potassium: 358 },
      },
    ],
  });
  assert(ings.ok && ings.data.totals.calories > 0, 'analyze-ingredients fehlgeschlagen');
  console.log('OK  POST /api/coach/analyze-ingredients → totals.kcal=' + ings.data.totals.calories);

  const plan = await postJson('/api/coach/daily-plan', {
    calories: 2200,
    protein: 140,
    fat: 70,
    carbs: 220,
  });
  assert(plan.ok && plan.data.meals && plan.data.meals[0].targets.calories > 0, 'daily-plan fehlgeschlagen');
  console.log('OK  POST /api/coach/daily-plan → Frühstück ' + plan.data.meals[0].targets.calories + ' kcal');

  const alts = await postJson('/api/coach/alternatives', {
    ingredient: 'butter',
    enrichUsda: false,
  });
  assert(alts.ok && alts.data.suggestions.length > 0, 'alternatives fehlgeschlagen');
  console.log('OK  POST /api/coach/alternatives → ' + alts.data.suggestions.map((s) => s.name).join(', '));

  console.log('\nAlle Coach-Tests bestanden.');
})().catch((err) => {
  console.error('\nFEHLER:', err && err.message ? err.message : err);
  process.exit(1);
});
