'use strict';
const apiI18n = require('./api-i18n');
/**
 * Recipe Quality Gate – zentrale Validierung vor Anzeige.
 * qualityStatus: ready | review | blocked
 *
 * Die KI-Antwort allein ist nie automatisch "ready".
 */

const portions = require('./recipe-portions');
const culinaryUsability = require('./culinary-usability');
const validator = require('./recipe-validator');

const QUALITY_STATUS = {
  READY: 'ready',
  REVIEW: 'review',
  BLOCKED: 'blocked',
};

const CHECK_STATUS = {
  PASS: 'pass',
  WARNING: 'warning',
  FAIL: 'fail',
};

/** Englische Coach-/HealthScore-Meldungen → DE-Keys in api-i18n. */
const EN_COACH_WARN_TO_KEY = {
  'High fat per serving – check portion size or preparation.': 'warn_high_fat',
  'Low protein per serving – consider a protein-rich side or alternative.': 'warn_low_protein',
  'High net carbs per serving.': 'warn_high_carbs',
  'Low fiber – add whole grains or vegetables.': 'warn_low_fiber',
  'Calorie-dense per serving (> 800 kcal).': 'warn_high_calories',
};

function checkResult(status, issues) {
  return {
    status: status,
    issues: Array.isArray(issues) ? issues.filter(Boolean) : [],
  };
}

function stepInstruction(step) {
  if (typeof step === 'string') return String(step || '').trim();
  if (!step || typeof step !== 'object') return '';
  return String(step.instruction || step.content || step.text || '').trim();
}

function setStepInstruction(step, text) {
  if (typeof step === 'string') return text;
  const copy = Object.assign({}, step);
  if (copy.content != null) copy.content = text;
  else if (copy.instruction != null) copy.instruction = text;
  else if (copy.text != null) copy.text = text;
  else copy.content = text;
  return copy;
}

function finalIngredientList(recipe) {
  if (Array.isArray(recipe.finalIngredients) && recipe.finalIngredients.length) {
    return recipe.finalIngredients;
  }
  return Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
}

/** Struktur: Pflichtfelder und finalIngredients vorhanden. */
function validateRecipeStructure(recipe) {
  const issues = [];
  const lang = apiI18n.normalizeLang((recipe && recipe.lang) || 'en');
  if (!recipe || typeof recipe !== 'object') {
    return checkResult(CHECK_STATUS.FAIL, [apiI18n.t('err_no_recipe_object', lang)]);
  }
  if (!String(recipe.title || '').trim()) {
    issues.push('Title missing');
  }
  const ings = finalIngredientList(recipe);
  if (!ings.length) {
    issues.push('finalIngredients missing or empty');
  }
  if (!Array.isArray(recipe.steps) || recipe.steps.length === 0) {
    issues.push('No preparation steps');
  }
  if (issues.length) return checkResult(CHECK_STATUS.FAIL, issues);
  return checkResult(CHECK_STATUS.PASS, []);
}

/** Portionen: unknown = fail/blocked, inferred = warning/review. */
function validatePortions(recipe) {
  const issues = [];
  const sourceStatus = String(recipe.sourceServingsStatus || recipe.servingsStatus || '');
  const sourceServings = Number(recipe.sourceServings);
  const finalServings = Number(recipe.finalServings != null ? recipe.finalServings : recipe.servings);
  const nutritionSource = String(recipe.nutritionSource || recipe.nutritionBasis || '');

  if (sourceStatus === 'unknown' || recipe.servingsStatus === 'unknown') {
    return checkResult(CHECK_STATUS.FAIL, [
      'Source servings are unknown. Safe scaling is not possible.',
    ]);
  }
  if (!(Number.isFinite(sourceServings) && sourceServings > 0) && sourceStatus !== 'explicit') {
    if (sourceStatus === 'inferred') {
      if (recipe.singlePortionNormalized || Number(recipe.finalServings) === 1) {
        return checkResult(CHECK_STATUS.PASS, issues);
      }
      issues.push('Portion size estimated – please check');
      return checkResult(CHECK_STATUS.WARNING, issues);
    }
    return checkResult(CHECK_STATUS.FAIL, ['sourceServings missing or invalid']);
  }
  if (!(Number.isFinite(finalServings) && finalServings > 0)) {
    return checkResult(CHECK_STATUS.FAIL, ['finalServings missing or invalid']);
  }
  if (nutritionSource && nutritionSource !== 'finalIngredients' && nutritionSource !== 'unscaled_source') {
    issues.push('nutritionSource unexpected: ' + nutritionSource);
  }
  if (sourceStatus === 'inferred' || recipe.requiresReview || recipe.portionSafe === false) {
    // Erfolgreich auf 1 Portion normiert → kein Schätz-Banner mehr
    if (
      recipe.singlePortionNormalized ||
      Number(recipe.finalServings) === 1
    ) {
      return checkResult(CHECK_STATUS.PASS, issues);
    }
    issues.push(recipe.portionDisplayHint || 'Portion size estimated – please check');
    return checkResult(CHECK_STATUS.WARNING, issues);
  }
  return checkResult(CHECK_STATUS.PASS, issues);
}

