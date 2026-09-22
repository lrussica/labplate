/**
 * Rezept-Pipeline v9.2 — JSON-Schema mit {ingredient_id}-Platzhaltern,
 * validate_recipe_v2 + Retry, Rendering in den bestehenden Client-Vertrag.
 */
'use strict';

const validator = require('./recipe-validator');
const portions = require('./recipe-portions');

const MAX_VALIDATION_ATTEMPTS = 3;
const DEFAULT_TARGET_SERVINGS = 1;

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
    // Groq strict: JEDES property muss in required stehen (sonst 400 invalid JSON schema).
    required: [
      'id', 'name', 'amount', 'unit', 'protein_source',
      'culinaryRole', 'countsAsPrimaryProteinSource',
      'netCarbs', 'fat', 'protein', 'fiber',
    ],
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
      protein_source: {
        type: 'boolean',
        description:
          'true nur bei primaerer Proteinquelle (main_protein/secondary_protein/protein_supplement). ' +
          'Nuesse/Joghurt-Basis: false.',
      },
      culinaryRole: {
        type: 'string',
        enum: [
          'main_protein', 'secondary_protein', 'protein_supplement', 'base', 'carbohydrate',
          'vegetable', 'fruit', 'fat_source', 'topping', 'garnish', 'seasoning', 'liquid',
          'binder', 'sweetener',
        ],
        description: 'Kulinarische Rolle der Zutat.',
      },
      countsAsPrimaryProteinSource: {
        type: 'boolean',
        description: 'Muss mit protein_source uebereinstimmen. Nuesse/topping/base: false.',
      },
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
        description:
          'Nur nackte {0001}-Platzhalter als Mengentoken — VERBOTEN: "{0004} Olivenöl", "Wasser {0007} ml", "{0005} Salz". ' +
          'Kein separater Step „Garnitur“; Anrichten inkl. Garnitur im letzten Step, Feld garnish parallel.',
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
        'title', 'servings', 'prep_time_min', 'nutrition', 'diet_labels', 'target_deviation_note',
        'dishPlan', 'ingredients', 'steps', 'garnish', 'chef_analysis',
      ],
      properties: {
        title: {
          type: 'string',
          description:
            'Beschreibt eine erkennbare Speise (z. B. „Protein-Pancakes mit Kokosjoghurt“), ' +
            'nicht nur „Proteinreicher Snack mit X und Y“.',
        },
        servings: {
          type: 'number',
          description:
            'IMMER exakt 4. Alle ingredients[].amount und nutrition gelten fuer genau 4 Portionen. ' +
            'Backend/Frontend skalieren auf die Nutzer-Portionszahl. VERBOTEN: servings≠4 oder Einzelportions-Kleinstmengen.',
        },
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
        dishPlan: {
          type: 'object',
          additionalProperties: false,
          required: ['dishType', 'texture', 'servingMode', 'cookingMethod', 'requiredActions'],
          description:
            'ZUERST festlegen, DANN Zutaten/Schritte. Bestimmt Rezeptart vor Makro-Optimierung.',
          properties: {
            dishType: {
              type: 'string',
              enum: [
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
              ],
            },
            texture: { type: 'string', description: 'z. B. soft, creamy, crispy' },
            servingMode: { type: 'string', enum: ['warm', 'cold', 'either'] },
            cookingMethod: {
              type: 'string',
              description: 'z. B. pan, boil, bake, no_cook, scramble',
            },
            requiredActions: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Konkrete Aktionen in Reihenfolge, z. B. whisk_eggs, mix_oats, cook_pan, fold_yogurt, serve',
            },
          },
        },
        ingredients: { type: 'array', items: ingredient },
        steps: { type: 'array', items: step },
        garnish: {
          type: 'string',
          description:
            'Nur Zutaten aus ingredients (per {id}). Leer \"\" wenn keine passende Listen-Zutat. ' +
            'VERBOTEN: erfundene Deko/Kraeuter (Petersilie etc.), die nicht in der Liste stehen.',
        },
        chef_analysis: {
          type: 'string',
          description:
            'Qualitativ. {id}-Platzhalter als Zutatreferenz erlaubt ("{0003} bildet die Basis"). ' +
            'VERBOTEN: "{0003} kcal", "{0003} g Protein", "{0003} g", "{0003}%".',
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
 * Wandelt v9.2-JSON in den Client-Vertrag um.
 * sourceServings (Rohmengen) → einmalige Skalierung auf targetServings → finalIngredients.
 * Steps/Garnish nur Namen (nameOnly) — keine Mengen in Prosa.
 */
function renderRecipeForDisplay(recipe, renderOpts) {
  if (!recipe || typeof recipe !== 'object') return null;
  // Identische Zutaten vor Skalierung zusammenfassen
  try {
    validator.dedupeRecipeIngredients(recipe);
  } catch (_) { /* best effort */ }
  const ingredientsIn = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  if (!ingredientsIn.length) return null;
  const o = renderOpts || {};
  const targetServings = Number(o.targetServings) > 0
    ? Number(o.targetServings)
    : DEFAULT_TARGET_SERVINGS;

  // Rohzutaten mit Original-Einheiten (Skalierung VOR stk→g).
  const sourceIngredients = ingredientsIn.map(function (ing) {
    const name = String(ing.name || 'Zutat').trim().slice(0, 200);
    let amount = Number(ing.amount);
    if (!Number.isFinite(amount) || amount < 0) amount = 0;
    let unit = ing.unit;
    if (unit === 'stk' || (unit == null && isEggIngredient(name))) unit = 'stk';
    else if (unit === 'prise' || unit === 'messerspitze') unit = unit;
    else if (unit === 'ml') unit = 'ml';
    else unit = 'g';
    return {
      id: ing.id,
      name: name,
      displayName: name,
      amount: amount,
      unit: unit,
      protein_source: !!ing.protein_source,
      culinaryRole: ing.culinaryRole || ing.role || null,
      countsAsPrimaryProteinSource: !!ing.countsAsPrimaryProteinSource,
      optional: !!ing.optional,
      netCarbs: Math.max(0, Number(ing.netCarbs) || 0),
      fat: Math.max(0, Number(ing.fat) || 0),
      protein: Math.max(0, Number(ing.protein) || 0),
      fiber: Math.max(0, Number(ing.fiber) || 0),
    };
  });

  console.log('RECIPE_RAW_SOURCE', JSON.stringify({
    title: recipe.title,
    declaredServings: recipe.servings,
    ingredients: sourceIngredients.map(function (i) {
      return { id: i.id, name: i.name, amount: i.amount, unit: i.unit };
    }),
  }));

  const portioned = portions.buildFinalPortionedRecipe({
    sourceIngredients: sourceIngredients,
    sourceServings: recipe.servings != null ? recipe.servings : recipe.sourceServings,
    sourceServingsStatus: recipe.sourceServingsStatus,
    sourceServingsMethod: recipe.sourceServingsMethod,
    sourceServingsConfidence: recipe.sourceServingsConfidence,
    cookedBatchWeight: recipe.cookedBatchWeight,
    targetServings: targetServings,
    title: recipe.title,
    steps: recipe.steps,
  });

  // Bei unbekannter Ausgangsportion: Rohmengen anzeigen, aber nie als sichere 1-Portion markieren.
  const scaledOk = !!(portioned.ok && portioned.finalIngredients);
  const useIngredients = scaledOk ? portioned.finalIngredients : sourceIngredients;
  const finalServings = scaledOk ? portioned.finalServings : null;
  const servingsStatus = portioned.servingsStatus || portions.SERVINGS_STATUS.UNKNOWN;
  const sourceServingsStatus = portioned.sourceServingsStatus ||
    portions.SOURCE_SERVINGS_STATUS.UNKNOWN;
  const requiresReview = scaledOk
    ? !!portioned.requiresReview
    : true;

  // Display-Mapping (stk → g für Makros; Eier-Name kulinarisch).
  // Unplausible KI-Makros/100g sofort klemmen (z.B. Protein 81 bei Hackfleisch).
  let ingredients = useIngredients.map(function (ing) {
    const name = String(ing.displayName || ing.name || 'Zutat').trim().slice(0, 200);
    let amount = Number(ing.amount);
    let unit = ing.unit;
    let netCarbs = Math.max(0, Number(ing.netCarbs) || 0);
    let fat = Math.max(0, Number(ing.fat) || 0);
    let protein = Math.max(0, Number(ing.protein) || 0);
    let fiber = Math.max(0, Number(ing.fiber) || 0);
    const isOil = /öl|oil|olio|butter|schmalz/i.test(name);
    if (protein > 40 || (!isOil && fat > 45) || netCarbs > 90 ||
        (/hack|fleisch|rind|schwein|huhn|hähn|pute|lachs|fisch|beef|pork/i.test(name) && protein > 35)) {
      if (/hack|rind|beef|schwein|pork|fleisch|huhn|hähn|pute|lachs|fisch/i.test(name)) {
        protein = 20; fat = Math.min(fat > 0 ? fat : 15, 15); netCarbs = 0; fiber = 0;
      } else if (isOil) {
        protein = 0; fat = 100; netCarbs = 0; fiber = 0;
      } else if (/parmesan|pecorino|grana/i.test(name)) {
        protein = Math.min(protein, 35); fat = Math.min(fat > 0 ? fat : 28, 35); netCarbs = 0; fiber = 0;
      } else {
        protein = Math.min(protein, 25);
        fat = Math.min(fat, 40);
        netCarbs = Math.min(netCarbs, 80);
      }
    }
    // Absolute Proteinmenge als per-100g (z.B. 112 bei 135 g Fleisch)
    if (/hack|rind|beef|schwein|fleisch|huhn|hähn|pute|lachs|fisch/i.test(name) &&
        Number.isFinite(amount) && amount >= 80 && protein > Math.max(40, amount * 0.5)) {
      protein = 20; fat = Math.min(fat > 0 ? fat : 15, 15); netCarbs = 0; fiber = 0;
    }
    if (unit === 'stk' || (unit == null && isEggIngredient(name))) {
      let pieces = Number.isFinite(amount) && amount > 0 ? Math.max(1, Math.round(amount)) : 1;
      // Name kann bereits „10 Eier“ tragen, obwohl amount=1
      const namePieces = String(name).match(/^\s*(\d+)\s*eier?\b/i);
      if (namePieces) {
        pieces = Math.max(pieces, Math.round(Number(namePieces[1])));
      }
      if (pieces > portions.SINGLE_PORTION_BASE.eggMaxPieces) {
        pieces = portions.SINGLE_PORTION_BASE.eggMaxPieces;
      }
      amount = pieces * 60;
      const displayName = pieces === 1
        ? '1 Ei (Größe M, ca. 60 g)'
        : pieces + ' Eier (Größe M, ca. 60 g je)';
      return {
        name: displayName,
        amount: amount,
        unit: 'g',
        status: 'benoetigt',
        macrosPer100g: { netCarbs: netCarbs, fat: fat, protein: protein, fiber: fiber },
        _v92_id: ing.id,
        _protein_source: !!ing.protein_source,
        _culinary_amount: pieces,
        _culinary_unit: 'stk',
        _discrete: true,
      };
    }
    // Eier fälschlich als Gramm + „N Eier“ im Namen
    if (isEggIngredient(name) && (unit === 'g' || unit === 'kg')) {
      let grams = unit === 'kg' ? amount * 1000 : amount;
      let pieces = Number.isFinite(grams) && grams >= 40 ? Math.max(1, Math.round(grams / 60)) : 1;
      const namePieces = String(name).match(/^\s*(\d+)\s*eier?\b/i);
      if (namePieces) pieces = Math.max(pieces, Math.round(Number(namePieces[1])));
      if (pieces > portions.SINGLE_PORTION_BASE.eggMaxPieces) {
        pieces = portions.SINGLE_PORTION_BASE.eggMaxPieces;
      }
      return {
        name: pieces === 1 ? '1 Ei (Größe M, ca. 60 g)' : (pieces + ' Eier (Größe M, ca. 60 g je)'),
        amount: pieces * 60,
        unit: 'g',
        status: 'benoetigt',
        macrosPer100g: { netCarbs: netCarbs, fat: fat, protein: protein, fiber: fiber },
        _v92_id: ing.id,
        _protein_source: !!ing.protein_source,
        _culinary_amount: pieces,
        _culinary_unit: 'stk',
        _discrete: true,
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
      macrosPer100g: { netCarbs: netCarbs, fat: fat, protein: protein, fiber: fiber },
      _v92_id: ing.id,
      _protein_source: !!ing.protein_source,
    };
  });

  // Zweite Sicherheits-Klemme nach Display-Mapping (deckt g-Eier / „10 Eier“-Namen ab)
  if (scaledOk) {
    const enforcedDisplay = portions.enforceSinglePortionBaseAmounts(ingredients, {
      dietLabels: recipe.diet_labels,
      aiInstruction: o.aiInstruction || recipe.ai_instruction,
    });
    if (enforcedDisplay.clamps && enforcedDisplay.clamps.length) {
      ingredients = enforcedDisplay.ingredients;
      recipe._eggClampWarnings = (recipe._eggClampWarnings || []).concat(enforcedDisplay.warnings || []);
    } else {
      ingredients = enforcedDisplay.ingredients;
    }
  }

  // Nährwerte nur aus skalierten finalIngredients als Portionswerte ausgeben.
  // Bei unknown: Mengen sind unskaliert → keine scheinbar sichere Portions-Nährwertangabe.
  let protein = 0;
  let fat = 0;
  let nettoKh = 0;
  let fiber = 0;
  ingredients.forEach(function (ing) {
    const grams = Number(ing.amount) || 0;
    const m = ing.macrosPer100g || {};
    const f = grams / 100;
    protein += (Number(m.protein) || 0) * f;
    fat += (Number(m.fat) || 0) * f;
    nettoKh += (Number(m.netCarbs) || 0) * f;
    fiber += (Number(m.fiber) || 0) * f;
  });
  const nutritionFromAmounts = {
    kcal: Math.round(protein * 4 + fat * 9 + nettoKh * 4),
    protein_g: Math.round(protein * 10) / 10,
    fat_g: Math.round(fat * 10) / 10,
    netto_kh_g: Math.round(nettoKh * 10) / 10,
    ballaststoffe_g: Math.round(fiber * 10) / 10,
  };
  const finalNutrition = scaledOk ? nutritionFromAmounts : null;
  if (scaledOk && finalNutrition) {
    const kcalCheck = portions.validateSinglePortionKcal(finalNutrition, {
      dietLabels: recipe.diet_labels,
      aiInstruction: o.aiInstruction || recipe.ai_instruction,
    });
    if (kcalCheck.warnings && kcalCheck.warnings.length) {
      // Warnungen später in portionWarnings mergen
      recipe._singlePortionKcalWarnings = kcalCheck.warnings;
    }
  }
  console.log('RECIPE_FINAL_NUTRITION', JSON.stringify({
    scaledOk: scaledOk,
    nutrition: finalNutrition,
  }));

  const byIdForProse = {};
  ingredients.forEach(function (ing) {
    if (!ing || !ing._v92_id) return;
    const pieces = ing._culinary_amount != null ? Number(ing._culinary_amount) : null;
    const proseName = validator.proseIngredientName(ing.name, {
      pieces: pieces,
      isEgg: !!ing._discrete || validator.isEggIngredientName(ing.name),
    });
    byIdForProse[String(ing._v92_id)] = {
      id: ing._v92_id,
      name: proseName,
      amount: 0,
      unit: '',
      _culinary_amount: pieces,
      _discrete: !!ing._discrete,
    };
  });

  const steps = (Array.isArray(recipe.steps) ? recipe.steps : []).map(function (s) {
    if (!s || typeof s === 'string') {
      const t = String(s || '').trim();
      if (!t) return '';
      return validator.smoothProseIngredientGrammar(validator.stripQuantityMentionsFromText(t));
    }
    let content = validator.resolvePlaceholders(s.content || '', byIdForProse, { nameOnly: true });
    content = validator.stripQuantityMentionsFromText(content);
    content = validator.smoothProseIngredientGrammar(content);
    const title = String(s.title || '').trim();
    const titleLower = title.toLowerCase();

    // Köcheln + Garnieren nie in einem Schritt
    if (/köchel|simmer|schmor/i.test(titleLower) && /garnier/i.test(titleLower + ' ' + content)) {
      content = 'Das Ragù bei niedriger Hitze etwa zwei Stunden sanft köcheln lassen und gelegentlich umrühren.';
      return content;
    }

    // Bare Namenlisten / nur Platzhalter-Auflösung → natürliche Sätze aus Titel
    const bareNames = /^\s*[A-ZÄÖÜa-zäöüß][A-Za-zÄÖÜäöüß0-9\-]*(?:\s+[A-ZÄÖÜa-zäöüß][A-Za-zÄÖÜäöüß0-9\-]*){0,8}\s*$/;
    const isBare = bareNames.test(content) &&
      !/\b(und|mit|in|auf|bei|bis|dann|lassen|erhitzen|braten)\b/i.test(content);
    if (isBare || !content) {
      if (/öl.*erhitz|erhitzen.*öl|^olivenöl erhitz/i.test(titleLower)) {
        content = 'Das Olivenöl in einem schweren Topf erhitzen.';
      } else if (/anschwitz|gemüse|soffritto/i.test(titleLower)) {
        content = 'Zwiebel, Karotte und Sellerie darin bei mittlerer Hitze langsam anschwitzen, bis das Gemüse weich ist.';
      } else if (/brat|fleisch|hack/i.test(titleLower)) {
        content = 'Das Rinderhackfleisch hinzufügen und unter Rühren krümelig anbraten.';
      } else if (/ablösch|wein/i.test(titleLower)) {
        content = 'Mit dem Rotwein ablöschen und kurz einkochen lassen.';
      } else if (/tomate|hinzufüg/i.test(titleLower)) {
        content = 'Passierte Tomaten und Tomatenmark einrühren.';
      } else if (/abschmeck|würz/i.test(titleLower)) {
        content = 'Mit Salz und Pfeffer abschmecken.';
      } else if (/köchel|schmor|simmer|langsam/i.test(titleLower)) {
        content = 'Das Ragù bei niedriger Hitze etwa zwei Stunden sanft köcheln lassen und gelegentlich umrühren.';
      } else if (/garnier/i.test(titleLower)) {
        content = 'Nach Wunsch garnieren.';
      } else if (title) {
        content = title.replace(/:\s*$/, '') + '.';
      } else {
        content = 'Weitergaren.';
      }
    }

    // Explizit verbieten: bare names trotz Titel
    if (title && bareNameList(content)) {
      content = naturalizeFromTitle(title, content);
    }

    return String(content || '').trim();
  }).filter(Boolean);

  function bareNameList(t) {
    const s = String(t || '').trim();
    if (!s || /[.!?]/.test(s)) return false;
    if (/\b(und|mit|erhitzen|braten|kochen|dünsten|anschwitzen|ablöschen|einrühren|köcheln|abschmecken|sanft|lassen)\b/i.test(s)) {
      return false;
    }
    const toks = s.split(/\s+/).filter(Boolean);
    return toks.length >= 1 && toks.length <= 10;
  }
  function naturalizeFromTitle(title) {
    const titleLower = String(title || '').toLowerCase();
    if (/öl|erhitz/i.test(titleLower)) return 'Das Olivenöl in einem schweren Topf erhitzen.';
    if (/anschwitz|gemüse/i.test(titleLower)) {
      return 'Zwiebel, Karotte und Sellerie darin bei mittlerer Hitze langsam anschwitzen, bis das Gemüse weich ist.';
    }
    if (/brat|fleisch/i.test(titleLower)) {
      return 'Das Rinderhackfleisch hinzufügen und unter Rühren krümelig anbraten.';
    }
    if (/ablösch|wein/i.test(titleLower)) return 'Mit dem Rotwein ablöschen und kurz einkochen lassen.';
    if (/tomate/i.test(titleLower)) return 'Passierte Tomaten und Tomatenmark einrühren.';
    if (/würz|abschmeck/i.test(titleLower)) return 'Mit Salz und Pfeffer abschmecken.';
    if (/köchel/i.test(titleLower)) {
      return 'Das Ragù bei niedriger Hitze etwa zwei Stunden sanft köcheln lassen und gelegentlich umrühren.';
    }
    return String(title).replace(/:\s*$/, '') + '.';
  }

  const stepTimeSum = (Array.isArray(recipe.steps) ? recipe.steps : []).reduce(function (sum, s) {
    return sum + (Number(s && s.time_min) || 0);
  }, 0);
  const declaredPrep = Number(recipe.prep_time_min) || 0;
  // Gesamtzeit: max(deklariert, Summe Schrittzeiten) – lange Kochzeiten nicht unterschlagen.
  const prepMin = Math.max(declaredPrep, stepTimeSum);
  function formatPrepLabel(mins) {
    const m = Math.max(0, Math.round(Number(mins) || 0));
    if (m <= 0) return '';
    if (m < 60) return m + ' Minuten';
    const h = Math.floor(m / 60);
    const rest = m % 60;
    if (rest === 0) return h === 1 ? 'ca. 1 Stunde' : ('ca. ' + h + ' Stunden');
    if (h === 1) return 'ca. 1 Stunde ' + rest + ' Minuten';
    return 'ca. ' + h + ' Stunden ' + rest + ' Minuten';
  }
  const prep_time = formatPrepLabel(prepMin);
  const cookMinutes = stepTimeSum;
  const prepMinutes = Math.max(0, declaredPrep > stepTimeSum ? declaredPrep - stepTimeSum : 0);
  const totalMinutes = prepMin;
  let garnish = validator.resolvePlaceholders(recipe.garnish || '', byIdForProse, { nameOnly: true });
  garnish = validator.smoothProseIngredientGrammar(validator.stripQuantityMentionsFromText(garnish)).slice(0, 400);
  // Keine Schein-Garnitur nur aus Öl/Salz
  if (/^(das\s+)?(olivenöl|öl|salz|pfeffer)\.?$/i.test(String(garnish || '').trim())) {
    garnish = '';
  }
  let note = validator.resolvePlaceholders(recipe.chef_analysis || '', byIdForProse, { nameOnly: true });
  note = validator.smoothProseIngredientGrammar(validator.stripQuantityMentionsFromText(note));
  if (recipe.target_deviation_note) {
    note = (note ? note + ' ' : '') + String(recipe.target_deviation_note);
  }

  const consistency = portions.validateRecipeConsistency({
    title: recipe.title,
    finalIngredients: ingredients,
    steps: steps,
  });
  const portionWarnings = (portioned.warnings || [])
    .concat(consistency.warnings || [])
    .concat(recipe._singlePortionKcalWarnings || [])
    .concat(recipe._eggClampWarnings || [])
    .filter(Boolean);

  const shopping = ingredients.map(function (ing) {
    if (!ing.amount) return ing.name + ' – nicht angegeben';
    return ing.name + ' – ' + ing.amount + ' ' + ing.unit;
  });

  // Client-Vertrag: servings = finalServings (nach Skalierung), nie stille Lüge.
  const displayServings = finalServings != null ? finalServings : 0;
  const singlePortionNormalized = !!(
    portioned.singlePortionNormalized ||
    (displayServings === 1 && portions.amountsLookLikeSinglePortion &&
      portions.amountsLookLikeSinglePortion(ingredients))
  );
  // Nach erfolgreicher 1-Portions-Normierung: kein Schätz-Banner / Review-Zwang nur wegen inferred
  const reviewForHint = singlePortionNormalized ? false : requiresReview;
  const safeSingle = portions.canDisplayAsSafeSinglePortion({
    finalServings: displayServings,
    servingsStatus: singlePortionNormalized ? portions.SERVINGS_STATUS.VALIDATED : servingsStatus,
    sourceServingsStatus: singlePortionNormalized
      ? portions.SOURCE_SERVINGS_STATUS.EXPLICIT
      : sourceServingsStatus,
    requiresReview: reviewForHint,
    portionWarnings: portionWarnings,
    singlePortionNormalized: singlePortionNormalized,
    finalIngredients: ingredients,
  });
  const portionDisplayHint = portions.getPortionDisplayHint({
    finalServings: displayServings,
    servingsStatus: servingsStatus,
    sourceServingsStatus: sourceServingsStatus,
    requiresReview: reviewForHint,
    singlePortionNormalized: singlePortionNormalized,
    finalIngredients: ingredients,
  });

  const out = {
    title: (typeof recipe.title === 'string' && recipe.title.trim())
      ? recipe.title.trim().slice(0, 200)
      : 'Rezept',
    servings: displayServings > 0 ? displayServings : 1,
    sourceServings: portioned.sourceServings,
    sourceServingsStatus: sourceServingsStatus,
    sourceServingsMethod: portioned.sourceServingsMethod || null,
    sourceServingsConfidence: portioned.sourceServingsConfidence != null
      ? portioned.sourceServingsConfidence
      : null,
    targetServings: targetServings,
    finalServings: displayServings > 0 ? displayServings : null,
    servingsStatus: servingsStatus,
    requiresReview: singlePortionNormalized ? false : requiresReview,
    singlePortionNormalized: singlePortionNormalized,
    scalingFactor: portioned.scalingFactor != null ? portioned.scalingFactor : null,
    portionSafe: safeSingle || singlePortionNormalized,
    portionDisplayHint: portionDisplayHint,
    portionWarnings: portionWarnings,
    validationWarnings: portionWarnings,
    prep_time: prep_time.slice(0, 60),
    prepMinutes: prepMinutes || null,
    cookMinutes: cookMinutes || null,
    totalMinutes: totalMinutes || null,
    nutrition_note: note.slice(0, 800),
    garnish: garnish.slice(0, 200),
    self_check: '',
    ingredients: ingredients,
    finalIngredients: ingredients,
    shopping_list: shopping,
    steps: steps,
    diet_labels: Array.isArray(recipe.diet_labels) ? recipe.diet_labels : [],
    dishPlan: recipe.dishPlan && typeof recipe.dishPlan === 'object' ? recipe.dishPlan : null,
    nutrition: finalNutrition || nutritionFromAmounts,
    finalNutrition: finalNutrition,
    nutritionBasis: scaledOk ? 'finalIngredients' : 'unscaled_source',
    nutritionSource: scaledOk ? 'finalIngredients' : 'unscaled_source',
    nutritionServings: scaledOk && displayServings > 0 ? displayServings : null,
    nutritionIngredientCount: ingredients.length,
    yield: portioned.yield || {
      rawBatchWeight: null,
      cookedBatchWeight: null,
      yieldStatus: 'unknown',
      portionWeight: null,
    },
    recipe_schema_version: 'v9.2',
    recipeVersion: portions.RECIPE_MODEL_VERSION.recipeVersion,
    ingredientModelVersion: portions.RECIPE_MODEL_VERSION.ingredientModelVersion,
    nutritionVersion: portions.RECIPE_MODEL_VERSION.nutritionVersion,
    instructionVersion: portions.RECIPE_MODEL_VERSION.instructionVersion,
    recipeSource: recipe.recipeSource || null,
    masterRecipeId: recipe.masterRecipeId || null,
    immutableCore: !!recipe.immutableCore,
    lactoseHonestyStatus: recipe.lactoseHonestyStatus || null,
    cuisine: recipe.cuisine || null,
    region: recipe.region || null,
    lang: recipe.lang || o.lang || null,
  };

  console.log('RECIPE_VALIDATION', JSON.stringify({
    servingsStatus: out.servingsStatus,
    sourceServingsStatus: out.sourceServingsStatus,
    sourceServings: out.sourceServings,
    finalServings: out.finalServings,
    requiresReview: out.requiresReview,
    portionSafe: out.portionSafe,
    warnings: portionWarnings,
  }));

  try {
    const displayFixes = require('./recipe-display-fixes');
    displayFixes.applyRecipeDisplayFixes(out, {
      noHerbs: !!(o.noHerbs || recipe.noHerbs),
      isOriginalRequest: !!(o.isOriginalRequest || recipe.recipeSource === 'ai-generated-original'),
      isOriginalBolognese: !!(o.isOriginalBolognese || /bolognese/i.test(String(out.title || ''))),
      allergens: o.allergens || recipe.allergens || [],
      aiInstruction: o.aiInstruction || recipe.ai_instruction || '',
      originalRules: o.originalRules || recipe.originalRules || '',
      dairyFreeAdaptation: !!o.dairyFreeAdaptation,
      lang: o.lang || recipe.lang || 'de',
    });
  } catch (eFx) {
    console.warn('[recipe-v92] display fixes failed', eFx && eFx.message);
  }

  try {
    const qualityGate = require('./recipe-quality-gate');
    qualityGate.applyRecipeQualityGate(out, {
      allergens: o.allergens || recipe.allergens || [],
      dishQuery: o.dishQuery || recipe._dishQuery || recipe.title || '',
      ai_instruction: o.ai_instruction || recipe.ai_instruction || '',
    });
  } catch (eQg) {
    console.warn('[recipe-v92] quality gate failed', eQg && eQg.message);
  }

  return out;
}

function logRawLlmJson(meta) {
  try {
    const parsed = meta.parsed;
    const stepContents = Array.isArray(parsed && parsed.steps)
      ? parsed.steps.map(function (s, i) {
          return {
            i: i + 1,
            title: s && s.title,
            content: s && s.content,
            stove_level: s && s.stove_level,
            time_min: s && s.time_min,
          };
        })
      : [];
    const ingSummary = Array.isArray(parsed && parsed.ingredients)
      ? parsed.ingredients.map(function (ing) {
          return {
            id: ing && ing.id,
            name: ing && ing.name,
            amount: ing && ing.amount,
            unit: ing && ing.unit,
            protein_source: !!(ing && ing.protein_source),
          };
        })
      : [];
    console.log('[recipe-v92] raw_llm_json ' + JSON.stringify({
      prompt_version: 'v9.2',
      attempt: meta.attempt,
      validation_pending: true,
      title: parsed && parsed.title,
      ingredients: ingSummary,
      step_contents: stepContents,
      garnish: parsed && parsed.garnish,
      chef_analysis: parsed && parsed.chef_analysis,
      nutrition: parsed && parsed.nutrition,
      diet_labels: parsed && parsed.diet_labels,
    }));
    // Vollständiges Raw-JSON (kann groß sein) – separates Log für Debug-Pipelines
    console.log('[recipe-v92] raw_llm_json_full attempt=' + meta.attempt + ' ' + JSON.stringify(parsed));
  } catch (e) {
    console.log('[recipe-v92] raw_llm_json_log_failed ' + (e && e.message ? e.message : String(e)));
  }
}

function logValidationFailure(meta) {
  try {
    const parsed = meta.parsed;
    const ingredientNames = Array.isArray(parsed && parsed.ingredients)
      ? parsed.ingredients.map(function (ing) { return String((ing && ing.name) || ''); }).filter(Boolean)
      : [];
    console.log('[recipe-v92] validation_failed ' + JSON.stringify({
      prompt_version: 'v9.2',
      attempt: meta.attempt,
      errors: meta.errors,
      warnings: meta.warnings,
      title: parsed && parsed.title,
      ingredient_names: ingredientNames,
    }));
  } catch (e) { /* ignore */ }
}

/**
 * Übersetzt validation.errors in konkrete LLM-Handlungsanweisungen (Retry-Feedback).
 * @param {string[]} errors
 * @returns {string[]}
 */
function errorsToDirectives(errors, opts) {
  const list = Array.isArray(errors) ? errors : [];
  const o = opts && typeof opts === 'object' ? opts : {};
  const dishQuery = String(o.dishQuery || o.title || '').trim();
  const directives = [];
  const seenProtein = {};

  function splitIngredientNameList(raw) {
    const out = [];
    let cur = '';
    let depth = 0;
    const s = String(raw || '');
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '(') depth += 1;
      if (ch === ')') depth = Math.max(0, depth - 1);
      if (ch === ',' && depth === 0) {
        if (cur.trim()) out.push(cur.trim());
        cur = '';
        continue;
      }
      cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  function namesNotInTitle(names) {
    if (!dishQuery || !names || !names.length) return [];
    const qLower = dishQuery.toLowerCase();
    return names.filter(function (nm) {
      const token = String(nm || '').toLowerCase()
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[,.].*$/, '')
        .trim()
        .split(/\s+/)[0];
      if (!token || token.length < 3) return true;
      const stem = token.replace(/(en|er|e|n)$/i, '');
      return qLower.indexOf(token) < 0 && (stem.length < 3 || qLower.indexOf(stem) < 0);
    });
  }

  list.forEach(function (err) {
    const e = String(err || '');
    const mTitleBind = e.match(/Titel-Zutaten-Bindung:\s*Die Zutat\(en\)\s+(.+?)\s+stehen nicht im vorgegebenen Titel/i);
    if (mTitleBind && !seenProtein.titleBind) {
      seenProtein.titleBind = true;
      const extraNames = mTitleBind[1].trim();
      const titleLabel = dishQuery || (e.match(/Titel '([^']+)'/) || [])[1] || '';
      directives.push(
        "Die Zutat(en) " + extraNames + " stehen nicht im vorgegebenen Titel '" + titleLabel +
        "'. Entferne sie und erhöhe stattdessen die Menge der im Titel genannten Zutat(en), " +
        'um das Proteinziel zu erreichen.'
      );
    }
    const mKw = e.match(/Mehr als 2 Proteinquellen \(Keyword-Heuristik\):\s*(.+)$/i);
    const mFlag = e.match(/Mehr als 2 Proteinquellen \(protein_source=true\):\s*(.+)$/i);
    const mCulinary = e.match(/Mehr als 2 primäre? Proteinquellen[^:]*:\s*(.+)$/i);
    const namesRaw = (mKw && mKw[1]) || (mFlag && mFlag[1]) || (mCulinary && mCulinary[1]) || '';
    if (namesRaw && !seenProtein.done) {
      seenProtein.done = true;
      const names = splitIngredientNameList(namesRaw);
      directives.push(
        'KONKRETE KORREKTUR: Du hast 3 Proteinquellen verwendet (' + names.join(', ') + '). ' +
        'Entferne EINE davon komplett aus den ingredients und erhöhe die Menge einer der ' +
        'verbleibenden zwei, um das ursprüngliche Proteinziel zu erreichen. ' +
        'Setze protein_source NICHT auf false, um eine Zutat zu "verstecken" — ' +
        'entferne sie stattdessen ganz aus dem Rezept.'
      );
      const extras = namesNotInTitle(names);
      if (extras.length && !seenProtein.titleBind) {
        seenProtein.titleBind = true;
        directives.push(
          "Die Zutat(en) " + extras.join(', ') + " stehen nicht im vorgegebenen Titel '" + dishQuery +
          "'. Entferne sie und erhöhe stattdessen die Menge der im Titel genannten Zutat(en), " +
          'um das Proteinziel zu erreichen.'
        );
      }
    }
    if (/protein_source falsch gesetzt|primaere Proteinquellen|primäre Proteinquellen/i.test(e) && !seenProtein.flagHint) {
      seenProtein.flagHint = true;
      if (!seenProtein.done) {
        directives.push(
          'KONKRETE KORREKTUR PROTEIN-ROLLEN: Maximal 2 Zutaten mit countsAsPrimaryProteinSource=true ' +
          '(Rollen main_protein, secondary_protein, protein_supplement). ' +
          'Nuesse/Samen/Mandeln = topping (false). Joghurt/Soja-Joghurt = base (false). ' +
          'Proteinpulver = protein_supplement (true). Entferne ueberzaehlige Hauptproteine komplett — Flag nicht faelschen.'
        );
      }
    }
    const mStaple = e.match(/Zutat '([^']+)' im Text erwähnt, aber nicht in ingredients gelistet/i);
    if (mStaple && !seenProtein['staple_' + mStaple[1]]) {
      seenProtein['staple_' + mStaple[1]] = true;
      const stapleName = mStaple[1];
      const isLiquid = /wasser|brühe|bruehe|fond|öl|oel|milch|essig/i.test(stapleName);
      directives.push(
        "KONKRETE KORREKTUR: Du hast '" + stapleName + "' im Step-Text genannt, ohne sie in ingredients " +
        'zu listen. Fuege "' + stapleName + '" mit eigener id in ingredients hinzu' +
        (isLiquid ? ' (unit ml, realistische Koch-/Bratmenge)' : '') +
        ' und ersetze jedes Klartext-Vorkommen im Step durch den {id}-Platzhalter ' +
        '(nie "etwas ' + stapleName + '" / nie nur das Wort "' + stapleName + '" ohne Listen-Eintrag).'
      );
    }
    if (/Kalorien-Formel-Abweichung/i.test(e) && !seenProtein.kcal) {
      seenProtein.kcal = true;
      directives.push(
        'KONKRETE KORREKTUR: nutrition.kcal muss der Formel ' +
        '4×protein_g + 9×fat_g + 4×netto_kh_g + 2×ballaststoffe_g entsprechen (±10 %). ' +
        'Passe nutrition.kcal ODER die Makros an, bis die Formel stimmt — erfinde keine ' +
        'unabhängige kcal-Zahl.'
      );
    }
    const mUnused = e.match(/Zutaten nie referenziert \(evtl\. überflüssig\):\s*(.+)$/i);
    if (mUnused && !seenProtein.unused) {
      seenProtein.unused = true;
      directives.push(
        'KONKRETE KORREKTUR: Die Zutaten-IDs ' + mUnused[1].trim() + ' kommen in keinem Step/garnish vor. ' +
        'Referenziere JEDE gelistete Zutat mindestens einmal per {id} ODER entferne ungenutzte ' +
        'Einträge komplett aus ingredients.'
      );
    }
    const mCold = e.match(/Gerinnungsschutz:\s*'([^']+)'/i);
    if (mCold && !seenProtein['cold_' + mCold[1]]) {
      seenProtein['cold_' + mCold[1]] = true;
      directives.push(
        "KONKRETE KORREKTUR: Verschiebe das Einrühren von '" + mCold[1] + "' an das Ende, nachdem der Herd " +
        'ausgeschaltet wurde (stove_level 0). VERBOTEN: sensible Milchprodukte zuerst in Eier/Masse ' +
        'mischen und danach die Mischung zu erhitzen — auch wenn die Zutat im Hitze-Step nur noch als ' +
        '"Mischung" vorkommt. Gare zuerst (Herd AUS), dann ' + mCold[1] + ' unterheben.'
      );
    }
    const mPh = e.match(/(?:chef_analysis|steps|garnish).*\{(\d{4})\}.*(?:Nährwert|Zahlen-|Naehrwert)/i) ||
      e.match(/missbraucht Zutat-Platzhalter \{(\d{4})\}/i);
    if (mPh && !seenProtein['ph_' + mPh[1]]) {
      seenProtein['ph_' + mPh[1]] = true;
      directives.push(
        'KONKRETE KORREKTUR: Platzhalter {' + mPh[1] + '} nur als Zutatreferenz ' +
        '("{' + mPh[1] + '} bildet die cremige Basis"). VERBOTEN direkt davor/danach: kcal, g, ml, %, Protein, Fett, KH.'
      );
    }
    if (/Gerichtskonzept verfehlt/i.test(e) && !seenProtein.dishConcept) {
      seenProtein.dishConcept = true;
      directives.push(
        'KONKRETE KORREKTUR TITEL-TREUE: Der Nutzer hat ein konkretes Gericht vorgegeben. ' +
        'Du DARFST Allergene nur durch kulinarisch etablierte Alternativen ersetzen ' +
        '(z.B. Joghurt → laktosefreier/Soja-Joghurt; Sahne → Pflanzensahne/Hafercreme). ' +
        'VERBOTEN: Gerichtskonzept wechseln oder unpassende Notlösungen (Tofu in Sahnesauce, Hähnchen statt Joghurt-Bowl). ' +
        'Pflichtzutaten aus dem Titel müssen als ingredients vorkommen (z.B. Joghurt + Nüsse). ' +
        'Nüsse unit=g (nie prise). Titel exakt beibehalten. ' +
        'Wenn kein würdiger Ersatz: title=__LACTOSE_HONESTY_ALTERNATIVE__ oder __LACTOSE_HONESTY_IMPOSSIBLE__.'
      );
    }
    if (/nicht in einem sinnvollen Kochschritt|Eier sind nicht/i.test(e) && !seenProtein.eggUsage) {
      seenProtein.eggUsage = true;
      directives.push(
        'KONKRETE KORREKTUR ZUTATEN-NUTZUNG: Jede nicht-optionale Zutat MUSS in einem konkreten Step ' +
        'per {id} vorkommen UND eine passende Aktion haben. Eier: verquirlen/braten/stocken/backen/' +
        'einarbeiten — VERBOTEN nur in chef_analysis oder in „Die Zutaten vermengen“. ' +
        'Lösche ungenutzte Zutaten NICHT stillschweigend — schreibe den fehlenden Kochschritt.'
      );
    }
    if (/Generische Zubereitungsschritte/i.test(e) && !seenProtein.genericSteps) {
      seenProtein.genericSteps = true;
      directives.push(
        'KONKRETE KORREKTUR SCHRITTE: Ersetze generische Floskeln („Die Zutaten gründlich vermengen“, ' +
        '„Wasser bereitstellen“) durch konkrete Technik (verquirlen, braten, kochen, unterheben).'
      );
    }
    if (/Keine eindeutige Rezeptart|Titel beschreibt keine erkennbare/i.test(e) && !seenProtein.dishPlan) {
      seenProtein.dishPlan = true;
      directives.push(
        'KONKRETE KORREKTUR dishPlan: Lege ZUERST dishPlan fest (z. B. oat_egg_pancake, protein_porridge, ' +
        'yogurt_nut_bowl), DANN Zutaten/Steps. Titel = Speise (Pancakes/Porridge/Bowl), ' +
        'nicht nur „Proteinreicher Snack mit…“.'
      );
    }
    if (/Flüssigkeitsmenge.*Haferflocken/i.test(e) && !seenProtein.oatsLiquid) {
      seenProtein.oatsLiquid = true;
      directives.push(
        'KONKRETE KORREKTUR FLÜSSIGKEIT: Hafer ≥25 g braucht ≥60 ml Wasser/Brühe ODER Backen/Braten ' +
        'ODER Quellen im Joghurt (≥60 g). 8 ml ist unplausibel — Menge oder Verfahren anpassen.'
      );
    }
    if (/high_protein-Label/i.test(e) && !seenProtein.highProtein) {
      seenProtein.highProtein = true;
      directives.push(
        'KONKRETE KORREKTUR LABEL: Entferne diet_labels high_protein ODER erhöhe Protein auf ≥25 g ' +
        '(mehr Hülsenfrüchte/Ei/Tofu) — Label und Makros müssen zusammenpassen.'
      );
    }
    if (/Wasser ohne passende Aktion/i.test(e) && !seenProtein.waterAction) {
      seenProtein.waterAction = true;
      directives.push(
        'KONKRETE KORREKTUR WASSER: Referenziere {wasser-id} in einem Hitze-Schritt ' +
        '(aufgießen, erhitzen, köcheln, einrühren) — nicht nur „Wasser bereitstellen“ oder ' +
        'still hinzufügen ohne Kochverb.'
      );
    }
    if (/Klassiker-Standard/i.test(e) && !seenProtein.classicCore) {
      seenProtein.classicCore = true;
      directives.push(
        'KONKRETE KORREKTUR KLASSIKER: Liefere die VOLLSTÄNDIGE klassische Version. ' +
        'Lasagne MUSS enthalten: Béchamel (Butter+Mehl+Milch), Ragù/Sofrito (Hack+Zwiebel+Karotte+Sellerie+Tomate), ' +
        'Mozzarella+Parmesan, Lasagneplatten. KEINE Kalorien-Kastration ohne Low-Cal-Anfrage.'
      );
    }
    if (/Komponenten-Vollständigkeit/i.test(e) && !seenProtein.proseComponent) {
      seenProtein.proseComponent = true;
      directives.push(
        'KONKRETE KORREKTUR KOMPONENTEN: Jede im Step-Text genannte Komponente (Béchamel, Ragù, Dressing, …) ' +
        'braucht ihre Rohzutaten im ingredients-Array — oder nenne die Komponente nicht.'
      );
    }
  });

  return directives;
}

