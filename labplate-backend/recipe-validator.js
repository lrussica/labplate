/**
 * Deterministischer Rezept-Validator (v2.0 — passend zu Prompt v9.2)
 * JS-Port von validation/recipe_validator.py — keine Prompt-Vertrauen-Prüfung.
 */
'use strict';

function ValidationResult() {
  this.ok = true;
  this.errors = [];
  this.warnings = [];
}
ValidationResult.prototype.addError = function (msg) {
  this.ok = false;
  this.errors.push(String(msg));
};
ValidationResult.prototype.addWarning = function (msg) {
  this.warnings.push(String(msg));
};

function validateKcalFormula(proteinG, fatG, nettoKhG, ballaststoffeG, kcalDeclared, tolerancePct) {
  const tol = tolerancePct == null ? 10.0 : tolerancePct;
  const kcalCalc = proteinG * 4 + nettoKhG * 4 + fatG * 9 + ballaststoffeG * 2;
  // Near-zero Sonderregel: relative %-Abweichung ist bei kcal_calc≈0 instabil
  // (Division durch 0 → fälschlich 100%, z. B. 0 vs. 0 bei magere Brühe).
  // Wenn BEIDE Seiten <20 kcal liegen, absolut ±15 kcal statt ±10% relativ.
  if (kcalCalc < 20 && Number(kcalDeclared) < 20) {
    const absDiff = Math.abs(kcalCalc - Number(kcalDeclared));
    return {
      ok: absDiff <= 15,
      kcalCalc: kcalCalc,
      abweichungPct: kcalCalc === 0 ? 0 : (absDiff / kcalCalc) * 100,
    };
  }
  if (kcalCalc === 0) return { ok: false, kcalCalc: 0, abweichungPct: 100 };
  const abweichungPct = (Math.abs(kcalCalc - kcalDeclared) / kcalCalc) * 100;
  return { ok: abweichungPct <= tol, kcalCalc: kcalCalc, abweichungPct: abweichungPct };
}

