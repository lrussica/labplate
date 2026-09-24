'use strict';
/**
 * Classic Master Store — Source of Truth für weltweite Klassiker.
 *
 * HIT  → starres Stammgerüst (immutable), ehrliche Allergen-Swaps, lokalisierte Texte
 * MISS → generative Pipeline unverändert
 *
 * LLM wird hier NICHT fürs Zutatengerüst genutzt (keine Halluzination am Kern).
 */

const fs = require('fs');
const path = require('path');

const LANGS = ['de', 'en', 'fr', 'it', 'tr'];
const MASTER_PATH = path.join(__dirname, 'data', 'master_recipes.json');

let _cache = null;

function loadMaster() {
  if (_cache) return _cache;
  const raw = fs.readFileSync(MASTER_PATH, 'utf8');
  _cache = JSON.parse(raw);
  _cache.recipes = (_cache.recipes || []).map(metadataFor);
  return _cache;
}

function reloadMaster() {
  _cache = null;
  return loadMaster();
}

function normalizeLang(lang) {
  const l = String(lang || 'de').toLowerCase().slice(0, 2);
  return LANGS.indexOf(l) >= 0 ? l : 'de';
}

function normalizeQuery(q) {
  let s = String(q || '').toLowerCase().trim();
  try {
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (_) { /* older node */ }
  s = s
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ä/g, 'a')
    .replace(/ß/g, 'ss');
  s = s.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/\b([a-z]+)s\b/g, '$1');
  return s;
}

function metadataFor(rec) {
  if (!rec.status) rec.status = 'published';
  if (!rec.sourceType) rec.sourceType = 'labplate_original';
  if (!rec.country) rec.country = rec.cuisine || null;
  if (!rec.category) {
    const text = `${rec.id} ${Object.values(rec.titles || {}).join(' ')}`.toLowerCase();
    rec.category = /soup|suppe|corbasi|zuppa|soupe/.test(text) ? 'soup'
      : /salad|salat|insalata|salade/.test(text) ? 'salad'
      : /tiramisu|bowl|dessert|cake|kuchen/.test(text) ? 'dessert'
      : /pizza|quiche|lahmacun|taco|burger|ramen|spätzle|spaetzle/.test(text) ? 'pastry'
      : 'main_dish';
  }
  if (!rec.canonicalName) rec.canonicalName = Object.assign({}, rec.titles || {});
  if (!Array.isArray(rec.relatedRecipeIds)) rec.relatedRecipeIds = [];
  return rec;
}

function pickLocalized(mapOrString, lang) {
  if (mapOrString == null) return '';
  if (typeof mapOrString === 'string') return mapOrString;
  const L = normalizeLang(lang);
  return String(mapOrString[L] || mapOrString.de || mapOrString.en || Object.values(mapOrString)[0] || '');
}

function contextQuery(payload) {
  const p = payload || {};
  const parts = [];
  if (Array.isArray(p.pantry_ingredients)) parts.push(p.pantry_ingredients.join(' '));
  if (p.dishQuery) parts.push(p.dishQuery);
  if (p.ai_instruction) parts.push(p.ai_instruction);
  if (p.aiInstruction) parts.push(p.aiInstruction);
  if (p.title) parts.push(p.title);
  return parts.filter(Boolean).join(' ');
}

function resolveClassic(queryOrPayload, lang) {
  const master = loadMaster();
  const blob = typeof queryOrPayload === 'string'
    ? queryOrPayload
    : contextQuery(queryOrPayload);
  const q = normalizeQuery(blob);
  if (!q || q.length < 3) return null;

  if (/low\s*cal|kalorienarm|light\s*version|abgespeckt|fettarm/.test(q)) return null;

  let best = null;
  (master.recipes || []).forEach(function (rec) {
    if (rec.status !== 'published') return;
    const aliases = rec.aliases || {};
    LANGS.forEach(function (L) {
      const list = (aliases[L] || []).concat(rec.canonicalName && rec.canonicalName[L] || []);
      list.forEach(function (alias) {
        const a = normalizeQuery(alias);
        if (!a) return;
        let score = 0;
        if (q === a) score = 100;
        else if (q.indexOf(a) >= 0) score = 80 + Math.min(19, a.length);
        if (score > 0 && (!best || score > best.score)) {
          best = { id: rec.id, recipe: rec, score: score };
        }
      });
    });
  });
  return best;
}

