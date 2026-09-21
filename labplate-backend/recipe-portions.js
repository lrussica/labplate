/**
 * Kanonische Portions- und Mengenarchitektur für LabPlate-Rezepte.
 * sourceServings → einmalige Skalierung → finalIngredients → Nährwerte.
 *
 * sourceServingsStatus: explicit | inferred | unknown
 * servingsStatus (Gesamt): validated | inferred | unknown | invalid
 */
'use strict';

const SERVINGS_STATUS = {
  VALIDATED: 'validated',
  INFERRED: 'inferred',
  UNKNOWN: 'unknown',
  INVALID: 'invalid',
};

const SOURCE_SERVINGS_STATUS = {
  EXPLICIT: 'explicit',
  INFERRED: 'inferred',
  UNKNOWN: 'unknown',
};

const RECIPE_MODEL_VERSION = {
  recipeVersion: 'v1',
  ingredientModelVersion: 'v1',
  nutritionVersion: 'v1',
  instructionVersion: 'v1',
};

const INFERRED_WARNING =
  'Die ursprüngliche Portionszahl wurde anhand der Zutatenmenge geschätzt.';
const UNKNOWN_WARNING =
  'Die Ausgangsportionszahl ist nicht bekannt. Eine sichere Skalierung ist nicht möglich.';
const ESTIMATED_UI_HINT = 'Portionsgröße geschätzt – bitte prüfen';

/**
 * Deterministische Skalierung (genau einmal pro Rezept verwenden).
 * scaledAmount = sourceAmount * (targetServings / sourceServings)
 */
function scaleIngredients(sourceIngredients, sourceServings, targetServings) {
  if (!Number.isFinite(sourceServings) || sourceServings <= 0) {
    throw new Error('sourceServings must be a positive number');
  }
  if (!Number.isFinite(targetServings) || targetServings <= 0) {
    throw new Error('targetServings must be a positive number');
  }
  const factor = targetServings / sourceServings;
  const list = Array.isArray(sourceIngredients) ? sourceIngredients : [];
  return list.map(function (ingredient) {
    const next = Object.assign({}, ingredient);
    const amount = Number(ingredient && ingredient.amount);
    if (Number.isFinite(amount)) {
      next.amount = amount * factor;
    }
    return next;
  });
}

/**
 * MODEL B: Anzeige-Skalierung relativ zu bereits portionierter Masterliste.
 * factor = selectedServings / finalServings
 * Niemals relative zu sourceServings, wenn die Basis bereits finalIngredients ist.
 */
function scaleDisplayFromFinalBase(finalIngredients, finalServings, selectedServings) {
  if (!Number.isFinite(finalServings) || finalServings <= 0) {
    throw new Error('finalServings must be a positive number');
  }
  if (!Number.isFinite(selectedServings) || selectedServings <= 0) {
    throw new Error('selectedServings must be a positive number');
  }
  return scaleIngredients(finalIngredients, finalServings, selectedServings);
}

function roundPracticalAmount(amount, unit) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const u = String(unit || '').toLowerCase();
  if (u === 'stk') return Math.max(1, Math.round(n));
  if (u === 'ml' || u === 'l') {
    const rounded = Math.round(n);
    return Math.max(1, rounded);
  }
  // g: 1 g-Schritte unter 20 g, sonst 5 g
  if (n < 20) return Math.max(1, Math.round(n));
  return Math.max(5, Math.round(n / 5) * 5);
}

function applyPracticalRounding(ingredients) {
  return (Array.isArray(ingredients) ? ingredients : []).map(function (ing) {
    const next = Object.assign({}, ing);
    if (Number.isFinite(Number(ing.amount))) {
      next.amount = roundPracticalAmount(ing.amount, ing.unit);
    }
    return next;
  });
}

function ingredientMapFromList(finalIngredients, idKey) {
  const key = idKey || 'id';
  const map = {};
  (Array.isArray(finalIngredients) ? finalIngredients : []).forEach(function (ing) {
    if (!ing) return;
    const id = ing[key] || ing.id || ing._v92_id || ing._prep_ingredient_id;
    if (id) map[String(id)] = ing;
  });
  return map;
}

function isMeatOrFishName(name) {
  const n = String(name || '').toLowerCase();
  return /hack|fleisch|rind|schwein|huhn|hähnchen|haehnchen|pute|lachs|fisch|garnele|thunfisch|truthahn|kalb|lamm|wurst|speck|bacon|tofu|tempeh/.test(n);
}

function isStapleCarbName(name) {
  const n = String(name || '').toLowerCase();
  return /pasta|nudel|spaghetti|reis|mehl|couscous|bulgur|quinoa|kartoffel|brot|tortilla/.test(n);
}

function isRichLiquidName(name) {
  const n = String(name || '').toLowerCase();
  return /öl|oel|sahne|creme|kokosmilch|butter|schmalz/.test(n);
}

/**
 * Roh-Batchgewicht aus Quellzutaten (g/ml ≈ g). Keine Yield-/Kochgewichts-Schätzung.
 */
function computeRawBatchWeight(ingredients) {
  let total = 0;
  let hasMass = false;
  (Array.isArray(ingredients) ? ingredients : []).forEach(function (ing) {
    if (!ing) return;
    const amount = Number(ing.amount);
    const unit = String(ing.unit || '').toLowerCase();
    if (!Number.isFinite(amount) || amount <= 0) return;
    if (unit === 'prise' || unit === 'messerspitze') return;
    if (unit === 'stk') {
      if (/\bei\b/i.test(ing.displayName || ing.name || '')) {
        total += amount * 60;
        hasMass = true;
      }
      return;
    }
    if (unit === 'l') {
      total += amount * 1000;
      hasMass = true;
      return;
    }
    if (unit === 'g' || unit === 'ml' || unit === 'kg') {
      total += unit === 'kg' ? amount * 1000 : amount;
      hasMass = true;
    }
  });
  return hasMass ? Math.round(total * 10) / 10 : null;
}

