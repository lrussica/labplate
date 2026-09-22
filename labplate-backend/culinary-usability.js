'use strict';
const apiI18n = require('./api-i18n');
/**
 * Kulinarische Brauchbarkeit – hartes Gate jenseits Schema/JSON.
 * Formal gültiges JSON ≠ gültiges Rezept.
 */

const ALLOWED_DISH_TYPES = [
  'cold_yogurt_oat_bowl',
  'yogurt_nut_bowl',
  'oat_egg_pancake',
  'protein_porridge',
  'baked_oats',
  'scrambled_egg_yogurt_bowl',
  'savory_skillet',
  'pasta_main',
  'general_cooked_main',
  'smoothie_bowl',
  'salad_bowl',
];

/** Semantische Aktionen je Zutatenfamilie (DE-Verben in Step-Text). */
const FAMILY_ACTION_RES = {
  egg: /verquirl|aufschlag|rührei|stocken|braten|anbrat|ausbacken|backen|pochier|kochen|einarbeiten|unterheb|unterrühr|scrambl|whisk|omelett|pfannkuchen|pancake/i,
  oats: /einrühr|unterheb|quellen|kochen|köchel|backen|ausbacken|einarbeiten|vermeng|verrühr|mix|brei|porridge|pfannkuchen|pancake/i,
  yogurt: /unterheb|unterrühr|verrühr|vermeng|servier|dazu\s*(geben|reichen)|anricht|auf\s*den\s*teller|als\s*topping|in\s+eine\s+schale|in\s+die\s+schale|darüber|bestreu|fold|mix/i,
  water: /erhitz|aufkoch|kochen|köchel|quellen|einrühr|aufgieß|übergieß|hinzugieß|auffüll|hinzugeb|dazugeb|gieß|verdünn|anschwitz|simmer|vermengen|verrühr|ablösch|dämpfen|gar\s*kochen/i,
  nuts: /darüber|bestreu|topp|servier|verrühr|unterheb|hacken|rösten|anricht|geröstet|geroestet|pinien|kern/i,
};

const GENERIC_INSTRUCTION_PATTERNS = [
  /^die\s+zutaten\s+(gründlich\s+)?vermengen\.?$/i,
  /^alles\s+(gründlich\s+)?vermengen\.?$/i,
  /^zutaten\s+vermischen\.?$/i,
  /^nach\s+belieben\s+zubereiten\.?$/i,
  /^wie\s+gewohnt\s+zubereiten\.?$/i,
  /^wasser\s+bereitstellen\.?$/i,
  /^die\s+zutaten\s+in\s+der\s+pfanne\s+goldbraun\s+anbraten\.?$/i,
  /^die\s+zutaten\s+bei\s+mittlerer\s+hitze\s+glasig\s+anschwitzen\.?$/i,
  /^die\s+zutaten\s+in\s+ausreichend\s+wasser\s+gar\s+kochen\.?$/i,
  /^alles\s+bei\s+niedriger\s+hitze\s+langsam\s+köcheln\s+lassen\.?$/i,
];

const SERVE_ONLY_PATTERNS = [
  /^anrichten\s+und\s+(sofort\s+)?servieren\.?$/i,
  /^servieren\.?$/i,
  /^anrichten\.?$/i,
  /^mit\s+salz\s+und\s+pfeffer\s+abschmecken\.?$/i,
];

function stepText(step) {
  if (typeof step === 'string') return String(step || '').trim();
  if (!step || typeof step !== 'object') return '';
  return String(step.content || step.instruction || step.text || '').trim();
}

function stepIds(step) {
  const raw = (step && (step.ingredientIds || step.ingredient_ids)) || [];
  if (!Array.isArray(raw)) return [];
  return raw.map(function (id) { return String(id); }).filter(Boolean);
}

function ingredientList(recipe) {
  if (Array.isArray(recipe.finalIngredients) && recipe.finalIngredients.length) {
    return recipe.finalIngredients;
  }
  return Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
}