function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = current;
    }
  }
  return row[b.length];
}

function findClassicCandidates(queryOrPayload, lang, limit) {
  const master = loadMaster();
  const q = normalizeQuery(typeof queryOrPayload === 'string' ? queryOrPayload : contextQuery(queryOrPayload));
  if (!q || q.length < 3) return [];
  const candidates = [];
  (master.recipes || []).forEach(function (rec) {
    if (rec.status !== 'published') return;
    const names = [];
    LANGS.forEach(function (L) {
      names.push.apply(names, (rec.aliases && rec.aliases[L]) || []);
      if (rec.canonicalName && rec.canonicalName[L]) names.push(rec.canonicalName[L]);
    });
    const distance = Math.min.apply(null, names.map(function (name) {
      return levenshtein(q, normalizeQuery(name));
    }));
    if (distance <= 2) {
      candidates.push({ id: rec.id, title: pickLocalized(rec.canonicalName, lang), distance });
    }
  });
  return candidates.sort((a, b) => a.distance - b.distance).slice(0, limit || 5);
}

function hasLactoseAllergen(allergens) {
  try {
    return require('./lactose-honesty').hasLactoseAllergen(allergens);
  } catch (_) {
    return (allergens || []).some(function (a) {
      return /laktose|lactose|milch|dairy|milk/i.test(String(a || ''));
    });
  }
}

function applyHonestAllergenSwaps(ingredients, opts) {
  const o = opts || {};
  const allergens = o.allergens || [];
  const lang = normalizeLang(o.lang);
  const notes = [];
  let lactoseStatus = 'none';

  if (!hasLactoseAllergen(allergens)) {
    return { ingredients: ingredients, lactoseStatus: lactoseStatus, notes: notes };
  }

  const masterMeta = o.masterMeta || {};
  if (masterMeta.lactosePolicy === 'impossible_swap') {
    return {
      ingredients: ingredients,
      lactoseStatus: 'impossible',
      notes: notes,
      block: true,
      blockReason: 'lactose_impossible_for_classic',
    };
  }

  const out = ingredients.map(function (ing) {
    if (!ing) return ing;
    const tags = ing.allergenTags || [];
    const isDairy = tags.some(function (t) {
      return /lactose|milk|dairy/i.test(String(t));
    });
    if (!isDairy || !ing.lactoseSwap || !ing.lactoseSwap.honest) return ing;
    const swapNames = ing.lactoseSwap.names || ing.lactoseSwap;
    const next = Object.assign({}, ing, {
      name: pickLocalized(swapNames, lang) || ing.name,
      displayName: pickLocalized(swapNames, lang) || ing.name,
      _lactoseSwapped: true,
    });
    notes.push(ing.name + ' → ' + next.name);
    lactoseStatus = 'adapted';
    return next;
  });

  return { ingredients: out, lactoseStatus: lactoseStatus, notes: notes };
}

