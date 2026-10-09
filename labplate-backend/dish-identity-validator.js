'use strict';
/**
 * dish-identity-validator.js
 * ===========================
 * Block-E-Kernpruefung: validiert ein generiertes Rezept gegen den
 * geladenen Archetyp.
 *
 * Verhindert den iPhone-Test-Bug:
 *   "Spaghetti mit Tomatensauce" + Haehnchen + Tofu + Haferflocken
 *   -> forbidden (oats/haferflocken) verletzt
 *   -> Rezept wird abgelehnt, nicht stillschweigend freigegeben.
 *
 * Namensraeume:
 *   YAML-ID-Space   : was in core.allowed / forbidden / tolerated steht
 *                     (z.B. "spaghetti", "tomato_sauce", "olive_oil")
 *   Catalog-Key     : was nutri-catalog.js als Key fuehrt
 *                     (z.B. "pasta_dry", "olive_oil")
 *   Registry        : verbindet beide (id-registry.json)
 *
 * Eine generierte Zutat kann verschiedene Formen haben. Wir loesen sie
 * auf eine Kandidatenmenge auf und pruefen jeden Kandidaten gegen die
 * allowed-Liste. Ein Treffer genuegt.
 */
const loader = require('./archetype-loader');

const SEV_BLOCK = 'block';
const SEV_WARN  = 'warn';

function normalizeName(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, '_');
}

/**
 * Liefert alle bekannten IDs fuer eine generierte Zutat:
 *   1. normalisierter Name (z.B. "spaghetti")
 *   2. Catalog-Key via lookupCatalog (z.B. "pasta_dry")
 *   3. Registry-Alias-Target (z.B. "pasta_dry")
 *   4. Registry-Catalog-Key (falls nutrient)
 */
function ingredientCandidates(ing, catalog) {
  const out = new Set();
  const raw = (ing && (ing.name || ing.displayName)) || '';
  const norm = normalizeName(raw);
  if (norm) out.add(norm);
  if (ing && ing.yamlId) out.add(normalizeName(ing.yamlId));
  if (ing && ing.catalogKey) out.add(normalizeName(ing.catalogKey));

  // Catalog-Lookup
  if (raw) {
    try {
      const hit = catalog.lookupCatalog(raw);
      if (hit && hit.key) out.add(hit.key);
    } catch (_) { /* ignore */ }
  }

  // Registry-Aufloesung
  const reg = loader.resolveId(norm);
  if (reg) {
    if (reg.target) out.add(reg.target);
    if (reg.catalog_key) out.add(reg.catalog_key);
  }
  // Ebenso fuer die expliziten Felder
  for (const cand of ['yamlId', 'catalogKey']) {
    if (ing && ing[cand]) {
      const r = loader.resolveId(normalizeName(ing[cand]));
      if (r) {
        if (r.target) out.add(r.target);
        if (r.catalog_key) out.add(r.catalog_key);
      }
    }
  }

  return Array.from(out);
}

function allowedIdSet(slotDef) {
  const a = slotDef && slotDef.allowed;
  if (!a) return new Set();
  if (Array.isArray(a)) return new Set(a);
  return new Set(Object.keys(a));
}

function isCoreSlotFilled(slotDef, ingredientCandidateSets) {
  const allowed = allowedIdSet(slotDef);
  if (allowed.size === 0) return false;
  for (const cands of ingredientCandidateSets) {
    for (const c of cands) {
      if (allowed.has(c)) return true;
      // Alias-Target des Kandidaten auch pruefen
      const r = loader.resolveId(c);
      if (r && r.target && allowed.has(r.target)) return true;
    }
  }
  return false;
}

function collectForbiddenFromRecipe(archetype, ingredientCandidateSets) {
  const f = new Set(archetype.forbidden || []);
  const used = new Set();
  for (const cands of ingredientCandidateSets) {
    for (const c of cands) {
      if (f.has(c)) used.add(c);
      const r = loader.resolveId(c);
      if (r && r.kind === 'forbidden') used.add(c);
    }
  }
  return Array.from(used);
}

function checkSidePolicy(archetype, recipe) {
  const policy = archetype.side_policy;
  const requested = recipe && (recipe.side_requested === true ||
                     recipe.side_policy_used === 'requested');
  const hasSide = recipe && Array.isArray(recipe.ingredients)
    && recipe.ingredients.some(i => i && (i.role === 'side' || i.isSide === true));

  if (policy === 'only-if-requested' && hasSide && !requested) {
    return [{ code: 'side_not_requested', severity: SEV_BLOCK,
              detail: 'Beilage im Rezept, aber side_policy=only-if-requested' }];
  }
  if (policy === 'required' && !hasSide) {
    return [{ code: 'side_missing', severity: SEV_BLOCK,
              detail: 'Beilage fehlt, side_policy=required' }];
  }
  return [];
}

function validate(archetypeId, recipe, options) {
  const opts = Object.assign({ strict: true }, options || {});
  const archetype = loader.loadArchetype(archetypeId);
  const catalog = require('./nutri-catalog');
  const violations = [];

  if (!recipe || !Array.isArray(recipe.ingredients)) {
    return { ok: false, violations: [{
      code: 'recipe_malformed', severity: SEV_BLOCK,
      detail: 'recipe.ingredients fehlt oder ist kein Array',
    }]};
  }

  const candidateSets = recipe.ingredients.map(ing =>
    ingredientCandidates(ing, catalog));

  // 1. core-Slots pruefen
  const core = archetype.core || {};
  for (const [slotName, slotDef] of Object.entries(core)) {
    if (!isCoreSlotFilled(slotDef, candidateSets)) {
      violations.push({
        code: 'core_slot_missing', severity: SEV_BLOCK,
        detail: 'core-Slot "' + slotName + '" nicht befuellt',
      });
    }
  }

  // 2. forbidden pruefen
  const used = collectForbiddenFromRecipe(archetype, candidateSets);
  for (const id of used) {
    violations.push({
      code: 'forbidden_used', severity: SEV_BLOCK,
      detail: 'forbidden-Zutat: ' + id,
    });
  }

  // 3. side_policy pruefen
  violations.push(...checkSidePolicy(archetype, recipe));

  // 4. unknown (nur warn)
  for (let i = 0; i < recipe.ingredients.length; i++) {
    const cands = candidateSets[i];
    const known = cands.some(c => loader.resolveId(c));
    if (!known) {
      violations.push({
        code: 'unknown_ingredient', severity: SEV_WARN,
        detail: 'Zutat nicht in Registry: ' + (cands[0] || '?'),
      });
    }
  }

  const hasBlock = violations.some(v => v.severity === SEV_BLOCK);
  return { ok: !hasBlock, violations };
}

module.exports = { validate };
