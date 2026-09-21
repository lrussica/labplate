/**
 * LabPlate – Coach Nutrition Logic
 * ================================
 * Ernährungs-Analyse: USDA-Nährwerte + Spoonacular/TheMealDB-Rezepte
 * → einheitliche Coach-Ausgabe (Makros, HealthScore, Tagesplan, Alternativen).
 *
 * COACH-INPUT-VERTRAG (analyzeRecipe):
 * Verwende ausschließlich finalNutrition und finalIngredients.
 * Berechne keine neuen Nährwerte, wenn finalNutrition vorliegt.
 * Verwende keine Rohzutaten / alten Rezeptversionen / sourceNutrition.
 * Wenn requiresReview true ist oder validationWarnings kritische Warnungen
 * enthalten, keine uneingeschränkt sichere Bewertung → coach_unavailable.
 * Erfinde keine Quellen.
 */

'use strict';

const usda = require('../api/usda');

const VITAMIN_KEYS = ['vitaminA', 'vitaminC', 'vitaminD', 'vitaminB12', 'folate'];
const MINERAL_KEYS = ['calcium', 'iron', 'magnesium', 'potassium', 'sodium', 'zinc'];

const ALTERNATIVES = {
  butter: [
    { name: 'Olivenöl', reason: 'Mehr ungesättigte Fette', benefit: 'lower_saturated_fat' },
    { name: 'Avocado', reason: 'Mehr Ballaststoffe und Mikronährstoffe', benefit: 'more_fiber' },
  ],
  'olive oil': [
    { name: 'Rapsöl', reason: 'Günstig, ausgewogenes Fettsäureprofil', benefit: 'balanced_fats' },
  ],
  cream: [
    { name: 'Griechischer Joghurt (0–2 %)', reason: 'Mehr Protein, weniger Fett', benefit: 'more_protein' },
    { name: 'Kokosmilch light', reason: 'Weniger Kalorien bei cremiger Textur', benefit: 'lower_calories' },
  ],
  sugar: [
    { name: 'Honig (sparsam)', reason: 'Intensiverer Geschmack, oft weniger Menge', benefit: 'lower_sugar_use' },
    { name: 'Apfelmus ungesüsst', reason: 'Süsse + Ballaststoffe', benefit: 'more_fiber' },
  ],
  'white rice': [
    { name: 'Vollkornreis', reason: 'Mehr Ballaststoffe und Sättigung', benefit: 'more_fiber' },
    { name: 'Quinoa', reason: 'Mehr Protein und Mikronährstoffe', benefit: 'more_protein' },
  ],
  'white bread': [
    { name: 'Vollkornbrot', reason: 'Mehr Ballaststoffe', benefit: 'more_fiber' },
  ],
  pasta: [
    { name: 'Vollkornnudeln', reason: 'Mehr Ballaststoffe', benefit: 'more_fiber' },
    { name: 'Linsen-/Kichererbsenpasta', reason: 'Deutlich mehr Protein', benefit: 'more_protein' },
  ],
  'ground beef': [
    { name: 'Putenhack', reason: 'Weniger Fett, viel Protein', benefit: 'lower_fat' },
    { name: 'Linsen', reason: 'Pflanzliches Protein + Ballaststoffe', benefit: 'more_fiber' },
  ],
  bacon: [
    { name: 'Truthahnspeck', reason: 'Weniger Fett', benefit: 'lower_fat' },
    { name: 'Räuchertofu', reason: 'Pflanzlich, weniger gesättigte Fette', benefit: 'lower_saturated_fat' },
  ],
  cheese: [
    { name: 'Hüttenkäse', reason: 'Mehr Protein, weniger Fett', benefit: 'more_protein' },
    { name: 'Feta light', reason: 'Weniger Kalorien bei würzigem Geschmack', benefit: 'lower_calories' },
  ],
  mayonnaise: [
    { name: 'Griechischer Joghurt', reason: 'Mehr Protein, weniger Fett', benefit: 'more_protein' },
    { name: 'Avocado-Püree', reason: 'Gesündere Fette + Ballaststoffe', benefit: 'more_fiber' },
  ],
  'sour cream': [
    { name: 'Skyr', reason: 'Sehr proteinreich, wenig Fett', benefit: 'more_protein' },
  ],
  potato: [
    { name: 'Süßkartoffel', reason: 'Mehr Vitamin A / Ballaststoffe', benefit: 'more_vitamins' },
  ],
  milk: [
    { name: 'Magermilch', reason: 'Weniger Fett bei gleichem Protein', benefit: 'lower_fat' },
    { name: 'Sojadrink (ungesüsst)', reason: 'Pflanzlich, oft angereichertes Protein', benefit: 'plant_based' },
  ],
};

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round1(v) {
  return Math.round(Number(v) * 10) / 10;
}

