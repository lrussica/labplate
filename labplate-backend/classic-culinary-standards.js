'use strict';
/**
 * Klassische Kulinarik-Standards (reproduzierbar, nicht verhandelbar).
 * - Bekannte Klassiker (Lasagne, …) behalten ihre Core-Components.
 * - Prosa-Komponenten (Béchamel, Ragù, Dressing, …) brauchen Rohzutaten in ingredients.
 * - Keine Kalorien-Kastration ohne explizite Low-Cal-Anfrage.
 */

/** @typedef {{ id: string, label: string, needRe: RegExp }} IngredientNeed */

/**
 * @typedef {object} ClassicDishStandard
 * @property {string} id
 * @property {string} label
 * @property {RegExp} detectRe
 * @property {object[]} coreGroups
 */

/** @type {ClassicDishStandard[]} */
const CLASSIC_DISH_STANDARDS = [
  {
    id: 'lasagne',
    label: 'Lasagne',
    detectRe: /lasagn[ea]|lasagne/i,
    coreGroups: [
      {
        id: 'bechamel',
        label: 'Béchamel (Butter + Mehl + Milch)',
        anyOf: [
          { id: 'bechamel_named', label: 'Béchamel', needRe: /b[eé]chamel|besciamella|wei[sß]e?\s*so[sß]e/i },
        ],
        allOf: [
          { id: 'butter', label: 'Butter', needRe: /butter|margarine|ghee/i },
          { id: 'flour', label: 'Mehl', needRe: /(?:weizen)?mehl|flour|tipo\s*00/i },
          { id: 'milk', label: 'Milch', needRe: /\bmilch\b|\bmilk\b|haferdrink|sojamilch|mandelmilch|vollmilch/i },
        ],
      },
      {
        id: 'ragu',
        label: 'Ragù/Sofrito (Hack + Zwiebel + Karotte + Sellerie + Tomate)',
        allOf: [
          { id: 'beef', label: 'Rinderhack', needRe: /hack|rind|beef|minced|bolognese|rag[uù]/i },
          { id: 'onion', label: 'Zwiebel', needRe: /zwiebel|onion|cipolla/i },
          { id: 'carrot', label: 'Karotte', needRe: /karotte|m[oö]hre|carrot/i },
          { id: 'celery', label: 'Sellerie', needRe: /sellerie|celery|sedano/i },
          { id: 'tomato', label: 'Tomate', needRe: /tomate|tomato|passata|pelati|tomatenmark/i },
        ],
      },
      {
        id: 'cheese',
        label: 'Käse (Mozzarella + Parmesan)',
        allOf: [
          { id: 'mozzarella', label: 'Mozzarella', needRe: /mozzarella/i },
          { id: 'parmesan', label: 'Parmesan', needRe: /parmesan|parmigiano|grana|pecorino/i },
        ],
      },
      {
        id: 'sheets',
        label: 'Lasagneplatten',
        anyOf: [
          {
            id: 'sheets',
            label: 'Lasagneplatten',
            needRe: /lasagneplatte|lasagnenudel|lasagna\s*sheet|lasagn[ea][\s\-]*(platte|blatt|nudel)|teigplatte/i,
          },
        ],
      },
    ],
  },
  {
    id: 'bolognese',
    label: 'Bolognese / Ragù',
    detectRe: /bolognese|(?:rag[uù].*bolognese)|(?:klassisch\w*.*rag[uù])/i,
    coreGroups: [
      {
        id: 'soffritto',
        label: 'Soffritto (Zwiebel + Karotte + Sellerie)',
        allOf: [
          { id: 'onion', label: 'Zwiebel', needRe: /zwiebel|onion/i },
          { id: 'carrot', label: 'Karotte', needRe: /karotte|m[oö]hre|carrot/i },
          { id: 'celery', label: 'Sellerie', needRe: /sellerie|celery/i },
        ],
      },
      {
        id: 'meat',
        label: 'Hackfleisch',
        anyOf: [
          { id: 'hack', label: 'Hackfleisch', needRe: /hack|rind|schwein|beef|pork|minced/i },
        ],
      },
      {
        id: 'tomato',
        label: 'Tomate',
        anyOf: [
          { id: 'tomato', label: 'Tomate', needRe: /tomate|tomato|passata|pelati|tomatenmark/i },
        ],
      },
    ],
  },
];

