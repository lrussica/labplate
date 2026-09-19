/**
 * Rezept-Pipeline v9.2 — JSON-Schema mit {ingredient_id}-Platzhaltern,
 * validate_recipe_v2 + Retry, Rendering in den bestehenden Client-Vertrag.
 */
'use strict';

const validator = require('./recipe-validator');

const MAX_VALIDATION_ATTEMPTS = 3;

function stripJsonFences(raw) {
  let s = String(raw == null ? '' : raw).trim();
  if (s.indexOf('```') === 0) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  return s;
}

function parseRecipeJson(raw) {
  const text = stripJsonFences(raw);
  try {
    return { data: JSON.parse(text) };
  } catch (e) {
    return { error: 'json_parse_failed', body: text.slice(0, 200) };
  }
}

/** Groq-strict JSON Schema für generatives v9.2-Output. */
function buildV92GenerativeSchema() {
  const ingredient = {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'name', 'amount', 'unit', 'protein_source', 'netCarbs', 'fat', 'protein', 'fiber'],
    properties: {
      id: { type: 'string', description: 'Vierstellige ID z.B. "0001"' },
      name: { type: 'string' },
      amount: {
        type: 'number',
        description: 'Menge. Eier: Stueckzahl (1,2,…). Gewuerze/Prise: 0. Sonst g/ml-Zahl.',
      },
      unit: {
        type: 'string',
        enum: ['g', 'ml', 'prise', 'messerspitze', 'stk'],
        description: 'Eier: "stk". Salz/Pfeffer: "prise"|"messerspitze". Sonst g|ml.',
      },
      protein_source: { type: 'boolean' },
      netCarbs: { type: 'number', description: 'Netto-KH je 100 g/ml (Eier: je 100 g Ei)' },
      fat: { type: 'number' },
      protein: { type: 'number' },
      fiber: { type: 'number' },
    },
  };
  const step = {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'content', 'stove_level', 'time_min'],
    properties: {
      title: { type: 'string' },
      content: {
        type: 'string',
        description: 'Nur {0001}-Platzhalter fuer Mengen – keine freien g/ml-Zahlen.',
      },
      stove_level: {
        type: 'number',
        description: '1-9 bei Hitze; 0 = kalt (entspricht null / kein Herd).',
      },
      time_min: { type: 'number' },
    },
  };
  return {
    name: 'nutri_recipe_v92',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: [
        'title', 'prep_time_min', 'nutrition', 'diet_labels', 'target_deviation_note',
        'ingredients', 'steps', 'garnish', 'chef_analysis',
      ],
      properties: {
        title: { type: 'string' },
        prep_time_min: { type: 'number' },
        nutrition: {
          type: 'object',
          additionalProperties: false,
          required: ['kcal', 'protein_g', 'fat_g', 'netto_kh_g', 'ballaststoffe_g'],
          properties: {
            kcal: { type: 'number' },
            protein_g: { type: 'number' },
            fat_g: { type: 'number' },
            netto_kh_g: { type: 'number' },
            ballaststoffe_g: { type: 'number' },
          },
        },
        diet_labels: { type: 'array', items: { type: 'string' } },
        target_deviation_note: {
          type: 'string',
          description: 'Leer "" wenn Ziel erreicht; sonst ehrliche Abweichung.',
        },
        ingredients: { type: 'array', items: ingredient },
        steps: { type: 'array', items: step },
        garnish: { type: 'string' },
        chef_analysis: {
          type: 'string',
          description: 'Qualitativ / Platzhalter – keine eigenen g/kcal-Zahlen.',
        },
      },
    },
  };
}

function isEggIngredient(name) {
  const n = String(name || '').toLowerCase();
  return /\bei(er)?\b/.test(n) && n.indexOf('eiweiss') < 0 && n.indexOf('eiweiß') < 0;
}

/**
 * Wandelt v9.2-JSON in den bestehenden Client-Vertrag um
 * (title, prep_time, nutrition_note, garnish, ingredients g|ml, steps strings).
 */
