'use strict';
/**
 * Post-KI Display-Fixes für Rezepte:
 * – Nährwert-Plausibilität (Makros pro 100g / Protein vs. Fleischmenge)
 * – noHerbs (Original-Bolognese)
 * – natürliche Zubereitungssätze
 * – milchfreie Anpassung kennzeichnen
 */

const HERB_RE = /petersilie|parsley|prezzemolo|perejil|persil|basilikum|basil|oregano|thymian|thyme|rosmarin|rosemary|schnittlauch|chives|koriander|cilantro|dill|minze|mint|kr[aä]uter|herbs?/i;

const MEAT_FISH_RE = /hack|rind|schwein|lamm|fleisch|beef|pork|lamb|huhn|hühn|hähn|chicken|pute|turkey|fisch|fish|lachs|salmon|thunfisch|tuna|garnelen|shrimp/i;

/** Typische Makros/100g, wenn KI-Werte unplausibel sind. */
const FALLBACK_MACROS_PER_100 = {
  beef_15: { protein: 20, fat: 15, netCarbs: 0, fiber: 0 },
  oil: { protein: 0, fat: 100, netCarbs: 0, fiber: 0 },
  onion: { protein: 1.1, fat: 0.1, netCarbs: 7, fiber: 1.7 },
  carrot: { protein: 0.9, fat: 0.2, netCarbs: 7, fiber: 2.8 },
  celery: { protein: 0.7, fat: 0.2, netCarbs: 1.4, fiber: 1.6 },
  tomato: { protein: 1.2, fat: 0.2, netCarbs: 3.5, fiber: 1.0 },
  wine: { protein: 0.1, fat: 0, netCarbs: 2.5, fiber: 0 },
  default: { protein: 5, fat: 5, netCarbs: 5, fiber: 1 },
};

function nameOf(ing) {
  return String((ing && (ing.displayName || ing.name)) || '');
}

function isHerbName(name) {
  return HERB_RE.test(String(name || ''));
}

function isMeatOrFishName(name) {
  return MEAT_FISH_RE.test(String(name || ''));
}

function detectNoHerbs(recipe, opts) {
  opts = opts || {};
  if (opts.noHerbs === true || recipe.noHerbs === true) return true;
  const blob = [
    recipe.ai_instruction,
    recipe.originalRules,
    opts.aiInstruction,
    opts.originalRules,
  ].filter(Boolean).join(' ');
  if (/KEINE\s+Kr[aä]uter|NO\s+herbs|NIENTE\s+erbe|SIN\s+hierbas|kein\s+Oregano|kein\s+Basilikum|kein\s+Petersilie/i.test(blob)) {
    return true;
  }
  if (
    (opts.isOriginalBolognese || recipe.isOriginalBolognese) ||
    (/rag[uù].*bolognese|bolognese/i.test(String(recipe.title || '')) &&
      (opts.isOriginalRequest || recipe.recipeSource === 'ai-generated-original' ||
        /ORIGINALREZEPT|ORIGINAL RECIPE/i.test(blob)))
  ) {
    return true;
  }
  return false;
}

function detectDairyFreeAdaptation(recipe, opts) {
  opts = opts || {};
  const allergens = []
    .concat(opts.allergens || [])
    .concat(recipe.allergens || [])
    .concat(recipe.userAllergens || []);
  try {
    const lactoseHonesty = require('./lactose-honesty');
    const lactoseActive = lactoseHonesty.hasLactoseAllergen(allergens) || opts.dairyFreeAdaptation === true;
    if (!lactoseActive) return false;
    if (lactoseHonesty.recipeHasAnimalDairy(recipe)) return false;
    // adapted nur mit nachweisbarem etablierten Ersatz
    return lactoseHonesty.recipeHasLactoseSafeDairySubstitute(recipe);
  } catch (_) {
    return false;
  }
}

function finalList(recipe) {
  if (Array.isArray(recipe.finalIngredients) && recipe.finalIngredients.length) {
    return recipe.finalIngredients;
  }
  return Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
}