function round0(v) {
  return Math.round(Number(v));
}

function emptyMacros() {
  return { protein: 0, fat: 0, netCarbs: 0, fiber: 0 };
}

function pickMicronutrients(per100g, keys) {
  const out = {};
  if (!per100g || typeof per100g !== 'object') return out;
  keys.forEach((key) => {
    if (per100g[key] != null && Number.isFinite(Number(per100g[key]))) {
      out[key] = round1(per100g[key]);
    }
  });
  return out;
}

function gramsFromIngredient(ing) {
  const amount = num(ing && ing.amount, 0);
  if (!(amount > 0)) return 0;
  const unit = String((ing && ing.unit) || 'g').toLowerCase();
  if (unit === 'kg') return amount * 1000;
  if (unit === 'ml' || unit === 'g') return amount; // 1 ml ≈ 1 g Näherung für Coach
  if (unit === 'l') return amount * 1000;
  return amount;
}

/**
 * Vereinheitlicht Spoonacular / TheMealDB / LabPlate-Rezepte.
 */
function normalizeRecipeInput(data) {
  if (!data || typeof data !== 'object') return null;

  // Bereits LabPlate / Coach-Format
  const source = String(data.source || data.provider || '').toLowerCase() || 'unknown';
  const title = String(data.title || data.strMeal || data.name || 'Rezept').trim().slice(0, 200);
  const servings = Math.max(1, round0(num(data.servings || data.servingsTotal, 1)) || 1);

  let ingredients = [];
  if (Array.isArray(data.ingredients)) {
    ingredients = data.ingredients;
  } else if (Array.isArray(data.extendedIngredients)) {
    ingredients = data.extendedIngredients.map((ing) => ({
      name: String((ing && (ing.nameClean || ing.name || ing.originalName)) || 'Zutat').trim(),
      amount: num(ing && ing.measures && ing.measures.metric && ing.measures.metric.amount, num(ing && ing.amount, 0)),
      unit: String((ing && ing.measures && ing.measures.metric && (ing.measures.metric.unitShort || ing.measures.metric.unitLong)) || ing.unit || 'g'),
      original: String((ing && ing.original) || '').trim() || undefined,
    }));
  }

  ingredients = ingredients.map((ing) => {
    if (!ing || typeof ing !== 'object') return null;
    const name = String(ing.name || ing.ingredient || '').trim().slice(0, 200);
    if (!name) return null;
    const macros = (ing.macrosPer100g && typeof ing.macrosPer100g === 'object')
      ? {
          protein: num(ing.macrosPer100g.protein, 0),
          fat: num(ing.macrosPer100g.fat, 0),
          netCarbs: num(ing.macrosPer100g.netCarbs, 0),
          fiber: num(ing.macrosPer100g.fiber, 0),
        }
      : emptyMacros();
    return {
      name,
      amount: num(ing.amount, 0),
      unit: String(ing.unit || 'g').toLowerCase() === 'ml' ? 'ml' : 'g',
      original: typeof ing.original === 'string' ? ing.original : undefined,
      caloriesPer100g: num(ing.caloriesPer100g != null ? ing.caloriesPer100g : ing.calories, 0),
      macrosPer100g: macros,
      vitamins: ing.vitamins && typeof ing.vitamins === 'object' ? ing.vitamins : undefined,
      minerals: ing.minerals && typeof ing.minerals === 'object' ? ing.minerals : undefined,
      usda: ing.usda && typeof ing.usda === 'object' ? ing.usda : undefined,
      fdcId: ing.fdcId != null ? Number(ing.fdcId) : undefined,
    };
  }).filter(Boolean);

  const steps = Array.isArray(data.steps)
    ? data.steps.map((s) => String(s || '').trim()).filter(Boolean)
    : [];

  return {
    id: data.id != null ? data.id : (data.idMeal != null ? String(data.idMeal) : undefined),
    source,
    title,
    servings,
    prep_time: typeof data.prep_time === 'string' ? data.prep_time : (data.readyInMinutes ? String(data.readyInMinutes) + ' Min.' : ''),
    image: typeof data.image === 'string' ? data.image : (typeof data.strMealThumb === 'string' ? data.strMealThumb : undefined),
    sourceUrl: typeof data.sourceUrl === 'string' ? data.sourceUrl : (typeof data.strSource === 'string' ? data.strSource : undefined),
    nutrition_note: typeof data.nutrition_note === 'string' ? data.nutrition_note : '',
    garnish: typeof data.garnish === 'string' ? data.garnish : '',
    self_check: typeof data.self_check === 'string' ? data.self_check : '',
    ingredients,
    steps,
    shopping_list: Array.isArray(data.shopping_list) ? data.shopping_list : undefined,
  };
}

