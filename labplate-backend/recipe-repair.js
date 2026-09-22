'use strict';
/**
 * Repair Layer — deterministische Soft-Repairs vor Hard-Validation.
 *
 * Staple-Katalog = Detector + Inject (Parity). Keine Einzelfall-Rezept-Patches.
 */

const unitModel = require('./recipe-unit-model');

/**
 * Generischer Staple-Katalog: stems für Detection, defaults für Inject.
 * unitKind/pieceMassG folgen dem Typed-Units-Modell.
 */
const STAPLE_CATALOG = [
  {
    label: 'Öl',
    stems: ['olivenöl', 'olivenoel', 'rapsöl', 'rapsoel', 'sonnenblumenöl', 'sonnenblumenoel', 'speiseöl', 'speiseoel', 'öl', 'oel'],
    name: 'Olivenöl',
    amount: 15,
    unit: 'ml',
    unitKind: 'volume',
    culinaryRole: 'fat_source',
    netCarbs: 0, fat: 100, protein: 0, fiber: 0,
  },
  {
    label: 'Butter',
    stems: ['butter', 'margarine', 'ghee'],
    name: 'Butter',
    amount: 20,
    unit: 'g',
    unitKind: 'mass',
    culinaryRole: 'fat_source',
    netCarbs: 0.1, fat: 82, protein: 0.7, fiber: 0,
  },
  {
    label: 'Wasser',
    stems: ['wasser', 'brühe', 'bruehe', 'fond'],
    name: 'Wasser',
    amount: 500,
    unit: 'ml',
    unitKind: 'volume',
    culinaryRole: 'liquid',
    netCarbs: 0, fat: 0, protein: 0, fiber: 0,
  },
  {
    label: 'Mehl',
    stems: ['mehl', 'stärke', 'staerke'],
    name: 'Mehl',
    amount: 20,
    unit: 'g',
    unitKind: 'mass',
    culinaryRole: 'binder',
    netCarbs: 70, fat: 1, protein: 10, fiber: 3,
  },
  {
    label: 'Zucker',
    stems: ['zucker', 'honig', 'sirup'],
    name: 'Zucker',
    amount: 10,
    unit: 'g',
    unitKind: 'mass',
    culinaryRole: 'sweetener',
    netCarbs: 100, fat: 0, protein: 0, fiber: 0,
  },
  {
    label: 'Ei',
    stems: ['eier', 'ei'],
    name: 'Ei',
    amount: 1,
    unit: 'stk',
    unitKind: 'discrete',
    pieceMassG: 60,
    culinaryRole: 'secondary_protein',
    protein_source: true,
    netCarbs: 0.7, fat: 10, protein: 13, fiber: 0,
  },
  {
    label: 'Salz',
    stems: ['meersalz', 'salz'],
    name: 'Salz',
    amount: 0,
    unit: 'prise',
    unitKind: 'pinch',
    culinaryRole: 'seasoning',
    netCarbs: 0, fat: 0, protein: 0, fiber: 0,
  },
  {
    label: 'Pfeffer',
    stems: ['pfeffer'],
    name: 'Schwarzer Pfeffer',
    amount: 0,
    unit: 'prise',
    unitKind: 'pinch',
    culinaryRole: 'seasoning',
    netCarbs: 0, fat: 0, protein: 0, fiber: 0,
  },
  {
    label: 'Essig',
    stems: ['essig', 'balsamico'],
    name: 'Essig',
    amount: 15,
    unit: 'ml',
    unitKind: 'volume',
    culinaryRole: 'seasoning',
    netCarbs: 0.5, fat: 0, protein: 0, fiber: 0,
  },
  {
    label: 'Knoblauch',
    stems: ['knoblauch'],
    name: 'Knoblauch',
    amount: 10,
    unit: 'g',
    unitKind: 'mass',
    culinaryRole: 'seasoning',
    netCarbs: 28, fat: 0.4, protein: 6, fiber: 2,
  },
  {
    label: 'Zwiebel',
    stems: ['zwiebeln', 'zwiebel', 'schalotten', 'schalotte'],
    name: 'Zwiebel',
    amount: 80,
    unit: 'g',
    unitKind: 'mass',
    culinaryRole: 'vegetable',
    netCarbs: 7, fat: 0.1, protein: 1.1, fiber: 1.7,
  },
  {
    label: 'Milch',
    stems: ['milch', 'sahne', 'rahm'],
    name: 'Milch',
    amount: 100,
    unit: 'ml',
    unitKind: 'volume',
    culinaryRole: 'liquid',
    netCarbs: 5, fat: 3.5, protein: 3.4, fiber: 0,
  },
];