function macrosOf(ing) {
  if (ing && ing.macrosPer100g && typeof ing.macrosPer100g === 'object') {
    return {
      protein: Number(ing.macrosPer100g.protein) || 0,
      fat: Number(ing.macrosPer100g.fat) || 0,
      netCarbs: Number(ing.macrosPer100g.netCarbs) || 0,
      fiber: Number(ing.macrosPer100g.fiber) || 0,
    };
  }
  return {
    protein: Number(ing && ing.protein) || 0,
    fat: Number(ing && ing.fat) || 0,
    netCarbs: Number(ing && (ing.netCarbs != null ? ing.netCarbs : ing.netto_kh)) || 0,
    fiber: Number(ing && ing.fiber) || 0,
  };
}

function fallbackMacrosForName(name) {
  const n = String(name || '').toLowerCase();
  if (/hack|rind|beef|schwein|pork|lamm|lamb|huhn|hähn|haehn|chicken|pute|turkey|fleisch|meat/.test(n)) {
    return Object.assign({}, FALLBACK_MACROS_PER_100.beef_15);
  }
  if (/parmesan|pecorino|grana/.test(n)) {
    return { protein: 33, fat: 28, netCarbs: 0, fiber: 0 };
  }
  if (/öl|oil|olio|butter|schmalz/.test(n)) return Object.assign({}, FALLBACK_MACROS_PER_100.oil);
  if (/zwiebel|onion|cipolla/.test(n)) return Object.assign({}, FALLBACK_MACROS_PER_100.onion);
  if (/karotte|carrot|möhre|carota/.test(n)) return Object.assign({}, FALLBACK_MACROS_PER_100.carrot);
  if (/sellerie|celery|sedano/.test(n)) return Object.assign({}, FALLBACK_MACROS_PER_100.celery);
  if (/tomate|tomato|passiert/.test(n)) return Object.assign({}, FALLBACK_MACROS_PER_100.tomato);
  if (/wein|wine|vino/.test(n)) return Object.assign({}, FALLBACK_MACROS_PER_100.wine);
  return Object.assign({}, FALLBACK_MACROS_PER_100.default);
}

/**
 * Klemmt Makros/100g. Erkennt auch absolute Proteinmenge als per-100g-Fehler der KI.
 */
function clampMacrosPer100g(name, macros, amountG) {
  let m = {
    protein: Math.max(0, Number(macros && macros.protein) || 0),
    fat: Math.max(0, Number(macros && macros.fat) || 0),
    netCarbs: Math.max(0, Number(macros && (macros.netCarbs != null ? macros.netCarbs : macros.netto_kh)) || 0),
    fiber: Math.max(0, Number(macros && macros.fiber) || 0),
  };
  const isMeat = isMeatOrFishName(name);
  const isOil = /öl|oil|olio|butter|schmalz/i.test(String(name || ''));
  const amt = Number(amountG) || 0;

  // Absolute Gramm-Protein fälschlich als /100g (typisch: 80–150 g Fleisch mit protein≈80–120)
  if (isMeat && amt >= 80 && m.protein > Math.max(40, amt * 0.5)) {
    m = fallbackMacrosForName(name);
    return { macros: m, clamped: true, reason: 'absolute_as_per100' };
  }
  if (isMeat && m.protein > 35) {
    m = fallbackMacrosForName(name);
    return { macros: m, clamped: true, reason: 'meat_protein_cap' };
  }
  if (m.protein > 40 || (!isOil && m.fat > 45) || m.netCarbs > 90) {
    m = fallbackMacrosForName(name);
    return { macros: m, clamped: true, reason: 'implausible_per100' };
  }
  if (isOil) {
    m.protein = 0;
    m.fat = Math.min(100, Math.max(m.fat, 99));
    m.netCarbs = 0;
    m.fiber = 0;
  }
  return { macros: m, clamped: false, reason: null };
}

function computeNutritionFromIngredients(ings) {
  let protein = 0;
  let fat = 0;
  let nettoKh = 0;
  let fiber = 0;
  (ings || []).forEach(function (ing) {
    const grams = Number(ing.amount) || 0;
    const m = macrosOf(ing);
    const f = grams / 100;
    protein += m.protein * f;
    fat += m.fat * f;
    nettoKh += m.netCarbs * f;
    fiber += m.fiber * f;
  });
  const kcal = Math.round(protein * 4 + fat * 9 + nettoKh * 4);
  const p = Math.round(protein * 10) / 10;
  const fa = Math.round(fat * 10) / 10;
  const nc = Math.round(nettoKh * 10) / 10;
  const fi = Math.round(fiber * 10) / 10;
  return {
    kcal: kcal,
    calories: kcal,
    protein_g: p,
    protein: p,
    fat_g: fa,
    fat: fa,
    netto_kh_g: nc,
    netCarbs: nc,
    carbs: nc,
    ballaststoffe_g: fi,
    fiber: fi,
  };
}