/**
 * analyzeIngredients(ingredients)
 * Akzeptiert USDA-normalizeNutrition-Objekte oder Coach-Zutaten mit per100g/macrosPer100g.
 */
function analyzeIngredients(ingredients) {
  const list = Array.isArray(ingredients) ? ingredients : [];
  if (!list.length) return { error: 'invalid_payload' };

  const analyzed = list.map((item) => {
    if (!item || typeof item !== 'object') return null;

    // USDA normalizeNutrition Format
    const per100g = (item.per100g && typeof item.per100g === 'object') ? item.per100g : item;
    const macrosSrc = (item.macrosPer100g && typeof item.macrosPer100g === 'object')
      ? item.macrosPer100g
      : {
          protein: num(per100g.protein, 0),
          fat: num(per100g.fat, 0),
          netCarbs: num(per100g.netCarbs != null ? per100g.netCarbs : (num(per100g.carbs, 0) - num(per100g.fiber, 0)), 0),
          fiber: num(per100g.fiber, 0),
        };

    const macrosPer100g = {
      protein: round1(num(macrosSrc.protein, 0)),
      fat: round1(num(macrosSrc.fat, 0)),
      netCarbs: round1(Math.max(0, num(macrosSrc.netCarbs, 0))),
      fiber: round1(num(macrosSrc.fiber, 0)),
    };

    const caloriesPer100g = round1(num(
      item.caloriesPer100g != null ? item.caloriesPer100g : (item.calories != null ? item.calories : per100g.calories),
      0
    ));

    const vitamins = item.vitamins && typeof item.vitamins === 'object'
      ? item.vitamins
      : pickMicronutrients(per100g, VITAMIN_KEYS);
    const minerals = item.minerals && typeof item.minerals === 'object'
      ? item.minerals
      : pickMicronutrients(per100g, MINERAL_KEYS);

    const grams = gramsFromIngredient(item);
    const factor = grams > 0 ? grams / 100 : 0;

    return {
      name: String(item.name || item.description || 'Zutat').trim().slice(0, 200),
      fdcId: item.fdcId != null ? Number(item.fdcId) : undefined,
      amount: num(item.amount, 0),
      unit: item.unit || (grams > 0 ? 'g' : undefined),
      grams: round1(grams),
      caloriesPer100g,
      macrosPer100g,
      vitamins,
      minerals,
      scaled: factor > 0 ? {
        calories: round1(caloriesPer100g * factor),
        protein: round1(macrosPer100g.protein * factor),
        fat: round1(macrosPer100g.fat * factor),
        netCarbs: round1(macrosPer100g.netCarbs * factor),
        fiber: round1(macrosPer100g.fiber * factor),
      } : undefined,
      source: item.source || 'usda',
    };
  }).filter(Boolean);

  if (!analyzed.length) return { error: 'invalid_payload' };

  const totals = analyzed.reduce((acc, row) => {
    if (!row.scaled) return acc;
    acc.calories += row.scaled.calories;
    acc.protein += row.scaled.protein;
    acc.fat += row.scaled.fat;
    acc.netCarbs += row.scaled.netCarbs;
    acc.fiber += row.scaled.fiber;
    return acc;
  }, { calories: 0, protein: 0, fat: 0, netCarbs: 0, fiber: 0 });

  Object.keys(totals).forEach((k) => { totals[k] = round1(totals[k]); });

  return {
    data: {
      count: analyzed.length,
      ingredients: analyzed,
      totals,
    },
  };
}

