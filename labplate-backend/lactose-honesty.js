'use strict';
/**
 * Laktose-Ehrlichkeit: kulinarisch sinnvolle Ersatzprodukte,
 * QualityGate-Hilfen (Sahne/Creme) und Frontend-Nachrichten-Status.
 *
 * Status:
 * - adapted: Originalgericht MIT etablierten laktosefreien Ersatzzutaten in finalIngredients
 * - alternative_available: kein klassisches Rezept ohne Laktose, aber passende Alternative
 * - impossible: kein authentischer Ersatz möglich
 * - none: kein Laktose-Allergen aktiv / nicht relevant / kein Ersatz nachweisbar
 *
 * Eigenrezept-Policy (siehe docs/Laktose-Ehrlichkeit.md):
 * STRUCTURED/Eigenrezept = Passthrough der Nutzerzutaten (keine KI-Ersetzung).
 * Tierische Milchprodukte + Laktose-Profil → QualityGate/Frontend blocken.
 */

const STATUS = {
  ADAPTED: 'adapted',
  ALTERNATIVE: 'alternative_available',
  IMPOSSIBLE: 'impossible',
  NONE: 'none',
};

const SENTINEL_ALTERNATIVE = '__LACTOSE_HONESTY_ALTERNATIVE__';
const SENTINEL_IMPOSSIBLE = '__LACTOSE_HONESTY_IMPOSSIBLE__';

/** Präfixe/Marker für echte Milchersatz-Produkte (nicht Erdnusscreme, nicht Sojasauce). */
const PLANT_DAIRY_MARKER_RE =
  /laktosefrei|lactose[\s-]?free|laktose[\s-]?frei|soja|kokos|mandel|hafer|reis|cashew|hanf|lupine|pflanzlich|pflanzensahne|vegan|oat\b|almond|coconut|soy\b/i;

const ANIMAL_DAIRY_RE =
  /milch|sahne|rahm|butter|k[aä]se|joghurt|yogurt|quark|schmand|mascarpone|frischk[aä]se|molke|whey|casein|creme\s*fra[iî]che|cr[eè]me\s*fra[iî]che|panna|latte|cream\b|cheese\b|milk\b/i;

const DAIRY_ROLE_RE =
  /milch|sahne|rahm|butter|joghurt|yogurt|quark|creme|cream|drink|k[aä]se|frischk[aä]se|margarine|schmand|panna/i;

