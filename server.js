/**
 * LabPlate – Naehrstoff-Rezepte Backend (sicherer Proxy zur Groq API)
 * ==================================================================
 * Zweck: Ein einziger Endpunkt (POST /api/nutri-recipe), der die bereits
 * datenminimierten Angaben aus der LabPlate-App entgegennimmt, sie erneut
 * serverseitig prueft/bereinigt, und dann stellvertretend fuer den Client
 * eine Rezeptidee bei der Groq API anfragt.
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// ---------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------
const PORT = parseInt(process.env.PORT, 10) || 3000;
const GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim();

// Ein gueltiger Groq API-Schluessel beginnt üblicherweise mit "gsk_"
const GROQ_API_KEY_LOOKS_VALID = /^gsk_[A-Za-z0-9]+$/.test(GROQ_API_KEY) || GROQ_API_KEY.length > 20;

function maskedPreview(s) {
  if (!s) return '(leer)';
  if (s.length <= 8) return '*'.repeat(s.length);
  return s.slice(0, 4) + '…' + s.slice(-4) + ' (Laenge ' + s.length + ')';
}

// Aktuelles Standard-Modell von Groq. "llama-3.3-70b-versatile" wurde von
// Groq am 16.08.2026 abgeschaltet (siehe console.groq.com/docs/deprecations)
// - genau das war die Ursache fuer den 404 "model_not_found". Groqs eigene
// Empfehlung als Ersatz ist "openai/gpt-oss-120b". Ueber die Umgebungsvariable
// GROQ_MODEL kannst du jederzeit, ohne Code-Aenderung, ein anderes Modell
// eintragen (z.B. in Render unter "Environment" - Dienst startet automatisch
// neu, kein neuer Deploy noetig).
const GROQ_MODEL = (process.env.GROQ_MODEL || 'openai/gpt-oss-120b').trim();
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Kommagetrennte Liste erlaubter Origins
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'null')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000; // 15 Min.
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX, 10) || 20; // 20 Anfragen / Fenster / IP
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 18000; // 18 Sek.

const MAX_INPUT_LEN = 200;
const MAX_INGREDIENTS = 15;
const MAX_MICRO_GAPS = 20;

// Feste Allowlist der tatsaechlich von LabPlate unterstuetzten Sprachcodes (siehe
// LabPlate.html: die vier Sprachumschalter-Buttons data-lang="de|en|es|it"). Nur diese
// vier Werte werden akzeptiert - alles andere (fehlend, leer, unbekannter Code, o.ae.)
// faellt sicher auf Deutsch zurueck. NICHT eigenmaechtig erweitern, ohne dass die App
// selbst die entsprechende Sprache tatsaechlich unterstuetzt.
const SUPPORTED_LANGS = ['de', 'en', 'es', 'it'];
const DEFAULT_LANG = 'de';
const LANG_NAMES = {
  de: 'Deutsch',
  en: 'Englisch (English)',
  es: 'Spanisch (Español)',
  it: 'Italienisch (Italiano)',
};

if (!GROQ_API_KEY) {
  console.error('[Konfiguration] WARNUNG: GROQ_API_KEY ist nicht gesetzt.');
} else if (!GROQ_API_KEY_LOOKS_VALID) {
  console.error('[Konfiguration] WARNUNG: GROQ_API_KEY hat ein ungewoehnliches Format.');
} else {
  console.log('[Konfiguration] GROQ_API_KEY sieht gueltig aus: ' + maskedPreview(GROQ_API_KEY));
}

// ---------------------------------------------------------------------
// App-Grundgeruest
// ---------------------------------------------------------------------
const app = express();
app.set('trust proxy', 1);

app.use(helmet());
app.use(express.json({ limit: '20kb' }));

function isLocalLoopbackOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
}

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    if (isLocalLoopbackOrigin(origin)) return callback(null, true);
    return callback(new Error('CORS: Origin nicht erlaubt'));
  },
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  maxAge: 600,
};
app.use(cors(corsOptions));

const nutriRecipeLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler(req, res) {
    res.status(429).json({ error: 'rate_limited' });
  },
});

function logEvent(event, fields) {
  const safeFields = fields || {};
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      event,
      ...safeFields,
    })
  );
}

// ---------------------------------------------------------------------
// Validierung & Sanitizing
// ---------------------------------------------------------------------
function sanitizeIngredientText(raw) {
  if (typeof raw !== 'string') return '';
  let t = raw.replace(/<[^>]*>/g, ' ');
  t = t.replace(/[\x00-\x1f\x7f]/g, ' ');
  t = t.replace(/[^\p{L}\p{N}\s,.\-/&()]/gu, '');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function validateAndSanitizeIncomingPayload(body) {
  if (!body || typeof body !== 'object') return null;

  const mode = body.mode === 'pantry' ? 'pantry' : body.mode === 'shopping' ? 'shopping' : null;
  if (!mode) return null;

  // Sprache des Rezeptinhalts: strikt gegen die feste Allowlist geprueft. Ein fehlender
  // oder ungueltiger Wert fuehrt NICHT zu einem Fehler, sondern faellt sicher auf
  // Deutsch zurueck (kein 400 nur wegen eines fehlenden/kaputten lang-Feldes).
  const lang = typeof body.lang === 'string' && SUPPORTED_LANGS.includes(body.lang) ? body.lang : DEFAULT_LANG;

  const rawMacros = body.macros && typeof body.macros === 'object' ? body.macros : {};
  const macroKeys = ['kh_g', 'protein_g', 'fett_g', 'ballaststoffe_g', 'salz_g'];
  const macros = {};
  for (const key of macroKeys) {
    const entry = rawMacros[key];
    if (!entry || typeof entry !== 'object') continue;
    const clean = {};
    if (isFiniteNumber(entry.value)) clean.value = entry.value;
    if (isFiniteNumber(entry.goal)) clean.goal = entry.goal;
    if (isFiniteNumber(entry.goal_min)) clean.goal_min = entry.goal_min;
    if (isFiniteNumber(entry.goal_max)) clean.goal_max = entry.goal_max;
    if (Object.keys(clean).length) macros[key] = clean;
  }

  const rawGaps = Array.isArray(body.micronutrient_gaps) ? body.micronutrient_gaps : [];
  const micronutrientGaps = rawGaps
    .slice(0, MAX_MICRO_GAPS)
    .map((g) => {
      if (!g || typeof g !== 'object') return null;
      if (typeof g.key !== 'string' || typeof g.label !== 'string' || typeof g.unit !== 'string') return null;
      if (!isFiniteNumber(g.percent_of_goal)) return null;
      return {
        key: g.key.slice(0, 60),
        label: g.label.slice(0, 80),
        unit: g.unit.slice(0, 20),
        percent_of_goal: Math.max(0, Math.min(999, Math.round(g.percent_of_goal))),
      };
    })
    .filter(Boolean);

  const result = { mode, macros, micronutrient_gaps: micronutrientGaps, lang };

  if (mode === 'pantry') {
    const rawIngredients = Array.isArray(body.pantry_ingredients) ? body.pantry_ingredients : [];
    const cleaned = rawIngredients
      .slice(0, MAX_INGREDIENTS)
      .map(sanitizeIngredientText)
      .filter(Boolean);
    if (!cleaned.length) return null;

    let joined = cleaned.join(', ');
    if (joined.length > MAX_INPUT_LEN) joined = joined.slice(0, MAX_INPUT_LEN);
    const finalIngredients = joined
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, MAX_INGREDIENTS);
    if (!finalIngredients.length) return null;

    result.pantry_ingredients = finalIngredients;
  }

  return result;
}

function isValidRecipeShape(data) {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.title !== 'string' || !data.title.trim()) return false;
  if (typeof data.servings !== 'number' || !Number.isFinite(data.servings)) return false;
  if (typeof data.prep_time !== 'string') return false;
  if (typeof data.nutrition_note !== 'string') return false;
  if (!Array.isArray(data.ingredients) || !data.ingredients.length) return false;
  // NEU: amount ist jetzt eine reine Zahl (statt freier Text wie "2 EL") plus eine feste
  // Einheit ("g"/"ml") und strukturierte Naehrwerte pro 100g - noetig, damit der Client die
  // Mengen lokal auf die individuellen Makro-Ziele des Nutzers skalieren kann (siehe
  // LabPlate.html: calcRecipeMacrosPerServing/computeLocalRecipeScaleFactor/scaleLocalRecipe).
  // Bei jeder Abweichung greift weiterhin ausschliesslich der feste Fehlerzustand im Client.
  for (const ing of data.ingredients) {
    if (!ing || typeof ing.name !== 'string' || !ing.name.trim()) return false;
    if (typeof ing.amount !== 'number' || !Number.isFinite(ing.amount) || ing.amount <= 0) return false;
    if (ing.unit !== 'g' && ing.unit !== 'ml') return false;
    const m = ing.macrosPer100g;
    if (!m || typeof m !== 'object') return false;
    if (typeof m.netCarbs !== 'number' || !Number.isFinite(m.netCarbs) || m.netCarbs < 0) return false;
    if (typeof m.fat !== 'number' || !Number.isFinite(m.fat) || m.fat < 0) return false;
    if (typeof m.protein !== 'number' || !Number.isFinite(m.protein) || m.protein < 0) return false;
    if (typeof m.fiber !== 'number' || !Number.isFinite(m.fiber) || m.fiber < 0) return false;
    if (ing.status !== 'vorhanden' && ing.status !== 'benoetigt') return false;
  }
  if (!Array.isArray(data.shopping_list) || !data.shopping_list.every((s) => typeof s === 'string')) return false;
  if (!Array.isArray(data.steps) || !data.steps.every((s) => typeof s === 'string')) return false;
  if (data.steps.length < 3 || data.steps.length > 5) return false;
  return true;
}

// ---------------------------------------------------------------------
// System-Prompt & Groq-API Request
// ---------------------------------------------------------------------
// Der System-Prompt haengt jetzt von der (bereits serverseitig gegen die Allowlist
// geprueften) Zielsprache ab: das GESAMTE sichtbare Rezept (title, nutrition_note,
// ingredients[].name, ingredients[].amount, shopping_list, steps) soll strikt in dieser
// Sprache erstellt werden - die JSON-Feldnamen selbst UND der Wert des Feldes "status"
// bleiben dabei IMMER die festen, technischen deutschen Werte "vorhanden"/"benoetigt"
// (siehe isValidRecipeShape weiter unten, das genau diese zwei Werte weiterhin strikt
// erzwingt - unveraendert, unabhaengig von "lang"). Schema, Validierung, Rate-Limits,
// CORS und Fehlerbehandlung bleiben von dieser Aenderung komplett unberuehrt.
function buildSystemPrompt(lang) {
  const langName = LANG_NAMES[lang] || LANG_NAMES[DEFAULT_LANG];
  return `Du bist ein Rezeptassistent innerhalb einer Ernaehrungs-App. Du erhaeltst anonyme, zusammengefasste Tageswerte sowie optional eine Liste vorhandener Zutaten.

Deine einzige Aufgabe: Schlage EINE alltagstaugliche Rezeptidee vor und antworte AUSSCHLIESSLICH als ein einzelnes JSON-Objekt im exakten folgenden Schema:

{
  "title": "String",
  "servings": Number,
  "prep_time": "String (z.B. 20 Min.)",
  "nutrition_note": "String (kurzer sachlicher Hinweis)",
  "ingredients": [
    {
      "name": "String",
      "amount": Number,
      "unit": "g" oder "ml",
      "macrosPer100g": { "netCarbs": Number, "fat": Number, "protein": Number, "fiber": Number },
      "status": "vorhanden" oder "benoetigt"
    }
  ],
  "shopping_list": ["String"],
  "steps": ["String (genau 3 bis 5 Schritte)"]
}

Strikte Regeln:
- Keine medizinischen Diagnosen, Heilversprechen oder Therapiehinweise.
- "nutrition_note" ist eine kurze, sachliche Ernaehrungsbemerkung.
- "steps" enthaelt genau 3 bis 5 kurze Zubereitungsschritte.
- Nutze bei "status" ausschliesslich "vorhanden" oder "benoetigt".
- "amount" ist IMMER eine reine Zahl (kein Text, keine Einheit im Wert selbst, z.B. 150
  statt "150 g" oder "2 EL") - "unit" ist IMMER ausschliesslich "g" (fuer feste/koernige
  Zutaten) oder "ml" (fuer Fluessigkeiten). Rechne uebliche Haushaltsmasse (EL, TL, Stueck,
  Tasse, Prise, ...) selbst in ein realistisches Gramm-/Milliliter-Aequivalent um (z.B. 1 EL
  Oel ≈ 10-15 ml, 1 Ei ≈ 55 g) - gib niemals ein Haushaltsmass direkt als "unit" oder im
  "amount"-Wert aus.
- "macrosPer100g" gibt realistische, geschaetzte Naehrwerte PRO 100 g bzw. 100 ml der
  jeweiligen Zutat an (netCarbs = Netto-Kohlenhydrate in g, fat = Fett in g, protein =
  Protein in g, fiber = Ballaststoffe in g - jeweils pro 100g/100ml). Alle vier Werte sind
  Zahlen >= 0.
- Sprache des Rezeptinhalts: Schreibe ALLE sichtbaren Textinhalte - also "title",
  "nutrition_note", jedes "ingredients[].name", jeden Eintrag in "shopping_list" und jeden
  Eintrag in "steps" - ausschliesslich auf ${langName}. Kein Mischen mit anderen Sprachen in
  diesen Feldern.
- WICHTIGE AUSNAHME von der obigen Sprachregel: Die JSON-Feldnamen selbst (title, servings,
  prep_time, nutrition_note, ingredients, name, amount, unit, macrosPer100g, netCarbs, fat,
  protein, fiber, status, shopping_list, steps) bleiben IMMER exakt diese
  englischen/technischen Bezeichner, der Wert von "unit" bleibt IMMER exakt "g" oder "ml"
  (niemals uebersetzt, z.B. nicht "gramos"/"grammi"), und der Wert des Feldes "status"
  bleibt IMMER exakt "vorhanden" oder "benoetigt" auf Deutsch - unabhaengig von der oben
  gewaehlten Sprache. Diese technischen Werte NIEMALS uebersetzen oder veraendern.
- Antworte AUSSCHLIESSLICH mit dem puren JSON-Objekt. Keine Markdown-Codeblöcke (\`\`\`json ... \`\`\`), kein Text davor oder danach!`;
}

function buildUserMessage(payload) {
  const lines = [];
  lines.push(`Modus: ${payload.mode === 'pantry' ? 'Rezept mit vorhandenen Zutaten' : 'Rezeptidee mit Einkaufsliste'}`);
  if (payload.mode === 'pantry') {
    lines.push(`Vorhandene Zutaten: ${payload.pantry_ingredients.join(', ')}`);
  }
  lines.push('Aggregierte Tages-Makrowerte (Wert / Ziel):');
  lines.push(JSON.stringify(payload.macros));
  if (payload.micronutrient_gaps.length) {
    lines.push('Mikronaehrstoffe unter 70% des Tagesziels:');
    lines.push(JSON.stringify(payload.micronutrient_gaps));
  }
  lines.push('Erstelle jetzt das JSON-Objekt der Rezeptidee.');
  return lines.join('\n');
}

async function requestRecipeFromGroq(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: buildSystemPrompt(payload.lang) },
          { role: 'user', content: buildUserMessage(payload) }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        // openai/gpt-oss-120b ist ein "reasoning"-Modell: es verbraucht einen Teil
        // des Token-Budgets fuer internes Ueberlegen, BEVOR die eigentliche JSON-
        // Antwort geschrieben wird. Ohne diese Einstellung frisst das oft so viel
        // vom max_tokens-Limit, dass die eigentliche JSON-Antwort mitten im Satz
        // abgeschnitten wird (-> "max completion tokens reached" ->
        // invalid_or_missing_schema) UND unnoetig viele Tokens pro Anfrage
        // verbraucht (-> schnelleres Erreichen des 8.000-Tokens-pro-Minute-Limits
        // -> 429). "low" reicht fuer diese einfache Rezept-JSON-Aufgabe voellig.
        reasoning_effort: 'low',
        include_reasoning: false,
        // Etwas hoeher als vorher (1024), da bei "low" reasoning effort fast das
        // gesamte Budget der eigentlichen JSON-Antwort zugutekommt - so bleibt
        // auch bei laengeren Zutatenlisten/Einkaufslisten genug Platz, ohne die
        // TPM-Grenze unnoetig stark zu belasten.
        max_tokens: 1200
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      let bodyPreview = '';
      try {
        const raw = await res.text();
        bodyPreview = raw ? raw.slice(0, 300) : '';
      } catch (e) {
        bodyPreview = '(Antworttext konnte nicht gelesen werden)';
      }
      logEvent('groq_http_error', { status: res.status, model: GROQ_MODEL, body: bodyPreview });
      return { error: 'provider_error', status: res.status, message: bodyPreview };
    }

    const data = await res.json();
    const content = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : null;

    if (!content || !content.trim()) {
      logEvent('groq_empty_response', {});
      return null;
    }

    try {
      return JSON.parse(content);
    } catch (e) {
      logEvent('groq_json_parse_failed', { raw: content.slice(0, 100) });
      return null;
    }
  } catch (err) {
    const safeMessage = err && err.message ? String(err.message).slice(0, 150) : '';
    logEvent('groq_request_failed', { reason: err && err.name ? err.name : 'unknown', detail: safeMessage });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------
// Routen
// ---------------------------------------------------------------------
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    configured: Boolean(GROQ_API_KEY),
    apiKeyLooksValid: GROQ_API_KEY ? GROQ_API_KEY_LOOKS_VALID : null,
    model: GROQ_MODEL,
    provider: 'Groq'
  });
});

app.post('/api/nutri-recipe', nutriRecipeLimiter, async (req, res) => {
  const startedAt = Date.now();

  if (!GROQ_API_KEY) {
    logEvent('request_rejected', { reason: 'server_not_configured' });
    return res.status(500).json({ error: 'server_not_configured' });
  }

  const payload = validateAndSanitizeIncomingPayload(req.body);
  if (!payload) {
    logEvent('request_rejected', { reason: 'invalid_payload' });
    return res.status(400).json({ error: 'invalid_payload' });
  }

  logEvent('request_received', { mode: payload.mode, lang: payload.lang });

  const candidate = await requestRecipeFromGroq(payload);

  // Behandlung von spezifischen Provider-Fehlern (z.B. Modell abgetrennt / 404 / 400)
  if (candidate && candidate.error === 'provider_error') {
    logEvent('response_rejected', { reason: 'provider_error', status: candidate.status, ms: Date.now() - startedAt });
    return res.status(502).json({
      error: 'provider_error',
      status: candidate.status,
      message: 'Der KI-Anbieter meldete einen Fehler. Bitte ueberpruefe das eingestellte Modell.'
    });
  }

  if (!isValidRecipeShape(candidate)) {
    logEvent('response_rejected', { reason: 'invalid_or_missing_schema', ms: Date.now() - startedAt });
    return res.status(502).json({ error: 'recipe_unavailable' });
  }

  const safeResult = {
    title: candidate.title,
    servings: candidate.servings,
    prep_time: candidate.prep_time,
    nutrition_note: candidate.nutrition_note,
    ingredients: candidate.ingredients.map((i) => ({
      name: i.name,
      amount: i.amount,
      unit: i.unit,
      macrosPer100g: {
        netCarbs: i.macrosPer100g.netCarbs,
        fat: i.macrosPer100g.fat,
        protein: i.macrosPer100g.protein,
        fiber: i.macrosPer100g.fiber,
      },
      status: i.status,
    })),
    shopping_list: candidate.shopping_list,
    steps: candidate.steps,
  };

  logEvent('response_ok', { ms: Date.now() - startedAt });
  return res.status(200).json(safeResult);
});

// ============================================================
// NEUE ROUTE /api/food-lookup für die KI-Lebensmittelsuche
// ============================================================
app.post('/api/food-lookup', async (req, res) => {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.error('/api/food-lookup: GROQ_API_KEY ist nicht gesetzt');
      return res.status(500).json({ error: 'server_misconfigured' });
    }

    const { model, response_format, messages, temperature } = req.body || {};
    if (!model || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'invalid_request' });
    }

    const groqRes = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, response_format, messages, temperature }),
    });

    const groqBody = await groqRes.text();
    res.status(groqRes.status);
    res.setHeader('Content-Type', 'application/json');
    res.send(groqBody);
  } catch (err) {
    console.error('/api/food-lookup: Fehler', err);
    res.status(502).json({ error: 'upstream_error' });
  }
});
// ============================================================

app.use((req, res) => {
  res.status(404).json({ error: 'not_found' });
});

app.use((err, req, res, next) => {
  if (err && /CORS/.test(err.message || '')) {
    logEvent('request_rejected', { reason: 'cors' });
    return res.status(403).json({ error: 'origin_not_allowed' });
  }
  logEvent('unhandled_error', { reason: 'internal' });
  return res.status(500).json({ error: 'internal_error' });
});

app.listen(PORT, () => {
  console.log(`LabPlate Naehrstoff-Rezepte Backend (Groq) laeuft auf Port ${PORT}.`);
});

module.exports = app;