/**
 * Schätzt sourceServings aus Rohmengen (Heuristik → immer inferred, nie explicit).
 */
function sumMeatFishGrams(ingredients) {
  let total = 0;
  let maxOne = 0;
  (Array.isArray(ingredients) ? ingredients : []).forEach(function (ing) {
    if (!ing) return;
    const name = ing.displayName || ing.name || '';
    if (!isMeatOrFishName(name)) return;
    const amount = Number(ing.amount);
    const unit = String(ing.unit || '').toLowerCase();
    if (!Number.isFinite(amount) || amount <= 0) return;
    let grams = amount;
    if (unit === 'kg') grams = amount * 1000;
    if (unit === 'stk') return;
    if (unit === 'ml' || unit === 'l' || unit === 'prise' || unit === 'messerspitze') return;
    total += grams;
    maxOne = Math.max(maxOne, grams);
  });
  return { total: total, maxOne: maxOne };
}

/**
 * Erkennt Batch-Mengen, die fälschlich als 1 Portion deklariert sind.
 * Wichtig: 300 g Rind + 200 g Schwein (Ragù) muss greifen – nicht nur >300 g Einzelstück.
 */
function looksLikeBatchAmounts(ingredients, declaredServings) {
  const declared = Number(declaredServings);
  if (Number.isFinite(declared) && declared > 1) return false;
  const list = Array.isArray(ingredients) ? ingredients : [];
  const meat = sumMeatFishGrams(list);
  let maxCarbG = 0;
  let maxRichMl = 0;
  let massTotal = 0;
  list.forEach(function (ing) {
    if (!ing) return;
    const name = ing.displayName || ing.name || '';
    const amount = Number(ing.amount);
    const unit = String(ing.unit || '').toLowerCase();
    if (!Number.isFinite(amount) || amount <= 0) return;
    if (unit === 'prise' || unit === 'messerspitze') return;
    if (unit === 'ml' || unit === 'l') {
      const ml = unit === 'l' ? amount * 1000 : amount;
      massTotal += ml;
      if (isRichLiquidName(name)) maxRichMl = Math.max(maxRichMl, ml);
      return;
    }
    if (unit === 'stk') return;
    const g = unit === 'kg' ? amount * 1000 : amount;
    massTotal += g;
    if (isStapleCarbName(name)) maxCarbG = Math.max(maxCarbG, g);
  });
  if (meat.total >= 350 || meat.maxOne >= 280) return true;
  if (maxCarbG >= 250) return true;
  if (maxRichMl >= 180) return true;
  if (massTotal >= 700) return true;
  return false;
}

function inferSourceServingsFromIngredients(ingredients) {
  const list = Array.isArray(ingredients) ? ingredients : [];
  const meat = sumMeatFishGrams(list);
  let maxCarbG = 0;
  let maxRichMl = 0;

  list.forEach(function (ing) {
    if (!ing) return;
    const name = ing.displayName || ing.name || '';
    const amount = Number(ing.amount);
    const unit = String(ing.unit || '').toLowerCase();
    if (!Number.isFinite(amount) || amount <= 0) return;
    if (unit === 'ml' || unit === 'l') {
      if (isRichLiquidName(name)) maxRichMl = Math.max(maxRichMl, unit === 'l' ? amount * 1000 : amount);
      return;
    }
    if (unit === 'prise' || unit === 'messerspitze') return;
    if (isStapleCarbName(name)) maxCarbG = Math.max(maxCarbG, amount);
  });

  let inferred = null;
  let confidence = 0;
  // Typische 1-Portion: ~100–150 g Fleisch gesamt, ~60–100 g Pasta/Reis
  const meatRef = Math.max(meat.total, meat.maxOne);
  if (meat.total >= 350 || meat.maxOne >= 280) {
    inferred = Math.max(2, Math.round(meatRef / 125));
    confidence = meat.total >= 450 ? 0.7 : 0.6;
  } else if (maxCarbG >= 250) {
    inferred = Math.max(2, Math.round(maxCarbG / 80));
    confidence = 0.5;
  } else if (maxRichMl >= 180) {
    inferred = Math.max(2, Math.round(maxRichMl / 40));
    confidence = 0.4;
  }

  if (!inferred || !Number.isFinite(inferred) || inferred < 2) {
    return {
      sourceServings: null,
      sourceServingsStatus: SOURCE_SERVINGS_STATUS.UNKNOWN,
      sourceServingsMethod: 'none',
      sourceServingsConfidence: 0,
      servingsStatus: SERVINGS_STATUS.UNKNOWN,
      requiresReview: true,
    };
  }
  inferred = Math.min(12, inferred);
  return {
    sourceServings: inferred,
    sourceServingsStatus: SOURCE_SERVINGS_STATUS.INFERRED,
    sourceServingsMethod: 'ingredient_heuristic',
    sourceServingsConfidence: confidence,
    servingsStatus: SERVINGS_STATUS.INFERRED,
    requiresReview: true,
  };
}

/**
 * Bestimmt sourceServings nach Priorität:
 * 1) explizites servings-Feld (vertrauenswürdig) → explicit
 * 2) KI-Schätzung / Heuristik → inferred (nie explicit)
 * 3) unknown – niemals automatisch 1, nur weil targetServings 1 ist
 */