const MESSAGES = {
  de: {
    adapted: function (dish) {
      return 'Weil du Laktose meidest, haben wir ‚' + dish +
        '‘ direkt mit passenden laktosefreien Alternativen zubereitet.';
    },
    alternative: function (dish, alt) {
      const base = 'Für ‚' + dish +
        '‘ gibt es kein klassisches Rezept ohne Laktose. Möchtest du stattdessen eine laktosefreie Alternative probieren?';
      return alt ? base + ' Vorschlag: ‚' + alt + '‘.' : base;
    },
    impossible: function (dish) {
      return 'Weil du Laktose meidest, können wir für ‚' + dish +
        '‘ leider kein laktosefreies Rezept anbieten, das unseren kulinarischen Qualitätsstandards entspricht.';
    },
  },
  en: {
    adapted: function (dish) {
      return 'Because you avoid lactose, we prepared ‘' + dish +
        '’ directly with suitable lactose-free alternatives.';
    },
    alternative: function (dish, alt) {
      const base = 'There is no classic recipe for ‘' + dish +
        '’ without lactose. Would you like to try a lactose-free alternative instead?';
      return alt ? base + ' Suggestion: ‘' + alt + '’.' : base;
    },
    impossible: function (dish) {
      return 'Because you avoid lactose, we unfortunately cannot offer a lactose-free recipe for ‘' +
        dish + '’ that meets our culinary quality standards.';
    },
  },
  es: {
    adapted: function (dish) {
      return 'Como evitas la lactosa, preparamos ‘' + dish +
        '’ directamente con alternativas sin lactosa adecuadas.';
    },
    alternative: function (dish, alt) {
      const base = 'No hay una receta clásica de ‘' + dish +
        '’ sin lactosa. ¿Quieres probar una alternativa sin lactosa?';
      return alt ? base + ' Sugerencia: ‘' + alt + '’.' : base;
    },
    impossible: function (dish) {
      return 'Como evitas la lactosa, lamentablemente no podemos ofrecer una receta sin lactosa de ‘' +
        dish + '’ que cumpla nuestros estándares culinarios.';
    },
  },
  it: {
    adapted: function (dish) {
      return 'Poiché eviti il lattosio, abbiamo preparato ‘' + dish +
        '’ direttamente con alternative senza lattosio adatte.';
    },
    alternative: function (dish, alt) {
      const base = 'Non esiste una ricetta classica di ‘' + dish +
        '’ senza lattosio. Vuoi provare un’alternativa senza lattosio?';
      return alt ? base + ' Suggerimento: ‘' + alt + '’.' : base;
    },
    impossible: function (dish) {
      return 'Poiché eviti il lattosio, purtroppo non possiamo offrire una ricetta senza lattosio di ‘' +
        dish + '’ che rispetti i nostri standard culinari.';
    },
  },
  pt: {
    adapted: function (dish) {
      return 'Como evitas a lactose, preparámos ‘' + dish +
        '’ diretamente com alternativas sem lactose adequadas.';
    },
    alternative: function (dish, alt) {
      const base = 'Não há uma receita clássica de ‘' + dish +
        '’ sem lactose. Queres experimentar uma alternativa sem lactose?';
      return alt ? base + ' Sugestão: ‘' + alt + '’.' : base;
    },
    impossible: function (dish) {
      return 'Como evitas a lactose, infelizmente não podemos oferecer uma receita sem lactose de ‘' +
        dish + '’ que cumpra os nossos padrões culinários.';
    },
  },
  fr: {
    adapted: function (dish) {
      return 'Comme tu évites le lactose, nous avons préparé ‘' + dish +
        '’ directement avec des alternatives sans lactose adaptées.';
    },
    alternative: function (dish, alt) {
      const base = 'Il n’existe pas de recette classique de ‘' + dish +
        '’ sans lactose. Veux-tu essayer une alternative sans lactose ?';
      return alt ? base + ' Suggestion : ‘' + alt + '’.' : base;
    },
    impossible: function (dish) {
      return 'Comme tu évites le lactose, nous ne pouvons malheureusement pas proposer de recette sans lactose de ‘' +
        dish + '’ conforme à nos standards culinaires.';
    },
  },
  tr: {
    adapted: function (dish) {
      return 'Laktozu tercih etmediğin için ‘' + dish +
        '’ tarifini doğrudan uygun laktozsuz alternatiflerle hazırladık.';
    },
    alternative: function (dish, alt) {
      const base = '‘' + dish +
        '’ için laktozsuz klasik bir tarif yok. Bunun yerine laktozsuz bir alternatif denemek ister misin?';
      return alt ? base + ' Öneri: ‘' + alt + '’.' : base;
    },
    impossible: function (dish) {
      return 'Laktozu tercih etmediğin için ‘' + dish +
        '’ için ne yazık ki mutfak kalite standartlarımıza uygun laktozsuz bir tarif sunamıyoruz.';
    },
  },
};

function nameOf(ing) {
  return String((ing && (ing.displayName || ing.name)) || '');
}

function ingredientList(recipe) {
  if (!recipe || typeof recipe !== 'object') return [];
  if (Array.isArray(recipe.finalIngredients) && recipe.finalIngredients.length) {
    return recipe.finalIngredients;
  }
  return Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
}

function normalizeLang(lang) {
  const l = String(lang || 'de').toLowerCase().slice(0, 2);
  return MESSAGES[l] ? l : 'de';
}

function hasLactoseAllergen(allergens) {
  return (Array.isArray(allergens) ? allergens : []).some(function (a) {
    return /milch|laktose|lactose|dairy|milk|latte|leche/i.test(String(a || ''));
  });
}

/**
 * Nut-/Erdnusscreme ist kein Milchersatz.
 * „Milchersatz“ ohne laktosefrei/pflanzlich → als tierisch unsicher behandeln.
 */
function isNutOrPeanutCreamName(name) {
  const n = String(name || '').toLowerCase();
  return /\b(erdnuss|peanut|haselnuss|hazelnut)[\s-]?(creme|cream|mus|butter)\b/.test(n) ||
    /\b(mandelmus|nussmus|nut\s*butter)\b/.test(n) ||
    (/\b(erdnuss|peanut|haselnuss|hazelnut)\b/.test(n) && /creme|cream|mus|butter/.test(n));
}

