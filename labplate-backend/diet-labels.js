// diet-labels.js
// Deterministische Berechnung der Diaet-Labels aus den finalen Naehrwerten und Zutaten.
// Ersetzt die KI-Schätzung. Keine Heuristik, sondern klare Schwellen + Zutaten-Klassifikation.
// Stand: 2026-10-06
'use strict';

// Schwellen (pro Portion)
const KETO_MAX_NET_CARBS_G = 10;
const HIGH_PROTEIN_MIN_G = 25;

// Regex auf Zutatennamen. Wortgrenzen verhindern Fehltreffer
// ("Kokosmilch" matcht nicht \bmilch\b, "Erdnussbutter" nicht \bbutter\b).
// Substring-Matching (deutsche Komposita wie "Hähnchenbrust" werden erfasst).
// Ausnahmen: pflanzliche Milch-/Butter-Alternativen, die NICHT als tierisch gelten.
const MEAT_RE = /(rind|rinder|beef|schwein|pork|huhn|huehner|hühner|haehn|hähn|haehnchen|hähnchen|chicken|pute|truthahn|poularde|turkey|lamm|lammfleisch|lamb|hackfleisch|hack|fleisch|speck|bacon|schinken|ham\b|salami|wurst|sucuk|chorizo|leberkaese|leberkäse)/i;
const FISH_RE = /(fisch|fish|lachs|salmon|thunfisch|tuna|forelle|trout|sardine|sardelle|makrele|garnele|shrimp|prawn|krabbe|crab|muschel|mussel|tintenfisch|octopus|calamari|hering|herring|kabeljau|\bcod\b|seelachs|schellfisch)/i;
const EGG_RE = /(\bei\b|\beier\b|\beiern\b|eiweiss|eiweiß|eigelb|\begg\b|\beggs\b|\bomelett)/i;
const DAIRY_RAW_RE = /(milch|milk|butter|kaese|käse|cheese|joghurt|yogurt|sahne|cream|quark|mozzarella|parmesan|gouda|feta|ricotta|mascarpone|schmand|kefir|buttermilch|buttermilk)/i;
// Pflanzliche Ausnahmen: duerfen NICHT als Milchprodukt zaehlen.
const PLANT_DAIRY_RE = /(kokosmilch|mandelmilch|sojamilch|soya|hafermilch|reismilch|nussmilch|cashewmilch|erdnussbutter|mandelbutter|kokosbutter|nussbutter|sheabutter|kokosfett|kokosoel|kokosöl|kokosnuss)/i;
const HONEY_RE = /(honig|honey)/i;

function isDairy(name) {
  if (PLANT_DAIRY_RE.test(name)) return false;
  return DAIRY_RAW_RE.test(name);
}

function classifyByIngredients(ingredients) {
  let hasMeat = false, hasFish = false, hasEgg = false, hasDairy = false, hasHoney = false;
  (Array.isArray(ingredients) ? ingredients : []).forEach(function (ing) {
    if (!ing) return;
    const name = String(ing.name || '');
    if (!name) return;
    if (MEAT_RE.test(name)) hasMeat = true;
    if (FISH_RE.test(name)) hasFish = true;
    if (EGG_RE.test(name)) hasEgg = true;
    if (isDairy(name)) hasDairy = true;
    if (HONEY_RE.test(name)) hasHoney = true;
  });
  const vegetarisch = !hasMeat && !hasFish;
  const vegan = vegetarisch && !hasEgg && !hasDairy && !hasHoney;
  return { vegetarisch: vegetarisch, vegan: vegan, hasMeat: hasMeat, hasFish: hasFish, hasEgg: hasEgg, hasDairy: hasDairy, hasHoney: hasHoney };
}

function computeDietLabels(nutrition, ingredients) {
  const labels = [];
  const n = nutrition || {};
  const protein = Number(n.protein_g) || 0;
  const netCarbs = Number(n.netto_kh_g);
  const netCarbsSafe = Number.isFinite(netCarbs) ? netCarbs : 999;

  if (netCarbsSafe < KETO_MAX_NET_CARBS_G) labels.push('keto');
  if (protein >= HIGH_PROTEIN_MIN_G) labels.push('high_protein');

  const cls = classifyByIngredients(ingredients);
  if (cls.vegan) {
    labels.push('vegan');
    labels.push('vegetarisch');
  } else if (cls.vegetarisch) {
    labels.push('vegetarisch');
  }
  return labels;
}

module.exports = {
  computeDietLabels: computeDietLabels,
  classifyByIngredients: classifyByIngredients,
  KETO_MAX_NET_CARBS_G: KETO_MAX_NET_CARBS_G,
  HIGH_PROTEIN_MIN_G: HIGH_PROTEIN_MIN_G,
};