function buildFromMaster(payload, opts) {
  const o = opts || {};
  const match = o.match || resolveClassic(payload, payload && payload.lang);
  if (!match) return { ok: false, error: 'no_master_hit' };

  const lang = normalizeLang((payload && payload.lang) || o.lang || 'de');
  const master = match.recipe;
  const sourceServings = Number(master.servings) > 0 ? Number(master.servings) : 4;

  let ingredients = (master.ingredients || []).map(function (ing) {
    const name = pickLocalized(ing.names, lang);
    return {
      id: String(ing.id),
      name: name,
      displayName: name,
      amount: Number(ing.amount) || 0,
      unit: ing.unit || 'g',
      protein_source: !!ing.protein_source,
      culinaryRole: ing.culinaryRole || null,
      countsAsPrimaryProteinSource: !!ing.protein_source &&
        (ing.culinaryRole === 'main_protein' || ing.culinaryRole === 'secondary_protein' ||
          ing.culinaryRole === 'protein_supplement'),
      netCarbs: Number(ing.netCarbs) || 0,
      fat: Number(ing.fat) || 0,
      protein: Number(ing.protein) || 0,
      fiber: Number(ing.fiber) || 0,
      allergenTags: Array.isArray(ing.allergenTags) ? ing.allergenTags.slice() : [],
      lactoseSwap: ing.lactoseSwap || null,
    };
  });

  const swap = applyHonestAllergenSwaps(ingredients, {
    allergens: (payload && payload.allergens) || o.allergens || [],
    lang: lang,
    masterMeta: master,
  });
  if (swap.block) {
    return {
      ok: false,
      error: swap.blockReason || 'allergen_impossible',
      lactoseStatus: swap.lactoseStatus,
      match: match,
    };
  }
  ingredients = swap.ingredients.map(function (ing) {
    const copy = Object.assign({}, ing);
    delete copy.lactoseSwap;
    return copy;
  });

  // Mengen bleiben auf Master-Portionen (sourceServings).
  // Skalierung auf targetServings macht ausschließlich renderRecipeForDisplay —
  // sonst droht Doppel-Skalierung (720 g → 180 g → 45 g).
  const steps = (master.steps || []).map(function (s) {
    return {
      title: pickLocalized(s.title, lang),
      content: pickLocalized(s.content, lang),
      stove_level: Number(s.stove_level) || 0,
      time_min: Number(s.time_min) || 0,
    };
  });

  const recipe = {
    title: pickLocalized(master.titles, lang),
    servings: sourceServings,
    sourceServings: sourceServings,
    sourceServingsStatus: 'explicit',
    sourceServingsMethod: 'master_explicit',
    sourceServingsConfidence: 1,
    prep_time_min: Number(master.prep_time_min) || 0,
    ingredients: ingredients,
    steps: steps,
    garnish: pickLocalized(master.garnish, lang),
    chef_analysis: pickLocalized(master.chef_analysis, lang),
    diet_labels: Array.isArray(master.diet_labels) ? master.diet_labels.slice() : [],
    target_deviation_note: '',
    nutrition: { kcal: 0, protein_g: 0, fat_g: 0, netto_kh_g: 0, ballaststoffe_g: 0 },
    recipeSource: 'master-classic',
    sourceType: master.sourceType || 'labplate_original',
    masterRecipeId: master.id,
    immutableCore: true,
    lactoseHonestyStatus: swap.lactoseStatus,
    lactoseSwapNotes: swap.notes,
    cuisine: master.cuisine,
    region: master.region,
    coreComponents: master.coreComponents || [],
    lang: lang,
  };

  try {
    const validator = require('./recipe-validator');
    recipe.nutrition = validator.computeNutritionFromIngredients(ingredients);
  } catch (_) { /* keep zeros */ }

  return {
    ok: true,
    recipe: recipe,
    match: match,
    scale: 1,
    lang: lang,
    temperature: 0,
    recipeSource: 'master-classic',
  };
}

function tryMasterClassic(payload, opts) {
  const match = resolveClassic(payload, payload && payload.lang);
  if (!match) return { ok: false, error: 'no_master_hit' };
  return buildFromMaster(payload, Object.assign({}, opts || {}, { match: match }));
}

function listMasterIds() {
  return (loadMaster().recipes || []).map(function (r) { return r.id; });
}

module.exports = {
  LANGS: LANGS,
  MASTER_PATH: MASTER_PATH,
  loadMaster: loadMaster,
  reloadMaster: reloadMaster,
  normalizeQuery: normalizeQuery,
  normalizeLang: normalizeLang,
  pickLocalized: pickLocalized,
  resolveClassic: resolveClassic,
  findClassicCandidates: findClassicCandidates,
  applyHonestAllergenSwaps: applyHonestAllergenSwaps,
  buildFromMaster: buildFromMaster,
  tryMasterClassic: tryMasterClassic,
  listMasterIds: listMasterIds,
};
