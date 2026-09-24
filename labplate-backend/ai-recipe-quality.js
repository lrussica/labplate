'use strict';

const fs = require('fs');
const path = require('path');

const CONSTRAINTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'constraints.json'), 'utf8'));
const aiRenderer = require('./recipe-ai-renderer');
const MAX_ATTEMPTS = 3;
const CATEGORY_VALUES = CONSTRAINTS.categories;
const UNIT_VALUES = CONSTRAINTS.units;
const ROLE_VALUES = CONSTRAINTS.roles;
const ACTION_VALUES = [
  'chop', 'fry', 'boil', 'simmer', 'bake', 'mix', 'season', 'serve',
  'stir', 'saute', 'grill', 'roast', 'whisk', 'fold_in', 'rest',
  'remove_from_heat', 'preheat', 'marinate', 'drain', 'blend',
];

function number(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizedText(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

function ingredientLookup(context) {
  const source = context && (context.ingredientDatabase || context.allowedIngredients);
  const entries = Array.isArray(source) ? source : Object.keys(source || {}).map((name) => {
    return Object.assign({ name: name }, source[name]);
  });
  const map = new Map();
  entries.forEach((entry) => {
    if (!entry) return;
    const names = [entry.name, entry.id].concat(entry.synonyms || []);
    names.filter(Boolean).forEach((name) => map.set(normalizedText(name), entry));
  });
  return map;
}

function parseTargetNumber(targets, keys) {
  for (const key of keys) {
    const value = number(targets && targets[key]);
    if (value != null) return value;
  }
  return null;
}

function checkFeasibility(targets, dishCategory, mainIngredient, constraints) {
  const cfg = constraints || CONSTRAINTS;
  const category = CATEGORY_VALUES.includes(dishCategory) ? dishCategory : 'other';
  const proteinMin = Number((cfg.feasibility.mainProteinGPerPortion || {})[category] || 0);
  const minimumCalories = Number((cfg.feasibility.minimumCaloriesPerPortion || {})[category] || 0);
  const targetCalories = parseTargetNumber(targets, ['kcal', 'calories', 'calorieTarget']);
  const requestedProtein = parseTargetNumber(targets, ['protein_g', 'protein', 'proteinTarget']);
  const requestedAmount = parseTargetNumber(targets, ['mainProteinGPerPortion', 'proteinAmountG']);
  const isMeat = /beef|rind|fleisch|pork|schwein|lamb|lamm|meat/i.test(String(mainIngredient || ''));
  const minimumAmount = isMeat && (category === 'main_meat' || category === 'main_fish')
    ? Number((cfg.minimums.mainProteinGPerPortion || {})[category] || proteinMin)
    : proteinMin;
  const adjustedCalories = targetCalories != null ? Math.max(targetCalories, minimumCalories) : targetCalories;
  const adjustedProtein = requestedProtein != null ? Math.max(requestedProtein, proteinMin * 0.2) : requestedProtein;
  const adjustedAmount = requestedAmount != null ? Math.max(requestedAmount, minimumAmount) : requestedAmount;
  const adjusted = adjustedCalories !== targetCalories ||
    adjustedProtein !== requestedProtein ||
    adjustedAmount !== requestedAmount;
  const adjustedTarget = Object.assign({}, targets || {});
  if (adjustedCalories != null) adjustedTarget.kcal = adjustedCalories;
  if (adjustedProtein != null) adjustedTarget.protein_g = adjustedProtein;
  if (adjustedAmount != null) adjustedTarget.mainProteinGPerPortion = adjustedAmount;
  return {
    adjusted,
    originalTarget: targets || {},
    adjustedTarget,
    reason: adjusted
      ? 'Das Ziel wurde an die Mindestmengen für ein plausibles, sicheres Rezept angepasst.'
      : '',
    minimums: { caloriesPerPortion: minimumCalories, mainProteinGPerPortion: minimumAmount },
  };
}

function violation(code, message, expected, actual, ingredientId) {
  const result = { code, message, expected, actual };
  if (ingredientId != null) result.ingredientId = ingredientId;
  return result;
}

function validateSchemaShape(recipe) {
  const errors = [];
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) {
    return [violation('SCHEMA_INVALID', 'Antwort muss ein JSON-Objekt sein.', 'object', typeof recipe)];
  }
  ['title', 'dishCategory', 'servings', 'ingredients', 'steps'].forEach((key) => {
    if (!(key in recipe)) errors.push(violation('SCHEMA_REQUIRED', 'Pflichtfeld fehlt.', key, undefined));
  });
  if (typeof recipe.title !== 'string') errors.push(violation('SCHEMA_TYPE', 'title muss string sein.', 'string', typeof recipe.title));
  if (!Array.isArray(recipe.ingredients)) errors.push(violation('SCHEMA_TYPE', 'ingredients muss array sein.', 'array', typeof recipe.ingredients));
  if (!Array.isArray(recipe.steps)) errors.push(violation('SCHEMA_TYPE', 'steps muss array sein.', 'array', typeof recipe.steps));
  return errors;
}

function amountPerPortion(ingredient, servings) {
  return Number(ingredient.amount) / servings;
}

function isName(name, pattern) {
  return pattern.test(normalizedText(name));
}

function validateHardConstraints(recipe, context) {
  const violations = [];
  const ctx = context || {};
  const servings = number(recipe && recipe.servings);
  const category = recipe && recipe.dishCategory;
  const ingredients = recipe && Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const steps = recipe && Array.isArray(recipe.steps) ? recipe.steps : [];
  const ids = new Set();
  const lookup = ingredientLookup(ctx);
  const hasIngredientDatabase = lookup.size > 0;
  const rules = CONSTRAINTS.culinaryRules || {};
  const allowedRoot = ['title', 'dishCategory', 'servings', 'ingredients', 'steps'];

  const schemaViolations = validateSchemaShape(recipe);
  if (schemaViolations.length) return { valid: false, violations: schemaViolations };
  if (!CATEGORY_VALUES.includes(category)) {
    violations.push(violation('DISH_CATEGORY_INVALID', 'dishCategory ist nicht erlaubt.', CATEGORY_VALUES, category));
  }
  if (!Number.isInteger(servings) || servings < 1) {
    violations.push(violation('SERVINGS_INVALID', 'servings muss eine positive Ganzzahl sein.', 'integer >= 1', recipe.servings));
  }
  if (Object.keys(recipe).some((key) => !allowedRoot.includes(key))) {
    violations.push(violation('SCHEMA_ADDITIONAL_PROPERTY', 'Unbekanntes Rezeptfeld.', allowedRoot, Object.keys(recipe)));
  }
  if (!ingredients.length) violations.push(violation('INGREDIENTS_EMPTY', 'Mindestens eine Zutat ist erforderlich.', '> 0 ingredients', ingredients.length));

  ingredients.forEach((ingredient) => {
    const id = ingredient && ingredient.id;
    const name = ingredient && ingredient.name;
    if (!id || ids.has(id)) violations.push(violation('INGREDIENT_ID_DUPLICATE', 'Zutaten-IDs müssen eindeutig sein.', 'unique id', id, id));
    ids.add(id);
    if (!name || /etwas|nach belieben|eine prise/i.test(String(name))) {
      violations.push(violation('INGREDIENT_NAME_VAGUE', 'Zutatname ist unpräzise.', 'konkreter Name', name, id));
    }
    if (!UNIT_VALUES.includes(ingredient && ingredient.unit)) {
      violations.push(violation('UNIT_INVALID', 'Einheit ist nicht erlaubt.', UNIT_VALUES, ingredient && ingredient.unit, id));
    }
    if (number(ingredient && ingredient.amount) == null || ingredient.amount <= 0) {
      violations.push(violation('AMOUNT_INVALID', 'Menge muss numerisch und > 0 sein.', '> 0', ingredient && ingredient.amount, id));
    }
    if (!ROLE_VALUES.includes(ingredient && ingredient.role)) {
      violations.push(violation('ROLE_INVALID', 'Rolle ist nicht erlaubt.', ROLE_VALUES, ingredient && ingredient.role, id));
    }
    if (!hasIngredientDatabase || (!lookup.has(normalizedText(name)) && !lookup.has(normalizedText(id)))) {
      violations.push(violation('INGREDIENT_NOT_RESOLVED', 'Zutat ist in der Nährwert-DB nicht auflösbar.', 'DB entry', name, id));
    }
  });

  const orders = steps.map((step) => step && step.order);
  steps.forEach((step, index) => {
    if (!Number.isInteger(step && step.order) || step.order !== index + 1) {
      violations.push(violation('STEP_ORDER_INVALID', 'Step order muss lückenlos aufsteigend sein.', index + 1, step && step.order));
    }
    const refs = Array.isArray(step && step.ingredientIds) ? step.ingredientIds : [];
    if (Object.keys(step || {}).some((key) => !['order', 'ingredientIds', 'action', 'durationMin', 'temperatureC'].includes(key))) {
      violations.push(violation('SCHEMA_ADDITIONAL_PROPERTY', 'Unbekanntes Step-Feld.', ['order', 'ingredientIds', 'action', 'durationMin', 'temperatureC'], Object.keys(step || {})));
    }
    if (!ACTION_VALUES.includes(step && step.action)) {
      violations.push(violation('STEP_ACTION_INVALID', 'Step-Aktion ist nicht erlaubt.', ACTION_VALUES, step && step.action));
    }
    if (number(step && step.durationMin) == null && step && step.durationMin !== null) {
      violations.push(violation('STEP_DURATION_INVALID', 'durationMin muss Zahl oder null sein.', 'number|null', step && step.durationMin));
    }
    refs.forEach((id) => {
      if (!ids.has(id)) violations.push(violation('STEP_UNKNOWN_INGREDIENT', 'Step referenziert eine unbekannte ingredientId.', Array.from(ids), id, id));
    });
    const dairyIds = new Set(ingredients.filter((i) => /milch|sahne|joghurt|quark|käse|kaese|butter|frischkäse|mascarpone/i.test(String(i.name))).map((i) => i.id));
    const eggIds = new Set(ingredients.filter((i) => /ei(er)?\b/i.test(String(i.name)) && !/eiweiß|eiweiss/i.test(String(i.name))).map((i) => i.id));
    const hot = Number(step.temperatureC);
    if (rules.dairyForbiddenActions && step.ingredientIds.some((id) => dairyIds.has(id)) &&
        rules.dairyForbiddenActions.includes(step.action)) {
      violations.push(violation('DAIRY_HEAT_ACTION', 'Milchprodukte dürfen nicht mit Kochen oder Köcheln kombiniert werden.', rules.dairyAllowedActions, step.action));
    }
    if (rules.eggForbiddenActions && step.ingredientIds.some((id) => eggIds.has(id)) &&
        rules.eggForbiddenActions.includes(step.action)) {
      violations.push(violation('EGG_HOT_SAUCE_ACTION', 'Eier dürfen in heißen Saucen nur nach remove_from_heat verarbeitet werden.', rules.eggAllowedActions, step.action));
    }
    if (Number.isFinite(hot) && hot > 0) {
      if (hot > Number(rules.dairyMaxTemperatureC || 85) && step.ingredientIds.some((id) => dairyIds.has(id))) {
        violations.push(violation('DAIRY_HEAT_MAX', 'Milchprodukte dürfen nicht über die konfigurierte Temperatur erhitzt werden.', rules.dairyMaxTemperatureC, hot));
      }
      if (hot > Number(rules.eggHotSauceMaxTemperatureC || 82) && step.ingredientIds.some((id) => eggIds.has(id))) {
        violations.push(violation('EGG_HOT_SAUCE_MAX', 'Ei in heißen Saucen darf die konfigurierte Temperatur nicht überschreiten.', rules.eggHotSauceMaxTemperatureC, hot));
      }
    }
    if (rules.sequence && rules.sequence.serveMustBeLast && steps.length &&
        steps.some((s, i) => s.action === 'serve' && i !== steps.length - 1)) {
      violations.push(violation('SEQUENCE_SERVE_LAST', 'Serve muss der letzte Schritt sein.', 'last', steps.map((s) => s.action)));
    }
    if (rules.sequence && rules.sequence.seasonBeforeServe) {
      const serveIndex = steps.findIndex((s) => s.action === 'serve');
      const seasonIndex = steps.findIndex((s) => s.action === 'season');
      if (serveIndex >= 0 && seasonIndex > serveIndex) violations.push(violation('SEQUENCE_SEASON_BEFORE_SERVE', 'Season muss vor Serve erfolgen.', 'season before serve', steps.map((s) => s.action)));
    }
    if (rules.sequence && rules.sequence.preheatBeforeBake) {
      const bakeIndex = steps.findIndex((s) => s.action === 'bake');
      const preheatIndex = steps.findIndex((s) => s.action === 'preheat');
      if (bakeIndex >= 0 && (preheatIndex < 0 || preheatIndex > bakeIndex)) {
        violations.push(violation('SEQUENCE_PREHEAT_BEFORE_BAKE', 'Vor dem Backen muss der Ofen vorgeheizt werden.', 'preheat before bake', steps.map((s) => s.action)));
      }
    }
    if (step && step.temperatureC != null && (number(step.temperatureC) == null || step.temperatureC < 0 || step.temperatureC > 300)) {
      violations.push(violation('STEP_TEMPERATURE_INVALID', 'temperatureC muss zwischen 0 und 300 liegen.', '0..300', step.temperatureC));
    }
  });
  const used = new Set(steps.flatMap((step) => Array.isArray(step && step.ingredientIds) ? step.ingredientIds : []));
  ingredients.forEach((ingredient) => {
    if (!used.has(ingredient.id)) violations.push(violation('INGREDIENT_UNUSED', 'Jede Zutat muss in mindestens einem Step genutzt werden.', 'referenced', false, ingredient.id));
  });

  if (Number.isInteger(servings) && servings > 0) {
    const minimums = (CONSTRAINTS.minimums || {}).mainProteinGPerPortion || {};
    const mainProtein = ingredients.filter((ingredient) => ingredient.role === 'main_protein');
    const proteinMin = Number(minimums[category] || 0);
    if ((category === 'main_meat' || category === 'main_fish') && mainProtein.reduce((sum, ingredient) => sum + amountPerPortion(ingredient, servings), 0) < proteinMin) {
      violations.push(violation('MAIN_PROTEIN_MIN', 'Hauptprotein unterschreitet die Mindestmenge pro Portion.', proteinMin, mainProtein.reduce((sum, ingredient) => sum + amountPerPortion(ingredient, servings), 0)));
    }
    const liquidMin = Number(((CONSTRAINTS.minimums || {}).liquidMlPerPortion || {})[category] || 0);
    const liquidTotal = ingredients.filter((ingredient) => ingredient.role === 'liquid').reduce((sum, ingredient) => sum + amountPerPortion(ingredient, servings), 0);
    if (liquidTotal < liquidMin) violations.push(violation('LIQUID_MIN', 'Flüssigkeitsmenge unterschreitet die Mindestmenge pro Portion.', liquidMin, liquidTotal));
    const fatTotal = ingredients.filter((ingredient) => ingredient.role === 'fat').reduce((sum, ingredient) => sum + amountPerPortion(ingredient, servings), 0);
    if (fatTotal > Number(CONSTRAINTS.maximums.fatGPerPortion)) violations.push(violation('FAT_MAX', 'Fettmenge überschreitet die Obergrenze pro Portion.', CONSTRAINTS.maximums.fatGPerPortion, fatTotal));
    const sweetenerMax = Number(((CONSTRAINTS.maximums || {}).sweetenerGPerPortion || {})[category] || CONSTRAINTS.maximums.sweetenerGPerPortion.default);
    const sweetenerTotal = ingredients.filter((ingredient) => ingredient.role === 'sweetener').reduce((sum, ingredient) => sum + amountPerPortion(ingredient, servings), 0);
    if (sweetenerTotal > sweetenerMax) violations.push(violation('SWEETENER_MAX', 'Süßungsmittel überschreitet die Kategorie-Obergrenze.', sweetenerMax, sweetenerTotal));
    ingredients.filter((ingredient) => ingredient.role === 'spice').forEach((ingredient) => {
      const key = /vanille/i.test(ingredient.name) ? 'vanilla'
        : /muskat/i.test(ingredient.name) ? 'nutmeg'
        : /salz/i.test(ingredient.name) ? 'salt'
        : /pfeffer/i.test(ingredient.name) ? 'pepper'
        : /zimt/i.test(ingredient.name) ? 'cinnamon'
        : /chili/i.test(ingredient.name) ? 'chili' : 'default';
      const max = Number(CONSTRAINTS.maximums.spiceGPerPortion[key] || CONSTRAINTS.maximums.spiceGPerPortion.default);
      const actual = amountPerPortion(ingredient, servings);
      if (actual > max) violations.push(violation('SPICE_MAX', 'Gewürz überschreitet die Obergrenze pro Portion.', max, actual, ingredient.id));
    });
    const profile = normalizedText(
      ctx.dietProfile || (ctx.userRequest && (ctx.userRequest.dietProfile || ctx.userRequest.diet))
    ).replace(/-/g, '_') || 'standard';
    const profileRules = (rules.vegetableFiber && rules.vegetableFiber.profiles || {})[profile] ||
      (rules.vegetableFiber && rules.vegetableFiber.profiles || {}).standard ||
      { minimumVegetableShare: 0, minimumFiberGPerPortion: 0 };
    const vegetableAmount = ingredients.filter((i) => i.role === 'vegetable').reduce((s, i) => s + Number(i.amount || 0), 0);
    const totalAmount = ingredients.reduce((s, i) => s + Number(i.amount || 0), 0);
    if (totalAmount > 0 && vegetableAmount / totalAmount < Number(profileRules.minimumVegetableShare || 0)) {
      violations.push(violation('VEGETABLE_PROFILE_MIN', 'Das Gemüseprofil unterschreitet den konfigurierten Anteil.', profileRules.minimumVegetableShare, vegetableAmount / totalAmount));
    }
    const fiberDb = ingredients.reduce((s, i) => {
      const db = lookup.get(normalizedText(i.name)) || lookup.get(normalizedText(i.id)) || {};
      return s + Number(db.fiber_g || db.fiber || 0) * Number(i.amount || 0) / 100;
    }, 0) / servings;
    if (fiberDb < Number(profileRules.minimumFiberGPerPortion || 0)) {
      violations.push(violation('FIBER_PROFILE_MIN', 'Ballaststoffprofil unterschreitet das konfigurierte Minimum.', profileRules.minimumFiberGPerPortion, fiberDb));
    }
  }

  const request = ctx.userRequest || {};
  const requestText = normalizedText(JSON.stringify(request));
  const vegetarian = request.vegetarian === true || /vegetarisch|vegetarian/.test(requestText);
  if (vegetarian && ingredients.some((ingredient) => /meat|beef|rind|pork|schwein|chicken|huhn|fish|fisch|lachs/i.test(String(ingredient.name)))) {
    violations.push(violation('DIET_VIOLATION', 'Vegetarische Vorgabe verletzt.', 'no meat or fish', ingredients.map((ingredient) => ingredient.name).join(', ')));
  }
  const allergens = Array.isArray(request.allergens) ? request.allergens : [];
  allergens.forEach((allergen) => {
    const pattern = new RegExp(String(allergen).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    ingredients.forEach((ingredient) => {
      if (pattern.test(String(ingredient.name))) violations.push(violation('ALLERGEN_VIOLATION', 'Allergen-Vorgabe verletzt.', 'allergen-free', ingredient.name, ingredient.id));
    });
  });
  return { valid: violations.length === 0, violations };
}

function buildSchema() {
  const ingredient = {
    type: 'object', additionalProperties: false,
    required: ['id', 'name', 'amount', 'unit', 'role'],
    properties: {
      id: { type: 'string' }, name: { type: 'string' },
      amount: { type: 'number', exclusiveMinimum: 0 },
      unit: { type: 'string', enum: UNIT_VALUES },
      role: { type: 'string', enum: ROLE_VALUES },
    },
  };
  const step = {
    type: 'object', additionalProperties: false,
    required: ['order', 'ingredientIds', 'action', 'durationMin', 'temperatureC'],
    properties: {
      order: { type: 'integer', minimum: 1 },
      ingredientIds: { type: 'array', items: { type: 'string' } },
      action: { type: 'string', enum: ACTION_VALUES },
      durationMin: { type: ['number', 'null'] },
      temperatureC: { type: ['number', 'null'] },
    },
  };
  return {
    name: 'labplate_ai_recipe',
    strict: true,
    schema: {
      type: 'object', additionalProperties: false,
      required: ['title', 'dishCategory', 'servings', 'ingredients', 'steps'],
      properties: {
        title: { type: 'string' },
        dishCategory: { type: 'string', enum: CATEGORY_VALUES },
        servings: { type: 'integer', minimum: 1 },
        ingredients: { type: 'array', items: ingredient },
        steps: { type: 'array', items: step },
      },
    },
  };
}

function buildRequest(context, model, previousViolations) {
  const c = context || {};
  const feasibility = c.feasibility || checkFeasibility(c.targets, c.dishCategory, c.mainIngredient);
  const violations = Array.isArray(previousViolations) && previousViolations.length
    ? '\nVIOLATIONS_JSON=' + JSON.stringify(previousViolations)
    : '';
  const system = [
    'Du bist ein Rezept-Generator. Deine Ausgabe wird maschinell geprüft.',
    'Antworte AUSSCHLIESSLICH mit einem einzigen gültigen JSON-Objekt gemäß Schema. Kein Markdown.',
    'HARTE REGELN: Mindestmengen und Obergrenzen einhalten; nur erlaubte Zutaten verwenden; keine Nährwerte berechnen; jede Zutat in einem Step referenzieren; Steps enthalten ausschließlich action, order, ingredientIds, durationMin und optional temperatureC (kein Freitext).',
    'Gültigkeit vor Zielerreichung. Erzeuge das komplette Rezept neu und behebe ausschließlich die gemeldeten Verstöße.',
    'CONSTRAINTS=' + JSON.stringify(CONSTRAINTS),
    'ALLOWED_INGREDIENTS=' + JSON.stringify(c.allowedIngredients || []),
    'USER_REQUEST=' + JSON.stringify(c.userRequest || {}),
    'FEASIBILITY=' + JSON.stringify(feasibility),
    violations,
  ].join('\n');
  return {
    model: model,
    temperature: 0,
    reasoning_effort: 'low',
    max_tokens: 4096,
    response_format: { type: 'json_schema', json_schema: buildSchema() },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(Object.assign({}, c.userRequest || {}, { adjustedTarget: feasibility.adjustedTarget })) },
    ],
  };
}