const PROSE_COMPONENT_BUNDLES = [
  {
    id: 'bechamel',
    label: 'Béchamel',
    mentionRe: /b[eé]chamel|besciamella|wei[sß]e?\s+so[sß]e|wei[sß]e?\s+sauce/i,
    acceptIngredientRe: /b[eé]chamel|besciamella/i,
    allOf: [
      { id: 'butter', label: 'Butter', needRe: /butter|margarine|ghee/i },
      { id: 'flour', label: 'Mehl', needRe: /(?:weizen)?mehl|flour|tipo\s*00/i },
      { id: 'milk', label: 'Milch', needRe: /\bmilch\b|\bmilk\b|haferdrink|sojamilch|mandelmilch|vollmilch/i },
    ],
  },
  {
    id: 'ragu',
    label: 'Ragù',
    mentionRe: /\brag[uù]\b|\bbolognese\b/i,
    acceptIngredientRe: /rag[uù]|bolognese/i,
    allOf: [
      { id: 'meat', label: 'Hackfleisch', needRe: /hack|rind|schwein|beef|pork|minced/i },
      { id: 'tomato', label: 'Tomate', needRe: /tomate|tomato|passata|pelati|tomatenmark/i },
    ],
  },
  {
    id: 'soffritto',
    label: 'Soffritto/Sofrito',
    mentionRe: /\bsoffritto\b|\bsofrito\b/i,
    allOf: [
      { id: 'onion', label: 'Zwiebel', needRe: /zwiebel|onion/i },
      { id: 'carrot', label: 'Karotte', needRe: /karotte|m[oö]hre|carrot/i },
      { id: 'celery', label: 'Sellerie', needRe: /sellerie|celery/i },
    ],
  },
  {
    id: 'dressing',
    label: 'Dressing/Vinaigrette',
    mentionRe: /\bdressing\b|\bvinaigrette\b/i,
    acceptIngredientRe: /\bdressing\b|\bvinaigrette\b/i,
    allOf: [
      { id: 'oil', label: 'Öl', needRe: /[oö]l\b|oil|olio/i },
      { id: 'acid', label: 'Säure (Essig/Zitrone)', needRe: /essig|vinegar|zitrone|lemon|lime|balsamico/i },
    ],
  },
  {
    id: 'pesto',
    label: 'Pesto',
    mentionRe: /\bpesto\b/i,
    acceptIngredientRe: /\bpesto\b/i,
    allOf: [
      { id: 'basil', label: 'Basilikum', needRe: /basilikum|basil/i },
      { id: 'oil', label: 'Öl', needRe: /[oö]l\b|oil|olio/i },
    ],
  },
  {
    id: 'hollandaise',
    label: 'Hollandaise',
    mentionRe: /\bhollandaise\b|\bholländische\s+so[sß]e/i,
    acceptIngredientRe: /\bhollandaise\b/i,
    allOf: [
      { id: 'butter', label: 'Butter', needRe: /butter/i },
      { id: 'egg', label: 'Eigelb/Ei', needRe: /eigelb|\bei\b|egg\s*yolk|dotter/i },
    ],
  },
];

const LOW_CAL_RE =
  /low[\s-]?cal(?:orie)?s?|kalorienarm|kalorienreduziert|light[\s-]?version|leichte?\s+version|abgespeckt|fettarm|low[\s-]?fat/i;

const CLASSIC_DECLARE_RE =
  /klassisch|classic|originale?|traditionell|authentisch|MODUS ORIGINALREZEPT|MODE ORIGINAL RECIPE/i;

function contextBlob(ctx) {
  const c = ctx || {};
  return [
    c.dishQuery,
    c.title,
    c.ai_instruction,
    c.aiInstruction,
    Array.isArray(c.pantry_ingredients) ? c.pantry_ingredients.join(' ') : '',
  ].filter(Boolean).join(' ');
}

function isLowCalorieRequest(ctx) {
  return LOW_CAL_RE.test(contextBlob(ctx));
}

function isClassicDeclared(ctx) {
  return CLASSIC_DECLARE_RE.test(contextBlob(ctx));
}

function findClassicDishStandard(ctx) {
  const blob = contextBlob(ctx);
  if (!blob) return null;
  for (let i = 0; i < CLASSIC_DISH_STANDARDS.length; i++) {
    if (CLASSIC_DISH_STANDARDS[i].detectRe.test(blob)) return CLASSIC_DISH_STANDARDS[i];
  }
  return null;
}