function escapeRegExp(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Entfernt redundante Namen/Einheiten neben {id}-Platzhaltern, bevor das Backend
 * amount+unit+name einsetzt — verhindert "Salz Salz", "10ml Öl Öl", "Wasser 1000ml Wasser ml".
 */
function stripRedundantBesidePlaceholders(text, ingredientsById) {
  let out = String(text == null ? '' : text);
  const ids = Object.keys(ingredientsById || {});
  ids.forEach(function (id) {
    const ing = ingredientsById[id];
    if (!ing) return;
    const name = String(ing.name || '').trim();
    if (!name) return;
    const ph = '\\{' + id + '\\}';
    const nameRe = escapeRegExp(name);
    const unit = String(ing.unit || '').trim();
    const shortName = name.split(/[\s(,]/)[0];
    const aliases = [name];
    if (shortName && shortName.length >= 2 && shortName.toLowerCase() !== name.toLowerCase()) {
      aliases.push(shortName);
    }
    // Ei / Eier neben Ei-Platzhalter
    if (/\bei\b/i.test(name) || String(ing.unit || '') === 'stk') {
      aliases.push('Ei', 'Eier', 'egg', 'eggs');
    }
    aliases.forEach(function (alias) {
      if (!alias) return;
      const aRe = escapeRegExp(alias);
      out = out.replace(new RegExp(ph + '\\s+' + aRe + '\\b', 'gi'), '{' + id + '}');
      out = out.replace(new RegExp('\\b' + aRe + '\\s+' + ph, 'gi'), '{' + id + '}');
      if (unit && /^(ml|g|stk|l)$/i.test(unit)) {
        const uRe = escapeRegExp(unit);
        out = out.replace(new RegExp(ph + '\\s*' + uRe + '\\b', 'gi'), '{' + id + '}');
        out = out.replace(new RegExp('\\b' + aRe + '\\s+' + ph + '\\s*' + uRe + '\\b', 'gi'), '{' + id + '}');
      }
    });
  });
  return out;
}

/**
 * Ersetzt {0001} durch Anzeige-Token aus der Zutatenliste.
 * @param {string} text
 * @param {object} ingredientsById
 * @param {{ nameOnly?: boolean }} [opts] nameOnly=true → nur Zutatname (chef_analysis)
 */
function resolvePlaceholders(text, ingredientsById, opts) {
  const nameOnly = !!(opts && opts.nameOnly);
  const byId = ingredientsById || {};
  let out = stripRedundantBesidePlaceholders(text, byId);
  out = out.replace(/\{(\d{4})\}/g, function (_m, id) {
    const ing = byId[id];
    if (!ing) return '{' + id + '}';
    const name = String(ing.name || '').trim();
    if (nameOnly) return name || '{' + id + '}';
    const amount = ing.amount;
    const unit = ing.unit || '';
    if (amount == null || amount === 0) return name;
    return String(amount) + (unit ? unit : '') + ' ' + name;
  });
  // Nach Expansion: doppelte Namen / hängende Einheiten glätten
  Object.keys(byId).forEach(function (id) {
    const ing = byId[id];
    if (!ing) return;
    const name = String(ing.name || '').trim();
    if (!name) return;
    const nameRe = escapeRegExp(name);
    out = out.replace(new RegExp('(' + nameRe + ')(\\s+\\1)+\\b', 'gi'), '$1');
    const amount = ing.amount;
    const unit = String(ing.unit || '');
    if (amount != null && amount !== 0 && unit) {
      const token = String(amount) + unit + ' ' + name;
      const tokenRe = escapeRegExp(token);
      out = out.replace(new RegExp(tokenRe + '\\s+' + nameRe + '\\b', 'gi'), token);
      out = out.replace(new RegExp('\\b' + nameRe + '\\s+' + tokenRe, 'gi'), token);
      out = out.replace(new RegExp(tokenRe + '\\s*' + escapeRegExp(unit) + '\\b', 'gi'), token);
      out = out.replace(
        new RegExp('\\b' + nameRe + '\\s+' + escapeRegExp(String(amount) + unit) + '\\s+' + nameRe +
          '(?:\\s*' + escapeRegExp(unit) + ')?\\b', 'gi'),
        token
      );
    }
  });
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Bottom-up: nutrition aus ingredients (amount × Makros/100g).
 * stk → 60 g/Stück; prise/messerspitze → 0 g.
 */
function computeNutritionFromIngredients(ingredients) {
  let protein = 0;
  let fat = 0;
  let nettoKh = 0;
  let fiber = 0;
  (Array.isArray(ingredients) ? ingredients : []).forEach(function (ing) {
    if (!ing) return;
    let grams = Number(ing.amount);
    if (!Number.isFinite(grams) || grams < 0) grams = 0;
    const unit = String(ing.unit || '');
    if (unit === 'prise' || unit === 'messerspitze') grams = 0;
    else if (unit === 'stk') grams = grams * 60;
    const factor = grams / 100;
    protein += factor * Math.max(0, Number(ing.protein) || 0);
    fat += factor * Math.max(0, Number(ing.fat) || 0);
    nettoKh += factor * Math.max(0, Number(ing.netCarbs) || 0);
    fiber += factor * Math.max(0, Number(ing.fiber) || 0);
  });
  const kcalRaw = protein * 4 + nettoKh * 4 + fat * 9 + fiber * 2;
  return {
    protein_g: Math.round(protein * 10) / 10,
    fat_g: Math.round(fat * 10) / 10,
    netto_kh_g: Math.round(nettoKh * 10) / 10,
    ballaststoffe_g: Math.round(fiber * 10) / 10,
    kcal: Math.round(kcalRaw / 5) * 5,
  };
}

function isEggIngredientName(name) {
  const n = String(name || '').toLowerCase();
  if (!n) return false;
  if (n.indexOf('eiweiss') >= 0 || n.indexOf('eiweiß') >= 0 || n.indexOf('eiweis') >= 0) return false;
  return /(?:^|[^a-z])ei(?:er)?(?:[^a-z]|$)/.test(n);
}

function validateNoFreeNumbersInProse(steps, garnish, chefAnalysis, ingredients) {
  const problems = [];
  const unitPattern = /\d+[.,]?\d*\s*(ml|g|kg|l|el|tl)\b/i;
  const list = Array.isArray(steps) ? steps : [];

  for (let i = 0; i < list.length; i++) {
    const step = list[i] || {};
    const content = String(step.content || '');
    if (unitPattern.test(content)) {
      problems.push(
        "Step " + (i + 1) + " ('" + (step.title || '') + "'): enthält eine freie Mengen-Zahl im " +
        "content-Text statt eines {ingredient_id}-Platzhalters: '" + content + "'"
      );
    }
  }

  if (garnish && unitPattern.test(garnish)) {
    problems.push("garnish enthält eine freie Mengen-Zahl statt Platzhalter: '" + garnish + "'");
  }

  if (chefAnalysis && /\d+[.,]?\d*\s*(g|kcal|kg)\b/i.test(chefAnalysis)) {
    problems.push(
      "chef_analysis enthält eine eigene Zahl statt Verweis auf 'nutrition': '" + chefAnalysis + "'"
    );
  }

  validateChefAnalysisPlaceholderMisuse(chefAnalysis).problems.forEach(function (p) {
    problems.push(p);
  });

  const validIds = {};
  (ingredients || []).forEach(function (ing) {
    if (ing && ing.id) validIds[String(ing.id)] = true;
  });
  let allText = list.map(function (s) { return (s && s.content) || ''; }).join(' ') + ' ' + (garnish || '');
  const usedIds = {};
  const re = /\{(\d{4})\}/g;
  let m;
  while ((m = re.exec(allText))) usedIds[m[1]] = true;

  const unknown = Object.keys(usedIds).filter(function (id) { return !validIds[id]; });
  if (unknown.length) problems.push('Referenzierte ingredient_ids ohne Zutateneintrag: ' + unknown.join(', '));

  const unused = Object.keys(validIds).filter(function (id) { return !usedIds[id]; });
  if (unused.length) problems.push('Zutaten nie referenziert (evtl. überflüssig): ' + unused.join(', '));

  return { ok: problems.length === 0, problems: problems };
}

/**
 * chef_analysis: {ingredient_id}-Platzhalter nur zur Benennung von Zutaten —
 * niemals als Ersatz für Nährwert-Zahlen ("{0001} g Protein").
 */
function validateChefAnalysisPlaceholderMisuse(chefAnalysis) {
  const problems = [];
  const text = String(chefAnalysis || '');
  if (!text) return { ok: true, problems: problems };

  const nutrientToken = '(?:Protein|Fett|kcal|Kohlenhydrate|Kalorien|Netto-?KH|\\bKH\\b)';
  const patterns = [
    /\{(\d{4})\}\s*(?:g|kcal|kg)\b/gi,
    new RegExp('\\{(\\d{4})\\}.{0,15}' + nutrientToken, 'gi'),
    new RegExp(nutrientToken + '.{0,15}\\{(\\d{4})\\}', 'gi'),
  ];
  const seen = {};
  patterns.forEach(function (re) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(text))) {
      const id = m[1];
      if (!id || seen[id]) continue;
      seen[id] = true;
      problems.push(
        'chef_analysis missbraucht Zutat-Platzhalter {' + id + '} als Nährwert-Referenz — ' +
        'Platzhalter sind nur für Zutatennamen zulässig, nicht für Zahlen.'
      );
    }
  });

  return { ok: problems.length === 0, problems: problems };
}