function calculateNutrition(recipe, context) {
  const lookup = ingredientLookup(context);
  const totals = { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0, fiber_g: 0 };
  (recipe.ingredients || []).forEach((ingredient) => {
    const db = lookup.get(normalizedText(ingredient.name)) || lookup.get(normalizedText(ingredient.id));
    if (!db) return;
    const amount = Number(ingredient.amount);
    const factor = amount / 100;
    totals.kcal += Number(db.kcal || 0) * factor;
    totals.protein_g += Number(db.protein_g || db.protein || 0) * factor;
    totals.fat_g += Number(db.fat_g || db.fat || 0) * factor;
    totals.carbs_g += Number(db.carbs_g || db.netCarbs || 0) * factor;
    totals.fiber_g += Number(db.fiber_g || db.fiber || 0) * factor;
  });
  const servings = Number(recipe.servings) || 1;
  Object.keys(totals).forEach((key) => { totals[key] = Math.round((totals[key] / servings) * 10) / 10; });
  return totals;
}

function toClientRecipe(recipe, nutrition, feasibility, context) {
  const lookup = ingredientLookup(context);
  const ingredients = (recipe.ingredients || []).map((ingredient) => ({
    id: ingredient.id,
    name: ingredient.name,
    amount: Number(ingredient.amount),
    unit: ingredient.unit === 'ml' ? 'ml' : 'g',
    status: 'benoetigt',
    macrosPer100g: {
      netCarbs: Number((lookup.get(normalizedText(ingredient.name)) || {}).carbs_g ||
        (lookup.get(normalizedText(ingredient.name)) || {}).netCarbs || 0),
      fat: Number((lookup.get(normalizedText(ingredient.name)) || {}).fat_g ||
        (lookup.get(normalizedText(ingredient.name)) || {}).fat || 0),
      protein: Number((lookup.get(normalizedText(ingredient.name)) || {}).protein_g ||
        (lookup.get(normalizedText(ingredient.name)) || {}).protein || 0),
      fiber: Number((lookup.get(normalizedText(ingredient.name)) || {}).fiber_g ||
        (lookup.get(normalizedText(ingredient.name)) || {}).fiber || 0),
    },
  }));
  const rendered = aiRenderer.renderRecipe(recipe, {
    lang: context.lang || 'de',
    servings: context.targetServings || recipe.servings,
  });
  return {
    title: recipe.title,
    servings: recipe.servings,
    prep_time: '',
    nutrition_note: feasibility.adjusted ? feasibility.reason : '',
    garnish: '',
    self_check: '',
    ingredients,
    shopping_list: ingredients.map((ingredient) => ingredient.name + ' – ' + ingredient.amount + ' ' + ingredient.unit),
    steps: rendered.steps.map((step) => Object.assign({ stepNumber: step.order }, step)),
    nutrition,
    finalNutrition: nutrition,
    mode: 'ai',
    dishCategory: recipe.dishCategory,
    targetAdjustment: feasibility.adjusted ? {
      originalTarget: feasibility.originalTarget,
      adjustedTarget: feasibility.adjustedTarget,
      reason: feasibility.reason,
    } : null,
  };
}