function renderRecipeForDisplay(recipe) {
  if (!recipe || typeof recipe !== 'object') return null;
  const ingredientsIn = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  if (!ingredientsIn.length) return null;

  const byId = {};
  ingredientsIn.forEach(function (ing) {
    if (ing && ing.id) byId[String(ing.id)] = ing;
  });

  const ingredients = ingredientsIn.map(function (ing) {
    const name = String(ing.name || 'Zutat').trim().slice(0, 200);
    let amount = Number(ing.amount);
    let unit = ing.unit;
    if (unit === 'stk' || (unit == null && isEggIngredient(name))) {
      const pieces = Number.isFinite(amount) && amount > 0 ? amount : 1;
      amount = pieces * 60;
      unit = 'g';
      const displayName = pieces === 1
        ? (/\bei\b/i.test(name) ? name : '1 Ei (Größe M, ca. 60 g)')
        : (name.indexOf('Eier') >= 0 ? name : pieces + ' Eier (Größe M, ca. 60 g je)');
      return {
        name: displayName,
        amount: amount,
        unit: 'g',
        status: 'benoetigt',
        macrosPer100g: {
          netCarbs: Math.max(0, Number(ing.netCarbs) || 0),
          fat: Math.max(0, Number(ing.fat) || 0),
          protein: Math.max(0, Number(ing.protein) || 0),
          fiber: Math.max(0, Number(ing.fiber) || 0),
        },
        _v92_id: ing.id,
        _protein_source: !!ing.protein_source,
      };
    }
    if (unit === 'prise' || unit === 'messerspitze') {
      return {
        name: name,
        amount: 0,
        unit: 'g',
        status: 'benoetigt',
        macrosPer100g: { netCarbs: 0, fat: 0, protein: 0, fiber: 0 },
        _v92_id: ing.id,
        _protein_source: !!ing.protein_source,
      };
    }
    if (!Number.isFinite(amount) || amount < 0) amount = 0;
    return {
      name: name,
      amount: amount > 0 ? Math.round(amount * 10) / 10 : 0,
      unit: unit === 'ml' ? 'ml' : 'g',
      status: 'benoetigt',
      macrosPer100g: {
        netCarbs: Math.max(0, Number(ing.netCarbs) || 0),
        fat: Math.max(0, Number(ing.fat) || 0),
        protein: Math.max(0, Number(ing.protein) || 0),
        fiber: Math.max(0, Number(ing.fiber) || 0),
      },
      _v92_id: ing.id,
      _protein_source: !!ing.protein_source,
    };
  });

  const steps = (Array.isArray(recipe.steps) ? recipe.steps : []).map(function (s) {
    if (!s || typeof s !== 'object') return '';
    let content = validator.resolvePlaceholders(s.content || '', byId);
    const parts = [];
    if (s.title) parts.push(String(s.title) + ':');
    if (s.stove_level != null && s.stove_level !== '' && Number(s.stove_level) > 0) {
      parts.push('Stufe ' + s.stove_level + ' von 9.');
    }
    if (s.time_min != null && Number(s.time_min) > 0) {
      parts.push('ca. ' + s.time_min + ' Min.');
    }
    parts.push(content);
    return parts.filter(Boolean).join(' ').trim();
  }).filter(Boolean);

  const prepMin = Number(recipe.prep_time_min) || 0;
  const prep_time = prepMin > 0 ? (prepMin + ' Minuten') : '';
  const garnish = validator.resolvePlaceholders(recipe.garnish || '', byId).slice(0, 400);
  let note = validator.resolvePlaceholders(recipe.chef_analysis || '', byId);
  if (recipe.target_deviation_note) {
    note = (note ? note + ' ' : '') + String(recipe.target_deviation_note);
  }

  const shopping = ingredients.map(function (ing) {
    if (!ing.amount) return ing.name + ' – nicht angegeben';
    return ing.name + ' – ' + ing.amount + ' ' + ing.unit;
  });

  return {
    title: (typeof recipe.title === 'string' && recipe.title.trim())
      ? recipe.title.trim().slice(0, 200)
      : 'Rezept',
    servings: 1,
    prep_time: prep_time.slice(0, 60),
    nutrition_note: note.slice(0, 800),
    garnish: garnish.slice(0, 200),
    self_check: '',
    ingredients: ingredients,
    shopping_list: shopping,
    steps: steps,
    diet_labels: Array.isArray(recipe.diet_labels) ? recipe.diet_labels : [],
    nutrition: recipe.nutrition || null,
    recipe_schema_version: 'v9.2',
  };
}