/** Etabliertes pflanzliches oder explizit laktosefreies Milchprodukt. */
function isPlantOrLactoseFreeDairyName(name) {
  const n = String(name || '').toLowerCase();
  if (!n) return false;
  if (isNutOrPeanutCreamName(n)) return false;
  // „Milchersatz“ allein zählt nicht als sicher (oft unklar / tierisch möglich)
  if (/\bmilchersatz\b|\bdairy\s*alternative\b/.test(n) && !/laktosefrei|lactose[\s-]?free|pflanzlich|vegan/.test(n)) {
    return false;
  }
  if (/laktose/.test(n) && /frei|free/.test(n)) return true;
  if (!PLANT_DAIRY_MARKER_RE.test(n)) return false;
  // Muss milchproduktartig sein (nicht Sojasauce, nicht Kokosraspeln allein)
  if (!DAIRY_ROLE_RE.test(n) && !/margarine/.test(n)) return false;
  if (/sojasauce|sojaso[sß]e|soy\s*sauce|tamari|miso/.test(n)) return false;
  return true;
}

/** Tierisches Milchprodukt ohne sicheren Ersatz-Hinweis im Namen. */
function isAnimalDairyName(name) {
  const n = String(name || '').toLowerCase();
  if (!n) return false;
  if (isNutOrPeanutCreamName(n)) return false;
  if (isPlantOrLactoseFreeDairyName(n)) return false;
  // Unklarer „Milchersatz“ → vorsichtig als Konflikt behandeln
  if (/\bmilchersatz\b/.test(n) && !/laktosefrei|lactose[\s-]?free|pflanzlich|vegan/.test(n)) {
    return true;
  }
  return ANIMAL_DAIRY_RE.test(n);
}

function textMentionsRealDairyCream(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return false;
  if (/\bsahne\b|\bschmand\b|\bcream\b|\bpanna\b/.test(t)) return true;
  if (/\bsahnesauce\b|\bsahne-sauce\b|\bsahneso[sß]e\b/.test(t)) return true;
  const withoutPlantCreme = t
    .replace(/\b(kokos|hafer|soja|mandel|cashew|reis|hanf|lupinen?|pflanzlich(?:e|er|es)?|vegan(?:e|er|es)?)\s*-?\s*creme\b/g, ' ')
    .replace(/\b(coconut|oat|soy|almond|cashew|rice)\s*-?\s*cream\b/g, ' ')
    .replace(/\b(erdnuss|peanut|haselnuss|hazelnut)\s*-?\s*creme\b/g, ' ');
  return /\bcreme\b|\bcr[eè]me\b/.test(withoutPlantCreme);
}

function recipeTextBlob(recipe) {
  const title = String((recipe && recipe.title) || '');
  const steps = (Array.isArray(recipe && recipe.steps) ? recipe.steps : []).map(function (s) {
    if (typeof s === 'string') return s;
    return String((s && (s.instruction || s.content || s.text)) || '');
  }).join(' ');
  return (title + ' ' + steps).toLowerCase();
}

/**
 * Zutat deckt Sahne-/Creme-Erwähnung ab.
 * Hafer-/Sojadrink nur, wenn Text/Titel Sahne/Creme nahelegt ODER Name selbst Sahne/Creme ist.
 */
function ingredientSatisfiesSahneSlot(ingredients, recipeContext) {
  const list = Array.isArray(ingredients) ? ingredients : [];
  const blob = list.map(function (i) { return nameOf(i).toLowerCase(); }).join(' ');
  if (!blob) return false;
  if (/pflanzensahne|sojasahne|hafersahne|kokossahne|laktosefreie?\s*sahne|hafercreme|sojacreme|kokoscreme/.test(blob)) {
    return true;
  }
  if (/sahne|creme|cream|schmand|rahm|panna/.test(blob) && !isNutOrPeanutCreamName(blob)) {
    return true;
  }
  const ctx = String(recipeContext || '').toLowerCase();
  const creamContext = textMentionsRealDairyCream(ctx) || /sahnesauce|sahne\s*sauce|cremesauce|sahneso[sß]e/.test(ctx);
  if (creamContext &&
      /haferdrink|hafermilch|oat\s*drink|oat\s*milk|sojamilch|sojadrink|mandelmilch|kokosmilch|reisdrink|reismilch|laktosefrei/.test(blob)) {
    return true;
  }
  return false;
}

function recipeHasAnimalDairy(recipe) {
  return ingredientList(recipe).some(function (ing) {
    return isAnimalDairyName(nameOf(ing));
  });
}

