/**
 * Prep-Assistent v1 — KI schreibt nur mengenfreie Zubereitungssätze.
 * App besitzt Zutaten, Mengen, Portionen und plannedActions (Datenhoheit).
 * KI-Ausgabe: ausschließlich { steps[{stepNumber, actionId, ingredientIds, instruction}] }
 */
'use strict';

const fs = require('fs');
const path = require('path');

const PREP_PROMPT_VERSION = 'prep_assistant_v1';
const PROMPT_PATH = path.join(__dirname, 'prompts', 'prep-assistant-v1.md');

/** Numerische Mengenangaben / Einheiten in instruction – harte Ablehnung. */
const AMOUNT_IN_TEXT_RE = /\b\d+[.,]?\d*\s*(g|kg|mg|ml|l|el|tl|stk|stück|stueck|prise|prisen|tasse|tassen|becher)\b/i;
const UNIT_GLUED_RE = /\d+\s*(g|kg|mg|ml|l)\s*\S/i;
const SPOKEN_COUNT_RE = /\b(ein|eine|einer|eines|zwei|drei|vier|fünf|fuenf|sechs|sieben|acht|neun|zehn)\s+(ei|eier|zwiebel|zwiebeln|knoblauchzehe|knoblauchzehen|tomate|tomaten)\b/i;

let _promptCache = null;

function loadPrepSystemPrompt(language) {
  if (!_promptCache) {
    _promptCache = fs.readFileSync(PROMPT_PATH, 'utf8');
  }
  const lang = String(language || 'de').trim() || 'de';
  const langName = lang === 'de' ? 'Deutsch'
    : lang === 'en' ? 'English'
      : lang === 'es' ? 'Español'
        : lang === 'it' ? 'Italiano'
          : lang === 'fr' ? 'Français'
            : lang === 'pt' ? 'Português'
              : lang === 'tr' ? 'Türkçe'
                : lang;
  return _promptCache.replace(/\{\{language\}\}/g, langName);
}

function buildPrepOutputSchema() {
  return {
    name: 'prep_assistant_v1',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['steps'],
      properties: {
        steps: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['stepNumber', 'actionId', 'ingredientIds', 'instruction'],
            properties: {
              stepNumber: {
                type: 'integer',
                description: '1-basierte Schrittnummer.',
              },
              actionId: {
                type: 'string',
                description: 'Muss einer plannedActions[].actionId entsprechen.',
              },
              ingredientIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'Nur IDs der zugehörigen Kochaktion.',
              },
              instruction: {
                type: 'string',
                description:
                  'Ein vollständiger Satz ohne Mengen, Einheiten und Zutatenlisten.',
              },
            },
          },
        },
      },
    },
  };
}