/** Nährwerte nur aus finalIngredients / finalNutrition. */
function validateNutrition(recipe) {
  const issues = [];
  const n = recipe.finalNutrition || (
    recipe.nutritionBasis === 'finalIngredients' || recipe.nutritionSource === 'finalIngredients'
      ? recipe.nutrition
      : null
  );
  if (!n || typeof n !== 'object') {
    if (String(recipe.sourceServingsStatus) === 'unknown') {
      return checkResult(CHECK_STATUS.FAIL, ['No reliable nutrition without portioning']);
    }
    return checkResult(CHECK_STATUS.WARNING, ['finalNutrition missing']);
  }
  const kcal = Number(n.kcal != null ? n.kcal : n.calories);
  const protein = Number(n.protein_g != null ? n.protein_g : n.protein);
  const fat = Number(n.fat_g != null ? n.fat_g : n.fat);
  const carbs = Number(n.netto_kh_g != null ? n.netto_kh_g : n.netCarbs);
  const fiber = Number(n.ballaststoffe_g != null ? n.ballaststoffe_g : n.fiber);
  if (!Number.isFinite(kcal) || kcal < 0) issues.push('Calories invalid');
  if (Number.isFinite(protein) && protein < 0) issues.push('Protein negativ');
  if (Number.isFinite(fat) && fat < 0) issues.push('Fett negativ');
  if (Number.isFinite(carbs) && carbs < 0) issues.push('Kohlenhydrate negativ');
  if (Number.isFinite(fiber) && fiber < 0) issues.push('Ballaststoffe negativ');

  const src = String(recipe.nutritionSource || recipe.nutritionBasis || '');
  if (src && src !== 'finalIngredients' && src !== 'unscaled_source' && src !== 'finalNutrition') {
    issues.push('Nutrition does not come from finalIngredients');
  }

  // Protein-Plausibilität vs. Fleischmenge / Gesamtmasse
  const ings = finalIngredientList(recipe);
  let meatGrams = 0;
  let totalMass = 0;
  ings.forEach(function (ing) {
    const amt = Number(ing && ing.amount) || 0;
    totalMass += amt;
    const nm = String((ing && (ing.displayName || ing.name)) || '');
    if (/hack|rind|schwein|lamm|fleisch|beef|pork|huhn|hähn|fisch|lachs/i.test(nm) ||
        ing._protein_source || ing.protein_source) {
      meatGrams += amt;
    }
  });
  if (meatGrams > 0 && Number.isFinite(protein) && protein > meatGrams * 0.4) {
    issues.push('Nutrition data does not plausibly match the stated ingredient amounts.');
  }
  if (recipe._nutritionImplausible) {
    issues.push('Nutrition data does not plausibly match the stated ingredient amounts.');
  }
  if ((recipe._nutritionPlausibilityIssues || []).length && !issues.some(function (i) {
    return /passen nicht plausibel/.test(i);
  })) {
    issues.push.apply(issues, recipe._nutritionPlausibilityIssues.slice(0, 2));
  }

  // nutrition vs finalNutrition Drift
  if (recipe.nutrition && recipe.finalNutrition &&
      Number(recipe.nutrition.netto_kh_g) !== Number(recipe.finalNutrition.netto_kh_g) &&
      Number.isFinite(Number(recipe.nutrition.netto_kh_g)) &&
      Number.isFinite(Number(recipe.finalNutrition.netto_kh_g))) {
    issues.push('nutrition und finalNutrition weichen bei Netto-KH ab');
  }

  if (issues.some(function (i) {
    return /ungültig|negativ|nicht aus|passen nicht plausibel|invalid|does not come from|does not plausibly match/i.test(i);
  })) {
    return checkResult(CHECK_STATUS.FAIL, issues);
  }
  if (issues.length) return checkResult(CHECK_STATUS.WARNING, issues);
  return checkResult(CHECK_STATUS.PASS, []);
}

/**
 * Allergene: opts.allergenPhrases = [{ label, phrases: string[] }]
 * oder opts.allergenConflictLabel = bereits erkannter Konflikt.
 * Laktose: pflanzliche/laktosefreie Alternativen und „laktosefrei“ zählen nicht als Treffer.
 */