function recipeHasLactoseSafeDairySubstitute(recipe) {
  return ingredientList(recipe).some(function (ing) {
    return isPlantOrLactoseFreeDairyName(nameOf(ing));
  });
}

function dishFallbackName(lang) {
  const map = {
    de: 'dieses Gericht',
    en: 'this dish',
    es: 'este plato',
    it: 'questo piatto',
    pt: 'este prato',
    fr: 'ce plat',
    tr: 'bu yemek',
  };
  return map[normalizeLang(lang)] || map.de;
}

function dishNameFromRecipe(recipe, fallback) {
  let title = String((recipe && recipe.title) || fallback || '').trim();
  title = title
    .replace(/\s*[–—-]\s*(milchfrei|laktosefrei)\s+angepasst\s*$/i, '')
    .replace(new RegExp('^' + SENTINEL_ALTERNATIVE + '\\s*:?\\s*', 'i'), '')
    .replace(new RegExp('^' + SENTINEL_IMPOSSIBLE + '\\s*:?\\s*', 'i'), '')
    .trim();
  return title || dishFallbackName((recipe && recipe.lang) || 'de');
}

function buildLactoseHonestyMessage(status, dishName, suggestedAlternative, lang) {
  const dish = String(dishName || dishFallbackName(lang)).trim() || dishFallbackName(lang);
  const pack = MESSAGES[normalizeLang(lang)] || MESSAGES.de;
  if (status === STATUS.ADAPTED) return pack.adapted(dish);
  if (status === STATUS.ALTERNATIVE) {
    return pack.alternative(dish, String(suggestedAlternative || '').trim());
  }
  if (status === STATUS.IMPOSSIBLE) return pack.impossible(dish);
  return '';
}

function collectParsedHaystack(parsed) {
  if (!parsed || typeof parsed !== 'object') return '';
  const parts = [
    String(parsed.title || ''),
    String(parsed.chef_analysis || ''),
    String(parsed.nutrition_note || ''),
    String(parsed.garnish || ''),
    String(parsed.target_deviation_note || ''),
  ];
  (Array.isArray(parsed.ingredients) ? parsed.ingredients : []).forEach(function (ing) {
    parts.push(nameOf(ing));
  });
  (Array.isArray(parsed.steps) ? parsed.steps : []).forEach(function (s) {
    if (typeof s === 'string') parts.push(s);
    else if (s && typeof s === 'object') {
      parts.push(String(s.title || ''), String(s.content || s.instruction || s.text || ''));
    }
  });
  return parts.join('\n');
}

function findSentinelInText(hay, sentinel) {
  const h = String(hay || '');
  const s = String(sentinel || '');
  if (!h || !s) return -1;
  return h.indexOf(s);
}

/**
 * Sentinels aus Titel, Analyse, Zutaten, Steps.
 * Leere Zutaten + Laktose ohne Sentinel → impossible (ehrlicher Abbruch).
 */
function extractLactoseHonestyFromParsed(parsed, allergens, dishQuery, opts) {
  opts = opts || {};
  const lang = opts.lang || 'de';
  if (!hasLactoseAllergen(allergens)) {
    return { status: STATUS.NONE };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { status: STATUS.NONE };
  }
  const dish = String(dishQuery || '').trim() || dishFallbackName(lang);
  const title = String(parsed.title || '').trim();
  const analysis = String(parsed.chef_analysis || parsed.nutrition_note || '').trim();
  const hay = collectParsedHaystack(parsed);
  const ings = Array.isArray(parsed.ingredients) ? parsed.ingredients : [];

  const impossibleAt = findSentinelInText(hay, SENTINEL_IMPOSSIBLE);
  if (impossibleAt >= 0 || title === SENTINEL_IMPOSSIBLE || title.indexOf(SENTINEL_IMPOSSIBLE) === 0) {
    return {
      status: STATUS.IMPOSSIBLE,
      dishName: dish,
      message: buildLactoseHonestyMessage(STATUS.IMPOSSIBLE, dish, '', lang),
      lang: lang,
    };
  }

  const altAt = findSentinelInText(hay, SENTINEL_ALTERNATIVE);
  if (altAt >= 0 || title === SENTINEL_ALTERNATIVE || title.indexOf(SENTINEL_ALTERNATIVE) === 0) {
    let suggested = '';
    const mTitle = title.match(new RegExp(SENTINEL_ALTERNATIVE + '\\s*:\\s*(.+)$', 'i'));
    if (mTitle && mTitle[1]) suggested = mTitle[1].trim();
    const mHay = hay.match(new RegExp(SENTINEL_ALTERNATIVE + '\\s*:\\s*([^\\n]+)', 'i'));
    if (!suggested && mHay && mHay[1]) suggested = mHay[1].trim();
    if (!suggested) suggested = analysis;
    suggested = String(suggested || '')
      .replace(new RegExp(SENTINEL_ALTERNATIVE, 'ig'), '')
      .replace(/^vorschlag\s*:?\s*/i, '')
      .replace(/^suggestion\s*:?\s*/i, '')
      .trim();
    return {
      status: STATUS.ALTERNATIVE,
      dishName: dish,
      suggestedAlternative: suggested || '',
      message: buildLactoseHonestyMessage(STATUS.ALTERNATIVE, dish, suggested, lang),
      lang: lang,
    };
  }

  // Leeres Rezept ohne Sentinel: nicht generisch validieren/retryen → ehrlich impossible
  if (!ings.length) {
    return {
      status: STATUS.IMPOSSIBLE,
      dishName: dish,
      message: buildLactoseHonestyMessage(STATUS.IMPOSSIBLE, dish, '', lang),
      lang: lang,
      inferredEmpty: true,
    };
  }

  return null;
}