function resolveSourceServings(recipe, opts) {
  const o = opts || {};
  const ingredients = (recipe && (recipe.ingredients || recipe.sourceIngredients)) || [];
  const declaredRaw = recipe && (recipe.sourceServings != null ? recipe.sourceServings : recipe.servings);
  const declared = Number(declaredRaw);
  const declaredOk = Number.isFinite(declared) && declared > 0;

  // Vorab: KI/Heuristik-Markierung an der Quelle respektieren (nie als explicit speichern).
  const preStatus = recipe && recipe.sourceServingsStatus
    ? String(recipe.sourceServingsStatus)
    : null;
  const methodHint = String(
    (recipe && (recipe.sourceServingsMethod || recipe.servingsMethod)) || ''
  ).toLowerCase();
  const markedAsEstimate =
    preStatus === SOURCE_SERVINGS_STATUS.INFERRED ||
    /ai|infer|estimat|heurist|model/.test(methodHint);

  const plausibility = validatePortionPlausibility({
    finalServings: declaredOk ? declared : 1,
    servingsStatus: SERVINGS_STATUS.VALIDATED,
    finalIngredients: ingredients.map(function (ing) {
      return {
        displayName: ing.displayName || ing.name,
        name: ing.name,
        amount: ing.amount,
        unit: ing.unit === 'stk' ? 'stk' : ing.unit === 'ml' ? 'ml' : 'g',
      };
    }),
  });

  const looksLikeBatchLabeledAsOne =
    (!declaredOk || declared === 1) && looksLikeBatchAmounts(ingredients, declaredOk ? declared : 1);

  // Explizit und plausibel → explicit (Heuristik darf das nie überschreiben außer Batch-als-1).
  if (declaredOk && !looksLikeBatchLabeledAsOne && !markedAsEstimate) {
    return {
      sourceServings: declared,
      sourceServingsStatus: SOURCE_SERVINGS_STATUS.EXPLICIT,
      sourceServingsMethod: recipe.sourceServingsMethod || 'source_explicit',
      sourceServingsConfidence: recipe.sourceServingsConfidence != null
        ? Number(recipe.sourceServingsConfidence)
        : 1,
      servingsStatus: SERVINGS_STATUS.VALIDATED,
      requiresReview: false,
      warnings: plausibility.warnings.slice(),
    };
  }

  // Deklariert, aber als Schätzung markiert → inferred (nicht explicit).
  if (declaredOk && markedAsEstimate && !looksLikeBatchLabeledAsOne) {
    return {
      sourceServings: declared,
      sourceServingsStatus: SOURCE_SERVINGS_STATUS.INFERRED,
      sourceServingsMethod: recipe.sourceServingsMethod || 'ai_estimate',
      sourceServingsConfidence: recipe.sourceServingsConfidence != null
        ? Number(recipe.sourceServingsConfidence)
        : 0.6,
      servingsStatus: SERVINGS_STATUS.INFERRED,
      requiresReview: true,
      warnings: [INFERRED_WARNING].concat(plausibility.warnings || []),
    };
  }

  if (looksLikeBatchLabeledAsOne || !declaredOk) {
    const inferred = inferSourceServingsFromIngredients(ingredients);
    if (inferred.sourceServings) {
      console.log('RECIPE_SOURCE_SERVINGS', {
        sourceServings: inferred.sourceServings,
        sourceServingsStatus: inferred.sourceServingsStatus,
        sourceServingsMethod: inferred.sourceServingsMethod,
        sourceServingsConfidence: inferred.sourceServingsConfidence,
        declaredServings: declaredOk ? declared : null,
        reason: looksLikeBatchLabeledAsOne ? 'implausible_single_portion' : 'missing_servings',
      });
      return Object.assign({}, inferred, {
        warnings: [INFERRED_WARNING],
      });
    }
  }

  return {
    sourceServings: null,
    sourceServingsStatus: SOURCE_SERVINGS_STATUS.UNKNOWN,
    sourceServingsMethod: 'none',
    sourceServingsConfidence: 0,
    servingsStatus: SERVINGS_STATUS.UNKNOWN,
    requiresReview: true,
    warnings: [UNKNOWN_WARNING].concat(plausibility.warnings || []),
  };
}

/**
 * Nur validieren/warnen – niemals Mengen korrigieren oder skalieren.
 */
function validatePortionPlausibility(recipe) {
  const warnings = [];
  const ingredients = recipe.finalIngredients || recipe.ingredients || [];
  const finalServings = Number(recipe.finalServings);
  const status = recipe.servingsStatus;
  const sourceStatus = recipe.sourceServingsStatus;

  if (
    status === SERVINGS_STATUS.UNKNOWN ||
    sourceStatus === SOURCE_SERVINGS_STATUS.UNKNOWN
  ) {
    warnings.push(UNKNOWN_WARNING);
  }

  ingredients.forEach(function (ingredient) {
    if (!ingredient) return;
    const name = String(ingredient.displayName || ingredient.name || '').toLowerCase();
    const amount = Number(ingredient.amount);
    const unit = String(ingredient.unit || '').toLowerCase();
    if (!Number.isFinite(amount)) return;

    if (finalServings === 1 && unit === 'g' && amount >= 280 && isMeatOrFishName(name)) {
      warnings.push(
        'Ungewöhnlich große Fleischmenge für 1 Portion: ' + amount + ' g ' +
          (ingredient.displayName || ingredient.name || '')
      );
    }
    if (finalServings === 1 && unit === 'g' && amount >= 250 && isStapleCarbName(name)) {
      warnings.push(
        'Ungewöhnlich große Sättigungsbeilage für 1 Portion: ' + amount + ' g ' +
          (ingredient.displayName || ingredient.name || '')
      );
    }
    if (finalServings === 1 && (unit === 'ml' || unit === 'l') && amount >= 180 && isRichLiquidName(name)) {
      warnings.push(
        'Ungewöhnlich große Fett-/Flüssigkeitsmenge für 1 Portion: ' + amount + ' ' + unit + ' ' +
          (ingredient.displayName || ingredient.name || '')
      );
    }
  });

  return { warnings: warnings };
}

function extractMentionedFoodTokens(text) {
  const t = String(text || '').toLowerCase();
  const checks = [
    { key: 'pasta', re: /\bpasta\b|\bnudel|\bspaghetti\b|\bpenne\b|\bfusilli\b/ },
    { key: 'reis', re: /\breis\b|\brace\b/ },
    { key: 'sahne', re: /\bsahne\b|\bcreme\b|\bcream\b/ },
    { key: 'lachs', re: /\blachs\b|\bsalmon\b/ },
    { key: 'hack', re: /\bhack\b|\brag[uù]\b|\bbolognese\b/ },
  ];
  return checks.filter(function (c) { return c.re.test(t); }).map(function (c) { return c.key; });
}