function validateAllergens(recipe, opts) {
  opts = opts || {};
  const lang = apiI18n.normalizeLang((opts && opts.lang) || (recipe && recipe.lang) || 'en');
  if (opts.allergenConflictLabel) {
    return checkResult(CHECK_STATUS.FAIL, [
      apiI18n.t('allergen_detected', lang, { label: opts.allergenConflictLabel }),
    ]);
  }
  let phrases = Array.isArray(opts.allergenPhrases) ? opts.allergenPhrases.slice() : [];
  // Pipeline liefert oft nur allergens[] – Laktose-Phrases deterministisch ergänzen.
  if (!phrases.length && Array.isArray(opts.allergens) && opts.allergens.length) {
    try {
      const lactoseHonesty = require('./lactose-honesty');
      const entry = lactoseHonesty.buildLactoseAllergenPhraseEntry(opts.allergens);
      if (entry) phrases = [entry];
    } catch (_) { /* optional */ }
  }
  if (!phrases.length) return checkResult(CHECK_STATUS.PASS, []);

  let lactoseHonesty = null;
  try { lactoseHonesty = require('./lactose-honesty'); } catch (_) { lactoseHonesty = null; }

  const ings = finalIngredientList(recipe);
  // Laktose: nur echte tierische Milchprodukte in Zutaten prüfen (nicht Titel/Steps mit „Sahne“-Wort
  // bei bereits ersetzten Alternativen).
  for (let i = 0; i < phrases.length; i++) {
    const entry = phrases[i];
    const label = String(entry.label || '');
    const isLactoseEntry = /laktose|lactose|milch|dairy|milk/i.test(label) ||
      (Array.isArray(entry.phrases) && entry.phrases.some(function (p) {
        return /milch|sahne|butter|joghurt|cream|milk/i.test(String(p || ''));
      }));
    if (isLactoseEntry && lactoseHonesty) {
      const hit = ings.find(function (ing) {
        return lactoseHonesty.isAnimalDairyName(
          String((ing && (ing.displayName || ing.name)) || '')
        );
      });
      if (hit) {
        return checkResult(CHECK_STATUS.FAIL, [
          apiI18n.t('allergen_detected', lang, { label: entry.label || 'Laktose' }),
        ]);
      }
      continue;
    }
    const list = Array.isArray(entry.phrases) ? entry.phrases : [];
    const parts = [String(recipe.title || '')];
    ings.forEach(function (ing) {
      parts.push(String((ing && (ing.displayName || ing.name)) || ''));
    });
    (Array.isArray(recipe.steps) ? recipe.steps : []).forEach(function (s) {
      parts.push(stepInstruction(s));
    });
    const hay = parts.join('\n').toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
    for (let j = 0; j < list.length; j++) {
      const p = String(list[j] || '').toLowerCase().trim();
      if (p.length < 2) continue;
      if (hay.indexOf(p) >= 0) {
        return checkResult(CHECK_STATUS.FAIL, [
          apiI18n.t('allergen_detected', lang, { label: entry.label || p }),
        ]);
      }
    }
  }
  return checkResult(CHECK_STATUS.PASS, []);
}

/** Zutaten-/Titel-/Schritt-Konsistenz. Kritische Mismatches = fail. */
function validateIngredientConsistency(recipe) {
  const ingsForCons = finalIngredientList(recipe);
  const cons = portions.validateRecipeConsistency({
    title: recipe.title,
    finalIngredients: ingsForCons,
    ingredients: ingsForCons,
    steps: recipe.steps || [],
  });
  const errors = (cons.errors || []).slice();
  const warnings = [];
  let lactoseHonesty = null;
  try { lactoseHonesty = require('./lactose-honesty'); } catch (_) { lactoseHonesty = null; }
  const sahneSatisfied = lactoseHonesty
    ? lactoseHonesty.ingredientSatisfiesSahneSlot(
      ingsForCons,
      String(recipe.title || '') + ' ' + (Array.isArray(recipe.steps) ? recipe.steps.map(function (s) {
        return typeof s === 'string' ? s : String((s && (s.instruction || s.content || s.text)) || '');
      }).join(' ') : '')
    )
    : false;
  (cons.warnings || []).forEach(function (w) {
    const s = String(w);
    // Sahne/Creme-Mismatch: kein Fail, wenn laktosefreie/pflanzliche Alternativen in finalIngredients stehen
    if (/sahne/i.test(s) && /fehlt|keine/i.test(s) && sahneSatisfied) {
      return;
    }
    // Pasta/Reis/Lachs in Schritt/Titel ohne Zutat → blockierend
    if (/fehlt in finalIngredients|keine Sahne|kein Lachs|kein Hackfleisch/i.test(s)) {
      if (/pasta|reis|lachs|hackfleisch|sahne/i.test(s) && /fehlt|keine|kein/i.test(s)) {
        errors.push(s);
        return;
      }
    }
    warnings.push(s);
  });

  const title = String(recipe.title || '');
  const ings = finalIngredientList(recipe);
  if (/\bpasta\b|nudel/i.test(title)) {
    const blob = ings.map(function (i) {
      return String((i && (i.displayName || i.name)) || '').toLowerCase();
    }).join(' ');
    if (!/pasta|nudel|spaghetti|penne|fusilli|tagliatelle|linguine/.test(blob)) {
      errors.push('Title mentions pasta, but no pasta in finalIngredients');
    }
  }

  if (errors.length) return checkResult(CHECK_STATUS.FAIL, errors.concat(warnings));
  if (warnings.length) return checkResult(CHECK_STATUS.WARNING, warnings);
  return checkResult(CHECK_STATUS.PASS, []);
}

/**
 * Klassiker-Core + Prosa-Komponenten-Vollständigkeit (Türsteher).
 * Unvollständige Klassiker → blocked; fehlende Rohzutaten zu genannten Komponenten → blocked.
 */
function validateClassicCompleteness(recipe, opts) {
  opts = opts || {};
  try {
    const classic = require('./classic-culinary-standards');
    const issues = [];
    const ctx = {
      dishQuery: opts.dishQuery || recipe.dishQuery || recipe.title || '',
      title: recipe.title,
      ai_instruction: opts.ai_instruction || recipe.ai_instruction || '',
      pantry_ingredients: opts.pantry_ingredients || recipe.pantry_ingredients,
    };
    const core = classic.validateClassicCoreComponents(recipe, ctx);
    (core.problems || []).forEach(function (p) { issues.push(p); });
    const prose = classic.validateProseComponentCompleteness(recipe);
    (prose.problems || []).forEach(function (p) { issues.push(p); });
    if (issues.length) return checkResult(CHECK_STATUS.FAIL, issues);
    return checkResult(CHECK_STATUS.PASS, []);
  } catch (e) {
    return checkResult(CHECK_STATUS.WARNING, [
      'classic-completeness check skipped: ' + (e && e.message),
    ]);
  }
}