/**
 * Fehlerklasse 3: Klartext-Grundzutat im Prosa-Text, aber kein ingredients-Eintrag.
 * Whitelist häufiger Koch-Staples; Treffer nur wenn kein Zutatenname den Stem abdeckt.
 */
const STAPLE_WHITELIST = [
  { label: 'Öl', stems: ['olivenöl', 'olivenoel', 'rapsöl', 'rapsoel', 'sonnenblumenöl', 'sonnenblumenoel', 'speiseöl', 'speiseoel', 'öl', 'oel'] },
  { label: 'Butter', stems: ['butter', 'margarine', 'ghee'] },
  { label: 'Wasser', stems: ['wasser', 'brühe', 'bruehe', 'fond'] },
  { label: 'Mehl', stems: ['mehl', 'stärke', 'staerke'] },
  { label: 'Zucker', stems: ['zucker', 'honig', 'sirup'] },
  { label: 'Ei', stems: ['eier', 'ei'] },
  { label: 'Salz', stems: ['meersalz', 'salz'] },
  { label: 'Pfeffer', stems: ['pfeffer'] },
  { label: 'Essig', stems: ['essig', 'balsamico'] },
  { label: 'Knoblauch', stems: ['knoblauch'] },
  { label: 'Zwiebel', stems: ['zwiebeln', 'zwiebel', 'schalotten', 'schalotte'] },
  { label: 'Milch', stems: ['milch', 'sahne', 'rahm'] },
];

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
    return /(?:^|[^a-z])ei(?:er)?(?:[^a-z]|$)/.test(n) && n.indexOf('eiweiss') < 0 && n.indexOf('eiweis') < 0;
  }
  return n.indexOf(st) >= 0;
}

