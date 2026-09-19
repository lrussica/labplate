/**
 * LabPlate – Naehrstoff-Rezepte Backend (sicherer Proxy zur Groq API)
 * ==================================================================
 * Endpunkte:
 *   GET  /health
 *   POST /api/nutri-recipe   -> Strict-JSON-Schema (siehe nutri-recipe-core.js → labplate-backend/)
 *      STRUCTURED/Eigenrezept: Inhalt fix, nur Struktur + Naehrwert-Anreicherung
 *      GENERATIV/Freisuche/Shopping: kreativ, Mengen an Tagesziele anpassbar
 *   POST /api/photo/verify  -> Vision-Check: fertiges Gerichtsfoto vs. Rohzutaten/falsches Motiv
 *   POST /api/food-lookup    -> 1:1-Weiterleitung eines Chat-Completion-Requests an Groq
 *
 * FIX "KI laesst Zutaten weg":
 *   - Modell openai/gpt-oss-120b, temperature 0, reasoning_effort "low"
 *   - response_format json_schema strict:true mit einem PFLICHT-Key pro Zutat
 *   - Render-Log: "[nutri-recipe] ENRICH model=… ingredients=N" / "[nutri-recipe] OK ingredients=N steps=M"
 *
 * Render-Env: GROQ_API_KEY (Pflicht), GROQ_MODEL (optional, Standard openai/gpt-oss-120b),
 *             GROQ_VISION_MODEL (optional, Standard qwen/qwen3.6-27b),
 *             ALLOWED_ORIGINS, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX, REQUEST_TIMEOUT_MS
 *   ACHTUNG: Ist GROQ_MODEL in Render noch auf "openai/gpt-oss-20b" gesetzt, muss der
 *   Eintrag geloescht oder auf "openai/gpt-oss-120b" gesetzt werden.
 */

'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const core = require('./nutri-recipe-core');
const strictPrompt = require('./labplate-backend/strict-prompt');
const coachRecipe = require('./labplate-backend/coach-recipe');
const nutriCoach = require('./labplate-backend/nutri-coach');
const recipeSuggestions = require('./labplate-backend/recipe-suggestions');
const { createPhotoVerifyHandlers } = require('./labplate-backend/api/photo-verify');

// ---------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------
const PORT = parseInt(process.env.PORT, 10) || 3000;
const GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim();
const GROQ_API_KEY_LOOKS_VALID = /^gsk_[A-Za-z0-9]+$/.test(GROQ_API_KEY) || GROQ_API_KEY.length > 20;
const GROQ_MODEL = (process.env.GROQ_MODEL || core.DEFAULT_MODEL).trim();

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

function resolveRecipeModel(reqBody) {
  const requested = reqBody && typeof reqBody.groq_model === 'string' ? reqBody.groq_model.trim() : '';
  if (reqBody && reqBody.debug_v92_raw === true && requested && DEBUG_V92_ALLOWED_MODELS.has(requested)) {
    return requested;
  }
  return GROQ_MODEL;
}
const GROQ_VISION_MODEL = (process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b').trim();
const PHOTO_VERIFY_TIMEOUT_MS = Math.min(REQUEST_TIMEOUT_MS, 25000);

function maskedPreview(s) {
  if (!s) return '(leer)';
  if (s.length <= 8) return '*'.repeat(s.length);
  return s.slice(0, 4) + '…' + s.slice(-4) + ' (Laenge ' + s.length + ')';
}

if (!GROQ_API_KEY) {
  console.error('[Konfiguration] WARNUNG: GROQ_API_KEY ist nicht gesetzt.');
} else if (!GROQ_API_KEY_LOOKS_VALID) {
  console.error('[Konfiguration] WARNUNG: GROQ_API_KEY hat ein ungewoehnliches Format.');
} else {
  console.log('[Konfiguration] GROQ_API_KEY sieht gueltig aus: ' + maskedPreview(GROQ_API_KEY));
}
console.log('[Konfiguration] GROQ_MODEL=' + GROQ_MODEL + (GROQ_MODEL !== core.DEFAULT_MODEL ? '  (Hinweis: Standard waere ' + core.DEFAULT_MODEL + ')' : ''));

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
app.use(helmet());
// Eigenrezepte mit ai_instruction (bis 8 kB) + 100 Zutaten passen problemlos in 64 kB.
app.use(express.json({ limit: '64kb' }));

function isLocalLoopbackOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
}

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
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
    model: GROQ_MODEL,
    provider: 'Groq',
    strictSchema: true,
    maxIngredients: core.MAX_INGREDIENTS,
    structuredPromptVersion: STRUCTURED_PROMPT_VERSION,
    structuredPromptOk: STRUCTURED_PROMPT_OK,
    strictPromptActiveInCore: STRICT_CORE_OK,
    strictPromptActiveInCoach: STRICT_COACH_OK,
    strictPromptActiveInSuggestions: STRICT_SUGGESTIONS_OK,
    // Deploy-Marker: Root-Entry hat v9.2-Validierung+Retry (nicht nur Render-Display)
    v92PipelineWired: typeof core.generateValidatedRecipe === 'function',
    recipeSchemaVersion: 'v9.2',
    groq429Diagnostics: true,
  });
});