function shouldEnforceClassicCores(ctx) {
  if (isLowCalorieRequest(ctx)) return false;
  return !!findClassicDishStandard(ctx);
}

function ingredientNames(recipe) {
  const list = [];
  const src = Array.isArray(recipe && recipe.finalIngredients) && recipe.finalIngredients.length
    ? recipe.finalIngredients
    : (Array.isArray(recipe && recipe.ingredients) ? recipe.ingredients : []);
  src.forEach(function (ing) {
    if (!ing) return;
    list.push(String(ing.displayName || ing.name || ''));
  });
  return list;
}

function namesMatchNeed(names, needRe) {
  return names.some(function (n) { return needRe.test(n); });
}

function groupSatisfied(group, names) {
  if (Array.isArray(group.anyOf) && group.anyOf.length) {
    if (group.anyOf.some(function (need) { return namesMatchNeed(names, need.needRe); })) {
      return { ok: true, missing: [] };
    }
  }
  if (Array.isArray(group.allOf) && group.allOf.length) {
    const missing = [];
    group.allOf.forEach(function (need) {
      if (!namesMatchNeed(names, need.needRe)) missing.push(need.label);
    });
    if (!missing.length) return { ok: true, missing: [] };
    return { ok: false, missing: missing };
  }
  if (Array.isArray(group.anyOf) && group.anyOf.length) {
    return { ok: false, missing: [group.label] };
  }
  return { ok: true, missing: [] };
}

/**
 * @returns {{ ok: boolean, problems: string[], standard: object|null, skipped: boolean }}
 */
function validateClassicCoreComponents(recipe, ctx) {
  const problems = [];
  const context = Object.assign({}, ctx || {}, {
    title: (ctx && ctx.title) || (recipe && recipe.title) || '',
  });
  if (!shouldEnforceClassicCores(context)) {
    return { ok: true, problems: problems, standard: null, skipped: true };
  }
  const standard = findClassicDishStandard(context);
  if (!standard) return { ok: true, problems: problems, standard: null, skipped: true };

  const names = ingredientNames(recipe);
  standard.coreGroups.forEach(function (group) {
    if (group.id === 'bechamel' && Array.isArray(group.anyOf) && Array.isArray(group.allOf)) {
      const named = group.anyOf.some(function (n) { return namesMatchNeed(names, n.needRe); });
      if (named) return;
      const raw = groupSatisfied({ allOf: group.allOf }, names);
      if (!raw.ok) {
        problems.push(
          "Klassiker-Standard '" + standard.label + "': Core-Komponente '" + group.label +
          "' unvollständig (fehlt: " + raw.missing.join(', ') +
          "). Keine Kalorien-Kastration — vollständige klassische Zutatenlisten."
        );
      }
      return;
    }
    const res = groupSatisfied(group, names);
    if (!res.ok) {
      problems.push(
        "Klassiker-Standard '" + standard.label + "': Core-Komponente '" + group.label +
        "' fehlt oder unvollständig" +
        (res.missing.length ? ' (fehlt: ' + res.missing.join(', ') + ')' : '') +
        '. Unverhandelbar für klassische Rezepte.'
      );
    }
  });

  return {
    ok: problems.length === 0,
    problems: problems,
    standard: standard,
    skipped: false,
  };
}

function collectProseText(recipe) {
  const parts = [];
  const steps = Array.isArray(recipe && recipe.steps) ? recipe.steps : [];
  steps.forEach(function (s) {
    if (!s) return;
    if (typeof s === 'string') {
      parts.push(s);
      return;
    }
    parts.push(String(s.content || s.instruction || s.text || ''));
    parts.push(String(s.title || ''));
  });
  parts.push(String((recipe && recipe.garnish) || ''));
  parts.push(String((recipe && recipe.chef_analysis) || ''));
  parts.push(String((recipe && recipe.nutrition_note) || ''));
  parts.push(String((recipe && recipe.title) || ''));
  return parts.join('\n');
}

/**
 * @returns {{ ok: boolean, problems: string[] }}
 */