function recomputeFinalNutrition(recipe) {
  const n = computeNutritionFromIngredients(finalList(recipe));
  recipe.finalNutrition = n;
  recipe.nutrition = n;
  recipe.nutritionSource = 'finalIngredients';
  recipe.nutritionBasis = 'finalIngredients';
  recipe.nutritionServings = recipe.finalServings != null ? recipe.finalServings : recipe.servings;
  return n;
}

function formatNutritionSummary(finalNutrition) {
  const n = finalNutrition || {};
  const netCarbs = Number(
    n.netto_kh_g != null ? n.netto_kh_g : (n.netCarbs != null ? n.netCarbs : n.carbs)
  ) || 0;
  return {
    calories: Math.round(Number(n.kcal != null ? n.kcal : n.calories) || 0),
    carbs: Math.round(netCarbs),
    netCarbs: Math.round(netCarbs * 10) / 10,
    fat: Math.round((Number(n.fat_g != null ? n.fat_g : n.fat) || 0) * 10) / 10,
    protein: Math.round((Number(n.protein_g != null ? n.protein_g : n.protein) || 0) * 10) / 10,
    fiber: Math.round((Number(n.ballaststoffe_g != null ? n.ballaststoffe_g : n.fiber) || 0) * 10) / 10,
  };
}

/**
 * Entfernt Kräuter aus Zutaten, Schritten, Garnitur, Einkaufsliste.
 */
function enforceNoHerbs(recipe) {
  if (!recipe || typeof recipe !== 'object') return recipe;
  const before = finalList(recipe);
  const herbIds = {};
  before.forEach(function (ing) {
    if (isHerbName(nameOf(ing))) {
      herbIds[String(ing.id || ing._v92_id || '')] = true;
    }
  });
  const kept = before.filter(function (ing) { return !isHerbName(nameOf(ing)); });
  const removed = before.length - kept.length;

  recipe.finalIngredients = kept;
  recipe.ingredients = kept;
  recipe.displayIngredients = kept;

  if (Array.isArray(recipe.shopping_list)) {
    recipe.shopping_list = recipe.shopping_list.filter(function (line) {
      return !isHerbName(String(line || ''));
    });
  }
  if (recipe.garnish && isHerbName(recipe.garnish)) {
    recipe.garnish = '';
  } else if (recipe.garnish) {
    recipe.garnish = String(recipe.garnish).replace(HERB_RE, '').replace(/\s{2,}/g, ' ').trim();
  }

  if (Array.isArray(recipe.steps)) {
    recipe.steps = recipe.steps
      .map(function (step) {
        if (typeof step === 'string') {
          if (isHerbName(step) && /garnier|bestreu/i.test(step)) return null;
          const cleaned = step.replace(HERB_RE, '').replace(/\s{2,}/g, ' ').trim();
          return cleaned || null;
        }
        if (!step || typeof step !== 'object') return step;
        const next = Object.assign({}, step);
        const text = String(next.instruction || next.content || next.text || '');
        if (/garnier/i.test(text) && isHerbName(text)) return null;
        if (next.instruction != null) {
          next.instruction = text.replace(HERB_RE, '').replace(/\s{2,}/g, ' ').trim();
        }
        if (next.content != null) {
          next.content = String(next.content).replace(HERB_RE, '').replace(/\s{2,}/g, ' ').trim();
        }
        if (Array.isArray(next.ingredientIds)) {
          next.ingredientIds = next.ingredientIds.filter(function (id) {
            return !herbIds[String(id)];
          });
        }
        const left = String(next.instruction || next.content || next.text || '').trim();
        return left ? next : null;
      })
      .filter(Boolean);
  }

  if (removed > 0) {
    recipe._herbsRemoved = true;
    recipe.noHerbs = true;
    recomputeFinalNutrition(recipe);
  }
  return recipe;
}

/**
 * Klemmt unplausible Makros/100g und erkennt Protein-Absurditäten.
 */
