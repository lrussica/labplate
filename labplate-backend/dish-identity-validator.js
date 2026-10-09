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
  // 3a. Klammer-Inhalt als Einzelkandidaten splitten
  //     'gemischtes ofengemuese (karotten, zucchini, paprika)'
  //     -> 'karotten', 'zucchini', 'paprika'
  const parenMatch = normSpaced.match(/\(([^)]+)\)/);
  if (parenMatch) {
    const inner = parenMatch[1].split(/[,;]+/).map(s => s.trim()).filter(Boolean);
    for (const part of inner) {
      if (!part) continue;
      out.add(part);
      out.add(part.replace(/\s+/g, '_'));
    }
    // Auch der Kopf ohne Klammer als eigene Variante
    const head = normSpaced.replace(/\([^)]+\)/g, ' ').replace(/\s+/g, ' ').trim();
    if (head) {
      out.add(head);
      out.add(head.replace(/\s+/g, '_'));
      // Kopf adjektiv-gestrippt
      const headStripped = head.replace(/^(gemischtes|gemischte|gemischter|frische|frischer|frisches|feine|feiner|feines|grobe|grober|grobes)\s+/i, '').trim();
      if (headStripped && headStripped !== head) {
        out.add(headStripped);
        out.add(headStripped.replace(/\s+/g, '_'));
      }
    }
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

/**
 * Naehrwert-Beitrag einer Zutat schaetzen.
 * Nutzt Kandidaten-Kette: yamlId -> Catalog-Key -> Alias -> Catalog.
 * Menge in g oder ml wird 1:1 gerechnet; prise/messerspitze/stk = 0.
 */