function buildPrepAssistantMessages(prepInput) {
  const input = prepInput && typeof prepInput === 'object' ? prepInput : {};
  const lang = input.lang || 'de';
  const system = loadPrepSystemPrompt(lang);
  // Mengen/amount bewusst nicht an die KI senden – nur sprachliche Referenzen.
  const ingredientsForAi = (Array.isArray(input.ingredients) ? input.ingredients : []).map(function (ing) {
    return {
      ingredientId: ing.ingredientId,
      displayName: ing.displayName,
    };
  });
  const actionsForAi = (Array.isArray(input.plannedActions) ? input.plannedActions : []).map(function (a) {
    const out = {
      actionId: a.actionId,
      action: a.action,
      ingredientIds: a.ingredientIds || [],
    };
    if (a.heatLevel != null) out.heatLevel = a.heatLevel;
    if (a.temperature != null) out.temperature = a.temperature;
    if (a.durationSeconds != null) out.durationSeconds = a.durationSeconds;
    if (a.durationMinutes != null) out.durationMinutes = a.durationMinutes;
    return out;
  });
  const userPayload = {
    recipeVersion: input.recipeVersion || PREP_PROMPT_VERSION,
    ingredients: ingredientsForAi,
    plannedActions: actionsForAi,
  };
  const user =
    'Hier ist das Eingabeobjekt. Erzeuge ausschließlich steps mit mengenfreien instructions.\n\n' +
    JSON.stringify(userPayload, null, 2);
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

function buildPrepGroqRequest(prepInput, model) {
  return {
    model: model,
    temperature: 0.2,
    reasoning_effort: 'low',
    max_tokens: 4096,
    response_format: {
      type: 'json_schema',
      json_schema: buildPrepOutputSchema(),
    },
    messages: buildPrepAssistantMessages(prepInput),
  };
}

function parseOptionalNumber(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parsePrepIncoming(body) {
  if (!body || typeof body !== 'object') return null;
  const prepFlag = body.prep_mode === true || body.prep_mode === 1 || body.prep_mode === 'true';
  const hasActions = Array.isArray(body.plannedActions) && body.plannedActions.length > 0;
  const hasTypedIngredients = Array.isArray(body.ingredients) && body.ingredients.some(function (ing) {
    return ing && (ing.ingredientId || ing.id);
  });
  if (!prepFlag && !(hasActions && hasTypedIngredients)) return null;

  const ingredientsRaw = Array.isArray(body.ingredients) ? body.ingredients : [];
  const ingredients = [];
  const seen = {};
  for (let i = 0; i < ingredientsRaw.length && ingredients.length < 100; i++) {
    const src = ingredientsRaw[i];
    if (!src || typeof src !== 'object') continue;
    const ingredientId = String(src.ingredientId || src.id || '').trim();
    if (!ingredientId || seen[ingredientId]) continue;
    seen[ingredientId] = true;
    const displayName = String(src.displayName || src.name || '').trim().slice(0, 200);
    if (!displayName) continue;
    const amount = Number(src.amount);
    const unit = src.unit === 'ml' ? 'ml' : src.unit === 'stk' ? 'stk' : 'g';
    ingredients.push({
      ingredientId: ingredientId,
      displayName: displayName,
      amount: Number.isFinite(amount) ? amount : 0,
      unit: unit,
      status: src.status === 'vorhanden' ? 'vorhanden' : 'benoetigt',
      macrosPer100g: src.macrosPer100g && typeof src.macrosPer100g === 'object'
        ? {
            netCarbs: Math.max(0, Number(src.macrosPer100g.netCarbs) || 0),
            fat: Math.max(0, Number(src.macrosPer100g.fat) || 0),
            protein: Math.max(0, Number(src.macrosPer100g.protein) || 0),
            fiber: Math.max(0, Number(src.macrosPer100g.fiber) || 0),
          }
        : {
            netCarbs: Math.max(0, Number(src.netCarbs) || 0),
            fat: Math.max(0, Number(src.fat) || 0),
            protein: Math.max(0, Number(src.protein) || 0),
            fiber: Math.max(0, Number(src.fiber) || 0),
          },
    });
  }
  if (!ingredients.length) return null;

  const plannedActions = [];
  const actionsRaw = Array.isArray(body.plannedActions) ? body.plannedActions : [];
  for (let i = 0; i < actionsRaw.length && plannedActions.length < 50; i++) {
    const a = actionsRaw[i];
    if (!a || typeof a !== 'object') continue;
    const actionId = String(a.actionId || a.id || ('action_' + (i + 1))).trim().slice(0, 80);
    const action = String(a.action || a.name || a.actionId || '').trim().slice(0, 80);
    if (!actionId || !action) continue;
    const ids = Array.isArray(a.ingredientIds)
      ? a.ingredientIds.map(function (id) { return String(id || '').trim(); }).filter(Boolean)
      : [];
    const entry = {
      actionId: actionId,
      action: action,
      ingredientIds: ids.slice(0, 20),
    };
    const heatLevel = parseOptionalNumber(a.heatLevel);
    const temperature = parseOptionalNumber(a.temperature);
    const durationSeconds = parseOptionalNumber(a.durationSeconds);
    const durationMinutes = parseOptionalNumber(a.durationMinutes);
    if (heatLevel != null) entry.heatLevel = heatLevel;
    if (temperature != null) entry.temperature = temperature;
    if (durationSeconds != null) entry.durationSeconds = durationSeconds;
    if (durationMinutes != null) entry.durationMinutes = durationMinutes;
    plannedActions.push(entry);
  }
  if (!plannedActions.length) return null;

  const lang = typeof body.lang === 'string' && /^[a-z]{2}$/.test(body.lang) ? body.lang : 'de';
  const titleHint = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
  return {
    prep_mode: true,
    lang: lang,
    recipeVersion: String(body.recipeVersion || PREP_PROMPT_VERSION).slice(0, 64),
    baseServings: Number(body.baseServings) > 0 ? Number(body.baseServings) : 1,
    targetServings: Number(body.targetServings) > 0 ? Number(body.targetServings) : 1,
    titleHint: titleHint,
    ingredients: ingredients,
    plannedActions: plannedActions,
    preferences: body.preferences && typeof body.preferences === 'object' ? body.preferences : null,
    constraints: body.constraints && typeof body.constraints === 'object' ? body.constraints : null,
    mode: body.mode === 'shopping' ? 'shopping' : 'pantry',
  };
}

function instructionHasAmount(text) {
  const t = String(text || '');
  return AMOUNT_IN_TEXT_RE.test(t) || UNIT_GLUED_RE.test(t) || SPOKEN_COUNT_RE.test(t);
}

function validatePrepAssistantOutput(parsed, prepInput) {
  const errors = [];
  const warnings = [];
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, errors: ['invalid_json'], warnings: warnings, parsed: null };
  }

  const allowedIngredients = {};
  (prepInput.ingredients || []).forEach(function (ing) {
    allowedIngredients[ing.ingredientId] = ing;
  });

  const allowedActions = {};
  (prepInput.plannedActions || []).forEach(function (a) {
    allowedActions[a.actionId] = a;
  });

  // title/valid/warnings sind nicht mehr Teil des KI-Vertrags; falls geliefert, ignorieren.
  const steps = Array.isArray(parsed.steps) ? parsed.steps : [];
  if (!steps.length) {
    errors.push('steps leer');
  }

  const seenActionIds = {};
  steps.forEach(function (step, i) {
    const label = 'Step ' + (i + 1);
    if (!step || typeof step !== 'object') {
      errors.push(label + ': ungültig');
      return;
    }
    const actionId = String(step.actionId || '').trim();
    const instruction = String(step.instruction || step.text || '').trim();
    const ids = Array.isArray(step.ingredientIds) ? step.ingredientIds : [];
    const stepNumber = Number(step.stepNumber);

    if (!Number.isFinite(stepNumber) || stepNumber < 1) {
      errors.push(label + ': stepNumber fehlt oder ungültig');
    }
    if (!actionId) {
      errors.push(label + ': actionId fehlt');
    } else if (!allowedActions[actionId]) {
      errors.push(label + ': unbekannte actionId "' + actionId + '"');
    } else if (seenActionIds[actionId]) {
      warnings.push(label + ': actionId "' + actionId + '" mehrfach verwendet');
    } else {
      seenActionIds[actionId] = true;
    }
    if (!instruction) errors.push(label + ': instruction fehlt');
    if (!ids.length) errors.push(label + ': ingredientIds leer');

    const actionDef = allowedActions[actionId];
    const actionIngSet = {};
    if (actionDef && Array.isArray(actionDef.ingredientIds)) {
      actionDef.ingredientIds.forEach(function (id) { actionIngSet[id] = true; });
    }

    ids.forEach(function (id) {
      const sid = String(id || '').trim();
      if (!sid || !allowedIngredients[sid]) {
        errors.push(label + ': unbekannte ingredientId "' + sid + '"');
        return;
      }
      if (actionDef && Object.keys(actionIngSet).length && !actionIngSet[sid]) {
        errors.push(label + ': ingredientId "' + sid + '" gehört nicht zu actionId "' + actionId + '"');
      }
    });

    if (instruction && instructionHasAmount(instruction)) {
      errors.push(label + ': instruction enthält Menge/Einheit (verboten): "' + instruction.slice(0, 80) + '"');
    }
  });

  return {
    ok: errors.length === 0,
    errors: errors,
    warnings: warnings,
    parsed: parsed,
  };
}