/** Rückwärtskompatibel: nur label+stems für Detector. */
const STAPLE_WHITELIST = STAPLE_CATALOG.map(function (s) {
  return { label: s.label, stems: s.stems.slice() };
});

function normalizeDeAscii(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
}

function ingredientCoversStem(ingName, stem) {
  const n = normalizeDeAscii(ingName);
  const st = normalizeDeAscii(stem);
  if (!st) return false;
  if (st === 'ei' || st === 'eier') {
    return /(?:^|[^a-z])ei(?:er)?(?:[^a-z]|$)/.test(n) &&
      n.indexOf('eiweiss') < 0 && n.indexOf('eiweis') < 0;
  }
  return n.indexOf(st) >= 0;
}

function textMentionsStem(text, stem) {
  const t = normalizeDeAscii(text);
  const st = normalizeDeAscii(stem);
  if (!st) return false;
  if (st === 'ei' || st === 'eier') {
    return /(?:^|[^a-z])ei(?:er)?(?:[^a-z]|$)/.test(t) && t.indexOf('eiweiss') < 0;
  }
  if (st.length <= 3) {
    return new RegExp('(?:^|[^a-z])' + st.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:[^a-z]|$)').test(t);
  }
  return t.indexOf(st) >= 0;
}

function nextIngredientId(ingredients) {
  let max = 0;
  (Array.isArray(ingredients) ? ingredients : []).forEach(function (ing) {
    const n = parseInt(String((ing && ing.id) || '').replace(/\D/g, ''), 10);
    if (Number.isFinite(n) && n > max) max = n;
  });
  return String(max + 1).padStart(4, '0');
}

function catalogByLabel(label) {
  const key = String(label || '').toLowerCase();
  for (let i = 0; i < STAPLE_CATALOG.length; i++) {
    if (STAPLE_CATALOG[i].label.toLowerCase() === key) return STAPLE_CATALOG[i];
  }
  return null;
}

/**
 * Findet fehlende Staples: { label, stepIndex|null, catalog }.
 */
function findMissingStaples(steps, garnish, ingredients) {
  const ings = Array.isArray(ingredients) ? ingredients : [];
  const list = Array.isArray(steps) ? steps : [];
  const missing = [];
  const covered = {};

  STAPLE_CATALOG.forEach(function (staple) {
    const ok = ings.some(function (ing) {
      return staple.stems.some(function (stem) {
        return ingredientCoversStem((ing && ing.name) || '', stem);
      });
    });
    if (ok) covered[staple.label] = true;
  });

  const flagged = {};
  function scan(text, stepIndex) {
    STAPLE_CATALOG.forEach(function (staple) {
      if (covered[staple.label] || flagged[staple.label]) return;
      const hit = staple.stems.some(function (stem) { return textMentionsStem(text, stem); });
      if (!hit) return;
      flagged[staple.label] = true;
      missing.push({ label: staple.label, stepIndex: stepIndex, catalog: staple });
    });
  }

  list.forEach(function (s, i) {
    scan(String((s && s.content) || ''), i);
  });
  if (garnish) scan(String(garnish), null);

  return missing;
}