/** Bare Namenlisten / Rohdaten in Instructions. */
function looksLikeBareIngredientDump(text) {
  const t = String(text || '').trim();
  if (!t || t.length < 4) return false;
  // "Titel: Zwiebel Karotte Sellerie"
  if (/^[^:]{3,60}:\s*[A-ZÄÖÜa-zäöüß]/.test(t)) {
    const after = t.split(':').slice(1).join(':').trim();
    if (after && !/[.!?]/.test(after) &&
        !/\b(und|mit|lassen|erhitzen|braten|kochen)\b/i.test(after)) {
      return true;
    }
  }
  if (/[.!?:,;]/.test(t) && /\b(und|mit|in|auf|bei|bis|dann|erhitzen|braten|kochen|mischen|geben|schneiden)\b/i.test(t)) {
    return false;
  }
  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2 && tokens.length <= 12) {
    const hasVerb = /\b(erhitzen|braten|kochen|dünsten|mischen|rühren|geben|schneiden|würzen|abschmecken|köcheln|garen|anbraten|anschwitzen|servieren|ziehen|ablöschen|einrühren)\b/i.test(t);
    if (!hasVerb && !/[.!?]/.test(t)) return true;
  }
  return false;
}

const ACTION_FALLBACKS = {
  saute: 'Sweat the ingredients over medium heat until translucent.',
  pan_fry: 'Pan-fry the ingredients until golden brown.',
  boil: 'Cook the ingredients in enough water until done.',
  simmer: 'Simmer everything gently over low heat.',
  mix: 'Mix the ingredients thoroughly.',
  season: 'Mit Salz und Pfeffer abschmecken.',
  serve: 'Anrichten und sofort servieren.',
};

function validateInstructions(recipe) {
  const issues = [];
  const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
  let fallbackUsed = false;
  const repaired = [];
  const ings = finalIngredientList(recipe);
  let stutterCleaned = 0;

  steps.forEach(function (step, i) {
    let text = stepInstruction(step);
    if (!text) {
      issues.push('Leerer Zubereitungsschritt ' + (i + 1));
      repaired.push(step);
      return;
    }
    // Auto-Cleanup: Zutaten-Dopplungen im Step-Text (vor Client-Rückgabe)
    const cleaned = validator.cleanupStepProseDuplicates(text, ings);
    if (cleaned !== text) {
      stutterCleaned += 1;
      text = cleaned;
      step = setStepInstruction(step, cleaned);
    }
    if (looksLikeBareIngredientDump(text)) {
      const action = (step && step.actionId) || guessActionFromContext(text, i, steps.length);
      const fb = ACTION_FALLBACKS[action] || ACTION_FALLBACKS.mix;
      fallbackUsed = true;
      if (typeof step === 'string') {
        repaired.push(fb);
      } else {
        repaired.push(Object.assign({}, step, { instruction: fb, content: fb, _instructionFallbackUsed: true }));
      }
      issues.push('Step ' + (i + 1) + ': raw enumeration replaced by fallback');
      return;
    }
    repaired.push(step);
  });

  recipe._qualityRepairedSteps = repaired;
  recipe._instructionFallbackUsed = fallbackUsed;
  if (stutterCleaned > 0) {
    recipe._stepStutterCleaned = stutterCleaned;
    // Soft-Repair: bereinigt, ohne Review zu erzwingen
  }

  // Nach Fallback: wenn immer noch Dumps → fail
  const stillBad = repaired.some(function (s) {
    return looksLikeBareIngredientDump(stepInstruction(s));
  });
  if (stillBad) {
    return checkResult(CHECK_STATUS.FAIL, issues.concat(['Preparation text not displayable']));
  }
  // Nur echte Instruction-Probleme als Warning (Stutter-Cleanup ist still)
  const reportIssues = issues.filter(function (x) {
    return !/^Step-Text Dopplungen bereinigt/i.test(String(x || ''));
  });
  if (reportIssues.length) return checkResult(CHECK_STATUS.WARNING, reportIssues);
  return checkResult(CHECK_STATUS.PASS, []);
}

/**
 * Prüft und säubert Kurz-/Langform-Dopplungen in bereits aufgelösten Steps
 * (zusätzliche Gate-Regel neben validateInstructions).
 */
function validateAndCleanStepStutter(recipe) {
  const issues = [];
  const ings = finalIngredientList(recipe);
  const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
  let cleanedCount = 0;
  const stutterRe = /\b([A-ZÄÖÜa-zäöüß][A-Za-zÄÖÜäöüß\-]{1,40})\s+\1\b/i;

  const nextSteps = steps.map(function (step, i) {
    let text = stepInstruction(step);
    if (!text) return step;
    let cleaned = validator.cleanupStepProseDuplicates(text, ings);
    const garnishStrip = validator.stripTrailingGarnishLine(cleaned);
    if (garnishStrip.extracted) cleaned = garnishStrip.text;
    if (cleaned !== text || stutterRe.test(text)) {
      if (cleaned !== text) {
        cleanedCount += 1;
        issues.push('Step ' + (i + 1) + ': Zutaten-Dopplung bereinigt');
        return setStepInstruction(step, cleaned);
      }
    }
    return step;
  });

  if (cleanedCount > 0) {
    recipe.steps = nextSteps;
    recipe._qualityRepairedSteps = nextSteps;
  }

  // Garnish / chef_analysis / nutrition_note ebenfalls
  ['garnish', 'chef_analysis', 'nutrition_note'].forEach(function (field) {
    if (recipe[field] == null || typeof recipe[field] !== 'string') return;
    const cleaned = validator.cleanupStepProseDuplicates(recipe[field], ings);
    if (cleaned !== recipe[field]) {
      recipe[field] = cleaned;
      cleanedCount += 1;
      issues.push(field + ': Zutaten-Dopplung bereinigt');
    }
  });

  if (cleanedCount > 0) {
    recipe._stepStutterCleaned = (recipe._stepStutterCleaned || 0) + cleanedCount;
    return checkResult(CHECK_STATUS.PASS, []);
  }
  return checkResult(CHECK_STATUS.PASS, []);
}