function ingredientListMentionsToken(ingredients, token) {
  const blob = (Array.isArray(ingredients) ? ingredients : [])
    .map(function (i) { return String((i && (i.displayName || i.name)) || '').toLowerCase(); })
    .join(' ');
  if (token === 'pasta') return /pasta|nudel|spaghetti|penne|fusilli/.test(blob);
  if (token === 'reis') return /\breis\b|rice/.test(blob);
  if (token === 'sahne') return /sahne|creme|cream|schmand/.test(blob);
  if (token === 'lachs') return /lachs|salmon/.test(blob);
  if (token === 'hack') return /hack|rind|schwein|bolognese|rag[uù]/.test(blob);
  return blob.indexOf(token) >= 0;
}

function validateRecipeConsistency(recipe) {
  const errors = [];
  const warnings = [];
  const ingredients = recipe.finalIngredients || recipe.ingredients || [];
  const steps = recipe.steps || [];
  const title = String(recipe.title || '');

  const stepText = steps.map(function (s) {
    if (typeof s === 'string') return s;
    return String((s && (s.instruction || s.content || s.text)) || '');
  }).join(' ');

  const mentioned = extractMentionedFoodTokens(stepText + ' ' + title);
  mentioned.forEach(function (token) {
    if (!ingredientListMentionsToken(ingredients, token)) {
      if (token === 'pasta' || token === 'reis' || token === 'lachs' || token === 'sahne') {
        warnings.push(
          'Zubereitung/Titel erwähnt "' + token + '", aber die Zutat fehlt in finalIngredients.'
        );
      }
    }
  });

  if (/sahnesauce|sahne-sauce/i.test(title) && !ingredientListMentionsToken(ingredients, 'sahne')) {
    warnings.push('Titel nennt Sahnesauce, aber keine Sahne in den Zutaten.');
  }
  if (/\blachs\b/i.test(title) && !ingredientListMentionsToken(ingredients, 'lachs')) {
    warnings.push('Titel nennt Lachs, aber kein Lachs in den Zutaten.');
  }
  if (/bolognese|rag[uù]/i.test(title) && !ingredientListMentionsToken(ingredients, 'hack')) {
    warnings.push('Titel nennt Bolognese/Ragù, aber kein Hackfleisch in den Zutaten.');
  }

  const qtyRe = /\b\d+(?:[.,]\d+)?\s*(g|kg|mg|ml|l|cl|el|tl|stk|stück)\b/i;
  steps.forEach(function (step, i) {
    const instruction = typeof step === 'string'
      ? step
      : String((step && (step.instruction || step.content || step.text)) || '');
    if (qtyRe.test(instruction)) {
      errors.push('Mengenangabe in Zubereitungsschritt ' + ((step && step.stepNumber) || (i + 1)));
    }
    if (step && typeof step === 'object') {
      if (Object.prototype.hasOwnProperty.call(step, 'amount') ||
          Object.prototype.hasOwnProperty.call(step, 'quantity') ||
          Object.prototype.hasOwnProperty.call(step, 'ingredients')) {
        errors.push('Schritt ' + ((step.stepNumber) || (i + 1)) + ' enthält unerlaubte Mengenfelder');
      }
      const ids = Array.isArray(step.ingredientIds) ? step.ingredientIds : null;
      if (ids) {
        const map = ingredientMapFromList(ingredients, 'id');
        ingredients.forEach(function (ing) {
          if (ing && ing._v92_id) map[String(ing._v92_id)] = ing;
        });
        ids.forEach(function (id) {
          if (!map[String(id)]) {
            warnings.push('Schritt verweist auf unbekannte ingredientId: ' + id);
          }
        });
      }
    }
  });

  return { errors: errors, warnings: warnings };
}

function validateRecipePortions(recipe) {
  const errors = [];
  const warnings = [];
  const sourceServings = Number(recipe.sourceServings);
  const targetServings = Number(recipe.targetServings);
  const finalServings = Number(recipe.finalServings);

  if (!Number.isFinite(sourceServings) || sourceServings <= 0) {
    errors.push('sourceServings fehlt oder ist ungültig');
  }
  if (!Number.isFinite(targetServings) || targetServings <= 0) {
    errors.push('targetServings fehlt oder ist ungültig');
  }
  if (Number.isFinite(finalServings) && Number.isFinite(targetServings) &&
      finalServings !== targetServings) {
    errors.push('finalServings entspricht nicht targetServings');
  }
  if (
    recipe.servingsStatus === SERVINGS_STATUS.UNKNOWN ||
    recipe.sourceServingsStatus === SOURCE_SERVINGS_STATUS.UNKNOWN
  ) {
    warnings.push(UNKNOWN_WARNING);
  }
  if (!Array.isArray(recipe.finalIngredients) || recipe.finalIngredients.length === 0) {
    if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
      errors.push('Keine finalen Zutaten vorhanden');
    }
  }

  const plaus = validatePortionPlausibility(recipe);
  warnings.push.apply(warnings, plaus.warnings || []);
  const cons = validateRecipeConsistency(recipe);
  errors.push.apply(errors, cons.errors || []);
  warnings.push.apply(warnings, cons.warnings || []);

  const seen = {};
  const uniqWarnings = [];
  warnings.forEach(function (w) {
    const k = String(w);
    if (!seen[k]) {
      seen[k] = true;
      uniqWarnings.push(k);
    }
  });

  return {
    valid: errors.length === 0,
    errors: errors,
    warnings: uniqWarnings,
  };
}

/**
 * Baut aus Rohzutaten + Portionsangaben das kanonische final-Rezept.
 * Skaliert genau einmal; Nährwerte müssen danach aus finalIngredients kommen.
 */
