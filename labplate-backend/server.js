/**
 * LabPlate – Naehrstoff-Rezepte Backend (sicherer Proxy zur Groq API)
 * ==================================================================
 * Endpunkte:
 *   GET  /health
 *   GET  /api/lexicon-terms[?q=]  -> Begriffe aus SQLite lexicon_terms (kein KI-Call)
 *   GET  /api/recipes/search?q=  -> Spoonacular Complex Search
 *   GET  /api/recipes/by-ingredients?ingredients= -> Spoonacular Find by Ingredients
 *   GET  /api/recipes/:id        -> Spoonacular Recipe Information (LabPlate-Format)
 *   GET  /api/themealdb/meal/:id -> TheMealDB Rezept per ID
 *   GET  /api/themealdb/category/:name -> TheMealDB nach Kategorie
 *   GET  /api/themealdb/area/:name -> TheMealDB nach Land/Region
 *   GET  /api/themealdb/random   -> TheMealDB Zufallsrezept
 *   GET  /api/usda/search?q=     -> USDA FoodData Central Suche
 *   GET  /api/usda/food/:fdcId   -> USDA Naehrwerte (normalisiert fuer Coach)
 *   POST /api/coach/analyze-recipe     -> Rezept-Analyse (Makros, HealthScore)
 *   POST /api/coach/analyze-ingredients -> Zutaten-Analyse (USDA-Format)
 *   POST /api/coach/daily-plan         -> Tagesplan aus Makro-Zielen
 *   POST /api/coach/alternatives       -> gesuendere Alternativen
 *   POST /api/photo/verify -> Vision-Check: fertiges Gerichtsfoto vs. Rohzutaten/falsches Motiv
 *   POST /api/nutri-recipe   -> Strict-JSON-Schema (siehe nutri-recipe-core.js)
 *      STRUCTURED/Eigenrezept: Inhalt fix, nur Struktur + Naehrwert-Anreicherung
 *      GENERATIV/Freisuche/Shopping: kreativ, Mengen an Tagesziele anpassbar
 *   POST /api/food-lookup    -> 1:1-Weiterleitung eines Chat-Completion-Requests an Groq
 *   POST /api/team-colleague -> Phase-3 Supplement-/Einkaufs-Coach (agent=supplement → nutri-supplement-core)
 *   POST /api/team-coach-route -> Phase-3 Korrektur: Coach→Koch Intent (nur Handoff-JSON, kein Rezept)
 *
 * FIX "KI laesst Zutaten weg":
 *   - Modell openai/gpt-oss-120b; Generativ temperature 0.85, Eigenrezept 0; reasoning_effort "low"
 *   - response_format json_schema strict:true mit einem PFLICHT-Key pro Zutat
 *   - Render-Log: "[nutri-recipe] ENRICH model=… ingredients=N" / "[nutri-recipe] OK ingredients=N steps=M"
 *
 * Render-Env: GROQ_API_KEY (KI), SPOONACULAR_API_KEY, THEMEALDB_API_KEY, USDA_API_KEY, GROQ_MODEL (optional),
 *             ALLOWED_ORIGINS, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX, REQUEST_TIMEOUT_MS
 *   TEMP 2026-09-20: TEMPORARY_GROQ_MODEL_OVERRIDE erzwingt gpt-oss-20b (Groq TPD-Sync-Bug auf 120b).
 *   Rueckbau: Override auf null + Render GROQ_MODEL wieder openai/gpt-oss-120b.
 */

'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const core = require('./nutri-recipe-core');
const teamRouter = require('./team-router');
const coachCore = require('./nutri-coach-core');
const strictPrompt = require('./strict-prompt');
const coachRecipe = require('./coach-recipe');
const nutriCoach = require('./nutri-coach');
const recipeSuggestions = require('./recipe-suggestions');
const spoonacular = require('./spoonacular');
const themealdb = require('./api/themealdb');
const usda = require('./api/usda');
const coachLogic = require('./coach/logic');
const { createPhotoVerifyHandlers } = require('./api/photo-verify');

// ---------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------
const PORT = parseInt(process.env.PORT, 10) || 3000;
const GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim();
const GROQ_API_KEY_DEBUG = (process.env.GROQ_API_KEY_DEBUG || '').trim();
const GROQ_API_KEY_LOOKS_VALID = /^gsk_[A-Za-z0-9]+$/.test(GROQ_API_KEY) || GROQ_API_KEY.length > 20;
const GROQ_API_KEY_DEBUG_LOOKS_VALID = !GROQ_API_KEY_DEBUG
  ? false
  : (/^gsk_[A-Za-z0-9]+$/.test(GROQ_API_KEY_DEBUG) || GROQ_API_KEY_DEBUG.length > 20);
// TEMP (2026-09-20): Groq Developer-Limits zeigen TPD "No limit" fuer gpt-oss-120b,
// API enforced aber weiter Free-Tier TPD 200k (Support-Ticket offen).
// Rueckbau: auf null setzen → wieder process.env.GROQ_MODEL / DEFAULT_MODEL (120b).
const TEMPORARY_GROQ_MODEL_OVERRIDE = 'openai/gpt-oss-20b';
const GROQ_MODEL = (TEMPORARY_GROQ_MODEL_OVERRIDE || process.env.GROQ_MODEL || core.DEFAULT_MODEL).trim();
const MODEL_OVERRIDE_REASON = TEMPORARY_GROQ_MODEL_OVERRIDE
  ? 'temporary — groq_120b_tpd_sync_issue, see Groq support ticket; revert to openai/gpt-oss-120b when fixed'
  : null;
const SPOONACULAR_CONFIGURED = spoonacular.isConfigured();
const THEMEALDB_CONFIGURED = themealdb.isConfigured();
const USDA_CONFIGURED = usda.isConfigured();

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'null').split(',').map((s) => s.trim()).filter(Boolean);
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000;
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX, 10) || 40;
// 120b + langes Rezept braucht mehr Zeit als 18 s; Client-Timeout ist 60 s.
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 55000;

// Modelle, die /api/food-lookup vom Client akzeptiert (Whitelist gegen Missbrauch)
const FOOD_LOOKUP_ALLOWED_MODELS = new Set([
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-scout-17b-16e-instruct',
]);

/** Nur mit debug_v92_raw:true — temporärer Modell-Override für TPD-schonende Debug-Läufe. */
const DEBUG_V92_ALLOWED_MODELS = new Set([
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
]);