/**
 * Soft-Repair: Mengenangaben aus Zutatennamen entfernen.
 */
function validateAndCleanIngredientNames(recipe) {
  const n = validator.normalizeRecipeIngredientNames(recipe);
  if (n > 0) {
    recipe._ingredientNamesCleaned = n;
  }
  return checkResult(CHECK_STATUS.PASS, []);
}

/**
 * Soft-Repair: trailing "Garnitur: …"-Zeilen aus Steps integrieren.
 */
function validateAndCleanGarnishEcho(recipe) {
  const stats = validator.integrateStepGarnishEcho(recipe);
  if (stats.stripped > 0) {
    recipe._garnishEchoStripped = stats.stripped;
  }
  return checkResult(CHECK_STATUS.PASS, []);
}

/**
 * Dedupliziert finale Zutatenliste (Mengen summieren) im QualityGate.
 */
function validateAndDedupeIngredients(recipe) {
  const notes = validator.dedupeRecipeIngredients(recipe);
  if (!notes.length) return checkResult(CHECK_STATUS.PASS, []);
  // Soft-Repair: Mengen zusammengefasst, ohne Review zu erzwingen
  recipe._ingredientsDeduped = notes;
  return checkResult(CHECK_STATUS.PASS, []);
}

/**
 * Ersetzt englische HealthScore-/Coach-Warntexte durch deutsche Strings.
 * Englische Fallbacks gelten als Validierungsfehler (Soft: Warning + Rewrite).
 */
function sanitizeGermanCoachMessages(recipe, opts) {
  const issues = [];
  const lang = 'de';
  const fields = ['warnings', 'coachWarnings', 'healthScoreWarnings', 'qualityWarnings'];

  function translateMessage(msg) {
    const s = String(msg || '').trim();
    if (!s) return s;
    if (EN_COACH_WARN_TO_KEY[s]) {
      return apiI18n.t(EN_COACH_WARN_TO_KEY[s], lang);
    }
    // Prefix-Match für added_sugar / portion_estimated
    const enFat = apiI18n.t('warn_high_fat', 'en');
    const enProt = apiI18n.t('warn_low_protein', 'en');
    const enCarb = apiI18n.t('warn_high_carbs', 'en');
    const enFiber = apiI18n.t('warn_low_fiber', 'en');
    const enCal = apiI18n.t('warn_high_calories', 'en');
    const enPortion = apiI18n.t('portion_estimated', 'en');
    if (s === enFat) return apiI18n.t('warn_high_fat', lang);
    if (s === enProt) return apiI18n.t('warn_low_protein', lang);
    if (s === enCarb) return apiI18n.t('warn_high_carbs', lang);
    if (s === enFiber) return apiI18n.t('warn_low_fiber', lang);
    if (s === enCal) return apiI18n.t('warn_high_calories', lang);
    if (s === enPortion || /^Portion size estimated/i.test(s)) {
      return apiI18n.t('portion_estimated', lang);
    }
    if (/^Contains sugar\/sweeteners:/i.test(s) || /^Contains sugar\/sweeteners：/i.test(s)) {
      const names = s.replace(/^Contains sugar\/sweeteners:\s*/i, '');
      return apiI18n.t('warn_added_sugar', lang, { names: names });
    }
    // Heuristik: typische EN-Coach-Phrasen
    if (/^High fat per serving/i.test(s)) return apiI18n.t('warn_high_fat', lang);
    if (/^Low protein per serving/i.test(s)) return apiI18n.t('warn_low_protein', lang);
    if (/^High net carbs/i.test(s)) return apiI18n.t('warn_high_carbs', lang);
    if (/^Low fiber/i.test(s)) return apiI18n.t('warn_low_fiber', lang);
    if (/^Calorie-dense per serving/i.test(s)) return apiI18n.t('warn_high_calories', lang);
    return s;
  }

  fields.forEach(function (field) {
    const arr = recipe[field];
    if (!Array.isArray(arr) || !arr.length) return;
    recipe[field] = arr.map(function (item) {
      if (item == null) return item;
      if (typeof item === 'string') {
        const next = translateMessage(item);
        if (next !== item) {
          issues.push('EN→DE: ' + field);
        }
        return next;
      }
      if (typeof item === 'object' && item.message != null) {
        const next = translateMessage(item.message);
        if (next !== item.message) {
          issues.push('EN→DE: ' + field + '/' + (item.code || 'msg'));
          return Object.assign({}, item, { message: next });
        }
      }
      return item;
    });
  });

  // Coach-Analyse-Objekt am Rezept
  if (recipe.coachAnalysis && Array.isArray(recipe.coachAnalysis.warnings)) {
    recipe.coachAnalysis.warnings = recipe.coachAnalysis.warnings.map(function (w) {
      if (!w || typeof w !== 'object') return w;
      const next = translateMessage(w.message);
      if (next !== w.message) {
        issues.push('EN→DE: coachAnalysis.warnings/' + (w.code || 'msg'));
        return Object.assign({}, w, { message: next });
      }
      return w;
    });
  }

  if (opts && opts.forceGerman === false) {
    return checkResult(CHECK_STATUS.PASS, []);
  }

  if (issues.length) {
    // Soft-Repair: Warning (nicht blocked), Texte sind bereits ersetzt
    return checkResult(CHECK_STATUS.WARNING, uniq(issues.concat([
      'HealthScore-/Coach-Meldungen waren Englisch und wurden auf Deutsch ersetzt',
    ])));
  }
  return checkResult(CHECK_STATUS.PASS, []);
}

