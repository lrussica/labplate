/**
 * LabPlate – Spoonacular Recipe Provider
 * ======================================
 * Serverseitiger Client fuer Rezeptsuche und -details.
 * API-Key bleibt ausschliesslich in process.env (nie an den Client).
 *
 * Docs: https://spoonacular.com/food-api/docs
 */

'use strict';

const BASE_URL = 'https://api.spoonacular.com';
const MAX_RESULTS = 20;
const MAX_INGREDIENTS = 100;
const MAX_STEPS = 50;

function getApiKey() {
  return String(process.env.SPOONACULAR_API_KEY || '').trim();
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

/**
 * GET gegen Spoonacular. apiKey nur als Query-Param (offizielle Auth).
 */
async function spoonacularGet(pathname, query, opts) {
  const apiKey = getApiKey();
  if (!apiKey) return { error: 'server_not_configured' };

  const params = new URLSearchParams();
  Object.keys(query || {}).forEach((key) => {
    const val = query[key];
    if (val === undefined || val === null || val === '') return;
    params.set(key, String(val));
  });
  params.set('apiKey', apiKey);

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

function mapUnit(rawUnit, amount) {
  const u = String(rawUnit || '').trim().toLowerCase();
  if (!u) return amount > 0 ? 'g' : 'g';
  if (u === 'ml' || u === 'milliliter' || u === 'milliliters' || u === 'l' || u === 'liter' || u === 'liters') {
    return 'ml';
  }
  // Spoonacular liefert oft oz/cup/tbsp – App-Vertrag kennt nur g|ml.
  // Wir behalten die metrische amount aus measures.metric, Fallback g.
  return 'g';
}

function pickMetricAmount(ing) {
  const metric = ing && ing.measures && ing.measures.metric;
  if (metric && Number.isFinite(Number(metric.amount))) {
    return {
      amount: Math.round(Number(metric.amount) * 10) / 10,
      unit: mapUnit(metric.unitShort || metric.unitLong, Number(metric.amount)),
    };
  }
  if (Number.isFinite(Number(ing && ing.amount))) {
    return {
      amount: Math.round(Number(ing.amount) * 10) / 10,
      unit: mapUnit(ing.unit, Number(ing.amount)),
    };
  }
  return { amount: 0, unit: 'g' };
}

function extractSteps(info) {
  const steps = [];
  const analyzed = Array.isArray(info && info.analyzedInstructions)
    ? info.analyzedInstructions
    : [];
  analyzed.forEach((block) => {
    (Array.isArray(block.steps) ? block.steps : []).forEach((step) => {
      const text = String((step && step.step) || '').trim();
      if (text) steps.push(text.slice(0, 2000));
    });
  });
  if (steps.length) return steps.slice(0, MAX_STEPS);

  // Fallback: HTML-Instructions als grobe Absätze
  const html = String((info && info.instructions) || '')
    .replace(/<li[^>]*>/gi, '\n')
    .replace(/<\/li>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!html) return [];
  return html
    .split(/\n+|(?<=\.)\s+(?=[A-ZÄÖÜ])/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_STEPS);
}

function nutritionNoteFromInfo(info) {
  const parts = [];
  if (info.readyInMinutes) parts.push(info.readyInMinutes + ' Min.');
  if (info.healthScore != null) parts.push('Health-Score ' + info.healthScore);
  if (info.vegetarian) parts.push('vegetarisch');
  if (info.vegan) parts.push('vegan');
  if (info.glutenFree) parts.push('glutenfrei');
  if (info.dairyFree) parts.push('laktosefrei');
  return parts.join(' · ').slice(0, 600);
}

/**
 * Spoonacular Recipe Information → LabPlate Client-Rezeptvertrag.
 */
function toLabPlateRecipe(info) {
  if (!info || typeof info !== 'object') return null;

  const ingredients = (Array.isArray(info.extendedIngredients) ? info.extendedIngredients : [])
    .slice(0, MAX_INGREDIENTS)
    .map((ing) => {
      const qty = pickMetricAmount(ing);
      const name = String((ing && (ing.nameClean || ing.name || ing.originalName)) || 'Zutat')
        .trim()
        .slice(0, 200);
      return {
        name: name || 'Zutat',
        amount: qty.amount > 0 ? qty.amount : 0,
        unit: qty.unit === 'ml' ? 'ml' : 'g',
        status: 'benoetigt',
        macrosPer100g: { netCarbs: 0, fat: 0, protein: 0, fiber: 0 },
        original: String((ing && ing.original) || '').slice(0, 200) || undefined,
      };
    })
    .filter((ing) => ing.name);

  if (!ingredients.length) return null;

  const steps = extractSteps(info);
  const shopping = ingredients.map((ing) => {
    if (!(ing.amount > 0)) return ing.name + ' – nicht angegeben';
    return ing.name + ' – ' + ing.amount + ' ' + ing.unit;
  });

  const servings = num(info.servings, 0);

  return {
    id: info.id != null ? Number(info.id) : undefined,
    source: 'spoonacular',
    sourceUrl: typeof info.sourceUrl === 'string' ? info.sourceUrl : undefined,
    image: typeof info.image === 'string' ? info.image : undefined,
    title: (typeof info.title === 'string' && info.title.trim())
      ? info.title.trim().slice(0, 200)
      : 'Rezept',
    servings: servings > 0 ? servings : 2,
    prep_time: info.readyInMinutes
      ? (String(info.readyInMinutes) + ' Min.')
      : '',
    nutrition_note: nutritionNoteFromInfo(info),
    ingredients,
    shopping_list: shopping,
    steps,
  };
}

function summarizeSearchHit(hit) {
  if (!hit || typeof hit !== 'object') return null;
  return {
    id: hit.id != null ? Number(hit.id) : null,
    title: typeof hit.title === 'string' ? hit.title : '',
    image: typeof hit.image === 'string' ? hit.image : undefined,
    imageType: typeof hit.imageType === 'string' ? hit.imageType : undefined,
    readyInMinutes: hit.readyInMinutes != null ? Number(hit.readyInMinutes) : undefined,
    servings: hit.servings != null ? Number(hit.servings) : undefined,
    source: 'spoonacular',
  };
}

/**
 * Complex Search. Query-Params aus dem Request (whitelist).
 */
async function searchRecipes(filters, opts) {
  const f = filters || {};
  const number = clampInt(f.number, 8, 1, MAX_RESULTS);
  const query = {
    query: String(f.query || f.q || '').trim().slice(0, 120),
    number,
    offset: clampInt(f.offset, 0, 0, 900),
    addRecipeInformation: f.addRecipeInformation === true || f.addRecipeInformation === 'true' ? 'true' : 'false',
    instructionsRequired: 'true',
    fillIngredients: f.fillIngredients === true || f.fillIngredients === 'true' ? 'true' : 'false',
  };

  if (f.cuisine) query.cuisine = String(f.cuisine).slice(0, 80);
  if (f.diet) query.diet = String(f.diet).slice(0, 80);
  if (f.intolerances) query.intolerances = String(f.intolerances).slice(0, 120);
  if (f.type) query.type = String(f.type).slice(0, 40);
  if (f.includeIngredients) query.includeIngredients = String(f.includeIngredients).slice(0, 200);
  if (f.excludeIngredients) query.excludeIngredients = String(f.excludeIngredients).slice(0, 200);
  if (f.maxReadyTime != null && f.maxReadyTime !== '') {
    query.maxReadyTime = String(clampInt(f.maxReadyTime, 45, 1, 240));
  }

  const result = await spoonacularGet('/recipes/complexSearch', query, opts);
  if (result.error) return result;

  const results = Array.isArray(result.data && result.data.results) ? result.data.results : [];
  return {
    data: {
      source: 'spoonacular',
      totalResults: num(result.data && result.data.totalResults, results.length),
      number: num(result.data && result.data.number, results.length),
      offset: num(result.data && result.data.offset, 0),
      results: results.map(summarizeSearchHit).filter(Boolean),
    },
  };
}

/**
 * Find by ingredients (Pantry-Suche).
 * ingredients: "tomato,cheese" oder Array.
 */
async function findByIngredients(ingredients, opts) {
  const list = Array.isArray(ingredients)
    ? ingredients
    : String(ingredients || '').split(/[,;\n]+/);
  const cleaned = list.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 20);
  if (!cleaned.length) return { error: 'invalid_payload' };

  const number = clampInt(opts && opts.number, 8, 1, MAX_RESULTS);
  const result = await spoonacularGet('/recipes/findByIngredients', {
    ingredients: cleaned.join(','),
    number,
    ranking: 1,
    ignorePantry: 'true',
  }, opts);
  if (result.error) return result;

  const rows = Array.isArray(result.data) ? result.data : [];
  return {
    data: {
      source: 'spoonacular',
      totalResults: rows.length,
      number: rows.length,
      offset: 0,
      results: rows.map((hit) => {
        const base = summarizeSearchHit(hit);
        if (!base) return null;
        return Object.assign(base, {
          usedIngredientCount: num(hit.usedIngredientCount, 0),
          missedIngredientCount: num(hit.missedIngredientCount, 0),
          likes: num(hit.likes, 0),
        });
      }).filter(Boolean),
    },
  };
}

async function getRecipeById(id, opts) {
  const recipeId = clampInt(id, 0, 1, 1e12);
  if (!recipeId) return { error: 'invalid_payload' };

  const includeNutrition = opts && (opts.includeNutrition === true || opts.includeNutrition === 'true');
  const result = await spoonacularGet('/recipes/' + recipeId + '/information', {
    includeNutrition: includeNutrition ? 'true' : 'false',
  }, opts);
  if (result.error) return result;

  const recipe = toLabPlateRecipe(result.data);
  if (!recipe) return { error: 'recipe_unavailable' };
  return { data: recipe, raw: result.data };
}

module.exports = {
  BASE_URL,
  isConfigured,
  getApiKeyConfigured: isConfigured,
  searchRecipes,
  findByIngredients,
  getRecipeById,
  toLabPlateRecipe,
};
