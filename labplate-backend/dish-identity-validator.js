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
  if (!ing || typeof ing !== 'object') return [];

  const raw = (ing.name || ing.displayName) || '';
  const norm = normalizeName(raw);
  const normSpaced = String(raw).trim().toLowerCase();
  const noParens = normSpaced
    .replace(/\(.*?\)/g, ' ')
    .replace(/[,;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Bindestrich -> Leerzeichen: 'chili-flocken' -> 'chili flocken'
  const hyphenFree = noParens.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  // Adjektiv-Suffixe entfernen: 'rote chilischote fein gehackt' -> 'rote chilischote'
  const ADJ = /\b(fein|grob|fein_gehackt|grob_gehackt|gehackt|geschnitten|gewuerfelt|gerieben|gehobelt|frisch|getrocknet|gemahlen|ganz|halbiert|geviertelt|gewaschen|geputzt|abgetropft|flocken|blaetter|blaetter\b|koerner|samen|pulver|paste|mark|saft|schale|filet|stuecke|streifen|wuerfel|scheiben)\b/g;
  const stripped = hyphenFree.replace(ADJ, ' ').replace(/\s+/g, ' ').trim();

  // 1. Direkt aus Recipe-Metadaten (hoechste Prioritaet):
  //    die v92-Pipeline liefert _catalogKey und _v92_id mit.
  if (ing._catalogKey) out.add(String(ing._catalogKey));
  if (ing.catalogKey) out.add(String(ing.catalogKey));
  if (ing.yamlId) out.add(String(ing.yamlId));
  if (ing._yamlId) out.add(String(ing._yamlId));

  // 2. Normalisierter Name (mit Underscores)
  if (norm) out.add(norm);
  // 3. Klammersubstitution: "Spaghetti (trocken)" -> "spaghetti"
  if (noParens) {
    out.add(noParens);
    out.add(noParens.replace(/\s+/g, '_'));
  }
  // 3b. Bindestrich-freie und adjektiv-gestrippte Varianten
  if (hyphenFree && hyphenFree !== noParens) {
    out.add(hyphenFree);
    out.add(hyphenFree.replace(/\s+/g, '_'));
  }
  if (stripped && stripped !== noParens && stripped !== hyphenFree) {
    out.add(stripped);
    out.add(stripped.replace(/\s+/g, '_'));
    // Farbadjektive entfernen: "rote chilischote" -> "chilischote"
    const noColor = stripped.replace(/^(rote|roter|rotes|roten|gruene|gruener|gruenes|gruenen|gelbe|gelber|gelbes|gelben|schwarze|schwarzer|schwarzes|schwarzen|weisse|weisser|weisses|weissen|reife|reifer|reifes|reifen)\s+/i, '').trim();
    if (noColor && noColor !== stripped) {
      out.add(noColor);
      out.add(noColor.replace(/\s+/g, '_'));
    }
  }
  // 4. Einzelwort-Variante ohne Klammer-Inhalt
  if (noParens && noParens !== normSpaced) {
    const first = noParens.split(/\s+/)[0];
    if (first) out.add(first);
  }

  // 5. Catalog-Lookup: mit Roh-Name und Klammer-Rest
  for (const probe of [raw, normSpaced, noParens]) {
    if (!probe) continue;
    try {
      const hit = catalog.lookupCatalog(probe);
      if (hit && hit.key) out.add(hit.key);
    } catch (_) { /* ignore */ }
  }

  // 6. Registry-Aufloesung fuer alle Kandidaten
  const expanded = new Set(out);
  for (const c of expanded) {
    const r = loader.resolveId(c);
    if (r) {
      if (r.target) out.add(r.target);
      if (r.catalog_key) out.add(r.catalog_key);
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

function checkSidePolicy(archetype, recipe, candidateSets) {
  const policy = archetype.side_policy;
  const requested = recipe && (recipe.side_requested === true ||
                     recipe.side_policy_used === 'requested');

  // Beilage-IDs aus tolerated.side.allowed sammeln
  const sideAllowed = new Set();
  const tolerated = archetype.tolerated || {};
  const sideDef = tolerated.side;
  if (sideDef && sideDef.allowed) {
    const a = sideDef.allowed;
    if (Array.isArray(a)) a.forEach(x => sideAllowed.add(x));
    else Object.keys(a).forEach(x => sideAllowed.add(x));
  }

  // Prefix-Match: potato <-> potato_boiled, rice <-> rice_cooked
  function sideMatch(candidate) {
    if (!candidate) return false;
    if (sideAllowed.has(candidate)) return true;
    for (const allowed of sideAllowed) {
      if (allowed.startsWith(candidate + '_') || candidate.startsWith(allowed + '_')) return true;
    }
    return false;
  }

  // Eine Zutat gilt als Beilage, wenn:
  //   1. role === 'side' oder isSide === true (explizite Markierung)
  //   2. ihr Kandidaten-Set eine ID aus sideAllowed enthaelt (inkl. Prefix)
  const hasSide = recipe && Array.isArray(recipe.ingredients)
    && recipe.ingredients.some((ing, i) => {
      if (ing.role === 'side' || ing.isSide === true) return true;
      if (!sideAllowed.size) return false;
      const cands = candidateSets ? candidateSets[i] : [];
      for (const c of cands) {
        if (sideMatch(c)) return true;
        const r = loader.resolveId(c);
        if (r && r.target && sideMatch(r.target)) return true;
        if (r && r.catalog_key && sideMatch(r.catalog_key)) return true;
      }
      return false;
    });

  if (policy === 'only-if-requested' && hasSide && !requested) {
    return [{ code: 'side_not_requested', severity: SEV_BLOCK,
              detail: 'Beilage im Rezept (aus tolerated.side.allowed), aber side_policy=only-if-requested' }];
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
  violations.push(...checkSidePolicy(archetype, recipe, candidateSets));

  // 4. unknown (nur warn)
  //    Bekannt = entweder Registry kennt den Kandidaten ODER Catalog hat ihn.
  const catalogKeys = new Set(Object.keys(catalog.CATALOG || {}));
  for (let i = 0; i < recipe.ingredients.length; i++) {
    const cands = candidateSets[i];
    const known = cands.some(c =>
      loader.resolveId(c) ||
      catalogKeys.has(c) ||
      (catalog.lookupCatalog && (() => { try { return !!catalog.lookupCatalog(c); } catch (_) { return false; } })())
    );
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