function guessActionFromContext(text, index, total) {
  const t = String(text || '').toLowerCase();
  if (/öl|zwiebel|karotte|sellerie|anschwitz|soffritto/.test(t)) return 'saute';
  if (/braten|hack|fleisch/.test(t)) return 'pan_fry';
  if (/köchel|schmor|simmer/.test(t)) return 'simmer';
  if (/koch|wasser|pasta|nudel/.test(t)) return 'boil';
  if (/würz|salz|pfeffer|abschmeck/.test(t)) return 'season';
  if (index >= total - 1) return 'serve';
  return 'mix';
}

function validateTiming(recipe) {
  const issues = [];
  const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
  let stepSum = 0;
  const groups = {};

  steps.forEach(function (step) {
    const text = stepInstruction(step);
    let mins = 0;
    if (step && typeof step === 'object' && step.durationMinutes != null) {
      mins = Number(step.durationMinutes) || 0;
    } else if (step && typeof step === 'object' && step.time_min != null) {
      mins = Number(step.time_min) || 0;
    } else {
      const m = text.match(/(\d+)\s*(?:-\s*\d+\s*)?(?:min|minute)/i);
      if (m) mins = parseInt(m[1], 10) || 0;
      const range = text.match(/(\d+)\s*[–\-]\s*(\d+)\s*(?:min|minute)/i);
      if (range) mins = Math.max(mins, parseInt(range[2], 10) || 0);
    }
    const pg = step && step.parallelGroup != null ? String(step.parallelGroup) : null;
    if (pg) {
      groups[pg] = Math.max(groups[pg] || 0, mins);
    } else {
      stepSum += mins;
    }
  });
  Object.keys(groups).forEach(function (k) { stepSum += groups[k]; });

  const declared = Number(recipe.totalMinutes) || 0;
  const prepDeclared = Number(recipe.prepMinutes) || 0;
  const cookDeclared = Number(recipe.cookMinutes) || 0;
  const headerFromPrepTime = extractMinutesFromPrepTime(recipe.prep_time);
  const totalMinutes = Math.max(declared, prepDeclared + cookDeclared, stepSum, headerFromPrepTime);

  recipe.timing = {
    prepMinutes: prepDeclared || null,
    cookMinutes: cookDeclared || Math.max(stepSum, cookDeclared) || null,
    totalMinutes: totalMinutes || null,
    timingStatus: stepSum > 0 ? 'calculated' : (totalMinutes > 0 ? 'declared' : 'unknown'),
  };
  if (totalMinutes > 0) {
    recipe.totalMinutes = totalMinutes;
    recipe.prep_time = formatTotalMinutesLabel(totalMinutes);
  }

  if (headerFromPrepTime > 0 && stepSum > 0 && headerFromPrepTime * 2 < stepSum) {
    issues.push(
      'Displayed time (' + headerFromPrepTime + ' min) conflicts with step times (' + stepSum + ' min)'
    );
  }
  if (stepSum >= 60 && headerFromPrepTime > 0 && headerFromPrepTime < stepSum * 0.5) {
    return checkResult(CHECK_STATUS.WARNING, issues);
  }
  if (issues.length) return checkResult(CHECK_STATUS.WARNING, issues);
  return checkResult(CHECK_STATUS.PASS, []);
}

function extractMinutesFromPrepTime(prepTime) {
  const s = String(prepTime || '');
  const hours = s.match(/(\d+)\s*stunden?/i);
  const mins = s.match(/(\d+)\s*minuten?/i);
  let total = 0;
  if (hours) total += parseInt(hours[1], 10) * 60;
  if (mins) total += parseInt(mins[1], 10);
  if (!total) {
    const only = s.match(/^(\d+)\s*minuten?$/i);
    if (only) total = parseInt(only[1], 10);
  }
  return total;
}

function formatTotalMinutesLabel(totalMinutes) {
  const mins = Math.max(0, Math.round(Number(totalMinutes) || 0));
  if (mins <= 0) return '';
  if (mins < 60) return mins + ' Minuten';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return h === 1 ? 'ca. 1 Stunde' : ('ca. ' + h + ' Stunden');
  if (h === 1) return 'ca. 1 Stunde ' + m + ' Minuten';
  return 'ca. ' + h + ' Stunden ' + m + ' Minuten';
}