// Vision-Modell für /api/photo/verify (multimodal); per Env überschreibbar.
const GROQ_VISION_MODEL = (process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b').trim();
const PHOTO_VERIFY_TIMEOUT_MS = Math.min(REQUEST_TIMEOUT_MS, 25000);

function maskedPreview(s) {
  if (!s) return '(leer)';
  if (s.length <= 8) return '*'.repeat(s.length);
  return s.slice(0, 4) + '…' + s.slice(-4) + ' (Laenge ' + s.length + ')';
}

function isDebugRecipeRequest(reqBody) {
  if (!reqBody || typeof reqBody !== 'object') return false;
  if (reqBody.debug_v92_raw === true) return true;
  const requested = typeof reqBody.groq_model === 'string' ? reqBody.groq_model.trim() : '';
  return !!(requested && DEBUG_V92_ALLOWED_MODELS.has(requested));
}

function resolveRecipeModel(reqBody) {
  const requested = reqBody && typeof reqBody.groq_model === 'string' ? reqBody.groq_model.trim() : '';
  if (reqBody && reqBody.debug_v92_raw === true && requested && DEBUG_V92_ALLOWED_MODELS.has(requested)) {
    return requested;
  }
  return GROQ_MODEL;
}

function resolveGroqAuth(reqBody) {
  const debug = isDebugRecipeRequest(reqBody);
  if (!debug) {
    return {
      apiKey: GROQ_API_KEY,
      keyType: 'prod',
      keyConfigured: !!GROQ_API_KEY,
      keyLooksValid: GROQ_API_KEY_LOOKS_VALID,
      keyFingerprint: GROQ_API_KEY ? maskedPreview(GROQ_API_KEY) : null,
    };
  }
  return {
    apiKey: GROQ_API_KEY_DEBUG,
    keyType: 'debug',
    keyConfigured: !!GROQ_API_KEY_DEBUG,
    keyLooksValid: GROQ_API_KEY_DEBUG_LOOKS_VALID,
    keyFingerprint: GROQ_API_KEY_DEBUG ? maskedPreview(GROQ_API_KEY_DEBUG) : null,
  };
}

if (!GROQ_API_KEY) {
  console.error('[Konfiguration] WARNUNG: GROQ_API_KEY ist nicht gesetzt.');
} else if (!GROQ_API_KEY_LOOKS_VALID) {
  console.error('[Konfiguration] WARNUNG: GROQ_API_KEY hat ein ungewoehnliches Format.');
} else {
  console.log('[Konfiguration] GROQ_API_KEY (prod) sieht gueltig aus: ' + maskedPreview(GROQ_API_KEY));
}
if (!GROQ_API_KEY_DEBUG) {
  console.error('[Konfiguration] HINWEIS: GROQ_API_KEY_DEBUG ist nicht gesetzt – Debug-Requests mit debug_v92_raw werden abgelehnt.');
} else if (!GROQ_API_KEY_DEBUG_LOOKS_VALID) {
  console.error('[Konfiguration] WARNUNG: GROQ_API_KEY_DEBUG hat ein ungewoehnliches Format.');
} else {
  console.log('[Konfiguration] GROQ_API_KEY_DEBUG sieht gueltig aus: ' + maskedPreview(GROQ_API_KEY_DEBUG));
  if (GROQ_API_KEY && GROQ_API_KEY_DEBUG === GROQ_API_KEY) {
    console.error('[Konfiguration] WARNUNG: GROQ_API_KEY_DEBUG ist identisch mit GROQ_API_KEY – TPD-Trennung wirkungslos.');
  }
}
console.log('[Konfiguration] GROQ_MODEL=' + GROQ_MODEL + (GROQ_MODEL !== core.DEFAULT_MODEL ? '  (Hinweis: Standard waere ' + core.DEFAULT_MODEL + ')' : ''));

if (!SPOONACULAR_CONFIGURED) {
  console.error('[Konfiguration] WARNUNG: SPOONACULAR_API_KEY ist nicht gesetzt – /api/recipes/* deaktiviert.');
} else {
  console.log('[Konfiguration] SPOONACULAR_API_KEY gesetzt: ' + maskedPreview(process.env.SPOONACULAR_API_KEY));
}
if (!THEMEALDB_CONFIGURED) {
  console.error('[Konfiguration] WARNUNG: THEMEALDB_API_KEY ist nicht gesetzt – /api/themealdb/* deaktiviert.');
} else {
  console.log('[Konfiguration] THEMEALDB_API_KEY gesetzt: ' + maskedPreview(process.env.THEMEALDB_API_KEY));
}
if (!USDA_CONFIGURED) {
  console.error('[Konfiguration] WARNUNG: USDA_API_KEY ist nicht gesetzt – /api/usda/* deaktiviert.');
} else {
  console.log('[Konfiguration] USDA_API_KEY gesetzt: ' + maskedPreview(process.env.USDA_API_KEY));
}

const STRUCTURED_PROMPT_VERSION = strictPrompt.STRUCTURED_PROMPT_VERSION;
const STRICT_CORE_OK = !!strictPrompt.getModuleStrictStatus('core').ok;
const STRICT_COACH_OK = !!coachRecipe.isStrictActive() && !!nutriCoach.isStrictActive();
const STRICT_SUGGESTIONS_OK = !!recipeSuggestions.isStrictActive();
const STRUCTURED_PROMPT_OK = STRICT_CORE_OK && STRICT_COACH_OK && STRICT_SUGGESTIONS_OK;
console.log('[Konfiguration] structured_prompt=' + STRUCTURED_PROMPT_VERSION +
  ' markers_ok=' + STRUCTURED_PROMPT_OK +
  ' core=' + STRICT_CORE_OK +
  ' coach=' + STRICT_COACH_OK +
  ' suggestions=' + STRICT_SUGGESTIONS_OK);

/** Waehlt das Rezept-Modul: core | coach | nutri-coach | suggestions */
function resolveRecipeFlow(reqBody, payload) {
  const raw = (reqBody && (reqBody.flow || reqBody.module)) || '';
  const flow = String(raw).toLowerCase().trim();
  if (flow === 'core') return 'core';
  if (flow === 'coach' || flow === 'coach-recipe') return 'coach';
  if (flow === 'nutri-coach' || flow === 'nutricoach') return 'nutri-coach';
  if (flow === 'suggestions' || flow === 'recipe-suggestions') return 'suggestions';
  // Default: STRUCTURED → Coach (Strict), sonst Suggestions
  return payload.structured ? 'coach' : 'suggestions';
}

function buildRecipeRequest(flow, payload, model) {
  const m = model || GROQ_MODEL;
  if (flow === 'coach') return coachRecipe.buildRequest(payload, m);
  if (flow === 'nutri-coach') return nutriCoach.buildRequest(payload, m);
  if (flow === 'suggestions') return recipeSuggestions.buildRequest(payload, m);
  return core.buildGroqRequest(payload, m);
}

// ---------------------------------------------------------------------
// App-Grundgeruest
// ---------------------------------------------------------------------
const app = express();
app.set('trust proxy', 1);
// CSP erlaubt Inline-CSS/JS in index.html (Test-Frontend im gleichen Ordner).
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src': ["'self'", "'unsafe-inline'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'connect-src': ["'self'", 'https://labplate.onrender.com'],
    },
  },
}));
// Eigenrezepte mit ai_instruction (bis 8 kB) + 100 Zutaten passen problemlos in 64 kB.
app.use(express.json({ limit: '64kb' }));

function isLocalLoopbackOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
}

app.use(cors({
  origin(origin, callback) {
    // Kein Origin-Header (z.B. curl, same-origin) immer erlauben.
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    // file:// und lokales Test-Frontend (localhost / 127.0.0.1)
    if (isLocalLoopbackOrigin(origin)) return callback(null, true);
    return callback(new Error('CORS: Origin nicht erlaubt'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  maxAge: 600,
}));

const limiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler(req, res) {
    res.status(429).json({ error: 'rate_limited' });
  },
});

function logEvent(event, fields) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...(fields || {}) }));
}

const photoVerify = createPhotoVerifyHandlers({
  groqApiKey: GROQ_API_KEY,
  groqApiUrl: core.GROQ_API_URL,
  visionModel: GROQ_VISION_MODEL,
  timeoutMs: PHOTO_VERIFY_TIMEOUT_MS,
  logEvent,
});

// ---------------------------------------------------------------------
// Routen
// ---------------------------------------------------------------------
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    configured: Boolean(GROQ_API_KEY),
    apiKeyLooksValid: GROQ_API_KEY ? GROQ_API_KEY_LOOKS_VALID : null,
    debugKeyConfigured: Boolean(GROQ_API_KEY_DEBUG),
    debugKeyLooksValid: GROQ_API_KEY_DEBUG ? GROQ_API_KEY_DEBUG_LOOKS_VALID : null,
    debugKeyDistinctFromProd: Boolean(
      GROQ_API_KEY && GROQ_API_KEY_DEBUG && GROQ_API_KEY !== GROQ_API_KEY_DEBUG
    ),
    model: GROQ_MODEL,
    model_override_reason: MODEL_OVERRIDE_REASON,
    provider: 'Groq',
    spoonacularConfigured: SPOONACULAR_CONFIGURED,
    themealdbConfigured: THEMEALDB_CONFIGURED,
    usdaConfigured: USDA_CONFIGURED,
    strictSchema: true,
    maxIngredients: core.MAX_INGREDIENTS,
    structuredPromptVersion: STRUCTURED_PROMPT_VERSION,
    structuredPromptOk: STRUCTURED_PROMPT_OK,
    strictPromptActiveInCore: STRICT_CORE_OK,
    strictPromptActiveInCoach: STRICT_COACH_OK,
    strictPromptActiveInSuggestions: STRICT_SUGGESTIONS_OK,
    v92PipelineWired: typeof core.generateValidatedRecipe === 'function',
    recipeSchemaVersion: 'v9.2',
    groq429Diagnostics: true,
    groqDebugKeyRouting: true,
  });
});

// Lexikon-Begriffe aus SQLite lexicon_terms (kein KI-Call zur Laufzeit).
app.get('/api/lexicon-terms', (req, res) => {
  try {
    const lexiconDb = require('./lexicon-db');
    const db = lexiconDb.openDb();
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const terms = q ? lexiconDb.searchTerms(db, q) : lexiconDb.listTerms(db);
    const count = lexiconDb.countTerms(db);
    db.close();
    return res.status(200).json({ count, terms });
  } catch (err) {
    logEvent('lexicon_terms_error', { reason: err && err.message ? err.message : 'unknown' });
    return res.status(500).json({ error: 'lexicon_unavailable' });
  }
});

function mapSpoonacularError(result, res, startedAt, flow) {
  if (result.error === 'server_not_configured') {
    logEvent('request_rejected', { reason: 'spoonacular_not_configured', flow });
    return res.status(500).json({ error: 'server_not_configured' });
  }
  if (result.error === 'invalid_payload') {
    return res.status(400).json({ error: 'invalid_payload' });
  }
  if (result.error === 'provider_error') {
    const upstreamStatus = Number(result.status) || 0;
    logEvent('spoonacular_http_error', {
      status: upstreamStatus,
      body: result.body,
      ms: Date.now() - startedAt,
      flow,
    });
    const clientStatus = upstreamStatus === 401 || upstreamStatus === 402 || upstreamStatus === 403
      ? 502
      : (upstreamStatus === 404 ? 404 : 502);
    return res.status(clientStatus).json({
      error: 'provider_error',
      status: upstreamStatus,
      message: 'Spoonacular meldete einen Fehler.',
    });
  }
  if (result.error === 'recipe_unavailable') {
    logEvent('response_rejected', { reason: 'recipe_unavailable', ms: Date.now() - startedAt, flow });
    return res.status(502).json({ error: 'recipe_unavailable' });
  }
  logEvent('response_rejected', { reason: result.error || 'unknown', detail: result.reason || '', ms: Date.now() - startedAt, flow });
  return res.status(502).json({ error: 'recipe_unavailable' });
}

// Spoonacular: Textsuche (complexSearch)
app.get('/api/recipes/search', limiter, async (req, res) => {
  const startedAt = Date.now();
  if (!SPOONACULAR_CONFIGURED) {
    return res.status(500).json({ error: 'server_not_configured' });
  }
  const q = String(req.query.q || req.query.query || '').trim();
  const includeIngredients = String(req.query.includeIngredients || '').trim();
  if (!q && !includeIngredients) {
    return res.status(400).json({ error: 'invalid_payload', message: 'Parameter q oder includeIngredients erforderlich.' });
  }

  const result = await spoonacular.searchRecipes({
    query: q,
    number: req.query.number,
    offset: req.query.offset,
    cuisine: req.query.cuisine,
    diet: req.query.diet,
    intolerances: req.query.intolerances,
    type: req.query.type,
    includeIngredients,
    excludeIngredients: req.query.excludeIngredients,
    maxReadyTime: req.query.maxReadyTime,
  }, { timeoutMs: Math.min(REQUEST_TIMEOUT_MS, 20000) });

  if (result.error) return mapSpoonacularError(result, res, startedAt, 'recipes-search');
  console.log(`[recipes/search] OK q="${q.slice(0, 40)}" results=${result.data.results.length} ms=${Date.now() - startedAt}`);
  return res.status(200).json(result.data);
});