function textMentionsStem(text, stem) {
  const t = normalizeDeAscii(text);
  const st = normalizeDeAscii(stem);
  if (!st) return false;
  if (st === 'ei' || st === 'eier') {
    // "Rührei"/"Speiseöl" nicht als freies Ei werten: Wortgrenze
    return /(?:^|[^a-z])ei(?:er)?(?:[^a-z]|$)/.test(t) && t.indexOf('eiweiss') < 0;
  }
  if (st.length <= 3) {
    return new RegExp('(?:^|[^a-z])' + st.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:[^a-z]|$)').test(t);
  }
  return t.indexOf(st) >= 0;
}

function validateUnlistedStaplesInProse(steps, garnish, ingredients) {
  const problems = [];
  const ings = Array.isArray(ingredients) ? ingredients : [];
  const list = Array.isArray(steps) ? steps : [];
  const blobs = list.map(function (s) { return String((s && s.content) || ''); });
  if (garnish) blobs.push(String(garnish));

  const coveredLabels = {};
  STAPLE_WHITELIST.forEach(function (staple) {
    const covered = ings.some(function (ing) {
      return staple.stems.some(function (stem) {
        return ingredientCoversStem((ing && ing.name) || '', stem);
      });
    });
    if (covered) coveredLabels[staple.label] = true;
  });

  const flagged = {};
  blobs.forEach(function (text, bi) {
    STAPLE_WHITELIST.forEach(function (staple) {
      if (coveredLabels[staple.label] || flagged[staple.label]) return;
      const hit = staple.stems.some(function (stem) { return textMentionsStem(text, stem); });
      if (!hit) return;
      flagged[staple.label] = true;
      const where = bi < list.length
        ? ("Step " + (bi + 1) + " ('" + ((list[bi] && list[bi].title) || '') + "')")
        : 'garnish';
      problems.push(
        "Zutat '" + staple.label + "' im Text erwähnt, aber nicht in ingredients gelistet (" + where + ")"
      );
    });
  });

  return { ok: problems.length === 0, problems: problems };
}

/** Gerinnungsempfindliche Milchprodukte (Regel 2) — Name-Heuristik. */
const COLD_SENSITIVE_STEMS = [
  'frischkäse', 'frischkaese', 'frischkase',
  'quark', 'joghurt', 'yogurt',
  'hüttenkäse', 'huettenkaese', 'huttenkase', 'cottage',
  'crème fraîche', 'creme fraiche', 'crème fraiche', 'creme fraîche',
  'mascarpone', 'schmand',
  'kokosjoghurt', 'kokos-joghurt',
];

function isColdSensitiveIngredientName(name) {
  const nl = String(name || '').toLowerCase();
  if (!nl) return false;
  // "Eiweisspulver" / "Proteinjoghurt-Ersatz" nicht pauschal — nur echte Stems
  for (let i = 0; i < COLD_SENSITIVE_STEMS.length; i++) {
    if (nl.indexOf(COLD_SENSITIVE_STEMS[i]) >= 0) return true;
  }
  return false;
}

