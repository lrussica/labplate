/**
 * LabPlate – TheMealDB Recipe Provider
 * ====================================
 * Serverseitiger Client. API-Key ausschliesslich aus process.env.THEMEALDB_API_KEY.
 *
 * Basis-URL: https://www.themealdb.com/api/json/v1/{KEY}/...
 * Docs: https://www.themealdb.com/api.php
 */

'use strict';

const HOST = 'https://www.themealdb.com/api/json/v1';
const MAX_INGREDIENTS = 100;
const MAX_STEPS = 50;

function getApiKey() {
  return String(process.env.THEMEALDB_API_KEY || '').trim();
}

function isConfigured() {
  return getApiKey().length > 0;
}

function baseUrl() {
  const key = getApiKey() || '1';
  return HOST + '/' + encodeURIComponent(key);
}

/**
 * GET gegen TheMealDB.
 * @param {string} pathAndQuery z.B. "/lookup.php?i=52772"
 */
async function themealdbGet(pathAndQuery, opts) {
  if (!isConfigured()) return { error: 'server_not_configured' };

  const url = baseUrl() + (pathAndQuery.startsWith('/') ? pathAndQuery : '/' + pathAndQuery);
  const timeoutMs = (opts && opts.timeoutMs) || 20000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      return { error: 'provider_error', status: res.status, body: text.slice(0, 400) };
    }
    if (!res.ok) {
      return {
        error: 'provider_error',
        status: res.status,
        body: typeof data === 'object' && data
          ? JSON.stringify(data).slice(0, 400)
          : String(text).slice(0, 400),
      };
    }
    return { data };
  } catch (err) {
    return {
      error: 'request_failed',
      reason: err && err.name === 'AbortError' ? 'timeout' : (err && err.name ? err.name : 'unknown'),
    };
  } finally {
    clearTimeout(timer);
  }
}

function parseMeasure(measure) {
  const raw = String(measure || '').trim();
  if (!raw) return { amount: 0, unit: 'g', original: '' };

  // z.B. "200g", "4 tbs", "1 large", "½ cup"
  const m = raw.match(/^([\d.,/½¼¾]+)\s*(.*)$/u);
  if (!m) return { amount: 0, unit: 'g', original: raw };

  let amountStr = m[1]
    .replace('½', '0.5')
    .replace('¼', '0.25')
    .replace('¾', '0.75')
    .replace(',', '.');
  if (amountStr.includes('/')) {
    const parts = amountStr.split('/');
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    amountStr = (Number.isFinite(a) && Number.isFinite(b) && b !== 0) ? String(a / b) : amountStr;
  }
  const amount = Number(amountStr);
  const unitRaw = String(m[2] || '').trim().toLowerCase();

  let unit = 'g';
  if (/^(ml|millilitre|milliliter|l|liter|litre|fl\.?\s*oz|cup|tbsp|tbs|tablespoon|tsp|teaspoon|pint)/i.test(unitRaw)) {
    unit = 'ml';
  }

  return {
    amount: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 10) / 10 : 0,
    unit,
    original: raw,
  };
}

function extractIngredients(meal) {
  const ingredients = [];
  for (let i = 1; i <= 20; i++) {
    const name = String(meal['strIngredient' + i] || '').trim();
    if (!name) continue;
    const qty = parseMeasure(meal['strMeasure' + i]);
    ingredients.push({
      name: name.slice(0, 200),
      amount: qty.amount,
      unit: qty.unit === 'ml' ? 'ml' : 'g',
      status: 'benoetigt',
      macrosPer100g: { netCarbs: 0, fat: 0, protein: 0, fiber: 0 },
      original: qty.original ? (qty.original + ' ' + name).trim() : name,
    });
  }
  return ingredients.slice(0, MAX_INGREDIENTS);
}