app.post('/api/nutri-recipe', limiter, async (req, res) => {
  const startedAt = Date.now();
  if (!GROQ_API_KEY) {
    logEvent('request_rejected', { reason: 'server_not_configured' });
    return res.status(500).json({ error: 'server_not_configured' });
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
    console.log(`[nutri-recipe] ENRICH flow=${flow} model=${recipeModel} ingredients=${n} lang=${payload.lang} instruction_chars=${payload.ai_instruction.length}`);
  } else {
    console.log(`[nutri-recipe] GENERATE flow=${flow} model=${recipeModel} mode=${payload.mode} pantry=${n}`);
  }

  const requestBody = buildRecipeRequest(flow, payload, recipeModel);

  // Generativ (nicht structured/coach): v9.2 Validierung + Retry (max 3).
  // Wichtig: Root-Entry muss dieselbe Pipeline wie labplate-backend/server.js nutzen —
  // sonst nur Render-Display (recipe_schema_version) ohne validate/retry/debug_v92_raw.
  const useV92Pipeline = !payload.structured && flow !== 'coach' && flow !== 'nutri-coach' && flow !== 'core';
  if (useV92Pipeline) {
    const pipelineResult = await core.generateValidatedRecipe({
      payload: payload,
      groqOpts: { apiKey: GROQ_API_KEY, timeoutMs: REQUEST_TIMEOUT_MS },
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
        message: upstreamStatus === 400
          ? 'Der KI-Anbieter hat die Antwort wegen Schema-/Validierungsfehler abgelehnt.'
          : 'Der KI-Anbieter meldete einen Fehler. Bitte ueberpruefe das eingestellte Modell.',
        model: recipeModel,
      };
      // Bei 429: voller Groq-Header-/Body-Dump an den Client (Diagnose RPM vs. Tageslimit)
      if (upstreamStatus === 429) {
        errPayload.provider_headers = pipelineResult.headers || {};
        errPayload.provider_body = pipelineResult.body || '';
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
      });
      const exhaustedBody = {
        error: 'recipe_validation_failed',
        attempts: pipelineResult.attempts,
        errors: pipelineResult.errors || [],
        flow: flow,
        useV92Pipeline: true,
        model: recipeModel,
      };
      if (req.body && req.body.debug_v92_raw === true) {
        exhaustedBody.debug_v92 = {
          model: recipeModel,
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
      logEvent('response_rejected', { reason: pipelineResult.error, detail: pipelineResult.reason || pipelineResult.body || '', ms: Date.now() - startedAt, flow });
      return res.status(502).json({ error: 'recipe_unavailable' });
    }

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
    console.log(`[nutri-recipe] OK flow=${flow} v92 attempts=${pipelineResult.attempts} model=${recipeModel} ingredients=${recipe.ingredients.length} steps=${recipe.steps.length} ms=${Date.now() - startedAt}`);
    if (req.body && req.body.debug_v92_raw === true) {
      recipe._debug_v92 = {
        flow: flow,
        useV92Pipeline: true,
        model: recipeModel,
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

  const result = await core.callGroq(requestBody, { apiKey: GROQ_API_KEY, timeoutMs: REQUEST_TIMEOUT_MS });

  if (result.error === 'provider_error') {
    const upstreamStatus = Number(result.status) || 0;
    // Schema-/Validierungsfehler (HTTP 400): an Client als 400 durchreichen – kein 502,
    // damit Chat-Retries denselben kaputten Request nicht 3× wiederholen.
    const clientStatus = upstreamStatus === 400 ? 400 : 502;
    logEvent('groq_http_error', {
      status: upstreamStatus,
      model: recipeModel,
      body: result.body,
      headers: result.headers || null,
      ms: Date.now() - startedAt,
      clientStatus,
      flow,
    });
    const errPayload = {
      error: 'provider_error',
      status: upstreamStatus,
      message: upstreamStatus === 400
        ? 'Der KI-Anbieter hat die Antwort wegen Schema-/Validierungsfehler abgelehnt.'
        : 'Der KI-Anbieter meldete einen Fehler. Bitte ueberpruefe das eingestellte Modell.',
      model: recipeModel,
    };
    if (upstreamStatus === 429) {
      errPayload.provider_headers = result.headers || {};
      errPayload.provider_body = result.body || '';
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

  const effectivePayload = (flow === 'coach' || flow === 'nutri-coach')
    ? Object.assign({}, payload, { structured: true })
    : payload;
  const recipe = core.toClientRecipe(result.data, effectivePayload);
  if (!recipe) {
    logEvent('response_rejected', { reason: 'invalid_or_missing_schema', ms: Date.now() - startedAt, flow });
    return res.status(502).json({ error: 'recipe_unavailable' });
  }

  console.log(`[nutri-recipe] OK flow=${flow} ingredients=${recipe.ingredients.length} steps=${recipe.steps.length} ms=${Date.now() - startedAt}`);
  return res.status(200).json(recipe);
});

// Vision-Check (vor Catch-All). GET → kein 404; POST → { isValidDishPhoto, reason }.
app.get('/api/photo/verify', photoVerify.handlePhotoVerifyGet);
app.post('/api/photo/verify', limiter, photoVerify.handlePhotoVerify);

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