function deriveTitleFromIngredients(prepInput) {
  if (prepInput.titleHint) return prepInput.titleHint;
  const names = (prepInput.ingredients || []).map(function (ing) {
    return String(ing.displayName || '').trim();
  }).filter(Boolean).slice(0, 3);
  if (!names.length) return 'Rezept';
  if (names.length === 1) return names[0];
  if (names.length === 2) return names[0] + ' mit ' + names[1];
  return names[0] + ' mit ' + names[1] + ' und ' + names[2];
}

function renderPrepClientRecipe(prepInput, aiParsed) {
  const recipeValidator = require('./recipe-validator');
  const ingredients = (prepInput.ingredients || []).map(function (ing) {
    let amount = Number(ing.amount);
    let unit = ing.unit === 'ml' ? 'ml' : 'g';
    let name = ing.displayName;
    if (ing.unit === 'stk') {
      const pieces = Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 1;
      amount = pieces * 60;
      unit = 'g';
      if (!/\bei\b/i.test(name)) {
        name = pieces === 1 ? '1 Ei (Größe M, ca. 60 g)' : pieces + ' Eier (Größe M, ca. 60 g je)';
      }
    }
    if (!Number.isFinite(amount) || amount < 0) amount = 0;
    const m = ing.macrosPer100g || {};
    return {
      name: name,
      amount: amount > 0 ? Math.round(amount * 10) / 10 : 0,
      unit: unit,
      status: ing.status || 'benoetigt',
      macrosPer100g: {
        netCarbs: Math.max(0, Number(m.netCarbs) || 0),
        fat: Math.max(0, Number(m.fat) || 0),
        protein: Math.max(0, Number(m.protein) || 0),
        fiber: Math.max(0, Number(m.fiber) || 0),
      },
      _prep_ingredient_id: ing.ingredientId,
    };
  });

  const sortedSteps = (aiParsed.steps || []).slice().sort(function (a, b) {
    return (Number(a.stepNumber) || 0) - (Number(b.stepNumber) || 0);
  });
  const steps = sortedSteps.map(function (s) {
    return recipeValidator.stripQuantityMentionsFromText(String(s.instruction || s.text || '').trim());
  }).filter(Boolean);

  const shopping = ingredients.map(function (ing) {
    if (!ing.amount) return ing.name + ' – nicht angegeben';
    return ing.name + ' – ' + ing.amount + ' ' + ing.unit;
  });

  let client = {
    title: deriveTitleFromIngredients(prepInput),
    servings: Number(prepInput.sourceServings || prepInput.servings) > 0
      ? Number(prepInput.sourceServings || prepInput.servings)
      : (Number(prepInput.targetServings) > 0 ? Number(prepInput.targetServings) : 1),
    prep_time: '',
    nutrition_note: '',
    garnish: '',
    self_check: '',
    ingredients: ingredients,
    shopping_list: shopping,
    steps: steps,
    diet_labels: [],
    nutrition: null,
    recipe_schema_version: 'prep_v1',
    prep_mode: true,
    valid: true,
    warnings: [],
    prep_steps: sortedSteps.map(function (s) {
      return {
        stepNumber: Number(s.stepNumber) || 0,
        actionId: String(s.actionId || ''),
        ingredientIds: Array.isArray(s.ingredientIds) ? s.ingredientIds.slice() : [],
        instruction: String(s.instruction || s.text || '').trim(),
      };
    }),
  };

  // Prep: App-Mengen sind Final-Mengen, sofern targetServings bereits 1.
  // Wenn sourceServings > targetServings → einmalig portionieren.
  console.log('LIVE_RECIPE_PATH_PREP');
  const portions = require('./recipe-portions');
  const targetServings = Number(prepInput.targetServings) > 0 ? Number(prepInput.targetServings) : 1;
  const sourceServings = Number(prepInput.sourceServings || prepInput.servings);
  if (Number.isFinite(sourceServings) && sourceServings > 0 && sourceServings !== targetServings) {
    client = portions.normalizeRecipeToFinalModel(Object.assign({}, client, {
      servings: sourceServings,
      sourceServings: sourceServings,
    }), { targetServings: targetServings });
  } else {
    // Bereits Zielportion: Metadaten setzen, keine Rohmengen vortäuschen
    client.finalIngredients = client.ingredients;
    client.displayIngredients = client.ingredients;
    client.finalServings = targetServings;
    client.servings = targetServings;
    client.sourceServings = Number.isFinite(sourceServings) && sourceServings > 0 ? sourceServings : targetServings;
    client.sourceServingsStatus = Number.isFinite(sourceServings) && sourceServings > 0 ? 'explicit' : 'unknown';
    client.nutritionSource = 'finalIngredients';
    client.nutritionBasis = 'finalIngredients';
    client.livePathNormalized = true;
    // Nährwerte aus App-Mengen
    let protein = 0;
    let fat = 0;
    let nettoKh = 0;
    let fiber = 0;
    client.ingredients.forEach(function (ing) {
      const grams = Number(ing.amount) || 0;
      const m = ing.macrosPer100g || {};
      const f = grams / 100;
      protein += (Number(m.protein) || 0) * f;
      fat += (Number(m.fat) || 0) * f;
      nettoKh += (Number(m.netCarbs) || 0) * f;
      fiber += (Number(m.fiber) || 0) * f;
    });
    client.finalNutrition = {
      kcal: Math.round(protein * 4 + fat * 9 + nettoKh * 4),
      protein_g: Math.round(protein * 10) / 10,
      fat_g: Math.round(fat * 10) / 10,
      netto_kh_g: Math.round(nettoKh * 10) / 10,
      ballaststoffe_g: Math.round(fiber * 10) / 10,
    };
    client.nutrition = client.finalNutrition;
  }
  return client;
}