function classifyFamily(ing) {
  const n = String((ing && (ing.name || ing.displayName)) || '').toLowerCase();
  if (!n) return null;
  if (/(?:^|[^a-zäöüß])ei(?:er)?(?:[^a-zäöüß]|$)/.test(n) && !/eiweiss|eiweiß|eiweis/.test(n)) return 'egg';
  if (/hafer|oat|porridge/i.test(n)) return 'oats';
  if (/joghurt|yogurt|yoghurt|skyr/i.test(n)) return 'yogurt';
  if (/^(das\s+)?(wasser|trinkwasser|kochwasser)\b/i.test(n)) return 'water';
  if (/n[uü]ss|mandel|cashew|walnuss|haselnuss|pistazie|pecan|erdnuss|pinien|sonnenblumenkern|kürbiskern|kuerbiskern|sesam/i.test(n) && !/\b(öl|oel|oil)\b/i.test(n)) {
    return 'nuts';
  }
  return 'other';
}

function isExemptUsage(ing) {
  if (!ing) return true;
  if (ing.optional === true) return true;
  const role = String(ing.culinaryRole || ing.role || '').toLowerCase();
  if (role === 'seasoning' || role === 'garnish') return true;
  // Toppings dürfen ausschließlich im garnish-Feld stehen
  if (role === 'topping') return false;
  const unit = String(ing.unit || '').toLowerCase();
  if (unit === 'prise' || unit === 'messerspitze') return true;
  const n = String(ing.name || ing.displayName || '').toLowerCase();
  if (/^(zimt|curry|paprika|muskat|oregano|basilikum|thymian|dill|petersilie|salz|pfeffer)\b/i.test(n)) {
    return true;
  }
  return false;
}

function isGenericInstruction(text) {
  const t = String(text || '').trim();
  if (!t) return true;
  return GENERIC_INSTRUCTION_PATTERNS.some(function (re) { return re.test(t); });
}

function isServeOnlyInstruction(text) {
  const t = String(text || '').trim();
  return SERVE_ONLY_PATTERNS.some(function (re) { return re.test(t); });
}

function amountToMlOrG(ing) {
  try {
    return require('./recipe-unit-model').ingredientAmountGrams(ing);
  } catch (_) {
    const a = Number(ing && ing.amount) || 0;
    const u = String((ing && ing.unit) || 'g').toLowerCase();
    if (u === 'l') return a * 1000;
    if (u === 'ml' || u === 'g') return a;
    if (u === 'prise' || u === 'messerspitze') return 0;
    if (u === 'stk') {
      // Fallback ohne unit-model: nur Eier ×60
      const n = String((ing && ing.name) || '').toLowerCase();
      if (/(?:^|[^a-z])ei(?:er)?(?:[^a-z]|$)/.test(n) && n.indexOf('eiweiss') < 0) return a * 60;
      return 0;
    }
    return a;
  }
}

/**
 * Sammelt Steps, die eine Zutat referenzieren (id, Platzhalter oder Namens-Stem).
 * Generische Steps zählen NICHT als sinnvolle Referenz.
 */