/**
 * Injiziert fehlende Katalog-Staples und verknüpft {id} im auslösenden Step.
 * @returns {string[]} Repair-Labels
 */
function injectMissingStaples(recipe) {
  const repairs = [];
  if (!recipe || typeof recipe !== 'object') return repairs;
  if (!Array.isArray(recipe.ingredients)) recipe.ingredients = [];
  const ingredients = recipe.ingredients;
  const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
  const garnish = typeof recipe.garnish === 'string' ? recipe.garnish : '';

  const missing = findMissingStaples(steps, garnish, ingredients);
  missing.forEach(function (gap) {
    const cat = gap.catalog || catalogByLabel(gap.label);
    if (!cat) return;
    // Nochmal prüfen (Race nach vorherigem Inject)
    const already = ingredients.some(function (ing) {
      return cat.stems.some(function (stem) {
        return ingredientCoversStem((ing && ing.name) || '', stem);
      });
    });
    if (already) return;

    const id = nextIngredientId(ingredients);
    const ing = {
      id: id,
      name: cat.name,
      amount: cat.amount,
      unit: cat.unit,
      unitKind: cat.unitKind,
      protein_source: !!cat.protein_source,
      culinaryRole: cat.culinaryRole || null,
      countsAsPrimaryProteinSource: false,
      netCarbs: cat.netCarbs || 0,
      fat: cat.fat || 0,
      protein: cat.protein || 0,
      fiber: cat.fiber || 0,
      _repairedStaple: cat.label,
    };
    if (cat.pieceMassG != null) ing.pieceMassG = cat.pieceMassG;
    unitModel.annotateIngredientUnits(ing);
    ingredients.push(ing);

    // Placeholder im auslösenden Step verknüpfen (Usage-Contract)
    if (gap.stepIndex != null && steps[gap.stepIndex]) {
      const step = steps[gap.stepIndex];
      const content = String(step.content || '');
      if (content && content.indexOf('{' + id + '}') < 0) {
        const ph = '{' + id + '}';
        // Bevorzugt Stem durch Placeholder ersetzen (längere Stems zuerst)
        let linked = false;
        const stemsSorted = cat.stems.slice().sort(function (a, b) { return b.length - a.length; });
        for (let si = 0; si < stemsSorted.length; si++) {
          const stem = stemsSorted[si];
          if (stem.length < 3 && stem !== 'öl' && stem !== 'oel' && stem !== 'ei') continue;
          const re = new RegExp('\\b(' + stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')\\b', 'i');
          if (re.test(content)) {
            step.content = content.replace(re, ph);
            linked = true;
            break;
          }
        }
        // Deutsch: „Öl“ ohne Wortgrenze vor Umlaut-Varianten
        if (!linked && (cat.label === 'Öl' || cat.label === 'Ei')) {
          const loose = cat.label === 'Öl'
            ? /\b([OoÖö]l(?:ivenöl|ivenoel)?|[Oo]liven[oö]l)\b/
            : /\b([Ee]ier?)\b/;
          if (loose.test(content)) {
            step.content = content.replace(loose, ph);
            linked = true;
          }
        }
        if (!linked) {
          step.content = content.replace(/\s*$/, '') + (/\.\s*$/.test(content) ? ' ' : '. ') + ph + '.';
        }
      }
      if (!Array.isArray(step.ingredientIds)) step.ingredientIds = [];
      if (step.ingredientIds.indexOf(id) < 0) step.ingredientIds.push(id);
    }

    repairs.push(cat.label);
  });

  return repairs;
}

/** Alias für bestehenden Call-Sites. */
function injectMissingSeasoningStaples(recipe) {
  return injectMissingStaples(recipe);
}

/**
 * Leitet step.ingredientIds aus {id}-Platzhaltern ab (Usage-Contract).
 */
