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

// --- P1 (Maillard vor Schmoren) ---
// Fleisch-Praefix-Erkennung. Bewusst ohne \b am Ende, damit Komposita
// wie "Rindfleisch", "Haehnchenbrust", "Rindergulasch" erkannt werden.
// Bruehe/Fond wird separat ausgeschlossen (siehe BROTH_EXCLUDE_RE),
// damit "Rinderbruehe" nicht als Fleisch zaehlt.
const MEAT_RE = /(?:rind|kalb|schwein|lamm|hähnchen|haehnchen|huhn|hühner|pute|truthahn|ente|gans|fisch|lachs|thunfisch|forelle|kabeljau|garnele|shrimp|scampi|steak|kotelett|filet|hackfleisch|gulasch|schnitzel|ossobuco|brisket|entrec[oô]te)/i;
const BROTH_EXCLUDE_RE = /\b(brühe|bruehe|fond|bouillon|stock|sud)\b/i;
// Fluessigkeits-/Loesch-Signale im Step-Text.
// Breit gefasst: Fluessigkeitsname ODER typisches Loesch-Verb.
const LIQUID_STEP_RE = /(?:wasser|brühe|bruehe|fond|wein|bier|sahne|milch|kokosmilch|soße|soosse|passata|tomaten|pürierte\s+tomaten|puerierte\s+tomaten|ablöschen|abloeschen|aufgießen|aufgiessen|angießen|angiessen|hinzugießen|hinzugiessen)/i;
// Anbrat-Signale. Bewusst OHNE generisches "braten", damit "im Ofen braten"
// nicht als Maillard-Vorstufe zaehlt.
const SEAR_STEP_RE = /(?:scharf\s+anbraten|heiß\s+anbraten|heiss\s+anbraten|kräftig\s+anbraten|kraeftig\s+anbraten|goldbraun\s+braten|farbe\s+nehmen\s+lassen|maillard|anbraten|anrösten|anroesten|anschwitzen|anbräunen|anbraeunen)/i;

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

/**
 * P1 (Maillard vor Schmoren):
 * Bei Gerichten mit Fleisch und Fluessigkeit (Braten/Schmoren/Braisieren)
 * muss das Fleisch VOR dem Fluessigkeitszusatz scharf angebraten werden.
 * Vegetarische Gerichte loesen P1 nicht aus.
 * Anbraten und Loeschen im selben Step sind korrekt und loesen nicht aus.
 */
function stepsOf(recipe) {
  const raw = (recipe && (recipe.steps || recipe.instructions)) || [];
  if (!Array.isArray(raw)) return [];
  return raw.map(function (s) {
    if (typeof s === 'string') return s;
    if (s && typeof s === 'object') {
      return String((s.title ? s.title + ' ' : '') + (s.content || s.text || ''));
    }
    return '';
  });
}

function checkMaillardBeforeBraising(recipe) {
  const ings = ingredientsOf(recipe);
  const title = titleOf(recipe);

  const meatInTitle = MEAT_RE.test(title) && !BROTH_EXCLUDE_RE.test(title);
  const meatInIngs = ings.some(function (ing) {
    const n = nameOf(ing);
    return MEAT_RE.test(n) && !BROTH_EXCLUDE_RE.test(n);
  });
  if (!meatInTitle && !meatInIngs) return { errors: [], warnings: [] };

  const steps = stepsOf(recipe);
  if (!steps.length) return { errors: [], warnings: [] };

  // Erster Step mit Fluessigkeit/Loesch-Signal.
  let liquidIdx = -1;
  for (let i = 0; i < steps.length; i++) {
    if (LIQUID_STEP_RE.test(steps[i])) { liquidIdx = i; break; }
  }
  if (liquidIdx < 0) return { errors: [], warnings: [] };

  // Anbraten in einem Step bis einschliesslich dem ersten Fluessigkeits-Step?
  for (let i = 0; i <= liquidIdx; i++) {
    if (SEAR_STEP_RE.test(steps[i])) return { errors: [], warnings: [] };
  }

  return {
    errors: [],
    warnings: [
      'Kulinarische Plausibilitaet: Maillard vor dem Schmoren fehlt. ' +
      'Bei einem Gericht mit Fleisch und Fluessigkeit sollte das Fleisch ' +
      'vor dem Fluessigkeitszusatz scharf angebraten werden ' +
      '(Roestaromen, Maillard-Reaktion).'
    ],
  };
}

function evaluateAll(recipe) {
  const errors = [];
  const warnings = [];
  [checkFatOverload, checkFiberOverload, checkPsylliumInProteinDish, checkVinegarInTofuCurry, checkMaillardBeforeBraising]
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
  checkMaillardBeforeBraising: checkMaillardBeforeBraising,
};