function stepStoveLevel(step) {
  const n = Number(step && step.stove_level);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

function stepMentionsIngredientId(step, id) {
  const content = String((step && step.content) || '');
  const re = new RegExp('\\{' + String(id) + '\\}');
  return re.test(content);
}

/**
 * Mise-en-Place / Abwiegen: {id} nur gelistet, noch nicht eingearbeitet.
 * Zählt nicht als "Einführung" der sensiblen Zutat (sonst False Positive vor Hitze-Steps).
 */
function isMiseEnPlaceOnlyMention(step, id) {
  if (!stepMentionsIngredientId(step, id)) return false;
  if (stepStoveLevel(step) > 0) return false;
  const title = String((step && step.title) || '').toLowerCase();
  const content = String((step && step.content) || '').toLowerCase();
  const incorporate = /einrühr|unterheb|untermisch|vermeng|verrühr|dazugeb|hinzufüg|einarbeit|mischen|verquirl|unterrühr|geben|rühren|einarbeiten/.test(content);
  if (incorporate) return false;
  if (/mise|vorbereit|abwieg|bereitstell/.test(title)) return true;
  if (/abwieg|bereitstell|mise en place|alle zutaten/.test(content)) return true;
  return false;
}

/**
 * Ansatz B (verstärkt, ohne Schema-Änderung):
 * Nach der ersten *aktiven* {id}-Erwähnung einer gerinnungsempfindlichen Zutat
 * (nicht nur Mise-en-Place) dürfen weder dieser Step noch spätere Steps stove_level > 0 haben.
 *
 * Reine „letzte Erwähnung“-B hätte Lücken (Garnitur-Nacherwähnung nach Hitze).
 * Ansatz A (Topf-Zustand im Schema) wäre robuster, braucht aber Schema-Felder — hier vermieden.
 *
 * @returns {{ ok: boolean, problems: string[] }}
 */
function validateColdIngredientHeatSequence(recipe) {
  const problems = [];
  const r = recipe && typeof recipe === 'object' ? recipe : {};
  const ingredients = Array.isArray(r.ingredients) ? r.ingredients : [];
  const steps = Array.isArray(r.steps) ? r.steps : [];

  const sensitive = ingredients.filter(function (ing) {
    return ing && ing.id && isColdSensitiveIngredientName(ing.name);
  });
  if (!sensitive.length || !steps.length) {
    return { ok: true, problems: problems };
  }

  sensitive.forEach(function (ing) {
    const id = String(ing.id);
    const name = String(ing.name || id);
    let firstActive = -1;
    for (let i = 0; i < steps.length; i++) {
      if (!stepMentionsIngredientId(steps[i], id)) continue;
      if (isMiseEnPlaceOnlyMention(steps[i], id)) continue;
      firstActive = i;
      break;
    }
    if (firstActive < 0) return;

    for (let j = firstActive; j < steps.length; j++) {
      const stove = stepStoveLevel(steps[j]);
      if (stove <= 0) continue;
      const title = (steps[j] && steps[j].title) || '';
      if (j === firstActive && stepMentionsIngredientId(steps[j], id)) {
        problems.push(
          "Gerinnungsschutz: '" + name + "' ({" + id + "}) wird in Step " + (j + 1) +
          " ('" + title + "') bei stove_level=" + stove + " erhitzt — nur stove_level 0 und Herd AUS erlaubt"
        );
      } else {
        problems.push(
          "Gerinnungsschutz: '" + name + "' ({" + id + "}) wurde in Step " + (firstActive + 1) +
          " eingearbeitet; danach folgt Step " + (j + 1) + " ('" + title + "') mit stove_level=" +
          stove + " — Hitze nach Einrühren verboten (auch wenn die Zutat nur noch als 'Mischung' vorkommt)"
        );
      }
    }
  });

  return { ok: problems.length === 0, problems: problems };
}

/** Hauptprotein-Keywords (Fleisch, Ei, Hülsenfrüchte, …) — immer zählen. */
const PROTEIN_KEYWORDS_CORE = [
  'hähnchen', 'haehnchen', 'huhn', 'pute', 'rind', 'schwein', 'lachs', 'thunfisch', 'fisch',
  'ei', 'eier', 'tofu', 'quark', 'hüttenkäse', 'huettenkaese', 'linsen', 'kichererbsen',
  'bohnen', 'protein', 'whey', 'seitan', 'tempeh', 'garnelen', 'krabben', 'truthahn',
  'speck', 'joghurt', 'yogurt',
];

/**
 * Käse / Nüsse / Samen — nur bei nennenswerter Menge (≥ PROTEIN_SUBSTANTIAL_G).
 * Ein Spritzer Parmesan oder 5 g Topping zählt nicht als Hauptproteinquelle (Regel 4).
 */
const PROTEIN_KEYWORDS_SUBSTANTIAL = [
  // Käse (inkl. Oberbegriff + Sorten)
  'käse', 'kaese', 'gouda', 'cheddar', 'mozzarella', 'parmesan', 'feta', 'ricotta',
  'camembert', 'frischkäse', 'frischkaese', 'frischkase', 'mascarpone', 'schmand',
  // Nüsse / Samen
  'nüsse', 'nusse', 'nuss', 'mandeln', 'mandel', 'cashew', 'walnüsse', 'walnusse', 'walnuss',
  'erdnüsse', 'erdnusse', 'erdnuss', 'haselnuss', 'haselnüsse',
  'sonnenblumenkerne', 'kürbiskerne', 'kuerbiskerne', 'chiasamen', 'chia-samen',
  'leinsamen', 'leinsaat', 'pistazie', 'pistazien', 'pecan',
];

const PROTEIN_SUBSTANTIAL_G = 30;

function ingredientAmountGrams(ing) {
  const amount = Number(ing && ing.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const unit = String((ing && ing.unit) || '').toLowerCase();
  if (unit === 'prise' || unit === 'messerspitze') return 0;
  if (unit === 'stk') return amount * 60;
  // g / ml näherungsweise 1:1 fuer Heuristik
  return amount;
}

function isFatOrOilLikeName(nameLower) {
  return /[oö]l\b|oel\b|milch\b|butter\b|sauce\b|soße\b|sosse\b|dressing\b/.test(nameLower);
}

function nameMatchesProteinKeyword(nameLower, kw) {
  if (nameLower.indexOf(kw) < 0) return false;
  if (kw === 'ei' || kw === 'eier') {
    if (!/(?:^|[^a-zäöüß])ei(?:er)?(?:[^a-zäöüß]|$)/i.test(nameLower)) return false;
  }
  // Nuss-/Samen-Stems nicht in Ölen/Milch (Erdnussöl, Haselnussmilch, …)
  if (/nuss|nüsse|nusse|mandel|cashew|erdnuss|haselnuss|walnuss|chia|lein/.test(kw) && isFatOrOilLikeName(nameLower)) {
    return false;
  }
  return true;
}

/**
 * Regel 4 Gegenprobe: Keyword-Heuristik unabhängig vom Modell-Flag.
 * Käse/Nüsse/Samen nur ab PROTEIN_SUBSTANTIAL_G (default 30 g).
 * @returns {{ ok: boolean, found: string[] }}
 */
function validateMaxProteinSourcesByKeywords(ingredients, proteinSourceKeywords) {
  const useCustom = Array.isArray(proteinSourceKeywords) && proteinSourceKeywords.length;
  const core = useCustom ? proteinSourceKeywords : PROTEIN_KEYWORDS_CORE;
  const substantial = useCustom ? [] : PROTEIN_KEYWORDS_SUBSTANTIAL;
  const found = [];

  (ingredients || []).forEach(function (ing) {
    const name = String((ing && ing.name) || '');
    const nameLower = name.toLowerCase();
    if (!nameLower) return;
    if (nameLower.indexOf('eiweiss') >= 0 || nameLower.indexOf('eiweiß') >= 0) return;

    let matched = false;
    for (let i = 0; i < core.length; i++) {
      if (nameMatchesProteinKeyword(nameLower, core[i])) {
        matched = true;
        break;
      }
    }
    if (!matched) {
      for (let i = 0; i < substantial.length; i++) {
        if (!nameMatchesProteinKeyword(nameLower, substantial[i])) continue;
        if (ingredientAmountGrams(ing) < PROTEIN_SUBSTANTIAL_G) continue;
        matched = true;
        break;
      }
    }
    if (matched && found.indexOf(name) < 0) found.push(name);
  });

  return { ok: found.length <= 2, found: found };
}

function validateRecipeV2(recipe) {
  const result = new ValidationResult();
  const r = recipe && typeof recipe === 'object' ? recipe : {};
  const nutrition = r.nutrition || {};
  const ingredients = Array.isArray(r.ingredients) ? r.ingredients : [];
  const steps = Array.isArray(r.steps) ? r.steps : [];
  const garnish = typeof r.garnish === 'string' ? r.garnish : '';
  const chefAnalysis = typeof r.chef_analysis === 'string' ? r.chef_analysis : '';

  // Bottom-up: nutrition aus Zutaten erzwingen (kein freies Erfinden von Makros)
  const computed = computeNutritionFromIngredients(ingredients);
  if (!r.nutrition || typeof r.nutrition !== 'object') r.nutrition = {};
  const declaredP = Number(nutrition.protein_g);
  if (Number.isFinite(declaredP) && computed.protein_g > 0) {
    const driftPct = Math.abs(declaredP - computed.protein_g) / Math.max(computed.protein_g, 1) * 100;
    if (driftPct > 20) {
      result.addWarning(
        'Nährwerte aus Zutaten neu berechnet (Protein deklariert ' + declaredP +
        ' g vs. berechnet ' + computed.protein_g + ' g)'
      );
    }
  }
  r.nutrition.protein_g = computed.protein_g;
  r.nutrition.fat_g = computed.fat_g;
  r.nutrition.netto_kh_g = computed.netto_kh_g;
  r.nutrition.ballaststoffe_g = computed.ballaststoffe_g;
  r.nutrition.kcal = computed.kcal;

  const kcal = validateKcalFormula(
    Number(r.nutrition.protein_g) || 0,
    Number(r.nutrition.fat_g) || 0,
    Number(r.nutrition.netto_kh_g) || 0,
    Number(r.nutrition.ballaststoffe_g) || 0,
    Number(r.nutrition.kcal) || 0
  );
  if (!kcal.ok) {
    r.nutrition.kcal = Math.round(kcal.kcalCalc);
    result.addWarning('Kalorien-Formel korrigiert → ' + r.nutrition.kcal + ' kcal');
  }

  // Eier / Stückware: nur ganze stk-Zahlen, nie "30g Ei"
  ingredients.forEach(function (ing) {
    if (!ing) return;
    const name = String(ing.name || '');
    const unit = String(ing.unit || '');
    const amount = Number(ing.amount);
    if (isEggIngredientName(name)) {
      if (unit !== 'stk') {
        result.addError(
          "Eier müssen unit=\"stk\" mit ganzer Stückzahl haben (nicht \"" + unit +
          "\" / keine Gramm-Angabe wie \"30g Ei\"): '" + name + "'"
        );
      } else if (!Number.isFinite(amount) || amount < 1 || Math.round(amount) !== amount) {
        result.addError(
          "Eier-amount muss ganze Zahl ≥1 sein (stk), gefunden: " + ing.amount + " bei '" + name + "'"
        );
      }
    } else if (unit === 'stk') {
      if (!Number.isFinite(amount) || amount < 1 || Math.round(amount) !== amount) {
        result.addError(
          "Stückware (unit=stk) nur als ganze Zahl ≥1: '" + name + "' amount=" + ing.amount
        );
      }
    }
  });

  // Kein separater Garnitur-Schritt
  steps.forEach(function (s, i) {
    const title = String((s && s.title) || '').trim();
    if (/^(garnitur|garnish)\b/i.test(title)) {
      result.addError(
        "Step " + (i + 1) + " ('" + title + "'): kein separater Garnitur-Schritt — " +
        "Garnieren im Anrichte-Schritt integrieren und im Feld garnish belassen"
      );
    }
  });

  const flagSources = ingredients
    .filter(function (ing) { return ing && ing.protein_source; })
    .map(function (ing) { return ing.name; });
  if (flagSources.length > 2) {
    result.addError('Mehr als 2 Proteinquellen (protein_source=true): ' + flagSources.join(', '));
  }

  // Gegenprobe: Keyword-Heuristik unabhängig vom Modell-Flag
  const kw = validateMaxProteinSourcesByKeywords(ingredients);
  if (!kw.ok) {
    result.addError('Mehr als 2 Proteinquellen (Keyword-Heuristik): ' + kw.found.join(', '));
  }
  // Flag vs. Keyword-Mismatch (Modell hat protein_source falsch gesetzt)
  const flagSet = {};
  flagSources.forEach(function (n) { flagSet[String(n)] = true; });
  const mislabeled = kw.found.filter(function (n) { return !flagSet[n]; });
  if (mislabeled.length) {
    const logMsg = 'Modell hat protein_source möglicherweise falsch gesetzt für: [' + mislabeled.join(', ') + ']' +
      ' (Flags=' + flagSources.length + ', Keywords=' + kw.found.length + ')';
    // LLM-Feedback / validation.errors: ohne „möglicherweise“ — unmissverständlich
    const errMsg = 'Modell hat protein_source falsch gesetzt für: [' + mislabeled.join(', ') + ']' +
      ' (Flags=' + flagSources.length + ', Keywords=' + kw.found.length + ')';
    console.log('[recipe-v92] protein_source_mismatch ' + logMsg);
    if (kw.found.length > 2 || flagSources.length > 2) {
      if (result.errors.indexOf(errMsg) < 0) result.addError(errMsg);
    } else if (kw.found.length !== flagSources.length) {
      result.addError(errMsg);
    }
  }

  const prose = validateNoFreeNumbersInProse(steps, garnish, chefAnalysis, ingredients);
  prose.problems.forEach(function (p) { result.addError(p); });

  const staples = validateUnlistedStaplesInProse(steps, garnish, ingredients);
  staples.problems.forEach(function (p) { result.addError(p); });

  const coldHeat = validateColdIngredientHeatSequence(r);
  coldHeat.problems.forEach(function (p) { result.addError(p); });

  const stepTimeSum = steps.reduce(function (acc, s) {
    return acc + (Number(s && s.time_min) || 0);
  }, 0);
  const prepTime = Number(r.prep_time_min) || 0;
  if (prepTime && Math.abs(stepTimeSum - prepTime) > Math.max(5, prepTime * 0.3)) {
    result.addWarning(
      'Zeit-Abweichung: Summe der Step-Zeiten=' + stepTimeSum + ' min, ' +
      'prep_time_min=' + prepTime + ' (inkl. Mise en Place ggf. nicht in steps erfasst)'
    );
  }

  const labels = (r.diet_labels || []).map(function (d) { return String(d || '').toLowerCase(); });
  if (labels.indexOf('keto') >= 0 && (Number(r.nutrition.netto_kh_g) || 999) >= 10) {
    result.addError(
      'Keto-Label vergeben, aber Netto-KH=' + r.nutrition.netto_kh_g + 'g >= 10g'
    );
  }
  if (labels.indexOf('high_protein') >= 0 || labels.indexOf('high-protein') >= 0) {
    if ((Number(r.nutrition.protein_g) || 0) < 25) {
      result.addError('high_protein-Label, aber protein_g < 25');
    }
  }

  ingredients.forEach(function (ing) {
    if (!ing) return;
    const nameLower = String(ing.name || '').toLowerCase();
    if ((nameLower.indexOf('salz') >= 0 || nameLower.indexOf('pfeffer') >= 0) && ing.unit === 'g') {
      result.addError("'" + ing.name + "' ist in Gramm angegeben statt Prise/Messerspitze");
    }
  });

  return result;
}

module.exports = {
  ValidationResult: ValidationResult,
  validateKcalFormula: validateKcalFormula,
  validateRecipeV2: validateRecipeV2,
  validateMaxProteinSourcesByKeywords: validateMaxProteinSourcesByKeywords,
  validateColdIngredientHeatSequence: validateColdIngredientHeatSequence,
  isColdSensitiveIngredientName: isColdSensitiveIngredientName,
  resolvePlaceholders: resolvePlaceholders,
  stripRedundantBesidePlaceholders: stripRedundantBesidePlaceholders,
  computeNutritionFromIngredients: computeNutritionFromIngredients,
  isEggIngredientName: isEggIngredientName,
  validateNoFreeNumbersInProse: validateNoFreeNumbersInProse,
  validateChefAnalysisPlaceholderMisuse: validateChefAnalysisPlaceholderMisuse,
  validateUnlistedStaplesInProse: validateUnlistedStaplesInProse,
  STAPLE_WHITELIST: STAPLE_WHITELIST,
  COLD_SENSITIVE_STEMS: COLD_SENSITIVE_STEMS,
  PROTEIN_KEYWORDS_CORE: PROTEIN_KEYWORDS_CORE,
  PROTEIN_KEYWORDS_SUBSTANTIAL: PROTEIN_KEYWORDS_SUBSTANTIAL,
  PROTEIN_SUBSTANTIAL_G: PROTEIN_SUBSTANTIAL_G,
};