// Spoonacular: Suche anhand vorhandener Zutaten
app.get('/api/recipes/by-ingredients', limiter, async (req, res) => {
  const startedAt = Date.now();
  if (!SPOONACULAR_CONFIGURED) {
    return res.status(500).json({ error: 'server_not_configured' });
  }
  const ingredients = String(req.query.ingredients || req.query.q || '').trim();
  if (!ingredients) {
    return res.status(400).json({ error: 'invalid_payload', message: 'Parameter ingredients erforderlich.' });
  }

  const result = await spoonacular.findByIngredients(ingredients, {
    number: req.query.number,
    timeoutMs: Math.min(REQUEST_TIMEOUT_MS, 20000),
  });

  if (result.error) return mapSpoonacularError(result, res, startedAt, 'recipes-by-ingredients');
  console.log(`[recipes/by-ingredients] OK ingredients="${ingredients.slice(0, 60)}" results=${result.data.results.length} ms=${Date.now() - startedAt}`);
  return res.status(200).json(result.data);
});

// Spoonacular: Rezeptdetail im LabPlate-Format
app.get('/api/recipes/:id', limiter, async (req, res) => {
  const startedAt = Date.now();
  if (!SPOONACULAR_CONFIGURED) {
    return res.status(500).json({ error: 'server_not_configured' });
  }
  const id = String(req.params.id || '').trim();
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'invalid_payload' });
  }

  const result = await spoonacular.getRecipeById(id, {
    includeNutrition: req.query.includeNutrition,
    timeoutMs: Math.min(REQUEST_TIMEOUT_MS, 25000),
  });

  if (result.error) return mapSpoonacularError(result, res, startedAt, 'recipes-detail');
  console.log(`[recipes/${id}] OK title="${(result.data.title || '').slice(0, 40)}" ingredients=${result.data.ingredients.length} steps=${result.data.steps.length} ms=${Date.now() - startedAt}`);
  return res.status(200).json(result.data);
});

function mapThemealdbError(result, res, startedAt, flow) {
  if (result.error === 'server_not_configured') {
    logEvent('request_rejected', { reason: 'themealdb_not_configured', flow });
    return res.status(500).json({ error: 'server_not_configured' });
  }
  if (result.error === 'invalid_payload') {
    return res.status(400).json({ error: 'invalid_payload' });
  }
  if (result.error === 'not_found') {
    return res.status(404).json({ error: 'not_found' });
  }
  if (result.error === 'provider_error') {
    const upstreamStatus = Number(result.status) || 0;
    logEvent('themealdb_http_error', {
      status: upstreamStatus,
      body: result.body,
      ms: Date.now() - startedAt,
      flow,
    });
    return res.status(502).json({
      error: 'provider_error',
      status: upstreamStatus,
      message: 'TheMealDB meldete einen Fehler.',
    });
  }
  if (result.error === 'recipe_unavailable') {
    logEvent('response_rejected', { reason: 'recipe_unavailable', ms: Date.now() - startedAt, flow });
    return res.status(502).json({ error: 'recipe_unavailable' });
  }
  logEvent('response_rejected', { reason: result.error || 'unknown', detail: result.reason || '', ms: Date.now() - startedAt, flow });
  return res.status(502).json({ error: 'recipe_unavailable' });
}

// TheMealDB: Rezept per ID
app.get('/api/themealdb/meal/:id', limiter, async (req, res) => {
  const startedAt = Date.now();
  if (!THEMEALDB_CONFIGURED) {
    return res.status(500).json({ error: 'server_not_configured' });
  }
  const result = await themealdb.getMealById(req.params.id, {
    timeoutMs: Math.min(REQUEST_TIMEOUT_MS, 20000),
  });
  if (result.error) return mapThemealdbError(result, res, startedAt, 'themealdb-meal');
  console.log(`[themealdb/meal/${req.params.id}] OK title="${(result.data.title || '').slice(0, 40)}" ingredients=${result.data.ingredients.length} steps=${result.data.steps.length} ms=${Date.now() - startedAt}`);
  return res.status(200).json(result.data);
});

// TheMealDB: nach Kategorie (z.B. Seafood, Vegetarian, Dessert)
app.get('/api/themealdb/category/:name', limiter, async (req, res) => {
  const startedAt = Date.now();
  if (!THEMEALDB_CONFIGURED) {
    return res.status(500).json({ error: 'server_not_configured' });
  }
  const result = await themealdb.getMealsByCategory(req.params.name, {
    timeoutMs: Math.min(REQUEST_TIMEOUT_MS, 20000),
  });
  if (result.error) return mapThemealdbError(result, res, startedAt, 'themealdb-category');
  console.log(`[themealdb/category] OK name="${result.data.category}" results=${result.data.results.length} ms=${Date.now() - startedAt}`);
  return res.status(200).json(result.data);
});

// TheMealDB: nach Land/Region (z.B. Italian, Japanese, Mexican)
app.get('/api/themealdb/area/:name', limiter, async (req, res) => {
  const startedAt = Date.now();
  if (!THEMEALDB_CONFIGURED) {
    return res.status(500).json({ error: 'server_not_configured' });
  }
  const result = await themealdb.getMealsByArea(req.params.name, {
    timeoutMs: Math.min(REQUEST_TIMEOUT_MS, 20000),
  });
  if (result.error) return mapThemealdbError(result, res, startedAt, 'themealdb-area');
  console.log(`[themealdb/area] OK name="${result.data.area}" results=${result.data.results.length} ms=${Date.now() - startedAt}`);
  return res.status(200).json(result.data);
});

// TheMealDB: Zufallsrezept
app.get('/api/themealdb/random', limiter, async (req, res) => {
  const startedAt = Date.now();
  if (!THEMEALDB_CONFIGURED) {
    return res.status(500).json({ error: 'server_not_configured' });
  }
  const result = await themealdb.getRandomMeal({
    timeoutMs: Math.min(REQUEST_TIMEOUT_MS, 20000),
  });
  if (result.error) return mapThemealdbError(result, res, startedAt, 'themealdb-random');
  console.log(`[themealdb/random] OK title="${(result.data.title || '').slice(0, 40)}" id=${result.data.id} ms=${Date.now() - startedAt}`);
  return res.status(200).json(result.data);
});