/**
 * Nur noch für Hilfszwecke (Sahne-Kontext). adapted braucht Substitute, nicht nur Dish-Namen.
 */
function recipeSuggestsDairyContext(recipe, opts) {
  opts = opts || {};
  if (recipeHasLactoseSafeDairySubstitute(recipe)) return true;
  const title = String((recipe && recipe.title) || '');
  const query = String(opts.dishQuery || '');
  const blob = [title, query, recipeTextBlob(recipe)].join(' ');
  return textMentionsRealDairyCream(blob);
}

/**
 * adapted nur bei nachweisbaren etablierten Ersatzzutaten (kein Ragù-Name allein).
 */
function applyLactoseHonestyAdaptation(recipe, opts) {
  opts = opts || {};
  if (!recipe || typeof recipe !== 'object') return recipe;
  const allergens = []
    .concat(opts.allergens || [])
    .concat(recipe.allergens || [])
    .concat(recipe.userAllergens || []);
  const lactoseActive = hasLactoseAllergen(allergens) || opts.dairyFreeAdaptation === true;
  const lang = opts.lang || recipe.lang || 'de';
  if (!lactoseActive) {
    recipe.lactoseHonestyStatus = recipe.lactoseHonestyStatus || STATUS.NONE;
    return recipe;
  }
  if (recipeHasAnimalDairy(recipe)) {
    recipe.lactoseHonestyStatus = STATUS.NONE;
    return recipe;
  }
  // Strikt: ohne sicheren Ersatz in finalIngredients kein adapted-Banner
  if (!recipeHasLactoseSafeDairySubstitute(recipe)) {
    recipe.lactoseHonestyStatus = STATUS.NONE;
    return recipe;
  }

  const dish = dishNameFromRecipe(recipe, opts.dishQuery);
  recipe.lactoseHonestyStatus = STATUS.ADAPTED;
  const flags = Array.isArray(recipe.adaptationFlags) ? recipe.adaptationFlags.slice() : [];
  if (flags.indexOf('dairy_free_adaptation') < 0) flags.push('dairy_free_adaptation');
  if (flags.indexOf('lactose_honesty_adapted') < 0) flags.push('lactose_honesty_adapted');
  recipe.adaptationFlags = flags;
  recipe.adaptationNote = buildLactoseHonestyMessage(STATUS.ADAPTED, dish, '', lang);
  recipe.adaptationNoteLang = normalizeLang(lang);
  recipe.isUnmodifiedOriginal = false;
  let title = String(recipe.title || '').trim();
  if (title) {
    title = title.replace(/\s*[–—-]\s*(milchfrei|laktosefrei)\s+angepasst\s*$/i, '').trim();
    recipe.title = title;
  }
  return recipe;
}