function computeHealthScore(perServing, warnings) {
  let score = 70;
  const cal = num(perServing.calories, 0);
  const protein = num(perServing.protein, 0);
  const fat = num(perServing.fat, 0);
  const netCarbs = num(perServing.netCarbs, 0);
  const fiber = num(perServing.fiber, 0);
  const macroSum = protein + fat + netCarbs || 1;

  const proteinShare = protein / macroSum;
  const fatShare = fat / macroSum;
  const fiberPer100kcal = cal > 0 ? (fiber / cal) * 100 : 0;

  if (proteinShare >= 0.25) score += 10;
  else if (proteinShare >= 0.18) score += 5;
  else if (proteinShare < 0.12) score -= 10;

  if (fiber >= 8) score += 10;
  else if (fiber >= 5) score += 5;
  else if (fiber < 2) score -= 8;

  if (fiberPer100kcal >= 1.5) score += 5;

  if (fatShare > 0.45) score -= 10;
  else if (fatShare > 0.35) score -= 5;

  if (cal > 900) score -= 15;
  else if (cal > 700) score -= 8;
  else if (cal >= 350 && cal <= 650) score += 5;

  if (netCarbs > 80) score -= 8;

  score -= Math.min(20, (warnings || []).length * 4);
  return Math.max(0, Math.min(100, round0(score)));
}

function buildWarnings(perServing, ingredients) {
  const warnings = [];
  const cal = num(perServing.calories, 0);
  const protein = num(perServing.protein, 0);
  const fat = num(perServing.fat, 0);
  const netCarbs = num(perServing.netCarbs, 0);
  const fiber = num(perServing.fiber, 0);
  const macroSum = protein + fat + netCarbs || 1;

  if (fat / macroSum > 0.4 || fat > 35) {
    warnings.push({ code: 'high_fat', message: 'Viel Fett pro Portion – Portionsgröße oder Zubereitung prüfen.' });
  }
  if (protein < 15) {
    warnings.push({ code: 'low_protein', message: 'Wenig Protein pro Portion – proteinreiche Beilage oder Alternative erwägen.' });
  }
  if (netCarbs > 70) {
    warnings.push({ code: 'high_carbs', message: 'Hoher Netto-Kohlenhydratanteil pro Portion.' });
  }
  if (fiber < 3) {
    warnings.push({ code: 'low_fiber', message: 'Wenig Ballaststoffe – Vollkorn oder Gemüse ergänzen.' });
  }
  if (cal > 800) {
    warnings.push({ code: 'high_calories', message: 'Kalorienreich pro Portion (> 800 kcal).' });
  }

  const sugarish = (ingredients || []).filter((ing) =>
    /sugar|zucker|sirup|syrup|honey|honig/i.test(String(ing.name || ''))
  );
  if (sugarish.length) {
    warnings.push({ code: 'added_sugar', message: 'Enthält Zucker/Süssungsmittel: ' + sugarish.map((s) => s.name).join(', ') });
  }

  return warnings;
}

/**
 * Reichert Zutaten ohne Makros per USDA-Suche an (best effort).
 */
async function enrichIngredientsWithUsda(ingredients, opts) {
  const timeoutMs = (opts && opts.timeoutMs) || 15000;
  const out = [];
  for (const ing of ingredients) {
    const hasMacros = ing.macrosPer100g
      && (ing.macrosPer100g.protein > 0 || ing.macrosPer100g.fat > 0 || ing.macrosPer100g.netCarbs > 0 || ing.macrosPer100g.fiber > 0);
    const hasCal = num(ing.caloriesPer100g, 0) > 0;
    if ((hasMacros && hasCal) || !usda.isConfigured()) {
      out.push(ing);
      continue;
    }

    try {
      let detail = null;
      if (ing.fdcId) {
        const got = await usda.getFoodDetails(ing.fdcId, { timeoutMs });
        if (!got.error) detail = got.data;
      }
      if (!detail) {
        const search = await usda.searchFood(ing.name, { pageSize: 1, timeoutMs });
        if (!search.error && search.data.results[0]) {
          const hit = search.data.results[0];
          const got = await usda.getFoodDetails(hit.fdcId, { timeoutMs });
          if (!got.error) detail = got.data;
          else {
            // Fallback: abridged macros aus Suche
            out.push(Object.assign({}, ing, {
              fdcId: hit.fdcId,
              caloriesPer100g: num(hit.calories, 0),
              macrosPer100g: hit.macrosPer100g || emptyMacros(),
              usda: { name: hit.name, fdcId: hit.fdcId },
            }));
            continue;
          }
        }
      }
      if (detail) {
        out.push(Object.assign({}, ing, {
          fdcId: detail.fdcId,
          caloriesPer100g: num(detail.calories, 0),
          macrosPer100g: detail.macrosPer100g || emptyMacros(),
          vitamins: pickMicronutrients(detail.per100g, VITAMIN_KEYS),
          minerals: pickMicronutrients(detail.per100g, MINERAL_KEYS),
          usda: { name: detail.name, fdcId: detail.fdcId, dataType: detail.dataType },
        }));
      } else {
        out.push(ing);
      }
    } catch (_) {
      out.push(ing);
    }
  }
  return out;
}