function stepsReferencingIngredient(ing, steps, garnishText) {
  const id = String((ing && ing.id) || '');
  const family = classifyFamily(ing);
  const name = String((ing && (ing.name || ing.displayName)) || '').toLowerCase();
  const stem = name.replace(/\([^)]*\)/g, ' ').replace(/[^a-zäöüß0-9\s]/gi, ' ').trim().split(/\s+/)[0];
  const hits = [];

  (Array.isArray(steps) ? steps : []).forEach(function (step, idx) {
    const text = stepText(step);
    const lower = text.toLowerCase();
    const ids = stepIds(step);
    let mentioned = false;
    if (id && ids.indexOf(id) >= 0) mentioned = true;
    if (id && text.indexOf('{' + id + '}') >= 0) mentioned = true;
    if (family === 'egg' && /(?:^|[^a-zäöüß])ei(?:er)?(?:[^a-zäöüß]|$)/i.test(lower) && !/eiweiss|eiweiß/i.test(lower)) {
      mentioned = true;
    } else if (family === 'oats' && /hafer|oat/i.test(lower)) {
      mentioned = true;
    } else if (family === 'yogurt' && /joghurt|yogurt|yoghurt|skyr/i.test(lower)) {
      mentioned = true;
    } else if (family === 'water' && /\bwasser\b/i.test(lower)) {
      mentioned = true;
    } else if (family === 'nuts' && /n[uü]ss|mandel|cashew|nüsse/i.test(lower)) {
      mentioned = true;
    } else if (stem && stem.length >= 4 && lower.indexOf(stem) >= 0) {
      mentioned = true;
    }
    if (!mentioned) return;
    hits.push({
      index: idx,
      text: text,
      generic: isGenericInstruction(text),
      serveOnly: isServeOnlyInstruction(text),
    });
  });

  if (garnishText) {
    const g = String(garnishText);
    const gl = g.toLowerCase();
    let gHit = false;
    if (id && g.indexOf('{' + id + '}') >= 0) gHit = true;
    if (family === 'nuts' && /n[uü]ss|mandel|cashew|pinien|kern|sesam/i.test(gl)) gHit = true;
    if (family === 'yogurt' && /joghurt|yogurt/i.test(gl)) gHit = true;
    if (gHit) {
      hits.push({ index: -1, text: g, generic: false, serveOnly: false, garnish: true });
    }
  }
  return hits;
}

function hasSemanticAction(family, texts) {
  const re = FAMILY_ACTION_RES[family];
  if (!re) return true; // other: Erwähnung reicht
  const blob = (texts || []).join(' ');
  return re.test(blob);
}

/**
 * 1) Unbenutzte / nur generisch referenzierte Hauptzutaten.
 */
function validateIngredientUsage(recipe) {
  const errors = [];
  const warnings = [];
  const ings = ingredientList(recipe);
  const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
  const garnish = typeof recipe.garnish === 'string' ? recipe.garnish : '';

  ings.forEach(function (ing) {
    if (isExemptUsage(ing)) return;
    const family = classifyFamily(ing);
    const label = String((ing && (ing.name || ing.displayName)) || 'ingredient');
    const refs = stepsReferencingIngredient(ing, steps, garnish);
    const meaningful = refs.filter(function (r) { return !r.generic && !(r.serveOnly && family === 'egg'); });

    if (!refs.length) {
      if (family === 'egg') {
        errors.push('Eggs are not used in a meaningful cooking step.');
      } else {
        errors.push("'" + label + "' is not used in a preparation step.");
      }
      return;
    }
    if (!meaningful.length) {
      if (family === 'egg') {
        errors.push('Eggs are not used in a meaningful cooking step.');
      } else {
        errors.push(
          "'" + label + "' is only mentioned in generic steps — " +
          'no matching cooking technique.'
        );
      }
      return;
    }
    if (family && FAMILY_ACTION_RES[family]) {
      const actionTexts = meaningful.map(function (r) { return r.text; });
      let okAction = hasSemanticAction(family, actionTexts);
      // Kochflüssigkeit: Referenz + Hitze irgendwo im Rezept reicht (Curry/Eintopf),
      // sonst scheitert "{id} hinzugeben" + späteres „köcheln“ ohne Wasser-Wort.
      if (!okAction && family === 'water') {
        const allTexts = steps.map(stepText);
        okAction = allTexts.some(function (t) {
          return /erhitz|aufkoch|kochen|köchel|simmer|ablösch|dämpfen|gar\s*kochen|anschwitz/i.test(t);
        });
      }
      if (!okAction) {
        if (family === 'egg') {
          errors.push(
            'Eggs are not used in a meaningful cooking step ' +
            '(expected: whisk, fry, set, bake, or incorporate).'
          );
        } else if (family === 'oats') {
          errors.push(
            'Oats without a matching action (stir in, soak, cook, or bake).'
          );
        } else if (family === 'yogurt') {
          errors.push(
            'Yogurt without a matching action (fold in, stir, or serve).'
          );
        } else if (family === 'water') {
          errors.push(
            'Water without a matching action (heat, soak, or stir in).'
          );
        }
      }
    }
  });

  return { errors: errors, warnings: warnings };
}