function validateProseComponentCompleteness(recipe) {
  const problems = [];
  const prose = collectProseText(recipe);
  if (!prose.trim()) return { ok: true, problems: problems };
  const names = ingredientNames(recipe);

  PROSE_COMPONENT_BUNDLES.forEach(function (bundle) {
    if (!bundle.mentionRe.test(prose)) return;
    if (bundle.acceptIngredientRe && namesMatchNeed(names, bundle.acceptIngredientRe)) return;
    if (Array.isArray(bundle.allOf) && bundle.allOf.length) {
      const missing = [];
      bundle.allOf.forEach(function (need) {
        if (!namesMatchNeed(names, need.needRe)) missing.push(need.label);
      });
      if (missing.length) {
        problems.push(
          "Komponenten-Vollständigkeit: '" + bundle.label + "' wird im Zubereitungstext erwähnt, " +
          'aber Rohzutaten fehlen in ingredients (fehlt: ' + missing.join(', ') + '). ' +
          'Entweder alle Rohzutaten listen oder die Komponente nicht erwähnen.'
        );
      }
    }
  });

  return { ok: problems.length === 0, problems: problems };
}

function buildClassicStandardsPromptRules(ctx) {
  const context = ctx || {};
  const dish = findClassicDishStandard(context);
  const classic = isClassicDeclared(context) || !!dish;
  if (!classic) return '';
  if (isLowCalorieRequest(context)) {
    return [
      'LOW-CALORIE-ANFRAGE erkannt: Abwandlungen der klassischen Zutatenliste sind erlaubt,',
      'solange das Gerichtskonzept erkennbar bleibt. Komponenten, die du im Text nennst',
      '(Béchamel, Ragù, Dressing, …), müssen trotzdem mit Rohzutaten in ingredients abgebildet sein.',
    ].join(' ');
  }

  const lines = [
    'KLASSISCHER KULINARIK-STANDARD (unverhandelbar, reproduzierbar):',
    'Wenn der Nutzer ein Klassik-Gericht sucht oder „klassisch/original/traditionell“ verlangt:',
    '1) Liefere die VOLLSTÄNDIGE klassische Version — KEINE abgespeckten Light-/Fitness-Varianten.',
    '2) VERBOTEN: Zutaten weglassen nur um Kalorien/Fett/KH zu sparen, es sei denn der Nutzer fordert explizit Low-Calorie/kalorienarm.',
    '3) Jede im Step-Text genannte Komponente (Béchamel, Ragù, Dressing, Soffritto, Pesto, Hollandaise)',
    '   MUSS mit ihren Rohzutaten (oder als fertige Komponente) im ingredients-Array stehen.',
    '4) Determinismus: halte bewährte Standard-Zutaten und -Schritte ein; keine kreativen Kürzungen am Kern.',
  ];

  if (dish && dish.id === 'lasagne') {
    lines.push(
      'LASAGNE-CORE (PFLICHT): Béchamel = Butter + Mehl + Milch; ' +
      'Ragù/Sofrito = Rinderhack + Zwiebel + Karotte + Sellerie + Tomate; ' +
      'Käse = Mozzarella + Parmesan; plus Lasagneplatten. Alle Gruppen müssen in ingredients vorkommen.'
    );
  }
  if (dish && dish.id === 'bolognese') {
    lines.push(
      'BOLOGNESE/RAGÙ-CORE (PFLICHT): Soffritto (Zwiebel+Karotte+Sellerie), Hackfleisch, Tomate. ' +
      'Keine Light-Kürzung des Soffritto.'
    );
  }
  return lines.join('\n');
}

function classicGenerationTemperature(ctx, fallback) {
  const context = ctx || {};
  if (isClassicDeclared(context) || findClassicDishStandard(context)) return 0;
  return fallback == null ? 0.2 : fallback;
}

module.exports = {
  CLASSIC_DISH_STANDARDS: CLASSIC_DISH_STANDARDS,
  PROSE_COMPONENT_BUNDLES: PROSE_COMPONENT_BUNDLES,
  isLowCalorieRequest: isLowCalorieRequest,
  isClassicDeclared: isClassicDeclared,
  findClassicDishStandard: findClassicDishStandard,
  shouldEnforceClassicCores: shouldEnforceClassicCores,
  validateClassicCoreComponents: validateClassicCoreComponents,
  validateProseComponentCompleteness: validateProseComponentCompleteness,
  buildClassicStandardsPromptRules: buildClassicStandardsPromptRules,
  classicGenerationTemperature: classicGenerationTemperature,
};