function buildFinalPortionedRecipe(opts) {
  const o = opts || {};
  const sourceIngredients = Array.isArray(o.sourceIngredients) ? o.sourceIngredients : [];
  const targetServings = Number(o.targetServings) > 0 ? Number(o.targetServings) : 1;
  const resolved = o.resolvedSource || resolveSourceServings({
    servings: o.sourceServings,
    sourceServings: o.sourceServings,
    sourceServingsStatus: o.sourceServingsStatus,
    sourceServingsMethod: o.sourceServingsMethod,
    sourceServingsConfidence: o.sourceServingsConfidence,
    ingredients: sourceIngredients,
  });

  const rawBatchWeight = computeRawBatchWeight(sourceIngredients);
  const yieldMeta = {
    rawBatchWeight: rawBatchWeight,
    cookedBatchWeight: o.cookedBatchWeight != null ? Number(o.cookedBatchWeight) : null,
    yieldStatus: (o.cookedBatchWeight != null && Number.isFinite(Number(o.cookedBatchWeight)))
      ? 'measured'
      : 'unknown',
    portionWeight: null,
  };
  if (
    yieldMeta.cookedBatchWeight != null &&
    Number.isFinite(yieldMeta.cookedBatchWeight) &&
    Number.isFinite(resolved.sourceServings) &&
    resolved.sourceServings > 0
  ) {
    yieldMeta.portionWeight = yieldMeta.cookedBatchWeight / resolved.sourceServings;
  }

  console.log('RECIPE_TARGET_SERVINGS', targetServings);
  console.log('RECIPE_SOURCE_SERVINGS', {
    sourceServings: resolved.sourceServings,
    sourceServingsStatus: resolved.sourceServingsStatus,
    sourceServingsMethod: resolved.sourceServingsMethod,
    sourceServingsConfidence: resolved.sourceServingsConfidence,
    servingsStatus: resolved.servingsStatus,
    requiresReview: resolved.requiresReview,
  });

  const sourceOk =
    Number.isFinite(resolved.sourceServings) &&
    resolved.sourceServings > 0 &&
    resolved.sourceServingsStatus !== SOURCE_SERVINGS_STATUS.UNKNOWN &&
    resolved.servingsStatus !== SERVINGS_STATUS.UNKNOWN;

  const targetOk = Number.isFinite(targetServings) && targetServings > 0;

  if (!sourceOk || !targetOk) {
    return {
      ok: false,
      valid: false,
      servingsStatus: SERVINGS_STATUS.UNKNOWN,
      sourceServings: null,
      sourceServingsStatus: SOURCE_SERVINGS_STATUS.UNKNOWN,
      sourceServingsConfidence: 0,
      sourceServingsMethod: resolved.sourceServingsMethod || 'none',
      targetServings: targetServings,
      finalServings: null,
      finalIngredients: null,
      requiresReview: true,
      scalingFactor: null,
      nutritionBasis: 'finalIngredients',
      nutritionServings: null,
      yield: yieldMeta,
      warnings: resolved.warnings && resolved.warnings.length
        ? resolved.warnings.slice()
        : [UNKNOWN_WARNING],
      errors: ['sourceServings fehlt oder ist ungültig'],
      recipeVersion: RECIPE_MODEL_VERSION.recipeVersion,
      ingredientModelVersion: RECIPE_MODEL_VERSION.ingredientModelVersion,
      nutritionVersion: RECIPE_MODEL_VERSION.nutritionVersion,
      instructionVersion: RECIPE_MODEL_VERSION.instructionVersion,
    };
  }

  const factor = targetServings / resolved.sourceServings;
  console.log('RECIPE_SCALE_FACTOR', factor);

  let finalIngredients = scaleIngredients(
    sourceIngredients,
    resolved.sourceServings,
    targetServings
  );
  finalIngredients = applyPracticalRounding(finalIngredients);

  console.log('RECIPE_FINAL_INGREDIENTS', JSON.stringify(finalIngredients.map(function (i) {
    return {
      id: i.id || i._v92_id,
      name: i.displayName || i.name,
      amount: i.amount,
      unit: i.unit,
    };
  })));

  const requiresReview =
    !!resolved.requiresReview ||
    resolved.sourceServingsStatus === SOURCE_SERVINGS_STATUS.INFERRED;

  const validation = validateRecipePortions({
    sourceServings: resolved.sourceServings,
    sourceServingsStatus: resolved.sourceServingsStatus,
    targetServings: targetServings,
    finalServings: targetServings,
    servingsStatus: resolved.servingsStatus,
    finalIngredients: finalIngredients,
    title: o.title,
    steps: o.steps,
  });

  const allWarnings = (resolved.warnings || []).concat(validation.warnings || []);
  const seenW = {};
  const uniqWarnings = [];
  allWarnings.forEach(function (w) {
    const k = String(w);
    if (!seenW[k]) {
      seenW[k] = true;
      uniqWarnings.push(k);
    }
  });

  return {
    ok: validation.valid || resolved.servingsStatus === SERVINGS_STATUS.INFERRED,
    valid: validation.valid && !requiresReview,
    sourceServings: resolved.sourceServings,
    sourceServingsStatus: resolved.sourceServingsStatus,
    sourceServingsMethod: resolved.sourceServingsMethod,
    sourceServingsConfidence: resolved.sourceServingsConfidence,
    targetServings: targetServings,
    finalServings: targetServings,
    servingsStatus: resolved.servingsStatus,
    requiresReview: requiresReview,
    finalIngredients: finalIngredients,
    scalingFactor: factor,
    scaleFactor: factor,
    nutritionBasis: 'finalIngredients',
    nutritionServings: targetServings,
    yield: yieldMeta,
    warnings: uniqWarnings,
    errors: validation.errors || [],
    recipeVersion: RECIPE_MODEL_VERSION.recipeVersion,
    ingredientModelVersion: RECIPE_MODEL_VERSION.ingredientModelVersion,
    nutritionVersion: RECIPE_MODEL_VERSION.nutritionVersion,
    instructionVersion: RECIPE_MODEL_VERSION.instructionVersion,
  };
}