/**
 * mapFinalNutrition → Coach perServing (keine Neuberechnung aus Rohzutaten).
 */
function perServingFromFinalNutrition(fn) {
  if (!fn || typeof fn !== 'object') return null;
  const calories = num(fn.kcal != null ? fn.kcal : fn.calories, NaN);
  const protein = num(fn.protein_g != null ? fn.protein_g : fn.protein, NaN);
  const fat = num(fn.fat_g != null ? fn.fat_g : fn.fat, NaN);
  const netCarbs = num(
    fn.netto_kh_g != null ? fn.netto_kh_g : (fn.netCarbs != null ? fn.netCarbs : fn.carbs),
    NaN
  );
  const fiber = num(fn.ballaststoffe_g != null ? fn.ballaststoffe_g : fn.fiber, NaN);
  if (![calories, protein, fat, netCarbs, fiber].every(Number.isFinite)) return null;
  return {
    calories: round1(calories),
    protein: round1(protein),
    fat: round1(fat),
    netCarbs: round1(netCarbs),
    fiber: round1(fiber),
  };
}

function hasCriticalPortionWarnings(warnings) {
  return (Array.isArray(warnings) ? warnings : []).some(function (w) {
    return /nicht bekannt|sichere Skalierung|Ungewöhnlich große/i.test(String(w || ''));
  });
}

/**
 * analyzeRecipe(recipe)
 * opts: { enrichUsda: boolean, timeoutMs }
 *
 * Bevorzugt finalNutrition + finalIngredients (Coach-Input-Vertrag).
 * Berechnet keine neuen Nährwerte aus Roh-/Alt-Rezepten, wenn finalNutrition vorliegt.
 */