function mapUsdaError(result, res, startedAt, flow) {
  if (result.error === 'server_not_configured') {
    logEvent('request_rejected', { reason: 'usda_not_configured', flow });
    return res.status(500).json({ error: 'server_not_configured' });
  }
  if (result.error === 'invalid_payload') {
    return res.status(400).json({ error: 'invalid_payload' });
  }
  if (result.error === 'not_found') {
    return res.status(404).json({ error: 'not_found' });
  }
  if (result.error === 'provider_error') {
    const upstreamStatus = Number(result.status) || 0;
    logEvent('usda_http_error', {
      status: upstreamStatus,
      body: result.body,
      ms: Date.now() - startedAt,
      flow,
    });
    return res.status(502).json({
      error: 'provider_error',
      status: upstreamStatus,
      message: 'USDA FoodData Central meldete einen Fehler.',
    });
  }
  logEvent('response_rejected', { reason: result.error || 'unknown', detail: result.reason || '', ms: Date.now() - startedAt, flow });
  return res.status(502).json({ error: 'food_unavailable' });
}

// USDA: Lebensmittelsuche
app.get('/api/usda/search', limiter, async (req, res) => {
  const startedAt = Date.now();
  if (!USDA_CONFIGURED) {
    return res.status(500).json({ error: 'server_not_configured' });
  }
  const q = String(req.query.q || req.query.query || '').trim();
  if (!q) {
    return res.status(400).json({ error: 'invalid_payload', message: 'Parameter q erforderlich.' });
  }

  const result = await usda.searchFood(q, {
    pageSize: req.query.pageSize || req.query.number,
    pageNumber: req.query.pageNumber || req.query.page,
    dataType: req.query.dataType,
    timeoutMs: Math.min(REQUEST_TIMEOUT_MS, 20000),
  });

  if (result.error) return mapUsdaError(result, res, startedAt, 'usda-search');
  console.log(`[usda/search] OK q="${q.slice(0, 40)}" results=${result.data.results.length} total=${result.data.totalHits} ms=${Date.now() - startedAt}`);
  return res.status(200).json(result.data);
});

// USDA: Naehrwert-Detail (normalisiert)
app.get('/api/usda/food/:fdcId', limiter, async (req, res) => {
  const startedAt = Date.now();
  if (!USDA_CONFIGURED) {
    return res.status(500).json({ error: 'server_not_configured' });
  }
  const fdcId = String(req.params.fdcId || '').trim();
  if (!/^\d+$/.test(fdcId)) {
    return res.status(400).json({ error: 'invalid_payload' });
  }

  const result = await usda.getFoodDetails(fdcId, {
    timeoutMs: Math.min(REQUEST_TIMEOUT_MS, 20000),
  });

  if (result.error) return mapUsdaError(result, res, startedAt, 'usda-food');
  console.log(`[usda/food/${fdcId}] OK name="${(result.data.name || '').slice(0, 40)}" kcal=${result.data.calories} ms=${Date.now() - startedAt}`);
  return res.status(200).json(result.data);
});

function mapCoachError(result, res, startedAt, flow) {
  if (result.error === 'invalid_payload') {
    return res.status(400).json({ error: 'invalid_payload' });
  }
  logEvent('response_rejected', { reason: result.error || 'unknown', ms: Date.now() - startedAt, flow });
  return res.status(502).json({ error: result.error || 'coach_unavailable' });
}

// Coach: Rezept analysieren (Spoonacular/TheMealDB + optional USDA)
app.post('/api/coach/analyze-recipe', limiter, async (req, res) => {
  const startedAt = Date.now();
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const recipe = body.recipe || body;
  if (!recipe || typeof recipe !== 'object') {
    return res.status(400).json({ error: 'invalid_payload' });
  }
  const enrichUsda = body.enrichUsda !== false && body.enrich_usda !== false;
  const result = await coachLogic.analyzeRecipe(recipe, {
    enrichUsda,
    timeoutMs: Math.min(REQUEST_TIMEOUT_MS, 20000),
  });
  if (result.error) return mapCoachError(result, res, startedAt, 'coach-analyze-recipe');
  console.log(`[coach/analyze-recipe] OK title="${(result.data.recipe.title || '').slice(0, 40)}" score=${result.data.healthScore} kcal/serving=${result.data.perServing.calories} ms=${Date.now() - startedAt}`);
  return res.status(200).json(result.data);
});

// Coach: Zutaten analysieren (USDA normalizeNutrition / Coach-Format)
app.post('/api/coach/analyze-ingredients', limiter, (req, res) => {
  const startedAt = Date.now();
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const ingredients = body.ingredients || body;
  const result = coachLogic.analyzeIngredients(ingredients);
  if (result.error) return mapCoachError(result, res, startedAt, 'coach-analyze-ingredients');
  console.log(`[coach/analyze-ingredients] OK count=${result.data.count} kcal=${result.data.totals.calories} ms=${Date.now() - startedAt}`);
  return res.status(200).json(result.data);
});

// Coach: Tagesplan aus Zielen
app.post('/api/coach/daily-plan', limiter, (req, res) => {
  const startedAt = Date.now();
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const targets = body.targets || body;
  const result = coachLogic.generateDailyPlan(targets);
  if (result.error) return mapCoachError(result, res, startedAt, 'coach-daily-plan');
  console.log(`[coach/daily-plan] OK kcal=${result.data.targets.calories} meals=${result.data.meals.length} ms=${Date.now() - startedAt}`);
  return res.status(200).json(result.data);
});

// Coach: gesündere Alternativen
app.post('/api/coach/alternatives', limiter, async (req, res) => {
  const startedAt = Date.now();
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const ingredient = body.ingredient != null ? body.ingredient : body.name;
  if (ingredient == null || ingredient === '') {
    return res.status(400).json({ error: 'invalid_payload', message: 'ingredient erforderlich.' });
  }
  const result = await coachLogic.suggestAlternatives(ingredient, {
    enrichUsda: body.enrichUsda !== false && body.enrich_usda !== false,
    timeoutMs: Math.min(REQUEST_TIMEOUT_MS, 15000),
  });
  if (result.error) return mapCoachError(result, res, startedAt, 'coach-alternatives');
  console.log(`[coach/alternatives] OK ingredient="${String(result.data.ingredient).slice(0, 40)}" n=${result.data.suggestions.length} ms=${Date.now() - startedAt}`);
  return res.status(200).json(result.data);
});