function sanitizeIngredientMacros(recipe) {
  const issues = [];
  let clamped = false;
  const ings = finalList(recipe);
  let meatGrams = 0;

  ings.forEach(function (ing) {
    const name = nameOf(ing);
    const amt = Number(ing.amount) || 0;
    const unit = String(ing.unit || 'g').toLowerCase();
    const grams = unit === 'kg' ? amt * 1000 : amt;
    let m = macrosOf(ing);
    const isMeat = isMeatOrFishName(name) || !!ing._protein_source || !!ing.protein_source;

    const clampedOne = clampMacrosPer100g(name, m, grams);
    m = clampedOne.macros;
    if (clampedOne.clamped) {
      clamped = true;
      issues.push('Makros für „' + name + '“ korrigiert (unplausible KI-Werte)');
    }
    if (isMeat && grams > 0) meatGrams += grams;

    ing.macrosPer100g = m;
    ing.protein = m.protein;
    ing.fat = m.fat;
    ing.netCarbs = m.netCarbs;
    ing.fiber = m.fiber;
  });

  let nutrition = computeNutritionFromIngredients(ings);
  let ok = true;

  // Protein-Bremse: Gesamtprotein darf Fleischmasse nicht physikalisch sprengen
  const proteinCap = meatGrams > 0 ? meatGrams * 0.35 + 8 : null;
  if (proteinCap != null && nutrition.protein_g > proteinCap) {
    clamped = true;
    ok = false;
    issues.push(
      'Protein (' + nutrition.protein_g + ' g) unplausibel für ' +
        Math.round(meatGrams) + ' g Fleisch/Fisch – Makros neu berechnet.'
    );
    ings.forEach(function (ing) {
      const name = nameOf(ing);
      if (!isMeatOrFishName(name) && !ing._protein_source && !ing.protein_source) return;
      const m = fallbackMacrosForName(name);
      ing.macrosPer100g = m;
      ing.protein = m.protein;
      ing.fat = m.fat;
      ing.netCarbs = m.netCarbs;
      ing.fiber = m.fiber;
    });
    nutrition = computeNutritionFromIngredients(ings);
    if (nutrition.protein_g <= proteinCap) ok = true;
  }

  const totalMass = ings.reduce(function (s, i) {
    return s + (Number(i.amount) || 0);
  }, 0);
  if (totalMass > 0 && nutrition.protein_g > Math.max(totalMass * 0.35, 50) && nutrition.protein_g > 80) {
    issues.push('Die Nährwertdaten passen nicht plausibel zu den angegebenen Zutatenmengen.');
    ok = false;
  }

  return { ok: ok, issues: issues, clamped: clamped, nutrition: nutrition };
}

const ACTION_SENTENCES = {
  heat_oil: 'Das Olivenöl in einem schweren Topf erhitzen.',
  saute_soffritto: 'Zwiebel, Karotte und Sellerie darin bei mittlerer Hitze langsam anschwitzen, bis das Gemüse weich ist.',
  brown_meat: 'Das Rinderhackfleisch hinzufügen und unter Rühren krümelig anbraten.',
  deglaze: 'Mit dem Rotwein ablöschen und kurz einkochen lassen.',
  add_tomato: 'Passierte Tomaten und Tomatenmark einrühren.',
  simmer: 'Das Ragù bei niedriger Hitze etwa zwei Stunden sanft köcheln lassen und gelegentlich umrühren.',
  season: 'Mit Salz und Pfeffer abschmecken.',
  garnish_parsley: 'Das Ragù nach Wunsch mit Petersilie garnieren.',
};

function looksLikeLabelColonDump(text) {
  const t = String(text || '').trim();
  if (!/^[^:]{3,60}:\s*\S/.test(t)) return false;
  const after = t.split(':').slice(1).join(':').trim();
  if (!after) return false;
  if (/[.!?]/.test(after) && /\b(und|mit|lassen|erhitzen)\b/i.test(after)) return false;
  return /^[A-ZÄÖÜa-zäöüß][A-Za-zÄÖÜäöüß0-9\-]*(?:\s+[A-ZÄÖÜa-zäöüß][A-Za-zÄÖÜäöüß0-9\-]*){0,10}$/.test(after);
}

function looksLikeBareNameList(text) {
  const t = String(text || '').trim();
  if (!t || /[.!?]/.test(t)) return false;
  if (/\b(und|mit|erhitzen|braten|kochen|dünsten|mischen|geben|schneiden|würzen|köcheln|abschmecken|servieren|einrühren|ablöschen)\b/i.test(t)) {
    return false;
  }
  const toks = t.split(/\s+/).filter(Boolean);
  return toks.length >= 1 && toks.length <= 12;
}