function validateLanguageQuality(recipe) {
  const issues = [];
  const title = String(recipe.title || '');
  if (title.length > 120) issues.push('Title unusually long');
  if (/[{}]|ingredient_id|0001/.test(title)) {
    return checkResult(CHECK_STATUS.FAIL, ['Title contains technical placeholders']);
  }
  const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
  let dumpCount = 0;
  steps.forEach(function (s) {
    if (looksLikeBareIngredientDump(stepInstruction(s))) dumpCount += 1;
  });
  if (dumpCount > 0 && !recipe._instructionFallbackUsed) {
    return checkResult(CHECK_STATUS.FAIL, ['Preparation contains raw data enumerations']);
  }
  if (issues.length) return checkResult(CHECK_STATUS.WARNING, issues);
  return checkResult(CHECK_STATUS.PASS, []);
}

function calculateQualityScore(checks) {
  const keys = Object.keys(checks || {});
  if (!keys.length) return 0;
  let score = 0;
  keys.forEach(function (k) {
    const st = checks[k] && checks[k].status;
    if (st === CHECK_STATUS.PASS) score += 100;
    else if (st === CHECK_STATUS.WARNING) score += 55;
    else score += 0;
  });
  return Math.round(score / keys.length);
}

/**
 * Zentrale Qualitätsbewertung. Mutiert recipe mit quality-* Feldern und ggf. reparierten Steps.
 * @param {object} recipe
 * @param {object} [opts] allergenPhrases | allergenConflictLabel
 */
function evaluateRecipeQuality(recipe, opts) {
  opts = opts || {};
  if (!recipe || typeof recipe !== 'object') {
    return {
      qualityStatus: QUALITY_STATUS.BLOCKED,
      qualityScore: 0,
      qualityChecks: {},
      qualityErrors: [apiI18n.t('err_no_recipe', (recipe && recipe.lang) || 'en')],
      qualityWarnings: [],
      requiresReview: true,
    };
  }

  const culinary = culinaryUsability.evaluateCulinaryUsability(recipe);
  const culinaryCheck = culinary.errors.length
    ? checkResult(CHECK_STATUS.FAIL, culinary.errors)
    : (culinary.warnings.length
      ? checkResult(CHECK_STATUS.WARNING, culinary.warnings)
      : checkResult(CHECK_STATUS.PASS, []));

  const checks = {
    structure: validateRecipeStructure(recipe),
    portions: validatePortions(recipe),
    nutrition: validateNutrition(recipe),
    allergens: validateAllergens(recipe, opts),
    ingredientNames: validateAndCleanIngredientNames(recipe),
    ingredientDedupe: validateAndDedupeIngredients(recipe),
    ingredients: validateIngredientConsistency(recipe),
    classicCompleteness: validateClassicCompleteness(recipe, opts),
    garnishEcho: validateAndCleanGarnishEcho(recipe),
    instructions: validateInstructions(recipe),
    stepStutter: validateAndCleanStepStutter(recipe),
    timing: validateTiming(recipe),
    language: validateLanguageQuality(recipe),
    coachLocalization: sanitizeGermanCoachMessages(recipe, opts),
    culinaryUsability: culinaryCheck,
  };

  // Fallback-Schritte übernehmen
  if (Array.isArray(recipe._qualityRepairedSteps) && recipe._qualityRepairedSteps.length) {
    recipe.steps = recipe._qualityRepairedSteps;
  }

  const errors = [];
  const warnings = [];
  Object.keys(checks).forEach(function (key) {
    const c = checks[key];
    if (!c) return;
    if (c.status === CHECK_STATUS.FAIL) errors.push.apply(errors, c.issues || []);
    if (c.status === CHECK_STATUS.WARNING) warnings.push.apply(warnings, c.issues || []);
  });

  const hasFailure = errors.length > 0;
  const hasWarning = warnings.length > 0;
  let qualityStatus = QUALITY_STATUS.READY;
  if (hasFailure) qualityStatus = QUALITY_STATUS.BLOCKED;
  else if (hasWarning) qualityStatus = QUALITY_STATUS.REVIEW;

  // inferred portions: höchstens review – außer auf 1 Portion normiert
  if (qualityStatus === QUALITY_STATUS.READY &&
      (recipe.sourceServingsStatus === 'inferred' || recipe.requiresReview) &&
      !(recipe.singlePortionNormalized || Number(recipe.finalServings) === 1)) {
    qualityStatus = QUALITY_STATUS.REVIEW;
  }

  const qualityScore = calculateQualityScore(checks);
  const result = {
    qualityStatus: qualityStatus,
    qualityScore: qualityScore,
    qualityChecks: checks,
    qualityErrors: uniq(errors),
    qualityWarnings: uniq(warnings),
    requiresReview: hasFailure || hasWarning || qualityStatus !== QUALITY_STATUS.READY,
  };

  applyQualityToRecipe(recipe, result);

  // Master-Klassiker: Source of Truth — generative Nährwert-/Heuristik-Fails dürfen nicht blocken
  if (
    (recipe.recipeSource === 'master-classic' || recipe.immutableCore) &&
    result.qualityStatus === QUALITY_STATUS.BLOCKED
  ) {
    const soft = /plausib|Nutrition data does not|Makros neu berechnet|außerhalb des Alltagsrahmens/i;
    const hard = (result.qualityErrors || []).filter(function (e) { return !soft.test(String(e)); });
    const softErrs = (result.qualityErrors || []).filter(function (e) { return soft.test(String(e)); });
    if (!hard.length) {
      result.qualityErrors = [];
      result.qualityWarnings = uniq((result.qualityWarnings || []).concat(softErrs));
      result.qualityStatus = result.qualityWarnings.length ? QUALITY_STATUS.REVIEW : QUALITY_STATUS.READY;
      // Master bleibt anzeigbar
      if (result.qualityStatus === QUALITY_STATUS.REVIEW && softErrs.length) {
        result.qualityStatus = QUALITY_STATUS.READY;
        result.requiresReview = false;
      }
      applyQualityToRecipe(recipe, result);
    }
  }

  // Sichtbarer Output-Check (kanonisches Display)
  try {
    const canon = require('./recipe-canonical-display');
    const display = canon.toCanonicalDisplayRecipe(recipe);
    const vis = display._visibleOutput || canon.validateVisibleDisplayRecipe(display);
    result.qualityChecks = result.qualityChecks || {};
    result.qualityChecks.visibleOutput = {
      status: vis.status === 'fail' ? CHECK_STATUS.FAIL : CHECK_STATUS.PASS,
      issues: vis.issues || [],
      forbiddenPatternsFound: vis.forbiddenPatternsFound || [],
      renderer: 'canonical',
    };
    if (vis.status === 'fail') {
      result.qualityStatus = QUALITY_STATUS.BLOCKED;
      result.qualityErrors = (result.qualityErrors || []).concat(vis.issues || []);
      result.requiresReview = true;
      applyQualityToRecipe(recipe, result);
    }
  } catch (eVis) {
    console.warn('[RECIPE_QUALITY] visibleOutput check skipped', eVis && eVis.message);
  }
  return result;
}