async function analyzeRecipe(recipe, opts) {
  const raw = recipe && typeof recipe === 'object' ? recipe : null;
  if (!raw) return { error: 'invalid_payload' };

  const requiresReview = !!raw.requiresReview;
  const validationWarnings = raw.validationWarnings || raw.portionWarnings || raw.warnings || [];
  const servingsStatus = String(raw.servingsStatus || '');
  const sourceServingsStatus = String(raw.sourceServingsStatus || '');

  if (
    servingsStatus === 'unknown' ||
    sourceServingsStatus === 'unknown' ||
    raw.qualityStatus === 'blocked' ||
    (requiresReview && hasCriticalPortionWarnings(validationWarnings)) ||
    (!raw.finalNutrition && !raw.nutrition && requiresReview && sourceServingsStatus === 'unknown')
  ) {
    return {
      error: 'coach_unavailable',
      reason: raw.qualityStatus === 'blocked' ? 'quality_blocked' : 'requires_review',
      details: 'Keine uneingeschränkt sichere Ernährungsbewertung möglich (Portionsstatus prüfen).',
    };
  }

  // Canonical coach input: finalIngredients + finalNutrition
  const finalIngredients = Array.isArray(raw.finalIngredients)
    ? raw.finalIngredients
    : (Array.isArray(raw.ingredients) ? raw.ingredients : null);
  const finalNutrition = raw.finalNutrition || (
    raw.nutritionBasis === 'finalIngredients' || raw.nutritionSource === 'finalIngredients'
      ? raw.nutrition
      : null
  );
  const finalServings = num(
    raw.finalServings != null ? raw.finalServings : raw.servings,
    1
  );
  const qualityStatus = String(raw.qualityStatus || '');
  const qualityWarnings = Array.isArray(raw.qualityWarnings) ? raw.qualityWarnings : [];

  const fromFinal = perServingFromFinalNutrition(finalNutrition);
  if (fromFinal) {
    const warnings = buildWarnings(fromFinal, finalIngredients || []);
    if (
      qualityStatus === 'review' ||
      requiresReview ||
      sourceServingsStatus === 'inferred' ||
      servingsStatus === 'inferred'
    ) {
      warnings.unshift({
        code: 'portion_estimated',
        message: (qualityWarnings[0] || 'Portionsgröße geschätzt – bitte prüfen'),
        severity: 'review',
      });
    }
    const healthScore = computeHealthScore(fromFinal, warnings);
    return {
      data: {
        recipe: {
          id: raw.id,
          source: raw.source || 'labplate',
          title: String(raw.title || 'Rezept').slice(0, 200),
          servings: finalServings > 0 ? finalServings : 1,
          prep_time: typeof raw.prep_time === 'string' ? raw.prep_time : '',
          image: raw.image,
        },
        totals: {
          calories: fromFinal.calories * (finalServings > 0 ? finalServings : 1),
          protein: fromFinal.protein * (finalServings > 0 ? finalServings : 1),
          fat: fromFinal.fat * (finalServings > 0 ? finalServings : 1),
          netCarbs: fromFinal.netCarbs * (finalServings > 0 ? finalServings : 1),
          fiber: fromFinal.fiber * (finalServings > 0 ? finalServings : 1),
        },
        perServing: fromFinal,
        healthScore: qualityStatus === 'review' ? Math.min(healthScore, 70) : healthScore,
        warnings,
        ingredients: finalIngredients || [],
        nutritionSource: 'finalNutrition',
        qualityStatus: qualityStatus || 'ready',
        coverage: {
          withNutrition: finalIngredients ? finalIngredients.length : 0,
          total: finalIngredients ? finalIngredients.length : 0,
          ratio: 1,
        },
      },
    };
  }

  // Legacy-Fallback: nur wenn keine finalNutrition – Zutaten = bereits final/anzeige.
  const normalized = normalizeRecipeInput(
    Object.assign({}, raw, {
      ingredients: finalIngredients || raw.ingredients,
      servings: finalServings,
    })
  );
  if (!normalized || !normalized.ingredients.length) return { error: 'invalid_payload' };

  const o = opts || {};
  let ingredients = normalized.ingredients;
  if (o.enrichUsda !== false) {
    ingredients = await enrichIngredientsWithUsda(ingredients, o);
  }

  const analysis = analyzeIngredients(ingredients);
  if (analysis.error) return analysis;

  const totals = analysis.data.totals;
  const servings = normalized.servings || 1;
  const perServing = {
    calories: round1(totals.calories / servings),
    protein: round1(totals.protein / servings),
    fat: round1(totals.fat / servings),
    netCarbs: round1(totals.netCarbs / servings),
    fiber: round1(totals.fiber / servings),
  };

  const warnings = buildWarnings(perServing, analysis.data.ingredients);
  const healthScore = computeHealthScore(perServing, warnings);
  const covered = analysis.data.ingredients.filter((i) => i.caloriesPer100g > 0 || (i.macrosPer100g && (i.macrosPer100g.protein + i.macrosPer100g.fat + i.macrosPer100g.netCarbs + i.macrosPer100g.fiber) > 0)).length;

  return {
    data: {
      recipe: {
        id: normalized.id,
        source: normalized.source,
        title: normalized.title,
        servings,
        prep_time: normalized.prep_time,
        image: normalized.image,
      },
      totals: {
        calories: totals.calories,
        protein: totals.protein,
        fat: totals.fat,
        netCarbs: totals.netCarbs,
        fiber: totals.fiber,
      },
      perServing,
      healthScore,
      warnings,
      ingredients: analysis.data.ingredients,
      nutritionSource: 'ingredients_fallback',
      coverage: {
        withNutrition: covered,
        total: analysis.data.ingredients.length,
        ratio: analysis.data.ingredients.length
          ? round1(covered / analysis.data.ingredients.length)
          : 0,
      },
    },
  };
}

/**
 * generateDailyPlan(targets)
 * targets: { calories, protein, fat, carbs|netCarbs }
 */