function culinaryHonestyPromptRules() {
  return [
    'LAKTOSE-EHRLICHKEIT (kulinarisch strikt):',
    'Der Nutzer meidet Laktose. Entscheide ehrlich zwischen genau drei Outcomes:',
    '1) AUTHENTISCHER ERSATZ möglich → normales Rezept; etablierte Alternativen MUESSEN in ingredients stehen',
    '   (Name z. B. „laktosefreie Sahne“, „Hafercreme“, „Sojajoghurt“, „Pflanzensahne“, „Kokosmilch“ bei Currys).',
    '   Gerichtskonzept und Titel beibehalten. VERBOTEN: Tofu in klassischer Sahnesauce, Hähnchen statt Joghurt-Bowl,',
    '   Erdnusscreme als Milchersatz, unklare „Milchersatz“-Zutaten ohne laktosefrei/pflanzlich.',
    '2) Kein klassisches Original ohne Laktose, aber eine passende Alternative existiert',
    '   → title EXAKT "' + SENTINEL_ALTERNATIVE + '" (optional ": Alternativname"),',
    '   chef_analysis = kurzer Alternativname, ingredients=[], steps=[], nutrition alle 0.',
    '   VERBOTEN: ein anderes Gericht als normales Rezept auszugeben.',
    '3) Kein authentischer Ersatz → title EXAKT "' + SENTINEL_IMPOSSIBLE + '",',
    '   ingredients=[], steps=[], nutrition alle 0. KEIN Mental-Coach-Handoff.',
    'FREISUCHE-HINWEIS: „kein anderes Gericht“ gilt nur für Outcome 1.',
    'Wenn Outcome 2/3 greift, ist der Sentinel-Titel verbindlich – kein erfundenes Ersatzgericht als normales JSON.',
  ].join(' ');
}

/** Kurzer Hinweis für Eigenrezept/STRUCTURED: keine Ersetzung, Gate blockt. */
function eigenrezeptAllergenPassthroughNote(allergens) {
  const list = (Array.isArray(allergens) ? allergens : []).join(', ');
  return (
    'EIGENREZEPT/ALLERGENE: Nutzerzutaten 1:1 belassen (keine Ersetzung). ' +
    'Allergene nur notieren: ' + (list || '—') + '. ' +
    'Backend/Frontend blocken unsichere Ergebnisse; kein Sentinel-Ersatzgericht.'
  );
}

function buildLactoseAllergenPhraseEntry(allergens) {
  if (!hasLactoseAllergen(allergens)) return null;
  const labels = (Array.isArray(allergens) ? allergens : [])
    .filter(function (a) { return /milch|laktose|lactose|dairy|milk/i.test(String(a || '')); });
  return {
    label: String(labels[0] || 'Laktose / Milchprodukte'),
    phrases: [
      'milch', 'sahne', 'butter', 'joghurt', 'yogurt', 'käse', 'kaese', 'quark',
      'schmand', 'rahm', 'cream', 'milk', 'cheese', 'molke', 'whey', 'casein',
      'mascarpone', 'frischkäse', 'frischkaese', 'panna',
    ],
  };
}

module.exports = {
  STATUS: STATUS,
  SENTINEL_ALTERNATIVE: SENTINEL_ALTERNATIVE,
  SENTINEL_IMPOSSIBLE: SENTINEL_IMPOSSIBLE,
  MESSAGES: MESSAGES,
  hasLactoseAllergen: hasLactoseAllergen,
  isPlantOrLactoseFreeDairyName: isPlantOrLactoseFreeDairyName,
  isAnimalDairyName: isAnimalDairyName,
  isNutOrPeanutCreamName: isNutOrPeanutCreamName,
  textMentionsRealDairyCream: textMentionsRealDairyCream,
  ingredientSatisfiesSahneSlot: ingredientSatisfiesSahneSlot,
  recipeHasAnimalDairy: recipeHasAnimalDairy,
  recipeHasLactoseSafeDairySubstitute: recipeHasLactoseSafeDairySubstitute,
  recipeSuggestsDairyContext: recipeSuggestsDairyContext,
  dishNameFromRecipe: dishNameFromRecipe,
  dishFallbackName: dishFallbackName,
  buildLactoseHonestyMessage: buildLactoseHonestyMessage,
  extractLactoseHonestyFromParsed: extractLactoseHonestyFromParsed,
  applyLactoseHonestyAdaptation: applyLactoseHonestyAdaptation,
  culinaryHonestyPromptRules: culinaryHonestyPromptRules,
  eigenrezeptAllergenPassthroughNote: eigenrezeptAllergenPassthroughNote,
  buildLactoseAllergenPhraseEntry: buildLactoseAllergenPhraseEntry,
  collectParsedHaystack: collectParsedHaystack,
};