/**
 * Coach-Input: ausschließlich finale Daten, keine Roh-/Alt-Nährwerte.
 */
function buildCoachInput(finalRecipe) {
  const r = finalRecipe || {};
  const finalIngredients = r.finalIngredients || r.ingredients || [];
  const finalNutrition = r.finalNutrition || r.nutrition || null;
  return {
    title: r.title || '',
    finalServings: r.finalServings != null ? r.finalServings : r.servings,
    servingsStatus: r.servingsStatus || null,
    sourceServingsStatus: r.sourceServingsStatus || null,
    requiresReview: !!r.requiresReview,
    finalIngredients: finalIngredients,
    finalNutrition: finalNutrition,
    validationWarnings: r.validationWarnings || r.portionWarnings || r.warnings || [],
    nutritionBasis: 'finalIngredients',
    nutritionServings: r.nutritionServings != null
      ? r.nutritionServings
      : (r.finalServings != null ? r.finalServings : r.servings),
  };
}

function canDisplayAsSafeSinglePortion(recipe) {
  if (!recipe) return false;
  if (Number(recipe.finalServings) !== 1) return false;
  if (
    recipe.servingsStatus === SERVINGS_STATUS.UNKNOWN ||
    recipe.servingsStatus === SERVINGS_STATUS.INVALID ||
    recipe.sourceServingsStatus === SOURCE_SERVINGS_STATUS.UNKNOWN
  ) {
    return false;
  }
  // Inferred: Anzeige möglich, aber nie „sicher ohne Hinweis“.
  if (
    recipe.servingsStatus === SERVINGS_STATUS.INFERRED ||
    recipe.sourceServingsStatus === SOURCE_SERVINGS_STATUS.INFERRED ||
    recipe.requiresReview
  ) {
    return false;
  }
  const critical = (recipe.portionWarnings || recipe.validationWarnings || []).some(function (w) {
    return /Ungewöhnlich große|nicht bekannt|geschätzt/i.test(w);
  });
  return !critical;
}

function getPortionDisplayHint(recipe) {
  if (!recipe) return null;
  if (
    recipe.sourceServingsStatus === SOURCE_SERVINGS_STATUS.UNKNOWN ||
    recipe.servingsStatus === SERVINGS_STATUS.UNKNOWN
  ) {
    return UNKNOWN_WARNING;
  }
  if (
    recipe.sourceServingsStatus === SOURCE_SERVINGS_STATUS.INFERRED ||
    recipe.servingsStatus === SERVINGS_STATUS.INFERRED ||
    recipe.requiresReview
  ) {
    return ESTIMATED_UI_HINT;
  }
  return null;
}

/**
 * Live-Pfad-Normalisierung: jedes Rezeptobjekt → finalIngredients / finalNutrition.
 * Wird von Server (toClientRecipe, Prep) und Frontend-Safety-Net genutzt.
 */
