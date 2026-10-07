// plausibility-checks.js
// Kulinarische Plausibilitaets-Pruefungen.
// Grundsatz: MARKIEREN, nicht blockieren. Alle Befunde sind Warnungen.
// Stand: 2026-10-07
'use strict';

const FAT_NAME_RE = /\b(oliven|l|raps|kokos|sesam|erdnuss|nuss|sonnenblumen|traubenkern)[\s-]?(öl|oel|oil)\b|\bbutter\b|\bschmalz\b|\bghee\b|\bkokosfett\b|\bmargarine\b/i;
const FAT_PLANT_ONLY_RE = /\b(olivenöl|olivenoel|rapsöl|rapsoel|kokosöl|kokos oel|kokosfett|butter|schmalz|ghee|margarine)\b/i;
const HIGH_FIBER_RE = /\b(chiasamen|chia|leinsamen|flohsamen|psyllium|flosamen|weizenkleie|haferkleie)\b/i;
const PROTEIN_DISH_RE = /\b(hähnchen|haehnchen|huhn|hähn|haehn|pute|truthahn|rind|schwein|beef|pork|fisch|lachs|thunfisch|garnele|shrimp|steak|kotelett|filet|hackfleisch|hack)\b/i;
const ACID_RE = /\b(essig|vinegar|balsamico|apfelessig)\b/i;
const TOFU_DISH_RE = /\b(tofu|tempeh)\b/i;

function nameOf(ing) {
  return String((ing && (ing.name || ing.displayName)) || '');
}
function ingredientsOf(recipe) {
  return Array.isArray(recipe && recipe.finalIngredients)
    ? recipe.finalIngredients
    : (Array.isArray(recipe && recipe.ingredients) ? recipe.ingredients : []);
}
function titleOf(recipe) {
  return String((recipe && recipe.title) || '');
}

/**
 * 1) Fett-Ueberladung: >= 3 verschiedene Fette gleichzeitig.
 */
function checkFatOverload(recipe) {
  const ings = ingredientsOf(recipe);
  const fats = [];
  ings.forEach(function (ing) {
    const n = nameOf(ing);
    const role = String(ing.culinaryRole || ing.role || '').toLowerCase();
    if (FAT_NAME_RE.test(n) || role === 'fat_source') {
      // Kochwasser/Wasser ausschliessen
      if (/wasser|water/i.test(n)) return;
      const key = n.toLowerCase();
      if (fats.indexOf(key) < 0) fats.push(key);
    }
  });
  if (fats.length >= 3) {
    return {
      errors: [],
      warnings: [
        'Kulinarische Plausibilitaet: ' + fats.length + ' verschiedene Fette gleichzeitig (' +
        fats.slice(0, 4).join(', ') + '). Fuer ein Gericht reichen meist 1-2 Fette.'
      ],
    };
  }
  return { errors: [], warnings: [] };
}

/**
 * 2) Ballaststoff-Ueberladung: >= 3 verschiedene starke Ballaststoff-Traeger.
 */
function checkFiberOverload(recipe) {
  const ings = ingredientsOf(recipe);
  const fibers = [];
  ings.forEach(function (ing) {
    const n = nameOf(ing);
    if (HIGH_FIBER_RE.test(n)) {
      const key = n.toLowerCase().replace(/[^a-zäöü]/g, '');
      if (fibers.indexOf(key) < 0) fibers.push(nameOf(ing));
    }
  });
  if (fibers.length >= 3) {
    return {
      errors: [],
      warnings: [
        'Kulinarische Plausibilitaet: ' + fibers.length + ' starke Ballaststoff-Traeger gleichzeitig (' +
        fibers.join(', ') + '). Das kann Magen-Darm belasten und die Konsistenz verderben.'
      ],
    };
  }
  return { errors: [], warnings: [] };
}

/**
 * 3) Psyllium/Flohsamen in proteinreichem Tiergericht (Haehnchen, Rind, Fisch).
 */
function checkPsylliumInProteinDish(recipe) {
  const ings = ingredientsOf(recipe);
  const blob = [titleOf(recipe)].concat(ings.map(nameOf)).join(' ');
  const hasProteinDish = PROTEIN_DISH_RE.test(blob);
  const hasPsyllium = /\b(psyllium|flohsamen|flosamen)\b/i.test(blob);
  if (hasProteinDish && hasPsyllium) {
    return {
      errors: [],
      warnings: [
        'Kulinarische Plausibilitaet: Psyllium/Flohsamen in einem proteinreichen Gericht (Haehnchen/Fleisch/Fisch) ' +
        'ist ungewoehnlich. Psyllium bindet Wasser stark und wird meist in Gebaeck oder als Verdickungsmittel ' +
        'in veganen Rezepten verwendet.'
      ],
    };
  }
  return { errors: [], warnings: [] };
}

/**
 * 4) Essig in Tofu-/Tempeh-Curry (kulinarisch fragwuerdige Kombination).
 */
function checkVinegarInTofuCurry(recipe) {
  const ings = ingredientsOf(recipe);
  const title = titleOf(recipe).toLowerCase();
  const blob = title + ' ' + ings.map(nameOf).join(' ');
  const isCurry = /curry|kokosmilch|kokos-curry/.test(blob);
  const isTofu = TOFU_DISH_RE.test(blob);
  const hasVinegar = ings.some(function (ing) { return ACID_RE.test(nameOf(ing)); });
  if (isCurry && isTofu && hasVinegar) {
    return {
      errors: [],
      warnings: [
        'Kulinarische Plausibilitaet: Essig in einem Tofu-/Tempeh-Curry ist ungewoehnlich. ' +
        'Fuer Saeure in Currys werden eher Limette oder Zitrone verwendet.'
      ],
    };
  }
  return { errors: [], warnings: [] };
}

function evaluateAll(recipe) {
  const errors = [];
  const warnings = [];
  [checkFatOverload, checkFiberOverload, checkPsylliumInProteinDish, checkVinegarInTofuCurry]
    .forEach(function (fn) {
      try {
        const r = fn(recipe);
        (r.errors || []).forEach(function (e) { if (errors.indexOf(e) < 0) errors.push(e); });
        (r.warnings || []).forEach(function (w) { if (warnings.indexOf(w) < 0) warnings.push(w); });
      } catch (e) {
        // defensive: check darf nie die Pipeline brechen
      }
    });
  return { errors: errors, warnings: warnings };
}

module.exports = {
  evaluateAll: evaluateAll,
  checkFatOverload: checkFatOverload,
  checkFiberOverload: checkFiberOverload,
  checkPsylliumInProteinDish: checkPsylliumInProteinDish,
  checkVinegarInTofuCurry: checkVinegarInTofuCurry,
};