async function generateAiRecipe(options) {
  const o = options || {};
  const context = Object.assign({}, o.context || {});
  const feasibility = checkFeasibility(context.targets, context.dishCategory, context.mainIngredient);
  context.feasibility = feasibility;
  let violations = [];
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const result = await o.callGroq(buildRequest(context, o.model, violations), o.groqOpts || {});
    if (!result || result.error) {
      if (result && (result.error === 'json_parse_failed' || result.error === 'empty_response')) {
        violations = [violation('JSON_PARSE_ERROR', 'LLM-Ausgabe ist kein vollständiges gültiges JSON-Objekt.', 'single JSON object', result.body || result.error)];
      }
      lastError = result || { error: 'provider_error' };
      continue;
    }
    const raw = result.data != null ? result.data : result.content;
    let parsed = raw;
    if (typeof raw === 'string') {
      try { parsed = JSON.parse(raw); } catch (_) {
        violations = [violation('JSON_PARSE_ERROR', 'LLM-Ausgabe ist kein gültiges JSON.', 'single JSON object', raw.slice(0, 200))];
        lastError = { error: 'validation_exhausted', violations };
        continue;
      }
    }
    const validation = validateHardConstraints(parsed, context);
    if (!validation.valid) {
      violations = validation.violations;
      lastError = { error: 'validation_exhausted', violations };
      continue;
    }
    return {
      ok: true, recipe: toClientRecipe(parsed, calculateNutrition(parsed, context), feasibility, context),
      validatedRecipe: parsed, attempts: attempt, feasibility,
      nutrition: calculateNutrition(parsed, context),
    };
  }
  return {
    error: 'ai_recipe_unavailable',
    message: 'Das KI-Rezept konnte nach drei Prüfungen nicht sicher erstellt werden.',
    fallback: {
      type: 'clear',
      message: 'Kein unsicheres Rezept anzeigen. Bitte Anfrage vereinfachen oder später erneut versuchen.',
    },
    attempts: MAX_ATTEMPTS,
    violations: (lastError && lastError.violations) || violations,
    feasibility,
  };
}

module.exports = {
  CONSTRAINTS, MAX_ATTEMPTS, checkFeasibility, validateHardConstraints,
  buildSchema, buildRequest, calculateNutrition, generateAiRecipe,
};