function normalizeRecipeToFinalModel(recipe, opts) {
  const o = opts || {};
  const targetServings = Number(o.targetServings) > 0
    ? Number(o.targetServings)
    : (Number(recipe && recipe.targetServings) > 0 ? Number(recipe.targetServings) : 1);
  const raw = recipe && typeof recipe === 'object' ? recipe : {};
  const sourceList = Array.isArray(raw.ingredients) ? raw.ingredients
    : (Array.isArray(raw.sourceIngredients) ? raw.sourceIngredients : []);

  console.log('LIVE_RECIPE_PATH_NORMALIZE');
  console.log('TRACE_RAW_INGREDIENTS', JSON.stringify(sourceList.map(function (i) {
    return { id: i && (i.id || i._v92_id), name: i && (i.name || i.displayName), amount: i && i.amount, unit: i && i.unit };
  })));

  const sourceIngredients = sourceList.map(function (ing) {
    return {
      id: ing.id || ing._v92_id || ing._prep_ingredient_id,
      name: ing.name || ing.displayName || 'Zutat',
      displayName: ing.displayName || ing.name || 'Zutat',
      amount: Number(ing.amount),
      unit: ing.unit === 'ml' ? 'ml' : (ing.unit === 'stk' ? 'stk' : 'g'),
      macrosPer100g: ing.macrosPer100g,
      netCarbs: ing.macrosPer100g ? ing.macrosPer100g.netCarbs : ing.netCarbs,
      fat: ing.macrosPer100g ? ing.macrosPer100g.fat : ing.fat,
      protein: ing.macrosPer100g ? ing.macrosPer100g.protein : ing.protein,
      fiber: ing.macrosPer100g ? ing.macrosPer100g.fiber : ing.fiber,
      protein_source: !!ing.protein_source,
      status: ing.status,
      _v92_id: ing._v92_id || ing.id,
      _prep_ingredient_id: ing._prep_ingredient_id,
    };
  });

  const declaredServings = raw.sourceServings != null ? raw.sourceServings : raw.servings;
  const portioned = buildFinalPortionedRecipe({
    sourceIngredients: sourceIngredients,
    sourceServings: declaredServings,
    sourceServingsStatus: raw.sourceServingsStatus,
    sourceServingsMethod: raw.sourceServingsMethod,
    sourceServingsConfidence: raw.sourceServingsConfidence,
    cookedBatchWeight: raw.cookedBatchWeight,
    targetServings: targetServings,
    title: raw.title,
    steps: raw.steps,
  });

  console.log('TRACE_SOURCE_SERVINGS', {
    sourceServings: portioned.sourceServings,
    targetServings: portioned.targetServings,
    servingsStatus: portioned.servingsStatus,
    sourceServingsStatus: portioned.sourceServingsStatus,
    scalingFactor: portioned.scalingFactor,
    requiresReview: portioned.requiresReview,
  });

  const scaledOk = !!(portioned.ok && portioned.finalIngredients);
  let finalIngredients = scaledOk
    ? portioned.finalIngredients.map(function (ing) {
        const next = Object.assign({}, ing);
        next.name = ing.displayName || ing.name;
        next.displayName = ing.displayName || ing.name;
        if (ing.macrosPer100g) next.macrosPer100g = ing.macrosPer100g;
        return next;
      })
    : sourceIngredients.map(function (ing) {
        return Object.assign({}, ing, { name: ing.displayName || ing.name });
      });

  // Makros aus Quellzutaten übernehmen (Index/ID)
  finalIngredients = finalIngredients.map(function (ing, idx) {
    const src = sourceList[idx] || sourceList.find(function (s) {
      return s && (s.id === ing.id || s._v92_id === ing.id || s.name === ing.name);
    });
    if (src && src.macrosPer100g && !ing.macrosPer100g) {
      ing.macrosPer100g = src.macrosPer100g;
    } else if (src && !ing.macrosPer100g) {
      ing.macrosPer100g = {
        netCarbs: Number(src.netCarbs) || 0,
        fat: Number(src.fat) || 0,
        protein: Number(src.protein) || 0,
        fiber: Number(src.fiber) || 0,
      };
    }
    return ing;
  });

  let protein = 0;
  let fat = 0;
  let nettoKh = 0;
  let fiber = 0;
  finalIngredients.forEach(function (ing) {
    const grams = Number(ing.amount) || 0;
    const m = ing.macrosPer100g || {};
    const f = grams / 100;
    protein += (Number(m.protein) || 0) * f;
    fat += (Number(m.fat) || 0) * f;
    nettoKh += (Number(m.netCarbs) || 0) * f;
    fiber += (Number(m.fiber) || 0) * f;
  });
  const finalNutrition = scaledOk ? {
    kcal: Math.round(protein * 4 + fat * 9 + nettoKh * 4),
    protein_g: Math.round(protein * 10) / 10,
    fat_g: Math.round(fat * 10) / 10,
    netto_kh_g: Math.round(nettoKh * 10) / 10,
    ballaststoffe_g: Math.round(fiber * 10) / 10,
  } : null;

  console.log('TRACE_FINAL_INGREDIENTS', JSON.stringify(finalIngredients.map(function (i) {
    return { id: i.id, name: i.name, amount: i.amount, unit: i.unit };
  })));
  console.log('TRACE_FINAL_NUTRITION', JSON.stringify(finalNutrition));

  const finalServings = scaledOk ? portioned.finalServings : null;
  const requiresReview = scaledOk ? !!portioned.requiresReview : true;
  const out = Object.assign({}, raw, {
    title: raw.title || 'Rezept',
    servings: finalServings != null ? finalServings : 1,
    sourceServings: portioned.sourceServings,
    sourceServingsStatus: portioned.sourceServingsStatus || SOURCE_SERVINGS_STATUS.UNKNOWN,
    sourceServingsConfidence: portioned.sourceServingsConfidence != null
      ? portioned.sourceServingsConfidence
      : 0,
    sourceServingsMethod: portioned.sourceServingsMethod || null,
    targetServings: targetServings,
    finalServings: finalServings,
    servingsStatus: portioned.servingsStatus || SERVINGS_STATUS.UNKNOWN,
    requiresReview: requiresReview,
    scalingFactor: portioned.scalingFactor != null ? portioned.scalingFactor : null,
    ingredients: finalIngredients,
    finalIngredients: finalIngredients,
    displayIngredients: finalIngredients,
    nutrition: finalNutrition || raw.nutrition || null,
    finalNutrition: finalNutrition,
    nutritionBasis: scaledOk ? 'finalIngredients' : 'unscaled_source',
    nutritionSource: scaledOk ? 'finalIngredients' : 'unscaled_source',
    nutritionServings: finalServings,
    nutritionIngredientCount: finalIngredients.length,
    portionSafe: canDisplayAsSafeSinglePortion({
      finalServings: finalServings,
      servingsStatus: portioned.servingsStatus,
      sourceServingsStatus: portioned.sourceServingsStatus,
      requiresReview: requiresReview,
      portionWarnings: portioned.warnings,
    }),
    portionDisplayHint: getPortionDisplayHint({
      servingsStatus: portioned.servingsStatus,
      sourceServingsStatus: portioned.sourceServingsStatus,
      requiresReview: requiresReview,
    }),
    portionWarnings: portioned.warnings || [],
    validationWarnings: portioned.warnings || [],
    yield: portioned.yield || {
      rawBatchWeight: computeRawBatchWeight(sourceIngredients),
      cookedBatchWeight: null,
      yieldStatus: 'unknown',
      portionWeight: null,
    },
    livePathNormalized: true,
  });

  // Chef-Analyse: bei requiresReview/unknown keine scheinbar sichere Nährwert-Analyse
  if (requiresReview || !scaledOk) {
    if (out.nutrition_note && /kcal|protein|fett|kohlenhydrat|nährwert/i.test(String(out.nutrition_note))) {
      out.nutrition_note = '';
      out.chefAnalysisBlocked = true;
    }
  }

  console.log('TRACE_DISPLAY_RECIPE', JSON.stringify({
    title: out.title,
    servings: out.servings,
    finalServings: out.finalServings,
    sourceServings: out.sourceServings,
    sourceServingsStatus: out.sourceServingsStatus,
    scalingFactor: out.scalingFactor,
    nutritionSource: out.nutritionSource,
    ingredientSample: (out.ingredients || []).slice(0, 3).map(function (i) {
      return { name: i.name, amount: i.amount, unit: i.unit };
    }),
  }));

  try {
    const displayFixes = require('./recipe-display-fixes');
    displayFixes.applyRecipeDisplayFixes(out, {
      noHerbs: !!(o.noHerbs || raw.noHerbs),
      isOriginalRequest: !!(o.isOriginalRequest || raw.recipeSource === 'ai-generated-original'),
      isOriginalBolognese: /bolognese/i.test(String(out.title || '')),
      allergens: o.allergens || raw.allergens || [],
      aiInstruction: o.aiInstruction || raw.ai_instruction || '',
      dairyFreeAdaptation: !!o.dairyFreeAdaptation,
    });
  } catch (eFx) {
    console.warn('[recipe-portions] display fixes failed', eFx && eFx.message);
  }

  try {
    const qualityGate = require('./recipe-quality-gate');
    qualityGate.applyRecipeQualityGate(out, {
      allergens: o.allergens || raw.allergens || [],
    });
  } catch (eQg) {
    console.warn('[recipe-portions] quality gate failed', eQg && eQg.message);
  }

  return out;
}