/**
 * 3) Nur generische Schritte → blocked.
 */
function validateGenericInstructions(recipe) {
  const errors = [];
  const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
  if (!steps.length) {
    errors.push('No preparation steps.');
    return { errors: errors, warnings: [] };
  }
  const texts = steps.map(stepText).filter(Boolean);
  const concrete = texts.filter(function (t) {
    return !isGenericInstruction(t) && !isServeOnlyInstruction(t);
  });
  if (concrete.length === 0) {
    errors.push('Generic preparation steps without concrete technique.');
  }
  // „Wasser bereitstellen“ allein als Flüssigkeits-Schritt zählt nicht
  const onlyWaterReady =
    texts.some(function (t) { return /^wasser\s+bereitstellen/i.test(t); }) &&
    !texts.some(function (t) {
      return /erhitz|kochen|quellen|einrühr|aufgieß/i.test(t) && !/^wasser\s+bereitstellen/i.test(t);
    });
  if (onlyWaterReady && texts.some(function (t) { return /hafer|oat/i.test(t); })) {
    errors.push('Generic preparation steps without concrete technique.');
  }
  return { errors: errors, warnings: [] };
}

/**
 * 5) Hafer + Wasser: offensichtliche Unterversorgung.
 */
function validateOatsLiquidRatio(recipe) {
  const errors = [];
  const warnings = [];
  const ings = ingredientList(recipe);
  let oatsG = 0;
  let waterMl = 0;
  let yogurtG = 0;
  ings.forEach(function (ing) {
    const fam = classifyFamily(ing);
    const amt = amountToMlOrG(ing);
    if (fam === 'oats') oatsG += amt;
    if (fam === 'water') waterMl += amt;
    if (fam === 'yogurt') yogurtG += amt;
  });
  if (oatsG <= 0) return { errors: errors, warnings: warnings };

  const stepsBlob = (Array.isArray(recipe.steps) ? recipe.steps : [])
    .map(stepText).join(' ').toLowerCase();
  const dryMethod = /backen|braten|ausbacken|pfanne|pancake|pfannkuchen|rösten/i.test(stepsBlob);
  // Joghurt-Quellen zählt nur, wenn KEIN Alibi-Wasser als Kochflüssigkeit angegeben ist
  const yogurtSoak = waterMl <= 0 &&
    /quellen|unterheb|verrühr|vermengen/i.test(stepsBlob) && yogurtG >= 60;

  if (waterMl > 0 && waterMl < 60 && oatsG >= 25 && !dryMethod) {
    errors.push(
      'The liquid amount is too low for the stated oats quantity.'
    );
  } else if (waterMl > 0 && waterMl < oatsG * 1.5 && oatsG >= 25 && !dryMethod) {
    warnings.push(
      'The liquid amount is tight for the stated oats quantity — please check.'
    );
  } else if (waterMl <= 0 && yogurtG < 40 && !dryMethod && !yogurtSoak) {
    warnings.push(
      'Oats without enough liquid and without baking/frying method.'
    );
  }
  return { errors: errors, warnings: warnings };
}

/**
 * 4+6) dishPlan Pflicht bei Ei+Hafer/Joghurt-Kombi; Titel muss Speise beschreiben.
 */