// Phase 3 Korrektur: Coach → Koch Intent-Router (kein Rezept, nur Handoff-JSON).
// Client orchestriert Overlay-Wechsel; Koch erhält brief via ai_instruction an /api/nutri-recipe.
app.post('/api/team-coach-route', limiter, (req, res) => {
  const startedAt = Date.now();
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const teamAi = body.team_ai !== false && body.teamAi !== false;
  const text = String(body.text || body.message || body.prompt || '').trim();
  if (!text) {
    return res.status(400).json({ error: 'invalid_payload' });
  }
  if (!teamAi) {
    console.log(`[team-coach-route] FLAG_OFF ms=${Date.now() - startedAt}`);
    return res.status(200).json({ handoff: null, reason: 'team_ai_off' });
  }
  const early = coachCore.tryRezeptHandoffEarly({ text, team_ai: true });
  if (early && early.handoff && early.handoff.to === 'koch') {
    console.log(`[team-coach-route] HANDOFF_KOCH reason=${early.handoff.reason} ms=${Date.now() - startedAt}`);
    return res.status(200).json(early);
  }
  const route = teamRouter.detectCoachRouteIntent(text);
  if (route && route.to === 'coach') {
    console.log(`[team-coach-route] STAY_COACH emotion ms=${Date.now() - startedAt}`);
    return res.status(200).json({ handoff: null, reason: 'emotion_stay' });
  }
  if (route && (route.to === 'supplement' || route.to === 'einkauf')) {
    const h = teamRouter.buildCoachHandoffFromIntent(text, route);
    console.log(`[team-coach-route] HANDOFF_${route.to.toUpperCase()} ms=${Date.now() - startedAt}`);
    return res.status(200).json({ handoff: h });
  }
  console.log(`[team-coach-route] NONE ms=${Date.now() - startedAt}`);
  return res.status(200).json({ handoff: null, reason: 'no_route' });
});

// Phase 3: Supplement- / Einkaufs-Coach (Shared Context + Handoff-Brief vom Mental-Coach).
app.post('/api/team-colleague', limiter, async (req, res) => {
  const startedAt = Date.now();
  if (!GROQ_API_KEY) {
    logEvent('request_rejected', { reason: 'server_not_configured' });
    return res.status(500).json({ error: 'server_not_configured' });
  }
  const payload = teamRouter.validateIncomingColleague(req.body);
  if (!payload) {
    logEvent('request_rejected', { reason: 'invalid_colleague_payload' });
    return res.status(400).json({ error: 'invalid_payload' });
  }

  // Exakter Agent-Name "supplement" → nutri-supplement-core (kein Medizin-Fallback).
  if (payload.agent === 'supplement') {
    console.log(`[team-colleague] runSupplementCoach brief_chars=${payload.handoffBrief.length}`);
    try {
      const advice = await teamRouter.runSupplementCoach(payload.handoffBrief, payload, core.callGroq, {
        apiKey: GROQ_API_KEY,
        timeoutMs: Math.min(REQUEST_TIMEOUT_MS, 25000),
        model: GROQ_MODEL,
      });
      console.log(`[team-colleague] OK agent=supplement type=${advice && advice.type} ms=${Date.now() - startedAt}`);
      return res.status(200).json(advice);
    } catch (err) {
      logEvent('response_rejected', { reason: 'supplement_coach_error', ms: Date.now() - startedAt });
      const fallback = teamRouter.supplementCore.buildSupplementOrientationFallback(payload.text, payload.handoffBrief);
      return res.status(200).json(fallback);
    }
  }

  // Intent-Guardrails für Einkauf – Emotion bleibt beim Coach.
  const route = teamRouter.detectCoachRouteIntent(payload.text);
  if (route && route.to === 'coach' && route.kind === 'emotion') {
    console.log(`[team-colleague] EMOTION_BOUNCE agent=${payload.agent} ms=${Date.now() - startedAt}`);
    return res.status(200).json({
      type: 'advice',
      summary: 'Das klingt eher nach einer belastenden Situation als nach einer Fachfrage.',
      details: 'Dafür ist der Mental- & Verhaltencoach besser geeignet – ich ersetze kein Coaching.',
      next_step: 'Wenn du möchtest, leite ich dich zu meinem Kollegen, dem Mental-Coach, weiter.',
      items: [],
      handoff: { to: 'coach', reason: 'intent_routing', brief: teamRouter.truncateTeamBrief(payload.text, 400) },
    });
  }

  const requestBody = teamRouter.buildColleagueGroqRequest(payload.agent, payload.text, {
    model: GROQ_MODEL,
    lang: payload.lang,
    handoffBrief: payload.handoffBrief,
    userSlice: payload.userSlice,
    history: payload.history,
  });
  console.log(`[team-colleague] agent=${payload.agent} lang=${payload.lang} brief_chars=${payload.handoffBrief.length}`);

  const result = await core.callGroq(requestBody, { apiKey: GROQ_API_KEY, timeoutMs: Math.min(REQUEST_TIMEOUT_MS, 25000) });
  if (result.error === 'provider_error') {
    const upstreamStatus = Number(result.status) || 0;
    logEvent('groq_http_error', { status: upstreamStatus, model: GROQ_MODEL, body: result.body, ms: Date.now() - startedAt, flow: 'team-colleague' });
    return res.status(upstreamStatus === 400 ? 400 : 502).json({ error: 'provider_error', status: upstreamStatus });
  }
  if (result.error) {
    logEvent('response_rejected', { reason: result.error, ms: Date.now() - startedAt, flow: 'team-colleague' });
    return res.status(502).json({ error: 'colleague_unavailable' });
  }

  const advice = teamRouter.validateColleagueResponse(result.data, payload.agent);
  if (!advice) {
    logEvent('response_rejected', { reason: 'invalid_colleague_schema', ms: Date.now() - startedAt, flow: 'team-colleague' });
    return res.status(502).json({ error: 'colleague_unavailable' });
  }
  console.log(`[team-colleague] OK agent=${payload.agent} type=${advice.type} ms=${Date.now() - startedAt}`);
  return res.status(200).json(advice);
});

/**
 * Vision-Check: zeigt das Bild ein fertig zubereitetes, serviertes Gericht?
 * Body: { imageUrl, dishTitle } → { isValidDishPhoto, reason }
 * Technische Fehler → HTTP 200 Fail-open (vision-check-failed-open).
 */
app.get('/api/photo/verify', photoVerify.handlePhotoVerifyGet);
app.post('/api/photo/verify', limiter, photoVerify.handlePhotoVerify);