/**
 * Simuliert den echten Live-Generator-Pfad (v9.2 Render → Display-Vertrag).
 * Skaliert genau einmal aus den Rohmengen – kein zweiter Normalize-Pass.
 */
function runActualLiveRecipePipeline(rawRecipe) {
  console.log('LIVE_RECIPE_PATH_A');
  const pipeline = require('./recipe-pipeline-v92');
  const targetServings = Number(rawRecipe && rawRecipe.targetServings) > 0
    ? Number(rawRecipe.targetServings)
    : 1;
  const asV92 = {
    title: rawRecipe.title,
    servings: rawRecipe.servings != null ? rawRecipe.servings : rawRecipe.sourceServings,
    prep_time_min: rawRecipe.prep_time_min != null ? rawRecipe.prep_time_min : 30,
    nutrition: rawRecipe.nutrition || { kcal: 0, protein_g: 0, fat_g: 0, netto_kh_g: 0, ballaststoffe_g: 0 },
    diet_labels: [],
    target_deviation_note: '',
    ingredients: (rawRecipe.ingredients || []).map(function (ing, i) {
      return {
        id: ing.id || ('000' + (i + 1)).slice(-4),
        name: ing.name || ing.displayName,
        amount: ing.amount,
        unit: ing.unit,
        protein_source: !!ing.protein_source,
        netCarbs: (ing.macrosPer100g && ing.macrosPer100g.netCarbs) || ing.netCarbs || 0,
        fat: (ing.macrosPer100g && ing.macrosPer100g.fat) || ing.fat || 0,
        protein: (ing.macrosPer100g && ing.macrosPer100g.protein) || ing.protein || 0,
        fiber: (ing.macrosPer100g && ing.macrosPer100g.fiber) || ing.fiber || 0,
      };
    }),
    steps: Array.isArray(rawRecipe.steps) && rawRecipe.steps.length
      ? rawRecipe.steps
      : [{ title: 'Zubereiten', content: 'Alle Zutaten zubereiten.', stove_level: 4, time_min: 10 }],
    garnish: rawRecipe.garnish || '',
    chef_analysis: rawRecipe.chef_analysis || '',
  };
  console.log('LIVE_RECIPE_PATH_V92');
  console.log('LIVE_RECIPE_PATH_RENDER');
  console.log('TRACE_RAW_INGREDIENTS', JSON.stringify(asV92.ingredients));
  let rendered = pipeline.renderRecipeForDisplay(asV92, { targetServings: targetServings });
  if (!rendered) {
    console.log('LIVE_RECIPE_PATH_NORMALIZE_FALLBACK');
    rendered = normalizeRecipeToFinalModel(rawRecipe, { targetServings: targetServings });
  } else {
    rendered.finalIngredients = rendered.ingredients;
    rendered.displayIngredients = rendered.ingredients;
    rendered.nutritionSource = rendered.nutritionBasis || 'finalIngredients';
    rendered.finalNutrition = rendered.finalNutrition || rendered.nutrition;
    rendered.nutritionIngredientCount = (rendered.ingredients || []).length;
    rendered.livePathNormalized = true;
  }
  console.log('TRACE_FINAL_INGREDIENTS', JSON.stringify((rendered.finalIngredients || rendered.ingredients || []).map(function (i) {
    return { id: i.id || i._v92_id, name: i.name, amount: i.amount, unit: i.unit };
  })));
  console.log('TRACE_FINAL_NUTRITION', JSON.stringify(rendered.finalNutrition || rendered.nutrition));
  console.log('TRACE_DISPLAY_RECIPE', JSON.stringify({
    finalServings: rendered.finalServings,
    sourceServings: rendered.sourceServings,
    scalingFactor: rendered.scalingFactor,
    nutritionSource: rendered.nutritionSource,
  }));
  return rendered;
}

module.exports = {
  SERVINGS_STATUS: SERVINGS_STATUS,
  SOURCE_SERVINGS_STATUS: SOURCE_SERVINGS_STATUS,
  RECIPE_MODEL_VERSION: RECIPE_MODEL_VERSION,
  INFERRED_WARNING: INFERRED_WARNING,
  UNKNOWN_WARNING: UNKNOWN_WARNING,
  ESTIMATED_UI_HINT: ESTIMATED_UI_HINT,
  scaleIngredients: scaleIngredients,
  scaleDisplayFromFinalBase: scaleDisplayFromFinalBase,
  roundPracticalAmount: roundPracticalAmount,
  applyPracticalRounding: applyPracticalRounding,
  ingredientMapFromList: ingredientMapFromList,
  computeRawBatchWeight: computeRawBatchWeight,
  sumMeatFishGrams: sumMeatFishGrams,
  looksLikeBatchAmounts: looksLikeBatchAmounts,
  inferSourceServingsFromIngredients: inferSourceServingsFromIngredients,
  resolveSourceServings: resolveSourceServings,
  validatePortionPlausibility: validatePortionPlausibility,
  validateRecipeConsistency: validateRecipeConsistency,
  validateRecipePortions: validateRecipePortions,
  buildFinalPortionedRecipe: buildFinalPortionedRecipe,
  buildCoachInput: buildCoachInput,
  canDisplayAsSafeSinglePortion: canDisplayAsSafeSinglePortion,
  getPortionDisplayHint: getPortionDisplayHint,
  normalizeRecipeToFinalModel: normalizeRecipeToFinalModel,
  runActualLiveRecipePipeline: runActualLiveRecipePipeline,
  isMeatOrFishName: isMeatOrFishName,
  isStapleCarbName: isStapleCarbName,
};
