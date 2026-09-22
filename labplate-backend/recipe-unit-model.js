'use strict';
/**
 * Typed Units — generisches Mengenmodell ohne globale stk×60-Annahme.
 *
 * unitKind: mass | volume | discrete | pinch
 * pieceMassG: nur bei discrete (Ei=60, Lorbeerblatt=0, …)
 */

const UNIT_KINDS = ['mass', 'volume', 'discrete', 'pinch'];

/** Bekannte discrete Defaults (Name-Heuristik). Ei hat Masse; Gewürzblatt/Nelke ≈ 0. */
const DISCRETE_PIECE_MASS_G = [
  { test: /\bei(?:er)?\b/i, exclude: /eiweiss|eiweiß|eiweis/i, mass: 60 },
  { test: /\b(?:lorbeer|bay\s*leaf|alloro|defne)\b/i, mass: 0 },
  { test: /\b(?:nelke|nelken|clove|chiodo)\b/i, mass: 0 },
  { test: /\b(?:kardamom\s*kapsel|cardamom\s*pod)\b/i, mass: 0 },
  { test: /\b(?:blatt|blätter|blaetter|leaf|leaves)\b/i, mass: 0 },
];

function isEggName(name) {
  const n = String(name || '').toLowerCase();
  if (!n || /eiweiss|eiweiß|eiweis/.test(n)) return false;
  return /(?:^|[^a-zäöüß])ei(?:er)?(?:[^a-zäöüß]|$)/.test(n);
}

function defaultPieceMassG(name) {
  const n = String(name || '');
  for (let i = 0; i < DISCRETE_PIECE_MASS_G.length; i++) {
    const row = DISCRETE_PIECE_MASS_G[i];
    if (row.exclude && row.exclude.test(n)) continue;
    if (row.test.test(n)) return row.mass;
  }
  // Unbekannte Stückware: keine Fantasie-Gramm → 0 (Makros nur wenn pieceMassG gesetzt)
  return 0;
}

/**
 * Inferiert unitKind aus unit + Name (ohne Mutation).
 * @returns {'mass'|'volume'|'discrete'|'pinch'}
 */
function inferUnitKind(ing) {
  if (!ing || typeof ing !== 'object') return 'mass';
  if (ing.unitKind && UNIT_KINDS.indexOf(ing.unitKind) >= 0) return ing.unitKind;
  const unit = String(ing.unit || '').toLowerCase().trim();
  if (unit === 'prise' || unit === 'messerspitze') return 'pinch';
  if (unit === 'ml' || unit === 'l' || unit === 'cl') return 'volume';
  if (unit === 'stk' || unit === 'stück' || unit === 'stueck') return 'discrete';
  if (unit === 'g' || unit === 'kg' || unit === 'mg') return 'mass';
  // Name-Fallback
  if (isEggName(ing.name || ing.displayName)) return 'discrete';
  return 'mass';
}

/**
 * Stückmasse in g. Explizites pieceMassG gewinnt; sonst Name-Default für discrete.
 */
function resolvePieceMassG(ing) {
  if (!ing) return 0;
  if (ing.pieceMassG != null && Number.isFinite(Number(ing.pieceMassG))) {
    return Math.max(0, Number(ing.pieceMassG));
  }
  const kind = inferUnitKind(ing);
  if (kind !== 'discrete') return 0;
  return defaultPieceMassG(ing.name || ing.displayName || '');
}

/**
 * Konvertiert Zutat → Gramm für Makro-Berechnung.
 * pinch → 0; discrete → amount × pieceMassG; volume/mass → amount (ml≈g für Wasserbasis).
 */
function ingredientAmountGrams(ing) {
  if (!ing) return 0;
  const amount = Number(ing.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const kind = inferUnitKind(ing);
  if (kind === 'pinch') return 0;
  if (kind === 'discrete') return amount * resolvePieceMassG(ing);
  const unit = String(ing.unit || '').toLowerCase();
  if (unit === 'kg') return amount * 1000;
  if (unit === 'l') return amount * 1000;
  if (unit === 'cl') return amount * 10;
  if (unit === 'mg') return amount / 1000;
  return amount;
}

/**
 * Annotiert ingredient in-place mit unitKind + pieceMassG (idempotent).
 * @returns {object} dasselbe ingredient
 */
function annotateIngredientUnits(ing) {
  if (!ing || typeof ing !== 'object') return ing;
  const kind = inferUnitKind(ing);
  ing.unitKind = kind;
  if (kind === 'discrete') {
    if (ing.pieceMassG == null || !Number.isFinite(Number(ing.pieceMassG))) {
      ing.pieceMassG = defaultPieceMassG(ing.name || ing.displayName || '');
    } else {
      ing.pieceMassG = Math.max(0, Number(ing.pieceMassG));
    }
  } else if (ing.pieceMassG != null && kind !== 'discrete') {
    delete ing.pieceMassG;
  }
  return ing;
}

function annotateRecipeIngredientUnits(recipe) {
  if (!recipe || typeof recipe !== 'object') return 0;
  let n = 0;
  ['ingredients', 'finalIngredients'].forEach(function (field) {
    const list = recipe[field];
    if (!Array.isArray(list)) return;
    list.forEach(function (ing) {
      if (!ing) return;
      annotateIngredientUnits(ing);
      n += 1;
    });
  });
  return n;
}

module.exports = {
  UNIT_KINDS: UNIT_KINDS,
  DISCRETE_PIECE_MASS_G: DISCRETE_PIECE_MASS_G,
  isEggName: isEggName,
  defaultPieceMassG: defaultPieceMassG,
  inferUnitKind: inferUnitKind,
  resolvePieceMassG: resolvePieceMassG,
  ingredientAmountGrams: ingredientAmountGrams,
  annotateIngredientUnits: annotateIngredientUnits,
  annotateRecipeIngredientUnits: annotateRecipeIngredientUnits,
};