function proseIngredientName(displayName, opts) {
  return require('./recipe-validator').proseIngredientName(displayName, opts);
}

function getIngredientNamesForAction(action, ingredientMap) {
  return (action.ingredientIds || [])
    .map(function (id) {
      const ing = ingredientMap[id];
      if (!ing) return null;
      const pieces = ing._culinary_amount != null ? ing._culinary_amount
        : (ing.unit === 'stk' ? Number(ing.amount) : null);
      return proseIngredientName(ing.displayName, { pieces: pieces });
    })
    .filter(Boolean);
}

function articleForName(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  if (/^eier\b/i.test(n)) return 'Die';
  if (/^(ei|öl|olivenöl|wasser|salz|mehl)\b/i.test(n)) return 'Das';
  if (/e$/i.test(n) || /milch|pasta|sahne|sauce|creme|butter/i.test(n)) return 'Die';
  return 'Den';
}

function buildFallbackInstruction(action, ingredientMap) {
  const names = getIngredientNamesForAction(action, ingredientMap).map(function (n) {
    return String(n || '').replace(/\s*\([^)]*Hackfleisch[^)]*\)/gi, '').replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  }).filter(Boolean);
  if (!names.length) return 'Den nächsten Arbeitsschritt ausführen.';
  const joined = names.length === 1
    ? names[0]
    : (names.length === 2
      ? names[0] + ' und ' + names[1]
      : names.slice(0, -1).join(', ') + ' und ' + names[names.length - 1]);
  const verb = String(action.action || action.actionId || action.label || '').toLowerCase();
  if (/anschwitz|sweat|soffritto|gemüse/.test(verb)) {
    if (names.some(function (n) { return /öl|oel/i.test(n); })) {
      const veg = names.filter(function (n) { return !/öl|oel/i.test(n); });
      const vegJoined = veg.length <= 1 ? (veg[0] || 'das Gemüse')
        : (veg.length === 2 ? veg[0] + ' und ' + veg[1] : veg.slice(0, -1).join(', ') + ' und ' + veg[veg.length - 1]);
      return 'Das Olivenöl erhitzen und ' + vegJoined + ' darin bei mittlerer Hitze langsam anschwitzen.';
    }
    return joined + ' bei mittlerer Hitze langsam anschwitzen.';
  }
  if (/koch|boil|garen|pasta|water/.test(verb)) {
    return 'Das Wasser aufkochen und ' + joined + ' darin garen.';
  }
  if (/brat|fry|sear|pfanne|pan|fleisch/.test(verb)) {
    if (names.length >= 2 && names.every(function (n) { return /hack|fleisch|rind|schwein/i.test(n); })) {
      return 'Das Rind- und Schweinehackfleisch zugeben und unter Rühren krümelig anbraten.';
    }
    return (articleForName(names[0]) + ' ' + joined + ' in einer Pfanne anbraten, bis alles gar ist.').replace(/^Den Das /, 'Das ');
  }
  if (/anbrat|saute|dämpf|dampf/.test(verb)) {
    return joined + ' in einer Pfanne kurz anbraten.';
  }
  if (/simmer|köchel|erwärm|schmor/.test(verb)) {
    return joined + ' bei niedriger Hitze weiter köcheln lassen.';
  }
  if (/misch|mix|rühr|vermeng/.test(verb)) {
    return joined + ' miteinander vermengen.';
  }
  if (/würz|season|abschmeck/.test(verb)) {
    return 'Mit Salz und Pfeffer abschmecken.';
  }
  if (/garn|servier/.test(verb)) {
    return 'Nach Geschmack anrichten und servieren.';
  }
  return (articleForName(names[0]) + ' ' + joined + ' zubereiten.').replace(/\s{2,}/g, ' ').trim();
}