app.post('/api/nutri-recipe', limiter, async (req, res) => {
  const startedAt = Date.now();
  const auth = resolveGroqAuth(req.body);
  if (auth.keyType === 'prod' && !GROQ_API_KEY) {
    logEvent('request_rejected', { reason: 'server_not_configured', keyType: 'prod' });
    return res.status(500).json({ error: 'server_not_configured' });
  }
  if (auth.keyType === 'debug' && !auth.keyConfigured) {
    logEvent('request_rejected', { reason: 'debug_key_not_configured', keyType: 'debug' });
    return res.status(503).json({
      error: 'debug_key_not_configured',
      message: 'GROQ_API_KEY_DEBUG ist nicht gesetzt. Debug-Requests verbrauchen absichtlich nicht den Prod-Key.',
      key_type: 'debug',
    });
  }

  const payload = core.validateIncoming(req.body);
  if (!payload) {
    logEvent('request_rejected', { reason: 'invalid_payload' });
    return res.status(400).json({ error: 'invalid_payload' });
  }

  // Phase 2 KI-Team: emotionale Blockade → Handoff an Coach (String-Match, kein Groq).
  const earlyHandoff = core.tryEmotionalHandoffEarly(payload);
  if (earlyHandoff && earlyHandoff.handoff) {
    console.log(`[nutri-recipe] HANDOFF_COACH early reason=${earlyHandoff.handoff.reason} ms=${Date.now() - startedAt}`);
    return res.status(200).json(earlyHandoff);
  }

  const flow = resolveRecipeFlow(req.body, payload);
  const recipeModel = resolveRecipeModel(req.body);
  const n = payload.pantry_ingredients.length;
  if (payload.structured || flow === 'coach' || flow === 'nutri-coach' || flow === 'core') {
    console.log(`[nutri-recipe] ENRICH flow=${flow} model=${recipeModel} key=${auth.keyType} ingredients=${n} lang=${payload.lang} instruction_chars=${payload.ai_instruction.length}`);
  } else {
    console.log(`[nutri-recipe] GENERATE flow=${flow} model=${recipeModel} key=${auth.keyType} mode=${payload.mode} pantry=${n}`);
  }

  const requestBody = buildRecipeRequest(flow, payload, recipeModel);

  // Generativ (nicht structured/coach): v9.2 Validierung + Retry (max 3)
  const useV92Pipeline = !payload.structured && flow !== 'coach' && flow !== 'nutri-coach' && flow !== 'core';
  if (useV92Pipeline) {
    const pipelineResult = await core.generateValidatedRecipe({
      payload: payload,
      groqOpts: { apiKey: auth.apiKey, timeoutMs: REQUEST_TIMEOUT_MS },
      callGroq: core.callGroq,
      buildRequestBody: function (p) {
        return buildRecipeRequest(flow, p, recipeModel);
      },
    });

    if (pipelineResult.error === 'provider_error') {
      const upstreamStatus = Number(pipelineResult.status) || 0;
      const clientStatus = upstreamStatus === 400 ? 400 : 502;
      logEvent('groq_http_error', {
        status: upstreamStatus,
        model: recipeModel,
        keyType: auth.keyType,
        keyFingerprint: auth.keyFingerprint,
        body: pipelineResult.body,
        headers: pipelineResult.headers || null,
        ms: Date.now() - startedAt,
        clientStatus,
        flow,
        v92: true,
      });
      const errPayload = {
        error: 'provider_error',
        status: upstreamStatus,
        message: core.providerErrorClientMessage(upstreamStatus, pipelineResult.body, pipelineResult.headers),
        model: recipeModel,
        key_type: auth.keyType,
        key_fingerprint: auth.keyFingerprint,
      };
      if (upstreamStatus === 429) {
        errPayload.provider_headers = pipelineResult.headers || {};
        errPayload.provider_body = pipelineResult.body || '';
        errPayload.rate_limit_kind = pipelineResult.rateLimitKind ||
          core.classifyGroqRateLimit(pipelineResult.body, pipelineResult.headers);
        try {
          errPayload.provider_body_json = JSON.parse(pipelineResult.body);
        } catch (e) { /* raw string bleibt in provider_body */ }
      }
      return res.status(clientStatus).json(errPayload);
    }
    if (pipelineResult.error === 'validation_exhausted') {
      logEvent('response_rejected', {
        reason: 'validation_exhausted',
        errors: pipelineResult.errors,
        attempts: pipelineResult.attempts,
        ms: Date.now() - startedAt,
        flow,
        keyType: auth.keyType,
      });
      const exhaustedBody = {
        error: 'recipe_validation_failed',
        attempts: pipelineResult.attempts,
        errors: pipelineResult.errors || [],
        flow: flow,
        useV92Pipeline: true,
        model: recipeModel,
        key_type: auth.keyType,
        key_fingerprint: auth.keyFingerprint,
      };
      if (req.body && req.body.debug_v92_raw === true) {
        exhaustedBody.debug_v92 = {
          model: recipeModel,
          key_type: auth.keyType,
          key_fingerprint: auth.keyFingerprint,
          attempt_raws: (pipelineResult.attempt_raws || []).map(function (a) {
            return {
              attempt: a.attempt,
              step_contents: (a.raw && a.raw.steps || []).map(function (s, i) {
                return { i: i + 1, title: s && s.title, content: s && s.content };
              }),
              ingredients: (a.raw && a.raw.ingredients || []).map(function (ing) {
                return {
                  id: ing && ing.id,
                  name: ing && ing.name,
                  amount: ing && ing.amount,
                  unit: ing && ing.unit,
                  protein_source: !!(ing && ing.protein_source),
                };
              }),
            };
          }),
        };
      }
      return res.status(422).json(exhaustedBody);
    }
    if (pipelineResult.error) {
      logEvent('response_rejected', { reason: pipelineResult.error, detail: pipelineResult.reason || pipelineResult.body || '', ms: Date.now() - startedAt, flow, keyType: auth.keyType });
      return res.status(502).json({ error: 'recipe_unavailable', key_type: auth.keyType });
    }

    // Handoff-Sentinel in Raw-JSON?
    if (!payload.structured && payload.team_ai !== false && pipelineResult.raw) {
      const userText = (payload.pantry_ingredients || []).join(' ');
      const modelHandoff = core.extractHandoffFromParsed(pipelineResult.raw, userText);
      if (modelHandoff) {
        console.log(`[nutri-recipe] HANDOFF_COACH model reason=${modelHandoff.reason} ms=${Date.now() - startedAt}`);
        return res.status(200).json({ handoff: modelHandoff });
      }
    }

    if (!pipelineResult.recipe) {
      logEvent('response_rejected', { reason: 'invalid_or_missing_schema', ms: Date.now() - startedAt, flow });
      return res.status(502).json({ error: 'recipe_unavailable' });
    }

    const recipe = pipelineResult.recipe;
    console.log(`[nutri-recipe] OK flow=${flow} v92 attempts=${pipelineResult.attempts} model=${recipeModel} key=${auth.keyType} ingredients=${recipe.ingredients.length} steps=${recipe.steps.length} ms=${Date.now() - startedAt}`);
    if (req.body && req.body.debug_v92_raw === true) {
      recipe._debug_v92 = {
        flow: flow,
        useV92Pipeline: true,
        model: recipeModel,
        key_type: auth.keyType,
        key_fingerprint: auth.keyFingerprint,
        attempts: pipelineResult.attempts,
        attempt_raws: (pipelineResult.attempt_raws || []).map(function (a) {
          return {
            attempt: a.attempt,
            step_contents: (a.raw && a.raw.steps || []).map(function (s, i) {
              return { i: i + 1, title: s && s.title, content: s && s.content };
            }),
            ingredients: (a.raw && a.raw.ingredients || []).map(function (ing) {
              return {
                id: ing && ing.id,
                name: ing && ing.name,
                amount: ing && ing.amount,
                unit: ing && ing.unit,
                protein_source: !!(ing && ing.protein_source),
              };
            }),
          };
        }),
      };
    }
    return res.status(200).json(recipe);
  }

  const result = await core.callGroq(requestBody, { apiKey: auth.apiKey, timeoutMs: REQUEST_TIMEOUT_MS });

  if (result.error === 'provider_error') {
    const upstreamStatus = Number(result.status) || 0;
    // Schema-/Validierungsfehler (HTTP 400): an Client als 400 durchreichen – kein 502,
    // damit Chat-Retries denselben kaputten Request nicht 3× wiederholen.
    const clientStatus = upstreamStatus === 400 ? 400 : 502;
    logEvent('groq_http_error', {
      status: upstreamStatus,
      model: recipeModel,
      keyType: auth.keyType,
      keyFingerprint: auth.keyFingerprint,
      body: result.body,
      headers: result.headers || null,
      ms: Date.now() - startedAt,
      clientStatus,
      flow,
    });
    const errPayload = {
      error: 'provider_error',
      status: upstreamStatus,
      message: core.providerErrorClientMessage(upstreamStatus, result.body, result.headers),
      model: recipeModel,
      key_type: auth.keyType,
      key_fingerprint: auth.keyFingerprint,
    };
    if (upstreamStatus === 429) {
      errPayload.provider_headers = result.headers || {};
      errPayload.provider_body = result.body || '';
      errPayload.rate_limit_kind = result.rateLimitKind ||
        core.classifyGroqRateLimit(result.body, result.headers);
      try {
        errPayload.provider_body_json = JSON.parse(result.body);
      } catch (e) { /* raw */ }
    }
    return res.status(clientStatus).json(errPayload);
  }
  if (result.error) {
    logEvent('response_rejected', { reason: result.error, detail: result.reason || result.body || '', ms: Date.now() - startedAt, flow });
    return res.status(502).json({ error: 'recipe_unavailable' });
  }

  // Phase 2: LLM-Sentinel / handoff-Feld → Coach statt Rezept.
  if (!payload.structured && payload.team_ai !== false) {
    const userText = (payload.pantry_ingredients || []).join(' ');
    const modelHandoff = core.extractHandoffFromParsed(result.data, userText);
    if (modelHandoff) {
      console.log(`[nutri-recipe] HANDOFF_COACH model reason=${modelHandoff.reason} ms=${Date.now() - startedAt}`);
      return res.status(200).json({ handoff: modelHandoff });
    }
  }

  const effectivePayload = (flow === 'coach' || flow === 'nutri-coach')
    ? Object.assign({}, payload, { structured: true })
    : payload;
  const recipe = core.toClientRecipe(result.data, effectivePayload);
  if (!recipe) {
    logEvent('response_rejected', { reason: 'invalid_or_missing_schema', ms: Date.now() - startedAt, flow });
    return res.status(502).json({ error: 'recipe_unavailable' });
  }

  console.log(`[nutri-recipe] OK flow=${flow} ingredients=${recipe.ingredients.length} steps=${recipe.steps.length} key=${auth.keyType} ms=${Date.now() - startedAt}`);
  return res.status(200).json(recipe);
});