function buildRetryFeedbackMessage(lastErrors, opts) {
  const errors = Array.isArray(lastErrors) ? lastErrors : [];
  const directives = errorsToDirectives(errors, opts);
  let content = 'Deine letzte Ausgabe hatte folgende Fehler, korrigiere sie und gib erneut NUR valides v9.2-JSON aus:\n- ' +
    errors.join('\n- ');
  if (directives.length) {
    content += '\n\n' + directives.join('\n');
  }
  return content;
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
  const attemptRaws = [];

  // ——— MASTER-CLASSIC HIT: starres Stammgerüst, kein generatives Zutatengerüst ———
  try {
    const masterStore = require('./classic-master-store');
    const masterHit = masterStore.tryMasterClassic(payload, {
      targetServings: payload && (payload.target_servings || payload.targetServings),
    });
    if (masterHit && masterHit.ok && masterHit.recipe) {
      console.log('[recipe-v92] MASTER_CLASSIC_HIT', JSON.stringify({
        id: masterHit.recipe.masterRecipeId,
        lang: masterHit.lang,
        score: masterHit.match && masterHit.match.score,
        lactose: masterHit.recipe.lactoseHonestyStatus,
      }));
      const dishQueryForValidation = Array.isArray(payload && payload.pantry_ingredients)
        ? payload.pantry_ingredients.join(' ')
        : '';
      // Master ist Source of Truth — Validierung bestätigen, keine LLM-Retries am Gerüst
      const validation = validator.validateRecipeV2(masterHit.recipe, {
        dishQuery: dishQueryForValidation || masterHit.recipe.title,
        ai_instruction: payload && (payload.ai_instruction || payload.aiInstruction),
      });
      if (!validation.ok) {
        console.warn('[recipe-v92] MASTER_CLASSIC validation warnings/errors', validation.errors);
        // Bei Master trotzdem rendern, wenn nur Soft-Themen — harte Fehler loggen
      }
      const rendered = renderRecipeForDisplay(masterHit.recipe, {
        dishQuery: dishQueryForValidation || masterHit.recipe.title,
        ai_instruction: payload && (payload.ai_instruction || payload.aiInstruction),
        allergens: payload && payload.allergens,
        targetServings: payload && (payload.target_servings || payload.targetServings),
      });
      if (!rendered) {
        return { error: 'master_render_failed', attempts: 0, recipeSource: 'master-classic' };
      }
      rendered.recipeSource = 'master-classic';
      rendered.masterRecipeId = masterHit.recipe.masterRecipeId;
      rendered.immutableCore = true;
      if (masterHit.recipe.lactoseHonestyStatus) {
        rendered.lactoseHonestyStatus = masterHit.recipe.lactoseHonestyStatus;
      }
      return {
        ok: true,
        recipe: rendered,
        raw: masterHit.recipe,
        attempts: 0,
        attempt_raws: [],
        recipeSource: 'master-classic',
        masterRecipeId: masterHit.recipe.masterRecipeId,
        temperature: 0,
      };
    }
    if (masterHit && masterHit.error === 'lactose_impossible_for_classic') {
      const lactoseHonesty = require('./lactose-honesty');
      const lang = (payload && payload.lang) || 'de';
      const dish = (masterHit.match && masterHit.match.recipe &&
        masterStore.pickLocalized(masterHit.match.recipe.titles, lang)) || 'Rezept';
      const msg = typeof lactoseHonesty.buildLactoseHonestyMessage === 'function'
        ? lactoseHonesty.buildLactoseHonestyMessage(
          lactoseHonesty.STATUS.IMPOSSIBLE, dish, '', lang
        )
        : ('Laktose: kein authentischer Swap für ' + dish);
      return {
        ok: true,
        recipe: null,
        raw: null,
        lactoseHonesty: {
          status: lactoseHonesty.STATUS.IMPOSSIBLE,
          message: msg,
          dish: dish,
        },
        attempts: 0,
        recipeSource: 'master-classic',
      };
    }
  } catch (eMaster) {
    console.warn('[recipe-v92] master-classic skipped', eMaster && eMaster.message);
  }

  for (let attempt = 1; attempt <= MAX_VALIDATION_ATTEMPTS; attempt++) {
    const dishQuery = Array.isArray(payload && payload.pantry_ingredients)
      ? payload.pantry_ingredients.join(' ')
      : '';
    const requestBody = buildRequestBody(payload, attempt, lastErrors);
    if (attempt > 1 && lastErrors.length && requestBody && Array.isArray(requestBody.messages)) {
      requestBody.messages = requestBody.messages.concat([{
        role: 'user',
        content: buildRetryFeedbackMessage(lastErrors, { dishQuery: dishQuery }),
      }]);
    }

    const result = await callGroq(requestBody, groqOpts);
    if (result.error) {
      return {
        error: result.error,
        status: result.status,
        body: result.body,
        headers: result.headers || null,
        reason: result.reason,
        rateLimitKind: result.rateLimitKind || null,
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
    attemptRaws.push({ attempt: attempt, raw: parsed });

    // Diagnose: Raw-JSON VOR Validierung und VOR renderRecipeForDisplay (jeder Versuch)
    logRawLlmJson({ attempt: attempt, parsed: parsed });

    // Laktose-Ehrlichkeit: Alternative / unmöglich (Sentinel in Titel/Analyse/Steps; leere Zutaten).
    try {
      const lactoseHonesty = require('./lactose-honesty');
      const allergens = (payload && payload.allergens) || [];
      const lang = (payload && payload.lang) || 'de';
      const lh = lactoseHonesty.extractLactoseHonestyFromParsed(parsed, allergens, dishQuery, { lang: lang });
      if (lh && (lh.status === lactoseHonesty.STATUS.ALTERNATIVE ||
          lh.status === lactoseHonesty.STATUS.IMPOSSIBLE)) {
        return {
          ok: true,
          recipe: null,
          raw: parsed,
          lactoseHonesty: lh,
          attempts: attempt,
          attempt_raws: attemptRaws,
        };
      }
    } catch (eLh) {
      console.warn('[recipe-v92] lactose honesty parse failed', eLh && eLh.message);
    }

    // Emotion-Handoff-Sentinel: nur bei echter emotionaler Blockade im Nutzertext.
    // Klarer Gerichtswunsch (Allergen-Konflikt etc.) → Retry mit Korrekturhinweis, kein Handoff.
    if (parsed && parsed.title === '__TEAM_HANDOFF_COACH__') {
      const userText = Array.isArray(payload && payload.pantry_ingredients)
        ? payload.pantry_ingredients.join(' ')
        : '';
      const acceptHandoff = typeof o.acceptCoachHandoff === 'function'
        ? !!o.acceptCoachHandoff(userText)
        : false;
      if (acceptHandoff) {
        return {
          ok: true,
          recipe: null,
          raw: parsed,
          handoff_sentinel: true,
          attempts: attempt,
          attempt_raws: attemptRaws,
        };
      }
      lastErrors = [
        'Falscher Coach-Handoff: Der Nutzer verlangt ein konkretes Gericht. ' +
        'Liefere ein normales v9.2-Rezept. Bei Laktose: nur kulinarisch etablierte Ersatzprodukte ' +
        '(laktosefreie Sahne/Butter, Pflanzensahne, Kokosmilch bei Currys) – kein Tofu/Hähnchen als Notlösung. ' +
        'Wenn kein authentischer Ersatz: title=__LACTOSE_HONESTY_ALTERNATIVE__ oder ' +
        '__LACTOSE_HONESTY_IMPOSSIBLE__ – KEIN title=__TEAM_HANDOFF_COACH__.',
      ];
      logValidationFailure({ attempt: attempt, errors: lastErrors, warnings: [] });
      continue;
    }

    const dishQueryForValidation = Array.isArray(payload && payload.pantry_ingredients)
      ? payload.pantry_ingredients.join(' ')
      : '';
    const validation = validator.validateRecipeV2(parsed, {
      dishQuery: dishQueryForValidation,
      ai_instruction: payload && (payload.ai_instruction || payload.aiInstruction),
    });
    if (!validation.ok) {
      lastErrors = validation.errors.slice();
      lastWarnings = validation.warnings.slice();
      logValidationFailure({
        attempt: attempt,
        errors: lastErrors,
        warnings: lastWarnings,
        parsed: parsed,
      });
      continue;
    }

    const rendered = renderRecipeForDisplay(parsed, {
      dishQuery: dishQueryForValidation,
      ai_instruction: payload && (payload.ai_instruction || payload.aiInstruction),
      allergens: payload && payload.allergens,
    });
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
      attempt_raws: attemptRaws,
    };
  }

  return {
    error: 'validation_exhausted',
    attempts: MAX_VALIDATION_ATTEMPTS,
    errors: lastErrors,
    warnings: lastWarnings,
    last_raw: lastRaw,
    attempt_raws: attemptRaws,
  };
}

module.exports = {
  MAX_VALIDATION_ATTEMPTS: MAX_VALIDATION_ATTEMPTS,
  stripJsonFences: stripJsonFences,
  parseRecipeJson: parseRecipeJson,
  buildV92GenerativeSchema: buildV92GenerativeSchema,
  renderRecipeForDisplay: renderRecipeForDisplay,
  generateValidatedRecipe: generateValidatedRecipe,
  errorsToDirectives: errorsToDirectives,
  buildRetryFeedbackMessage: buildRetryFeedbackMessage,
  portions: portions,
  DEFAULT_TARGET_SERVINGS: DEFAULT_TARGET_SERVINGS,
};