function extractSteps(meal) {
  const text = String(meal.strInstructions || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (!text) return [];

  // Nummerierte Schritte oder Absätze
  const byNumber = text.split(/\n+/).map((s) => s.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
  if (byNumber.length >= 2) return byNumber.slice(0, MAX_STEPS);

  return text
    .split(/\n{2,}|(?<=\.)\s+(?=[A-ZÄÖÜ])/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_STEPS);
}

/**
 * TheMealDB Meal → LabPlate Client-Rezeptvertrag.
 */
function toLabPlateRecipe(meal) {
  if (!meal || typeof meal !== 'object') return null;
  const ingredients = extractIngredients(meal);
  if (!ingredients.length) return null;

  const steps = extractSteps(meal);
  const shopping = ingredients.map((ing) => {
    if (ing.original) return ing.original;
    if (!(ing.amount > 0)) return ing.name + ' – nicht angegeben';
    return ing.name + ' – ' + ing.amount + ' ' + ing.unit;
  });

  const tags = String(meal.strTags || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const noteParts = [
    meal.strCategory ? String(meal.strCategory) : null,
    meal.strArea ? String(meal.strArea) : null,
  ].concat(tags).filter(Boolean);

  return {
    id: meal.idMeal != null ? String(meal.idMeal) : undefined,
    source: 'themealdb',
    sourceUrl: typeof meal.strSource === 'string' && meal.strSource ? meal.strSource : undefined,
    youtube: typeof meal.strYoutube === 'string' && meal.strYoutube ? meal.strYoutube : undefined,
    image: typeof meal.strMealThumb === 'string' ? meal.strMealThumb : undefined,
    category: typeof meal.strCategory === 'string' ? meal.strCategory : undefined,
    area: typeof meal.strArea === 'string' ? meal.strArea : undefined,
    title: (typeof meal.strMeal === 'string' && meal.strMeal.trim())
      ? meal.strMeal.trim().slice(0, 200)
      : 'Rezept',
    servings: 0,
    prep_time: '',
    nutrition_note: noteParts.join(' · ').slice(0, 600),
    ingredients,
    shopping_list: shopping,
    steps,
  };
}

function summarizeMeal(row) {
  if (!row || typeof row !== 'object') return null;
  const id = row.idMeal != null ? String(row.idMeal) : null;
  if (!id) return null;
  return {
    id,
    title: typeof row.strMeal === 'string' ? row.strMeal : '',
    image: typeof row.strMealThumb === 'string' ? row.strMealThumb : undefined,
    source: 'themealdb',
  };
}

function sanitizePathSegment(name) {
  return String(name || '')
    .trim()
    .slice(0, 80)
    .replace(/[^\w\s\-']/g, '')
    .trim();
}

/** Rezept per ID (lookup.php?i=) */
async function getMealById(id, opts) {
  const mealId = String(id || '').trim();
  if (!/^\d+$/.test(mealId)) return { error: 'invalid_payload' };

  const result = await themealdbGet('/lookup.php?i=' + encodeURIComponent(mealId), opts);
  if (result.error) return result;

  const meals = result.data && Array.isArray(result.data.meals) ? result.data.meals : null;
  if (!meals || !meals[0]) return { error: 'not_found' };

  const recipe = toLabPlateRecipe(meals[0]);
  if (!recipe) return { error: 'recipe_unavailable' };
  return { data: recipe, raw: meals[0] };
}

/** Rezepte nach Kategorie (filter.php?c=) – Kurzlisten ohne Zutaten/Schritte */
async function getMealsByCategory(category, opts) {
  const name = sanitizePathSegment(category);
  if (!name) return { error: 'invalid_payload' };

  const result = await themealdbGet('/filter.php?c=' + encodeURIComponent(name), opts);
  if (result.error) return result;

  const meals = result.data && Array.isArray(result.data.meals) ? result.data.meals : [];
  return {
    data: {
      source: 'themealdb',
      category: name,
      totalResults: meals.length,
      results: meals.map(summarizeMeal).filter(Boolean),
    },
  };
}

/** Rezepte nach Land/Region (filter.php?a=) */
async function getMealsByArea(area, opts) {
  const name = sanitizePathSegment(area);
  if (!name) return { error: 'invalid_payload' };

  const result = await themealdbGet('/filter.php?a=' + encodeURIComponent(name), opts);
  if (result.error) return result;

  const meals = result.data && Array.isArray(result.data.meals) ? result.data.meals : [];
  return {
    data: {
      source: 'themealdb',
      area: name,
      totalResults: meals.length,
      results: meals.map(summarizeMeal).filter(Boolean),
    },
  };
}

/** Zufälliges Rezept (random.php) */
async function getRandomMeal(opts) {
  const result = await themealdbGet('/random.php', opts);
  if (result.error) return result;

  const meals = result.data && Array.isArray(result.data.meals) ? result.data.meals : null;
  if (!meals || !meals[0]) return { error: 'recipe_unavailable' };

  const recipe = toLabPlateRecipe(meals[0]);
  if (!recipe) return { error: 'recipe_unavailable' };
  return { data: recipe, raw: meals[0] };
}

module.exports = {
  isConfigured,
  getMealById,
  getMealsByCategory,
  getMealsByArea,
  getRandomMeal,
  toLabPlateRecipe,
};