function deriveIngredientIdsFromPlaceholders(recipe) {
  let n = 0;
  if (!recipe || !Array.isArray(recipe.steps)) return n;
  recipe.steps.forEach(function (step) {
    if (!step || typeof step !== 'object') return;
    const content = String(step.content || '');
    const found = {};
    const re = /\{(\d{4})\}/g;
    let m;
    while ((m = re.exec(content))) found[m[1]] = true;
    const ids = Object.keys(found);
    if (!ids.length) return;
    const existing = Array.isArray(step.ingredientIds) ? step.ingredientIds.map(String) : [];
    const merged = existing.slice();
    ids.forEach(function (id) {
      if (merged.indexOf(id) < 0) {
        merged.push(id);
        n += 1;
      }
    });
    step.ingredientIds = merged;
  });
  return n;
}

/**
 * Verknüpft bestehende Zutaten, die im Prosa namentlich vorkommen, mit {id}.
 * Generisch — kein Rezept-Sonderfall.
 */
function linkNamedIngredientsInProse(recipe) {
  let n = 0;
  if (!recipe || !Array.isArray(recipe.ingredients) || !Array.isArray(recipe.steps)) return n;
  const ingredients = recipe.ingredients;

  recipe.steps.forEach(function (step) {
    if (!step || typeof step !== 'object') return;
    let content = String(step.content || '');
    if (!content) return;
    const linkedIds = [];

    ingredients.forEach(function (ing) {
      if (!ing || !ing.id) return;
      const id = String(ing.id);
      if (content.indexOf('{' + id + '}') >= 0) {
        linkedIds.push(id);
        return;
      }
      const rawName = String(ing.name || '').trim();
      if (!rawName || rawName.length < 2) return;
      const aliases = [
        rawName,
        rawName.split(',')[0].trim(),
        rawName.replace(/\s*\([^)]*\)/g, '').trim(),
      ];
      const tokens = aliases[1].split(/\s+/).filter(Boolean);
      if (tokens.length >= 2) aliases.push(tokens[tokens.length - 1]);

      const unique = [];
      aliases.forEach(function (a) {
        if (!a || a.length < 3) return;
        if (/^(und|mit|oder|der|die|das)$/i.test(a)) return;
        if (!unique.some(function (u) { return u.toLowerCase() === a.toLowerCase(); })) {
          unique.push(a);
        }
      });
      unique.sort(function (a, b) { return b.length - a.length; });

      for (let i = 0; i < unique.length; i++) {
        const alias = unique[i];
        const re = new RegExp('\\b(' + alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')\\b', 'i');
        if (!re.test(content)) continue;
        content = content.replace(re, '{' + id + '}');
        linkedIds.push(id);
        n += 1;
        break;
      }
    });

    if (content !== step.content) step.content = content;
    if (linkedIds.length) {
      if (!Array.isArray(step.ingredientIds)) step.ingredientIds = [];
      linkedIds.forEach(function (id) {
        if (step.ingredientIds.indexOf(id) < 0) step.ingredientIds.push(id);
      });
    }
  });

  return n;
}

/**
 * Soft-drop: verwaiste optionale/Pinch-Orphans entfernen.
 */