function estimateProtein(ing, candidateSets, catalog) {
  if (!ing || typeof ing !== 'object') return 0;
  const amount = Number(ing.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const unit = String(ing.unit || '').toLowerCase();
  if (unit === 'prise' || unit === 'messerspitze' || unit === 'stk') return 0;

  // Direkter Catalog-Hit aus der Zutat selbst
  if (ing._catalogKey && catalog.CATALOG[ing._catalogKey]) {
    const e = catalog.CATALOG[ing._catalogKey];
    if (e.per100g && Number.isFinite(e.per100g.protein)) {
      return amount * e.per100g.protein / 100;
    }
  }
  // Fallback: Kandidaten-Kette
  const cands = candidateSets || [];
  for (const cand of cands) {
    const hit = catalog.CATALOG[cand];
    if (hit && hit.per100g && Number.isFinite(hit.per100g.protein)) {
      return amount * hit.per100g.protein / 100;
    }
  }
  return 0;
}

/**
 * Kern-Regel gegen Protein-Stuffing:
 * Wenn Protein aus tolerated-Zutaten das Protein aus core-Zutaten
 * um mehr als Faktor 1.5 uebersteigt, ist das Gericht kein
 * klassisches Rezept mehr, sondern eine proteinoptimierte Variante.
 *
 * Beispiele:
 *   Spaghetti + Tomate + 125g Haehnchen + 40g Tofu:
 *     core ~14g, tolerated ~35g, Faktor 2.5 -> Block
 *   Carbonara (Ei + Pecorino + Guanciale toleriert):
 *     core ~52g, tolerated ~49g, Faktor 0.94 -> OK
 */
function checkCoreShare(archetype, recipe, candidateSets, catalog) {
  const core = archetype.core || {};
  const tolerated = archetype.tolerated || {};
  const coreIds = new Set();
  const tolIds = new Set();

  function collectIds(map, target) {
    for (const slotDef of Object.values(map)) {
      if (!slotDef || !slotDef.allowed) continue;
      const a = slotDef.allowed;
      if (Array.isArray(a)) a.forEach(x => target.add(x));
      else Object.keys(a).forEach(x => target.add(x));
    }
  }
  collectIds(core, coreIds);
  collectIds(tolerated, tolIds);

  // Set um Alias-Targets erweitern: 'chicken' -> 'chicken_breast'
  function expandSet(set) {
    const expanded = new Set(set);
    for (const id of set) {
      const r = loader.resolveId(id);
      if (r && r.target) expanded.add(r.target);
      if (r && r.catalog_key) expanded.add(r.catalog_key);
    }
    return expanded;
  }
  const coreIdsExpanded = expandSet(coreIds);
  const tolIdsExpanded = expandSet(tolIds);

  function isInSet(cands, set) {
    for (const c of cands) {
      if (set.has(c)) return true;
      const r = loader.resolveId(c);
      if (r && r.target && set.has(r.target)) return true;
      if (r && r.catalog_key && set.has(r.catalog_key)) return true;
    }
    return false;
  }

  let coreProtein = 0;
  let tolProtein = 0;
  for (let i = 0; i < recipe.ingredients.length; i++) {
    const ing = recipe.ingredients[i];
    const cands = candidateSets[i] || [];
    const p = estimateProtein(ing, cands, catalog);
    if (p <= 0) continue;
    if (isInSet(cands, coreIdsExpanded)) coreProtein += p;
    else if (isInSet(cands, tolIdsExpanded)) tolProtein += p;
    // Zutaten weder core noch tolerated (z.B. basic seasoning) ignoriert
  }

  const total = coreProtein + tolProtein;
  if (total < 15) return []; // zu wenig Protein fuers Rezept — keine Aussage
  if (coreProtein <= 0) return []; // keine core-Protein — Sonderfall, andere Regel greift

  const factor = tolProtein / coreProtein;
  if (factor > 1.5) {
    return [{
      code: 'core_protein_dominance',
      severity: SEV_BLOCK,
      detail: 'Protein aus tolerated-Zutaten uebersteigt Protein aus ' +
              'core-Zutaten um Faktor ' + factor.toFixed(2) +
              ' (' + tolProtein.toFixed(1) + 'g tolerated vs ' +
              coreProtein.toFixed(1) + 'g core). Das ist eine ' +
              'proteinoptimierte Variante, nicht das klassische Gericht.',
    }];
  }
  return [];
}

/**
 * Prueft, ob jede Zutat im Rezept in irgendeinem Slot von
 * core.allowed oder tolerated.allowed steht.
 *
 * Erfundene Zutaten (z.B. Linsen in A1 'Spaghetti mit Tomatensoße')
 * sind damit blockierbar, unabhaengig von Naehrwerten.
 *
 * SEVERITY_BLOCK, wenn die Zutat auch nicht in Registry als
 * 'nutrient' oder 'alias' mit Ziel in allowed steht.
 */
function checkProfileFit(archetype, recipe, candidateSets, extraAllowed) {
  const violations = [];
  const allAllowed = new Set();
  if (extraAllowed) {
    for (const id of extraAllowed) allAllowed.add(id);
  }
  function collect(map) {
    for (const slotDef of Object.values(map || {})) {
      if (!slotDef || !slotDef.allowed) continue;
      const a = slotDef.allowed;
      if (Array.isArray(a)) a.forEach(x => allAllowed.add(x));
      else Object.keys(a).forEach(x => allAllowed.add(x));
    }
  }
  collect(archetype.core);
  collect(archetype.tolerated);
  collect(archetype.variants); // Varianten-Additions zaehlen mit

  // Alias-Targets expandieren
  const expanded = new Set(allAllowed);
  for (const id of allAllowed) {
    const r = loader.resolveId(id);
    if (r && r.target) expanded.add(r.target);
    if (r && r.catalog_key) expanded.add(r.catalog_key);
  }

  // Whitelist generischer Zutaten (Salz, Wasser, Pfeffer, Oel)
  const BASIC = new Set([
    'salt', 'water', 'black_pepper', 'white_pepper', 'pepper',
    'olive_oil', 'sunflower_oil', 'rapeseed_oil',
  ]);

  for (let i = 0; i < recipe.ingredients.length; i++) {
    const ing = recipe.ingredients[i];
    const cands = candidateSets[i] || [];
    if (cands.length === 0) continue;

    let matched = false;
    for (const c of cands) {
      if (expanded.has(c)) { matched = true; break; }
      if (BASIC.has(c)) { matched = true; break; }
      const r = loader.resolveId(c);
      if (r) {
        if (r.target && expanded.has(r.target)) { matched = true; break; }
        if (r.catalog_key && expanded.has(r.catalog_key)) { matched = true; break; }
      }
    }
    if (!matched) {
      violations.push({
        code: 'unknown_to_profile',
        severity: SEV_BLOCK,
        detail: 'Zutat "' + (ing.name || cands[0]) +
                '" steht in keinem core- oder tolerated-Slot dieses Profils. ' +
                'Erfundene Zutat, kein klassischer Bestandteil.',
      });
    }
  }
  return violations;
}

/**
 * Prueft ein Rezept gegen ein Composite-Profil (Pesto, Amatriciana,
 * Marinara, Napoletana, Arrabbiata, Cacio e Pepe).
 *
 * Nur aufgerufen, wenn der Resolver ein Composite erkannt hat
 * (z.B. "Spaghetti all'Amatriciana" -> compositeId='amatriciana').
 *
 * Prueft analog zur Archetyp-Pruefung, aber gegen das Composite-YAML:
 *   - jeder core-Slot muss befuellt sein
 *   - forbidden-Zutaten duerfen nicht vorkommen
 *   - Zutaten ausserhalb von core+tolerated -> unknown_to_composite
 */
function validateComposite(compositeId, recipe) {
  const compositeLoader = require('./composite-loader');
  const catalog = require('./nutri-catalog');
  const composite = compositeLoader.loadComposite(compositeId);

  const violations = [];
  const candidateSets = recipe.ingredients.map(ing =>
    ingredientCandidates(ing, catalog));

  // Alle allowed-IDs aus core + tolerated sammeln
  const allAllowed = new Set();
  const coreIds = new Set();
  function collect(map, target) {
    for (const slotDef of Object.values(map || {})) {
      if (!slotDef || !slotDef.allowed) continue;
      const a = slotDef.allowed;
      const arr = Array.isArray(a) ? a : Object.keys(a);
      arr.forEach(x => { target.add(x); allAllowed.add(x); });
    }
  }
  collect(composite.core, coreIds);
  collect(composite.tolerated, allAllowed);
  // Core-IDs auch in allAllowed (sonst doppelt sammeln)
  coreIds.forEach(x => allAllowed.add(x));

  // Alias-Targets expandieren
  const expandSet = (set) => {
    const expanded = new Set(set);
    for (const id of set) {
      const r = loader.resolveId(id);
      if (r && r.target) expanded.add(r.target);
      if (r && r.catalog_key) expanded.add(r.catalog_key);
    }
    return expanded;
  };
  const coreExpanded = expandSet(coreIds);
  const allExpanded = expandSet(allAllowed);

  const BASIC = new Set([
    'salt', 'water', 'black_pepper', 'white_pepper', 'pepper',
    'pasta_dry', 'spaghetti', 'penne', 'rigatoni', 'fusilli',
    'tagliatelle', 'linguine', 'farfalle', 'orecchiette', 'bucatini',
    'conchiglie', 'gemelli', 'trofie', 'fettuccine', 'pappardelle',
    'ziti', 'cavatappi', 'elbow_macaroni', 'noodle',
  ]);

  // matchesSet: nur echte Zutaten. BASIC-Kandidaten zaehlen nicht als
  // Slot-Fueller, sondern werden bei der Core-Pruefung ausgefiltert.
  function matchesSet(cands, set) {
    for (const c of cands) {
      if (set.has(c)) return true;
      const r = loader.resolveId(c);
      if (r && r.target && set.has(r.target)) return true;
      if (r && r.catalog_key && set.has(r.catalog_key)) return true;
    }
    return false;
  }

  // 1. core-Slots pruefen
  //    matchesSet prueft nur echte Slot-Zugehoerigkeit, keine BASIC-Shortcuts.
  for (const [slotName, slotDef] of Object.entries(composite.core || {})) {
    let filled = false;
    const slotSet = expandSet(new Set(
      Array.isArray(slotDef.allowed) ? slotDef.allowed : Object.keys(slotDef.allowed || {})
    ));
    for (const cands of candidateSets) {
      if (matchesSet(cands, slotSet)) { filled = true; break; }
    }
    if (!filled) {
      violations.push({
        code: 'composite_core_missing',
        severity: SEV_BLOCK,
        detail: 'Composite "' + compositeId + '": core-Slot "' + slotName + '" nicht befuellt',
      });
    }
  }

  // 2. forbidden pruefen (harte Blocker)
  //    Plus separater Check fuer tolerated-Slots mit role=technique
  //    und amount_g-Limit (Nutzer-Lehre 9. Okt: "Olivenöl als
  //    Anbrat-Fett erlaubt, aber nicht als Sauce-Fett").
  const forbidden = composite.forbidden || [];

  const techniqueSlots = [];
  for (const slotDef of Object.values(composite.tolerated || {})) {
    if (!slotDef || !slotDef.allowed) continue;
    const roles = slotDef.roles || [];
    if (!roles.includes('technique')) continue;
    const allowed = Array.isArray(slotDef.allowed)
      ? slotDef.allowed : Object.keys(slotDef.allowed);
    const amountG = slotDef.amount_g || [0, 0];
    techniqueSlots.push({
      allowed: expandSet(new Set(allowed)),
      maxG: Number(amountG[1]) || 0,
      notes: slotDef.notes || '',
    });
  }

  function matchesTechniqueSlot(cands) {
    for (const slot of techniqueSlots) {
      for (const c of cands) {
        if (slot.allowed.has(c)) return slot;
        const r = loader.resolveId(c);
        if (r && r.target && slot.allowed.has(r.target)) return slot;
        if (r && r.catalog_key && slot.allowed.has(r.catalog_key)) return slot;
      }
    }
    return null;
  }

  for (let i = 0; i < recipe.ingredients.length; i++) {
    const ing = recipe.ingredients[i];
    const cands = candidateSets[i];

    // (a) Harte Blocker
    let forbiddenHit = null;
    for (const c of cands) {
      if (forbidden.includes(c)) { forbiddenHit = c; break; }
      const r = loader.resolveId(c);
      if (r && r.target && forbidden.includes(r.target)) { forbiddenHit = r.target; break; }
    }
    if (forbiddenHit) {
      violations.push({
        code: 'composite_forbidden_used',
        severity: SEV_BLOCK,
        detail: 'Composite "' + compositeId + '": forbidden-Zutat ' + forbiddenHit + ' (' + (ing.name || '?') + ')',
      });
      continue;
    }

    // (b) Technik-Slot mit Mengenlimit
    const slot = matchesTechniqueSlot(cands);
    if (slot && slot.maxG > 0) {
      const amount = Number(ing.amount) || 0;
      if (amount <= 0) continue; // Prise/Messerspitze oder unbestimmt
      if (amount > slot.maxG) {
        violations.push({
          code: 'technique_fat_excess',
          severity: SEV_BLOCK,
          detail: 'Composite "' + compositeId + '": ' + (ing.name || cands[0]) +
                  ' (' + amount + 'g) ueberschreitet das Technik-Limit (' +
                  slot.maxG + 'g). Das verschiebt das Profil.',
        });
      } else {
        violations.push({
          code: 'technique_fat_deviation',
          severity: SEV_WARN,
          detail: 'Composite "' + compositeId + '": ' + (ing.name || cands[0]) +
                  ' als technisches Anbrat-Fett (' + amount + 'g von max ' +
                  slot.maxG + 'g). Nicht traditionell erforderlich; ' +
                  (slot.notes || 'Guanciale-Fett bevorzugt.'),
        });
      }
    }
  }

  // 3. unknown_to_composite (Warnung, kein Block)
  //    BASIC (Pasta, Wasser, Salz, Pfeffer) wird komplett uebersprungen,
  //    wenn mindestens ein Kandidat in BASIC steht. Sonst wuerde z.B.
  //    "Salz" mit Kandidaten ['salz','salt'] getriggert, weil nur
  //    'salt' in BASIC ist und 'salz' nicht matcht.
  for (let i = 0; i < recipe.ingredients.length; i++) {
    const cands = candidateSets[i];
    if (cands.some(x => BASIC.has(x))) continue;
    if (!matchesSet(cands, allExpanded)) {
      violations.push({
        code: 'unknown_to_composite',
        severity: SEV_WARN,
        detail: 'Composite "' + compositeId + '": "' + (recipe.ingredients[i].name || cands[0]) +
                '" steht in keinem Slot',
      });
    }
  }

  // 4. Mengen-Check gegen die Composite-amount_g-Bereiche
  violations.push(...checkAmountRanges('Composite ' + compositeId, composite, recipe, candidateSets));

  const hasBlock = violations.some(v => v.severity === SEV_BLOCK);
  return { ok: !hasBlock, violations };
}

/**
 * Sammelt Mengenbereiche pro Zutat aus einem Profil (Archetyp oder Composite).
 * Unterstuetzt drei Formen:
 *   a) slot: { allowed: [...], amount_g: [min, max] }
 *   b) slot: { allowed: [...], amount_g: { id: [min,max] } }
 *   c) slot: { allowed: { id: { amount_g: [min,max] } } }
 */
function buildRangeIndex(profile) {
  const rangeById = new Map();

  function addSlot(slotName, slotDef) {
    if (!slotDef) return;
    const allowed = slotDef.allowed;
    const slotAmount = slotDef.amount_g;

    // Merge-Helper: wenn eine Zutat in mehreren Slots vorkommt,
    // nehmen wir den weiteren Bereich (kleinere min, groessere max).
    function put(id, min, max) {
      if (rangeById.has(id)) {
        const old = rangeById.get(id);
        const mergedMin = (old.min == null || min == null) ? (old.min == null ? min : old.min) : Math.min(old.min, min);
        const mergedMax = (old.max == null || max == null) ? (old.max == null ? max : old.max) : Math.max(old.max, max);
        rangeById.set(id, { min: mergedMin, max: mergedMax, slotName: old.slotName + '+' + slotName });
        return;
      }
      rangeById.set(id, { min, max, slotName });
    }

    if (Array.isArray(allowed)) {
      let min = null, max = null;
      if (Array.isArray(slotAmount)) { min = slotAmount[0]; max = slotAmount[1]; }
      for (const id of allowed) put(id, min, max);
    } else if (allowed && typeof allowed === 'object') {
      for (const [id, itemDef] of Object.entries(allowed)) {
        const itemAmount = (itemDef && itemDef.amount_g) || slotAmount;
        let min = null, max = null;
        if (Array.isArray(itemAmount)) { min = itemAmount[0]; max = itemAmount[1]; }
        put(id, min, max);
      }
    }
  }

  for (const [name, def] of Object.entries(profile.core || {})) addSlot(name, def);
  for (const [name, def] of Object.entries(profile.tolerated || {})) addSlot(name, def);

  const expanded = new Map(rangeById);
  for (const [id, info] of expanded) {
    const r = loader.resolveId(id);
    if (r && r.target && !expanded.has(r.target)) expanded.set(r.target, info);
    if (r && r.catalog_key && !expanded.has(r.catalog_key)) expanded.set(r.catalog_key, info);
  }
  return expanded;
}

/**
 * Prueft Mengen pro Portion gegen die erlaubten Bereiche im Profil.
 * Rechnet amount / servings.
 *
 * Schwellen:
 *   < 50% von min     -> BLOCK  amount_out_of_range
 *   < 80% von min     -> WARN   amount_near_boundary
 *   > 150% von max    -> BLOCK  amount_out_of_range
 *   > 120% von max    -> WARN   amount_near_boundary
 */
function checkAmountRanges(profileName, profile, recipe, candidateSets) {
  const violations = [];
  const rangeById = buildRangeIndex(profile);
  const servings = Math.max(1, Number(recipe.servings) || 1);

  for (let i = 0; i < recipe.ingredients.length; i++) {
    const ing = recipe.ingredients[i];
    const unit = String(ing.unit || '').toLowerCase();
    if (unit === 'prise' || unit === 'messerspitze' || unit === 'stk') continue;
    const amount = Number(ing.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const cands = candidateSets[i] || [];
    let info = null;
    for (const c of cands) {
      if (rangeById.has(c)) { info = rangeById.get(c); break; }
    }
    if (!info || info.min == null || info.max == null) continue;

    const perServing = amount / servings;
    const min = Number(info.min);
    const max = Number(info.max);

    if (perServing < min * 0.5) {
      violations.push({
        code: 'amount_out_of_range',
        severity: SEV_BLOCK,
        detail: profileName + ': ' + (ing.name || cands[0]) +
                ' bei ' + perServing.toFixed(1) + ' g/Portion, Profil erwartet ' +
                min + '-' + max + ' g.',
      });
    } else if (perServing < min * 0.85) {
      violations.push({
        code: 'amount_near_boundary',
        severity: SEV_WARN,
        detail: profileName + ': ' + (ing.name || cands[0]) +
                ' bei ' + perServing.toFixed(1) + ' g/Portion, unterer Rand ' +
                min + '-' + max + ' g.',
      });
    } else if (perServing > max * 1.5) {
      violations.push({
        code: 'amount_out_of_range',
        severity: SEV_BLOCK,
        detail: profileName + ': ' + (ing.name || cands[0]) +
                ' bei ' + perServing.toFixed(1) + ' g/Portion, Profil erlaubt ' +
                min + '-' + max + ' g.',
      });
    } else if (perServing > max * 1.15) {
      violations.push({
        code: 'amount_near_boundary',
        severity: SEV_WARN,
        detail: profileName + ': ' + (ing.name || cands[0]) +
                ' bei ' + perServing.toFixed(1) + ' g/Portion, oberer Rand ' +
                min + '-' + max + ' g.',
      });
    }
  }
  return violations;
}

function validate(archetypeId, recipe, options) {
  const opts = Object.assign({ strict: true }, options || {});
  // Composite-Bridge: erlaubte IDs aus einem Composite-Profil
  // werden als zusaetzlich legitim akzeptiert.
  const extraAllowed = new Set(opts.extraAllowedIds || []);
  const skipCoreShare = !!opts.skipCoreShare;
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

  // 3b. Protein-Dominanz pruefen (Block E, 2026-10-09, spaet)
  //     Bei Composite-Profilen uebernimmt das Composite die
  //     Protein-Bewertung, der Archetyp-Grenzwert greift nicht.
  if (!skipCoreShare) {
    violations.push(...checkCoreShare(archetype, recipe, candidateSets, catalog));
  }

  // 3c. Profil-Treue: jede Zutat muss in core/tolerated erlaubt sein,
  //     ausser sie kommt aus einem Composite-Profil (extraAllowed).
  violations.push(...checkProfileFit(archetype, recipe, candidateSets, extraAllowed));

  // 3d. Mengen-Check gegen Archetyp-amount_g-Bereiche.
  //     Bei Composite uebernimmt das Composite, dann hier uebersprungen.
  if (!opts.skipAmountRanges) {
    violations.push(...checkAmountRanges('Archetyp ' + archetypeId, archetype, recipe, candidateSets));
  }

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

function getCompositeAllowedIds(compositeId) {
  const compositeLoader = require('./composite-loader');
  const composite = compositeLoader.loadComposite(compositeId);
  const ids = new Set();
  function collect(map) {
    for (const slotDef of Object.values(map || {})) {
      if (!slotDef || !slotDef.allowed) continue;
      const a = slotDef.allowed;
      const arr = Array.isArray(a) ? a : Object.keys(a);
      arr.forEach(x => ids.add(x));
    }
  }
  collect(composite.core);
  collect(composite.tolerated);
  // Alias-Targets auch aufnehmen
  for (const id of Array.from(ids)) {
    const r = loader.resolveId(id);
    if (r && r.target) ids.add(r.target);
    if (r && r.catalog_key) ids.add(r.catalog_key);
  }
  return Array.from(ids);
}

module.exports = { validate, validateComposite, getCompositeAllowedIds };
