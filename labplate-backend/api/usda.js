/**
 * LabPlate – USDA FoodData Central Provider
 * =========================================
 * Serverseitiger Client fuer Lebensmittelsuche und Naehrwerte.
 * API-Key ausschliesslich aus process.env.USDA_API_KEY.
 *
 * Docs: https://fdc.nal.usda.gov/api-guide/
 *   GET https://api.nal.usda.gov/fdc/v1/foods/search
 *   GET https://api.nal.usda.gov/fdc/v1/food/{fdcId}
 */

'use strict';

const BASE_URL = 'https://api.nal.usda.gov/fdc/v1';
const MAX_PAGE_SIZE = 25;

/** USDA nutrient.id → Coach-Feld (Werte je 100 g, sofern nicht anders angegeben) */
const NUTRIENT_BY_ID = {
  1008: { key: 'calories', unit: 'kcal' },       // Energy
  1003: { key: 'protein', unit: 'g' },           // Protein
  1004: { key: 'fat', unit: 'g' },               // Total lipid (fat)
  1005: { key: 'carbs', unit: 'g' },             // Carbohydrate, by difference
  1079: { key: 'fiber', unit: 'g' },             // Fiber, total dietary
  2000: { key: 'sugar', unit: 'g' },             // Total sugars
  1258: { key: 'saturatedFat', unit: 'g' },      // Fatty acids, total saturated
  1293: { key: 'transFat', unit: 'g' },          // Fatty acids, total trans
  1253: { key: 'cholesterol', unit: 'mg' },      // Cholesterol
  1093: { key: 'sodium', unit: 'mg' },           // Sodium
  1087: { key: 'calcium', unit: 'mg' },          // Calcium
  1089: { key: 'iron', unit: 'mg' },             // Iron
  1090: { key: 'magnesium', unit: 'mg' },        // Magnesium
  1092: { key: 'potassium', unit: 'mg' },        // Potassium
  1095: { key: 'zinc', unit: 'mg' },             // Zinc
  1162: { key: 'vitaminC', unit: 'mg' },         // Vitamin C
  1114: { key: 'vitaminD', unit: 'ug' },         // Vitamin D (D2 + D3)
  1106: { key: 'vitaminA', unit: 'ug' },         // Vitamin A, RAE
  1175: { key: 'vitaminB12', unit: 'ug' },       // Vitamin B-12
  1177: { key: 'folate', unit: 'ug' },           // Folate, total
};

/** Fallback ueber nutrient.number (SR Legacy Nummern) */
const NUTRIENT_BY_NUMBER = {
  '208': NUTRIENT_BY_ID[1008],
  '203': NUTRIENT_BY_ID[1003],
  '204': NUTRIENT_BY_ID[1004],
  '205': NUTRIENT_BY_ID[1005],
  '291': NUTRIENT_BY_ID[1079],
  '269': NUTRIENT_BY_ID[2000],
  '606': NUTRIENT_BY_ID[1258],
  '605': NUTRIENT_BY_ID[1293],
  '601': NUTRIENT_BY_ID[1253],
  '307': NUTRIENT_BY_ID[1093],
  '301': NUTRIENT_BY_ID[1087],
  '303': NUTRIENT_BY_ID[1089],
  '304': NUTRIENT_BY_ID[1090],
  '306': NUTRIENT_BY_ID[1092],
  '309': NUTRIENT_BY_ID[1095],
  '401': NUTRIENT_BY_ID[1162],
  '328': NUTRIENT_BY_ID[1114],
  '320': NUTRIENT_BY_ID[1106],
  '418': NUTRIENT_BY_ID[1175],
  '417': NUTRIENT_BY_ID[1177],
};

function getApiKey() {
  return String(process.env.USDA_API_KEY || '').trim();
}

function isConfigured() {
  return getApiKey().length > 0;
}

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round1(v) {
  return Math.round(Number(v) * 10) / 10;
}

/**
 * GET gegen USDA FDC. api_key als Query-Param.
 */
async function usdaGet(pathname, query, opts) {
  const apiKey = getApiKey();
  if (!apiKey) return { error: 'server_not_configured' };

  const params = new URLSearchParams();
  Object.keys(query || {}).forEach((key) => {
    const val = query[key];
    if (val === undefined || val === null || val === '') return;
    if (Array.isArray(val)) {
      val.forEach((item) => {
        if (item !== undefined && item !== null && item !== '') params.append(key, String(item));
      });
      return;
    }
    params.set(key, String(val));
  });
  params.set('api_key', apiKey);

  const url = BASE_URL + pathname + '?' + params.toString();
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

function resolveNutrientMeta(entry) {
  if (!entry || typeof entry !== 'object') return null;

  // Detail-Format: { nutrient: { id, number, name, unitName }, amount }
  if (entry.nutrient && typeof entry.nutrient === 'object') {
    const id = entry.nutrient.id;
    const number = entry.nutrient.number != null ? String(entry.nutrient.number) : '';
    return NUTRIENT_BY_ID[id] || NUTRIENT_BY_NUMBER[number] || null;
  }

  // Search-Format: { nutrientId, nutrientNumber, nutrientName, value, unitName }
  if (entry.nutrientId != null && NUTRIENT_BY_ID[entry.nutrientId]) {
    return NUTRIENT_BY_ID[entry.nutrientId];
  }
  if (entry.nutrientNumber != null && NUTRIENT_BY_NUMBER[String(entry.nutrientNumber)]) {
    return NUTRIENT_BY_NUMBER[String(entry.nutrientNumber)];
  }
  return null;
}

function readNutrientAmount(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.amount != null && Number.isFinite(Number(entry.amount))) return Number(entry.amount);
  if (entry.value != null && Number.isFinite(Number(entry.value))) return Number(entry.value);
  return null;
}