function generateDailyPlan(targets) {
  const t = targets && typeof targets === 'object' ? targets : {};
  const calories = num(t.calories != null ? t.calories : t.zielKalorien, 0);
  const protein = num(t.protein != null ? t.protein : t.zielProtein, 0);
  const fat = num(t.fat != null ? t.fat : t.zielfett != null ? t.zielfett : t.zielFett, 0);
  const carbs = num(
    t.carbs != null ? t.carbs : (t.netCarbs != null ? t.netCarbs : (t.zielkohlenhydrate != null ? t.zielkohlenhydrate : t.zielKohlenhydrate)),
    0
  );

  if (!(calories > 0) && !(protein > 0) && !(fat > 0) && !(carbs > 0)) {
    return { error: 'invalid_payload' };
  }

  const slots = [
    { id: 'breakfast', label: 'Frühstück', share: 0.25, hint: 'Protein + Ballaststoffe (z. B. Skyr, Hafer, Beeren)' },
    { id: 'lunch', label: 'Mittagessen', share: 0.35, hint: 'Ausgewogen: Protein, Gemüse, komplexe KH' },
    { id: 'dinner', label: 'Abendessen', share: 0.30, hint: 'Leichter: Protein + Gemüse, weniger späte KH' },
    { id: 'snack', label: 'Snack', share: 0.10, hint: 'Proteinreich oder Ballaststoffe (Nüsse, Obst, Joghurt)' },
  ];

  const meals = slots.map((slot) => ({
    id: slot.id,
    label: slot.label,
    share: slot.share,
    targets: {
      calories: round0(calories * slot.share),
      protein: round1(protein * slot.share),
      fat: round1(fat * slot.share),
      carbs: round1(carbs * slot.share),
    },
    hint: slot.hint,
  }));

  return {
    data: {
      date: new Date().toISOString().slice(0, 10),
      targets: {
        calories: round0(calories),
        protein: round1(protein),
        fat: round1(fat),
        carbs: round1(carbs),
      },
      meals,
      notes: [
        'Verteilung: 25 % Frühstück · 35 % Mittag · 30 % Abend · 10 % Snack.',
        'Passe Portionsgrößen an Hunger und Training an – die Werte sind Zielkorridore.',
      ],
    },
  };
}

function normalizeAltKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * suggestAlternatives(ingredient)
 * ingredient: string oder { name, macrosPer100g?, ... }
 * opts: { enrichUsda: boolean } – ergänzt USDA-Treffer als Inspiration
 */
async function suggestAlternatives(ingredient, opts) {
  const name = typeof ingredient === 'string'
    ? ingredient
    : (ingredient && (ingredient.name || ingredient.ingredient));
  const key = normalizeAltKey(name);
  if (!key) return { error: 'invalid_payload' };

  let suggestions = [];
  if (ALTERNATIVES[key]) {
    suggestions = ALTERNATIVES[key].slice();
  } else {
    // Fuzzy: Teilstring-Match
    Object.keys(ALTERNATIVES).forEach((k) => {
      if (key.includes(k) || k.includes(key)) {
        suggestions = suggestions.concat(ALTERNATIVES[k]);
      }
    });
  }

  // Deduplizieren
  const seen = new Set();
  suggestions = suggestions.filter((s) => {
    const id = normalizeAltKey(s.name);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  if (!suggestions.length) {
    suggestions = [
      { name: 'Gemüseanteil erhöhen', reason: 'Mehr Volumen und Ballaststoffe bei wenig Kalorien', benefit: 'more_fiber' },
      { name: 'Proteinquelle ergänzen', reason: 'Sättigung und Muskelprotein-Synthese unterstützen', benefit: 'more_protein' },
    ];
  }

  const o = opts || {};
  if (o.enrichUsda !== false && usda.isConfigured() && suggestions[0]) {
    try {
      const search = await usda.searchFood(suggestions[0].name, {
        pageSize: 2,
        timeoutMs: o.timeoutMs || 12000,
      });
      if (!search.error && search.data.results.length) {
        suggestions = suggestions.map((s, idx) => {
          if (idx !== 0) return s;
          const hit = search.data.results[0];
          return Object.assign({}, s, {
            usdaExample: {
              fdcId: hit.fdcId,
              name: hit.name,
              macrosPer100g: hit.macrosPer100g,
              calories: hit.calories,
            },
          });
        });
      }
    } catch (_) { /* optional */ }
  }

  return {
    data: {
      ingredient: String(name).trim(),
      suggestions,
    },
  };
}

module.exports = {
  analyzeIngredients,
  analyzeRecipe,
  generateDailyPlan,
  suggestAlternatives,
  normalizeRecipeInput,
};