function softDropUnusedNonCore(recipe) {
  const dropped = [];
  if (!recipe || !Array.isArray(recipe.ingredients)) return dropped;
  const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
  const garnish = String(recipe.garnish || '');
  const prepText = steps.map(function (s) { return String((s && s.content) || ''); }).join(' ') + ' ' + garnish;
  const used = {};
  const re = /\{(\d{4})\}/g;
  let m;
  while ((m = re.exec(prepText))) used[m[1]] = true;
  steps.forEach(function (s) {
    (Array.isArray(s && s.ingredientIds) ? s.ingredientIds : []).forEach(function (id) {
      if (id != null) used[String(id)] = true;
    });
  });

  const keep = [];
  recipe.ingredients.forEach(function (ing) {
    if (!ing) return;
    const id = ing.id != null ? String(ing.id) : '';
    if (!id || used[id]) {
      keep.push(ing);
      return;
    }
    const role = String(ing.culinaryRole || '').toLowerCase();
    const isCore = ing.protein_source || role === 'main_protein' || role === 'secondary_protein' ||
      role === 'base' || role === 'carbohydrate';
    const isPinch = String(ing.unit || '') === 'prise' || ing.unitKind === 'pinch';
    // Injizierte Staples behalten (Usage kommt über Placeholder-Link);
    // nur optionale / Pinch-Orphans soft-droppen.
    if (ing._repairedStaple) {
      keep.push(ing);
      return;
    }
    if ((isPinch && !isCore) || ing.optional === true) {
      dropped.push(id + ':' + (ing.name || ''));
      return;
    }
    keep.push(ing);
  });
  recipe.ingredients = keep;
  return dropped;
}

/**
 * Zentrale Repair Layer.
 * @returns {{ recipe: object, repairs: string[] }}
 */
function repairRecipeV2(recipe) {
  const repairs = [];
  if (!recipe || typeof recipe !== 'object') {
    return { recipe: recipe, repairs: repairs };
  }

  const unitN = unitModel.annotateRecipeIngredientUnits(recipe);
  if (unitN > 0) repairs.push('unitKind:' + unitN);

  try {
    const validator = require('./recipe-validator');
    if (typeof validator.normalizeRecipeIngredientNames === 'function') {
      const nameN = validator.normalizeRecipeIngredientNames(recipe);
      if (nameN > 0) repairs.push('ingredientNames:' + nameN);
    }
    if (typeof validator.dedupeRecipeIngredients === 'function') {
      const notes = validator.dedupeRecipeIngredients(recipe);
      if (notes && notes.length) repairs.push('dedupe:' + notes.join(','));
    }
  } catch (_) { /* optional */ }

  const injected = injectMissingStaples(recipe);
  if (injected.length) repairs.push('staples:' + injected.join(','));

  // Bestehende Zutaten namentlich im Text → {id} (vor Usage-Check)
  const linked = linkNamedIngredientsInProse(recipe);
  if (linked > 0) repairs.push('linkNames:' + linked);

  const derived = deriveIngredientIdsFromPlaceholders(recipe);
  if (derived > 0) repairs.push('ingredientIds:' + derived);

  // Nochmal Units für frisch injizierte
  unitModel.annotateRecipeIngredientUnits(recipe);

  const dropped = softDropUnusedNonCore(recipe);
  if (dropped.length) repairs.push('dropUnused:' + dropped.join(','));

  // Garnish-Echo / Stutter soft (best effort)
  try {
    const validator = require('./recipe-validator');
    if (typeof validator.integrateStepGarnishEcho === 'function') {
      const g = validator.integrateStepGarnishEcho(recipe);
      if (g && g.stripped) repairs.push('garnishEcho:' + g.stripped);
    }
  } catch (_) { /* optional */ }

  recipe._repairs = repairs.slice();
  return { recipe: recipe, repairs: repairs };
}

module.exports = {
  STAPLE_CATALOG: STAPLE_CATALOG,
  STAPLE_WHITELIST: STAPLE_WHITELIST,
  normalizeDeAscii: normalizeDeAscii,
  ingredientCoversStem: ingredientCoversStem,
  textMentionsStem: textMentionsStem,
  findMissingStaples: findMissingStaples,
  injectMissingStaples: injectMissingStaples,
  injectMissingSeasoningStaples: injectMissingSeasoningStaples,
  linkNamedIngredientsInProse: linkNamedIngredientsInProse,
  deriveIngredientIdsFromPlaceholders: deriveIngredientIdsFromPlaceholders,
  softDropUnusedNonCore: softDropUnusedNonCore,
  repairRecipeV2: repairRecipeV2,
  catalogByLabel: catalogByLabel,
};