// 1:1-Proxy fuer die KI-Lebensmittelsuche (Client baut den Chat-Completion-Request selbst).
app.post('/api/food-lookup', limiter, async (req, res) => {
  const startedAt = Date.now();
  if (!GROQ_API_KEY) return res.status(500).json({ error: 'server_not_configured' });

  const body = req.body;
  if (!body || typeof body !== 'object' || !Array.isArray(body.messages) || !body.messages.length) {
    return res.status(400).json({ error: 'invalid_payload' });
  }
  const model = typeof body.model === 'string' && FOOD_LOOKUP_ALLOWED_MODELS.has(body.model) ? body.model : GROQ_MODEL;
  const forward = {
    model,
    messages: body.messages.slice(0, 8).map((m) => ({
      role: m && (m.role === 'system' || m.role === 'user' || m.role === 'assistant') ? m.role : 'user',
      content: typeof (m && m.content) === 'string' ? m.content.slice(0, 6000) : '',
    })),
    temperature: Number.isFinite(body.temperature) ? Math.max(0, Math.min(1, body.temperature)) : 0,
    max_tokens: Number.isFinite(body.max_tokens) ? Math.min(2048, Math.max(64, body.max_tokens)) : 1024,
  };
  if (body.response_format && typeof body.response_format === 'object') forward.response_format = body.response_format;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(REQUEST_TIMEOUT_MS, 20000));
  try {
    const upstream = await fetch(core.GROQ_API_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + GROQ_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(forward),
      signal: controller.signal,
    });
    const text = await upstream.text();
    logEvent(upstream.ok ? 'food_lookup_ok' : 'food_lookup_provider_error', { status: upstream.status, model, ms: Date.now() - startedAt });
    res.status(upstream.status).type('application/json').send(text);
  } catch (err) {
    logEvent('food_lookup_failed', { reason: err && err.name ? err.name : 'unknown' });
    res.status(502).json({ error: 'provider_error' });
  } finally {
    clearTimeout(timer);
  }
});

// Test-Frontend: nur index.html aus dem gleichen Ordner (kein static von __dirname,
// damit server.js / .env / package.json nicht oeffentlich werden).
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({ error: 'not_found' });
});

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err && /CORS/.test(err.message || '')) {
    logEvent('request_rejected', { reason: 'cors' });
    return res.status(403).json({ error: 'origin_not_allowed' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'payload_too_large' });
  }
  logEvent('unhandled_error', { reason: 'internal' });
  return res.status(500).json({ error: 'internal_error' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`LabPlate Naehrstoff-Rezepte Backend (Groq, strict schema) laeuft auf Port ${PORT}.`);
  });
}

module.exports = app;
module.exports.handlePhotoVerify = photoVerify.handlePhotoVerify;
module.exports.handlePhotoVerifyGet = photoVerify.handlePhotoVerifyGet;