function inferActionKey(title, content, index, total) {
  const blob = (String(title || '') + ' ' + String(content || '')).toLowerCase();
  if (/garnier|petersilie|parsley/.test(blob)) return 'garnish_parsley';
  if (/abschmeck|würz|season|salz/.test(blob) && !/köchel|simmer/.test(blob)) return 'season';
  if (/köchel|schmor|simmer|langsam/.test(blob)) return 'simmer';
  if (/wein|ablösch|deglaze/.test(blob)) return 'deglaze';
  if (/tomate|passiert|tomatenmark/.test(blob)) return 'add_tomato';
  if (/fleisch|hack|braten|brown/.test(blob)) return 'brown_meat';
  if (/gemüse|anschwitz|soffritto|zwiebel|karotte|sellerie/.test(blob)) return 'saute_soffritto';
  if (/öl|erhitzen|heat/.test(blob) && index === 0) return 'heat_oil';
  if (index >= total - 1) return 'season';
  return null;
}

function rewriteStepsNatural(recipe, opts) {
  opts = opts || {};
  const noHerbs = !!opts.noHerbs || !!recipe.noHerbs;
  const stepsIn = Array.isArray(recipe.steps) ? recipe.steps : [];
  const out = [];

  stepsIn.forEach(function (step, i) {
    let title = '';
    let content = '';
    let durationMinutes = null;
    let heatLevel = null;
    let actionId = null;
    let ingredientIds = null;

    if (typeof step === 'string') {
      content = step;
      if (looksLikeLabelColonDump(content)) {
        const parts = content.split(':');
        title = parts[0].trim();
        content = parts.slice(1).join(':').trim();
      }
    } else if (step && typeof step === 'object') {
      title = String(step.title || '');
      content = String(step.instruction || step.content || step.text || '');
      durationMinutes = step.durationMinutes != null ? step.durationMinutes : step.time_min;
      heatLevel = step.heatLevel != null ? step.heatLevel : step.stove_level;
      actionId = step.actionId || null;
      ingredientIds = Array.isArray(step.ingredientIds) ? step.ingredientIds.slice() : null;
      if (!title && looksLikeLabelColonDump(content)) {
        const parts = content.split(':');
        title = parts[0].trim();
        content = parts.slice(1).join(':').trim();
      }
    }

    const combined = title && content ? (title + ': ' + content) : (content || title);

    if (/köcheln/i.test(combined) && /garnier/i.test(combined)) {
      out.push({
        stepNumber: out.length + 1,
        actionId: 'simmer',
        ingredientIds: [],
        instruction: ACTION_SENTENCES.simmer,
        durationMinutes: durationMinutes != null ? durationMinutes : 120,
        heatLevel: heatLevel,
      });
      if (!noHerbs) {
        out.push({
          stepNumber: out.length + 1,
          actionId: 'garnish',
          ingredientIds: ['parsley'],
          instruction: ACTION_SENTENCES.garnish_parsley,
          durationMinutes: 1,
          heatLevel: 0,
        });
      }
      return;
    }

    if (/garnier/i.test(combined) && noHerbs) return;

    let instruction = content || title;
    const needsRewrite = looksLikeLabelColonDump(combined) || looksLikeBareNameList(content) ||
      looksLikeBareNameList(combined);

    if (needsRewrite) {
      const key = inferActionKey(title, content, i, stepsIn.length);
      if (key === 'garnish_parsley' && noHerbs) return;
      if (key && ACTION_SENTENCES[key]) {
        // Nur kanonische Sätze – niemals Zutaten-Namenlisten einbetten
        instruction = ACTION_SENTENCES[key];
        actionId = actionId || key;
      } else if (title) {
        if (/erhitzen|öl/i.test(title)) {
          instruction = ACTION_SENTENCES.heat_oil;
        } else if (/anschwitz|gemüse|soffritto/i.test(title)) {
          instruction = ACTION_SENTENCES.saute_soffritto;
        } else if (/braten|fleisch|hack/i.test(title)) {
          instruction = ACTION_SENTENCES.brown_meat;
        } else if (/ablösch|wein/i.test(title)) {
          instruction = ACTION_SENTENCES.deglaze;
        } else if (/hinzufüg|tomate/i.test(title)) {
          instruction = ACTION_SENTENCES.add_tomato;
        } else if (/würz|abschmeck/i.test(title)) {
          instruction = ACTION_SENTENCES.season;
        } else if (/köchel|schmor|simmer/i.test(title)) {
          instruction = ACTION_SENTENCES.simmer;
        } else {
          instruction = title.replace(/:\s*$/, '') + '.';
        }
      }
    }

    if (looksLikeLabelColonDump(instruction)) {
      const before = instruction.split(':')[0].trim();
      instruction = before.charAt(0).toUpperCase() + before.slice(1) + '.';
    }

    out.push({
      stepNumber: out.length + 1,
      actionId: actionId || inferActionKey(title, instruction, i, stepsIn.length) || 'mix',
      ingredientIds: ingredientIds,
      instruction: String(instruction || '').trim(),
      durationMinutes: durationMinutes,
      heatLevel: heatLevel,
    });
  });

  recipe.steps = out.map(function (s) { return s.instruction; });
  recipe.structuredSteps = out;
  recipe._stepsNaturalized = true;
  return recipe;
}