function validateDishPlan(recipe) {
  const errors = [];
  const warnings = [];
  const plan = recipe.dishPlan && typeof recipe.dishPlan === 'object' ? recipe.dishPlan : null;
  const ings = ingredientList(recipe);
  const families = {};
  ings.forEach(function (ing) {
    const f = classifyFamily(ing);
    if (f) families[f] = true;
  });
  const needsPlan = !!(families.egg && (families.oats || families.yogurt));
  const title = String(recipe.title || '');

  if (!plan || !plan.dishType) {
    if (needsPlan) {
      errors.push('No clear dish type or cooking method detectable.');
    }
  } else {
    const dt = String(plan.dishType || '');
    if (ALLOWED_DISH_TYPES.indexOf(dt) < 0) {
      warnings.push('Unknown dishPlan.dishType: ' + dt);
    }
    const actions = Array.isArray(plan.requiredActions) ? plan.requiredActions : [];
    if (needsPlan && actions.length < 2) {
      errors.push('No clear dish type or cooking method detectable.');
    }
    // Titel soll Speiseform tragen, nicht nur Makros+Zutaten
    const dishWord =
      /pancake|pfannkuchen|porridge|brei|bowl|pfanne|rührei|omelett|auflauf|muffin|porridge|skillet|salat|pasta|nudel|bowl/i.test(title);
    const vagueSnack = /proteinreicher\s+snack\s+mit/i.test(title) && !dishWord;
    if (vagueSnack && needsPlan) {
      errors.push(
        'Title does not describe a recognizable dish (e.g. pancakes, porridge, bowl) — only macros/ingredients.'
      );
    }
  }

  // Ohne Plan: vager Snack-Titel + Ei ohne Technik
  if ((!plan || !plan.dishType) && /proteinreicher\s+snack\s+mit/i.test(title) && families.egg) {
    if (errors.indexOf('No clear dish type or cooking method detectable.') < 0) {
      errors.push('No clear dish type or cooking method detectable.');
    }
  }

  return { errors: errors, warnings: warnings };
}

/**
 * Gesamte kulinarische Brauchbarkeit.
 * @returns {{ ok: boolean, errors: string[], warnings: string[], qualityStatus: 'ready'|'review'|'blocked' }}
 */
function evaluateCulinaryUsability(recipe, opts) {
  const errors = [];
  const warnings = [];
  const lang = apiI18n.normalizeLang((opts && opts.lang) || (recipe && recipe.lang) || 'en');
  if (!recipe || typeof recipe !== 'object') {
    return {
      ok: false,
      errors: [apiI18n.t('err_no_recipe', lang)],
      warnings: [],
      qualityStatus: 'blocked',
    };
  }

  function merge(part) {
    (part.errors || []).forEach(function (e) {
      if (errors.indexOf(e) < 0) errors.push(e);
    });
    (part.warnings || []).forEach(function (w) {
      if (warnings.indexOf(w) < 0) warnings.push(w);
    });
  }

  merge(validateIngredientUsage(recipe));
  merge(validateGenericInstructions(recipe));
  merge(validateOatsLiquidRatio(recipe));
  merge(validateDishPlan(recipe));

  let qualityStatus = 'ready';
  if (errors.length) qualityStatus = 'blocked';
  else if (warnings.length) qualityStatus = 'review';

  return {
    ok: errors.length === 0,
    errors: errors,
    warnings: warnings,
    qualityStatus: qualityStatus,
  };
}

module.exports = {
  ALLOWED_DISH_TYPES: ALLOWED_DISH_TYPES,
  FAMILY_ACTION_RES: FAMILY_ACTION_RES,
  GENERIC_INSTRUCTION_PATTERNS: GENERIC_INSTRUCTION_PATTERNS,
  classifyFamily: classifyFamily,
  isGenericInstruction: isGenericInstruction,
  isServeOnlyInstruction: isServeOnlyInstruction,
  validateIngredientUsage: validateIngredientUsage,
  validateGenericInstructions: validateGenericInstructions,
  validateOatsLiquidRatio: validateOatsLiquidRatio,
  validateDishPlan: validateDishPlan,
  evaluateCulinaryUsability: evaluateCulinaryUsability,
  stepsReferencingIngredient: stepsReferencingIngredient,
};