/**
 * USDA foodNutrients → einheitliches Coach-Format (Werte typischerweise je 100 g).
 */
function normalizeNutrition(data) {
  if (!data || typeof data !== 'object') return null;

  const nutrients = Array.isArray(data.foodNutrients) ? data.foodNutrients : [];
  const per100g = {};

  nutrients.forEach((entry) => {
    const meta = resolveNutrientMeta(entry);
    const amount = readNutrientAmount(entry);
    if (!meta || amount == null) return;
    per100g[meta.key] = round1(amount);
  });

  const carbs = num(per100g.carbs, 0);
  const fiber = num(per100g.fiber, 0);
  const netCarbs = Math.max(0, round1(carbs - fiber));

  const macrosPer100g = {
    netCarbs,
    fat: num(per100g.fat, 0),
    protein: num(per100g.protein, 0),
    fiber,
  };

  return {
    source: 'usda',
    fdcId: data.fdcId != null ? Number(data.fdcId) : null,
    name: typeof data.description === 'string' ? data.description.trim().slice(0, 300) : '',
    dataType: typeof data.dataType === 'string' ? data.dataType : undefined,
    brandOwner: typeof data.brandOwner === 'string' ? data.brandOwner : undefined,
    category: typeof data.foodCategory === 'string'
      ? data.foodCategory
      : (data.foodCategory && data.foodCategory.description
        ? String(data.foodCategory.description)
        : undefined),
    publishedDate: typeof data.publishedDate === 'string' ? data.publishedDate : undefined,
    per100g: Object.assign({}, per100g, { netCarbs }),
    macrosPer100g,
    // Alias passend zum LabPlate-Ingredient-Vertrag
    calories: num(per100g.calories, 0),
  };
}

function summarizeSearchHit(food) {
  if (!food || typeof food !== 'object' || food.fdcId == null) return null;
  const normalized = normalizeNutrition(food);
  return {
    fdcId: Number(food.fdcId),
    name: typeof food.description === 'string' ? food.description : '',
    dataType: typeof food.dataType === 'string' ? food.dataType : undefined,
    brandOwner: typeof food.brandOwner === 'string' ? food.brandOwner : undefined,
    publishedDate: typeof food.publishedDate === 'string' ? food.publishedDate : undefined,
    score: food.score != null ? Number(food.score) : undefined,
    macrosPer100g: normalized ? normalized.macrosPer100g : { netCarbs: 0, fat: 0, protein: 0, fiber: 0 },
    calories: normalized ? normalized.calories : 0,
    source: 'usda',
  };
}

/**
 * searchFood(query) – Lebensmittelsuche.
 * opts: pageSize, pageNumber, dataType (String oder Array)
 */
async function searchFood(query, opts) {
  const q = String(query || '').trim().slice(0, 120);
  if (!q) return { error: 'invalid_payload' };

  const o = opts || {};
  const pageSize = clampInt(o.pageSize, 10, 1, MAX_PAGE_SIZE);
  const pageNumber = clampInt(o.pageNumber, 1, 1, 100);
  const params = {
    query: q,
    pageSize,
    pageNumber,
  };

  if (o.dataType) {
    params.dataType = Array.isArray(o.dataType)
      ? o.dataType.map(String)
      : String(o.dataType).split(',').map((s) => s.trim()).filter(Boolean);
  } else {
    // Standard: Foundation + SR Legacy (zuverlaessige Naehrwerte je 100 g).
    // Branded ohne Filter liefert oft Treffer ohne Makros.
    params.dataType = ['Foundation', 'SR Legacy'];
  }

  const result = await usdaGet('/foods/search', params, o);
  if (result.error) return result;

  const foods = Array.isArray(result.data && result.data.foods) ? result.data.foods : [];
  return {
    data: {
      source: 'usda',
      query: q,
      totalHits: num(result.data && result.data.totalHits, foods.length),
      currentPage: num(result.data && result.data.currentPage, pageNumber),
      totalPages: num(result.data && result.data.totalPages, 1),
      results: foods.map(summarizeSearchHit).filter(Boolean),
    },
  };
}

/**
 * getFoodDetails(fdcId) – vollstaendige Naehrwerte + normalizeNutrition.
 */
async function getFoodDetails(fdcId, opts) {
  const id = String(fdcId || '').trim();
  if (!/^\d+$/.test(id)) return { error: 'invalid_payload' };

  const result = await usdaGet('/food/' + encodeURIComponent(id), {}, opts);
  if (result.error) return result;
  if (!result.data || result.data.fdcId == null) return { error: 'not_found' };

  const normalized = normalizeNutrition(result.data);
  if (!normalized) return { error: 'recipe_unavailable' };

  return { data: normalized, raw: result.data };
}

module.exports = {
  BASE_URL,
  isConfigured,
  searchFood,
  getFoodDetails,
  normalizeNutrition,
};