function uniq(arr) {
  const seen = {};
  const out = [];
  (arr || []).forEach(function (x) {
    const k = String(x);
    if (!seen[k]) {
      seen[k] = true;
      out.push(x);
    }
  });
  return out;
}

function applyQualityToRecipe(recipe, quality) {
  recipe.quality = quality;
  recipe.qualityStatus = quality.qualityStatus;
  recipe.qualityScore = quality.qualityScore;
  recipe.qualityChecks = quality.qualityChecks;
  recipe.qualityErrors = quality.qualityErrors;
  recipe.qualityWarnings = quality.qualityWarnings;
  if (quality.qualityStatus === QUALITY_STATUS.BLOCKED) {
    recipe.requiresReview = true;
    recipe.portionSafe = false;
  } else if (quality.qualityStatus === QUALITY_STATUS.REVIEW) {
    recipe.requiresReview = true;
  }
  recipe.qualityMetrics = {
    qualityStatus: quality.qualityStatus,
    qualityScore: quality.qualityScore,
    validationErrorCount: (quality.qualityErrors || []).length,
    validationWarningCount: (quality.qualityWarnings || []).length,
    sourceServingsStatus: recipe.sourceServingsStatus || null,
    allergenConflict: !!(quality.qualityChecks && quality.qualityChecks.allergens &&
      quality.qualityChecks.allergens.status === CHECK_STATUS.FAIL),
    ingredientStepMismatch: !!(quality.qualityChecks && quality.qualityChecks.ingredients &&
      quality.qualityChecks.ingredients.status === CHECK_STATUS.FAIL),
    instructionFallbackUsed: !!recipe._instructionFallbackUsed,
    generationAttempts: Number(recipe.generationAttempts) || Number(recipe._generationAttempt) || 1,
    renderCount: Number(recipe.renderCount) || 0,
  };
  return recipe;
}

/**
 * Wendet Quality Gate an und gibt das angereicherte Rezept zurück.
 */
function applyRecipeQualityGate(recipe, opts) {
  if (!recipe || typeof recipe !== 'object') return recipe;
  evaluateRecipeQuality(recipe, opts || {});
  console.log('[RECIPE_QUALITY]', JSON.stringify({
    title: recipe.title,
    qualityStatus: recipe.qualityStatus,
    qualityScore: recipe.qualityScore,
    errors: (recipe.qualityErrors || []).slice(0, 5),
    warnings: (recipe.qualityWarnings || []).slice(0, 5),
  }));
  return recipe;
}

module.exports = {
  QUALITY_STATUS: QUALITY_STATUS,
  CHECK_STATUS: CHECK_STATUS,
  evaluateRecipeQuality: evaluateRecipeQuality,
  applyRecipeQualityGate: applyRecipeQualityGate,
  applyQualityToRecipe: applyQualityToRecipe,
  validateRecipeStructure: validateRecipeStructure,
  validatePortions: validatePortions,
  validateNutrition: validateNutrition,
  validateAllergens: validateAllergens,
  validateIngredientConsistency: validateIngredientConsistency,
  validateInstructions: validateInstructions,
  validateAndCleanStepStutter: validateAndCleanStepStutter,
  validateAndCleanIngredientNames: validateAndCleanIngredientNames,
  validateAndCleanGarnishEcho: validateAndCleanGarnishEcho,
  validateAndDedupeIngredients: validateAndDedupeIngredients,
  sanitizeGermanCoachMessages: sanitizeGermanCoachMessages,
  validateClassicCompleteness: validateClassicCompleteness,
  validateTiming: validateTiming,
  validateLanguageQuality: validateLanguageQuality,
  calculateQualityScore: calculateQualityScore,
  looksLikeBareIngredientDump: looksLikeBareIngredientDump,
  ACTION_FALLBACKS: ACTION_FALLBACKS,
  formatTotalMinutesLabel: formatTotalMinutesLabel,
};