function logValidationFailure(meta) {
  try {
    console.log('[recipe-v92] validation_failed ' + JSON.stringify({
      prompt_version: 'v9.2',
      attempt: meta.attempt,
      errors: meta.errors,
      warnings: meta.warnings,
    }));
  } catch (e) { /* ignore */ }
}

/**
 * generateValidatedRecipe — LLM → parse → validate_recipe_v2 → retry ≤3 → render.
 * @param {object} opts
 * @param {function} opts.buildRequestBody (payload, attempt, previousErrors?) => groq body
 * @param {function} opts.callGroq (body, groqOpts) => Promise<{data}|{error}>
 * @param {object} opts.payload validated incoming payload
 * @param {object} opts.groqOpts
 */
async function generateValidatedRecipe(opts) {
  const o = opts || {};
  const buildRequestBody = o.buildRequestBody;
  const callGroq = o.callGroq;
  const payload = o.payload;
  const groqOpts = o.groqOpts || {};
  let lastErrors = [];
  let lastWarnings = [];
  let lastRaw = null;

  for (let attempt = 1; attempt <= MAX_VALIDATION_ATTEMPTS; attempt++) {
    const requestBody = buildRequestBody(payload, attempt, lastErrors);
    if (attempt > 1 && lastErrors.length && requestBody && Array.isArray(requestBody.messages)) {
      requestBody.messages = requestBody.messages.concat([{
        role: 'user',
        content: 'Deine letzte Ausgabe hatte folgende Fehler, korrigiere sie und gib erneut NUR valides v9.2-JSON aus:\n- ' +
          lastErrors.join('\n- '),
      }]);
    }

    const result = await callGroq(requestBody, groqOpts);
    if (result.error) {
      return {
        error: result.error,
        status: result.status,
        body: result.body,
        reason: result.reason,
        attempts: attempt,
      };
    }

    let parsed = result.data;
    // Falls callGroq schon geparstes Objekt liefert — ok.
    // Falls Content-String (Tests): parsen.
    if (typeof parsed === 'string') {
      const p = parseRecipeJson(parsed);
      if (p.error) {
        lastErrors = ['JSON-Parse fehlgeschlagen'];
        logValidationFailure({ attempt: attempt, errors: lastErrors, warnings: [] });
        continue;
      }
      parsed = p.data;
    }
    lastRaw = parsed;

    // Emotion-Handoff-Sentinel: nicht validieren, an Caller durchreichen
    if (parsed && parsed.title === '__TEAM_HANDOFF_COACH__') {
      return {
        ok: true,
        recipe: null,
        raw: parsed,
        handoff_sentinel: true,
        attempts: attempt,
      };
    }

    const validation = validator.validateRecipeV2(parsed);
    if (!validation.ok) {
      lastErrors = validation.errors.slice();
      lastWarnings = validation.warnings.slice();
      logValidationFailure({
        attempt: attempt,
        errors: lastErrors,
        warnings: lastWarnings,
      });
      continue;
    }

    const rendered = renderRecipeForDisplay(parsed);
    if (!rendered) {
      lastErrors = ['render_failed'];
      continue;
    }
    return {
      ok: true,
      recipe: rendered,
      raw: parsed,
      warnings: validation.warnings,
      attempts: attempt,
    };
  }

  return {
    error: 'validation_exhausted',
    attempts: MAX_VALIDATION_ATTEMPTS,
    errors: lastErrors,
    warnings: lastWarnings,
    last_raw: lastRaw,
  };
}

module.exports = {
  MAX_VALIDATION_ATTEMPTS: MAX_VALIDATION_ATTEMPTS,
  stripJsonFences: stripJsonFences,
  parseRecipeJson: parseRecipeJson,
  buildV92GenerativeSchema: buildV92GenerativeSchema,
  renderRecipeForDisplay: renderRecipeForDisplay,
  generateValidatedRecipe: generateValidatedRecipe,
};