function buildFallbackSteps(prepInput) {
  const ingredientMap = {};
  (prepInput.ingredients || []).forEach(function (ing) {
    ingredientMap[ing.ingredientId] = ing;
  });
  return (prepInput.plannedActions || []).map(function (action, i) {
    return {
      stepNumber: i + 1,
      actionId: action.actionId,
      ingredientIds: (action.ingredientIds || []).slice(),
      instruction: buildFallbackInstruction(action, ingredientMap),
    };
  });
}

function softCleanAiSteps(parsed, prepInput) {
  if (!parsed || !Array.isArray(parsed.steps)) return parsed;
  const recipeValidator = require('./recipe-validator');
  parsed.steps = parsed.steps.map(function (step) {
    if (!step || typeof step !== 'object') return step;
    const instruction = String(step.instruction || step.text || '');
    let cleaned = recipeValidator.stripQuantityMentionsFromText(instruction);
    cleaned = recipeValidator.smoothProseIngredientGrammar(cleaned);
    return Object.assign({}, step, { instruction: cleaned });
  });
  return parsed;
}

async function generatePrepRecipe(opts) {
  const o = opts || {};
  const prepInput = o.prepInput;
  const callGroq = o.callGroq;
  const model = o.model;
  const groqOpts = o.groqOpts || {};
  if (!prepInput || !callGroq) {
    return { ok: false, error: 'invalid_setup' };
  }

  async function attemptOnce() {
    const body = buildPrepGroqRequest(prepInput, model);
    const result = await callGroq(body, groqOpts);
    if (result.error) {
      return {
        ok: false,
        provider: true,
        error: result.error,
        status: result.status,
        body: result.body,
        headers: result.headers,
        rateLimitKind: result.rateLimitKind,
      };
    }
    let parsed = softCleanAiSteps(result.data, prepInput);
    let validation = validatePrepAssistantOutput(parsed, prepInput);
    if (!validation.ok) {
      console.log('RECIPE_DEBUG_AI_OUTPUT_INVALID', JSON.stringify({
        errors: validation.errors,
        steps: parsed && parsed.steps,
      }));
    }
    return { ok: validation.ok, validation: validation, parsed: parsed, raw: result.data };
  }

  console.log('RECIPE_DEBUG_FINAL_INGREDIENTS', JSON.stringify((prepInput.ingredients || []).map(function (i) {
    return { id: i.ingredientId, displayName: i.displayName, amount: i.amount, unit: i.unit };
  })));
  console.log('RECIPE_DEBUG_AI_INPUT', JSON.stringify({
    ingredients: (prepInput.ingredients || []).map(function (i) {
      return { ingredientId: i.ingredientId, displayName: i.displayName };
    }),
    plannedActions: prepInput.plannedActions,
  }));

  let first = await attemptOnce();
  if (first.provider) {
    return {
      ok: false,
      error: first.error,
      status: first.status,
      body: first.body,
      headers: first.headers,
      rateLimitKind: first.rateLimitKind,
    };
  }

  if (!first.ok) {
    console.log('RECIPE_DEBUG_PREP_RETRY', first.validation && first.validation.errors);
    const second = await attemptOnce();
    if (second.provider) {
      // Fallback statt Provider-Fehler weitergeben, wenn erster Versuch nur Validierung war
      const fallback = { steps: buildFallbackSteps(prepInput) };
      const recipe = renderPrepClientRecipe(prepInput, fallback);
      recipe.warnings = (recipe.warnings || []).concat(['prep_fallback_after_provider_error']);
      return { ok: true, recipe: recipe, raw: fallback, warnings: recipe.warnings, usedFallback: true };
    }
    if (second.ok) {
      first = second;
    } else {
      console.log('RECIPE_DEBUG_PREP_FALLBACK', second.validation && second.validation.errors);
      const fallback = { steps: buildFallbackSteps(prepInput) };
      const recipe = renderPrepClientRecipe(prepInput, fallback);
      recipe.warnings = (recipe.warnings || []).concat(['prep_template_fallback']);
      console.log('RECIPE_DEBUG_RENDERED_STEPS', JSON.stringify(recipe.steps));
      return { ok: true, recipe: recipe, raw: fallback, warnings: recipe.warnings, usedFallback: true };
    }
  }

  const recipe = renderPrepClientRecipe(prepInput, first.validation.parsed);
  recipe.warnings = (recipe.warnings || []).concat(first.validation.warnings || []);
  console.log('RECIPE_DEBUG_RENDERED_STEPS', JSON.stringify(recipe.steps));
  return {
    ok: true,
    recipe: recipe,
    raw: first.raw,
    warnings: recipe.warnings,
  };
}

module.exports = {
  PREP_PROMPT_VERSION: PREP_PROMPT_VERSION,
  loadPrepSystemPrompt: loadPrepSystemPrompt,
  buildPrepOutputSchema: buildPrepOutputSchema,
  buildPrepAssistantMessages: buildPrepAssistantMessages,
  buildPrepGroqRequest: buildPrepGroqRequest,
  parsePrepIncoming: parsePrepIncoming,
  validatePrepAssistantOutput: validatePrepAssistantOutput,
  renderPrepClientRecipe: renderPrepClientRecipe,
  generatePrepRecipe: generatePrepRecipe,
  buildFallbackSteps: buildFallbackSteps,
  instructionHasAmount: instructionHasAmount,
};