function applyDairyFreeAdaptation(recipe, opts) {
  if (!detectDairyFreeAdaptation(recipe, opts)) return recipe;
  try {
    const lactoseHonesty = require('./lactose-honesty');
    return lactoseHonesty.applyLactoseHonestyAdaptation(recipe, opts);
  } catch (_) {
    const flags = Array.isArray(recipe.adaptationFlags) ? recipe.adaptationFlags.slice() : [];
    if (flags.indexOf('dairy_free_adaptation') < 0) flags.push('dairy_free_adaptation');
    recipe.adaptationFlags = flags;
    recipe.adaptationNote =
      recipe.adaptationNote ||
      'Weil du Laktose meidest, haben wir dieses Gericht direkt mit passenden laktosefreien Alternativen zubereitet.';
    recipe.isUnmodifiedOriginal = false;
    return recipe;
  }
}

function applyRecipeDisplayFixes(recipe, opts) {
  opts = opts || {};
  if (!recipe || typeof recipe !== 'object') return recipe;

  const noHerbs = detectNoHerbs(recipe, opts);
  if (noHerbs) {
    recipe.noHerbs = true;
    enforceNoHerbs(recipe);
  }

  const macroResult = sanitizeIngredientMacros(recipe);
  recomputeFinalNutrition(recipe);
  recipe._nutritionPlausibilityIssues = macroResult.issues || [];
  // Nach Korrektur der Makros/100g: erneut prüfen
  const check = sanitizeIngredientMacros(recipe);
  recomputeFinalNutrition(recipe);
  recipe._nutritionImplausible = !check.ok;
  if (check.issues.length) {
    recipe._nutritionPlausibilityIssues = check.issues;
  }

  rewriteStepsNatural(recipe, { noHerbs: noHerbs });
  applyDairyFreeAdaptation(recipe, opts);

  recipe.shopping_list = finalList(recipe).map(function (ing) {
    const n = nameOf(ing);
    const amt = Number(ing.amount);
    const unit = ing.unit || 'g';
    if (!amt) return n;
    return n + ' – ' + amt + ' ' + unit;
  });

  return recipe;
}

module.exports = {
  HERB_RE: HERB_RE,
  detectNoHerbs: detectNoHerbs,
  detectDairyFreeAdaptation: detectDairyFreeAdaptation,
  enforceNoHerbs: enforceNoHerbs,
  sanitizeIngredientMacros: sanitizeIngredientMacros,
  clampMacrosPer100g: clampMacrosPer100g,
  computeNutritionFromIngredients: computeNutritionFromIngredients,
  recomputeFinalNutrition: recomputeFinalNutrition,
  formatNutritionSummary: formatNutritionSummary,
  rewriteStepsNatural: rewriteStepsNatural,
  applyDairyFreeAdaptation: applyDairyFreeAdaptation,
  applyRecipeDisplayFixes: applyRecipeDisplayFixes,
  looksLikeLabelColonDump: looksLikeLabelColonDump,
  looksLikeBareNameList: looksLikeBareNameList,
  isHerbName: isHerbName,
  ACTION_SENTENCES: ACTION_SENTENCES,
};
