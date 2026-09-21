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
 * Entfernt Mengenangaben/Einheiten aus Prosa (Steps/Garnish/Analyse).
 * Mengen gehören ausschließlich in die autoritative Zutatenliste.
 */
function stripQuantityMentionsFromText(text) {
  let out = String(text == null ? '' : text);
  // "170 g Lachs", "100 ml Kokosmilch", "5 EL Öl"
  out = out.replace(
    /\b\d+[.,]?\d*\s*(g|kg|mg|ml|l|cl|el|tl|stk|stück|stueck|prise|prisen)\b/gi,
    ''
  );
  // Mitten im Wort geklebt: "Kokosmilch30gAvocado" / "Kokosmilch30g Avocado"
  out = out.replace(
    /(\d+[.,]?\d*)\s*(g|kg|mg|ml|l|cl)(?=[A-Za-zÄÖÜäöüß]|\s|$)/gi,
    ''
  );
  // CamelCase-Klebe nach Strip: "KokosmilchAvocado" → "Kokosmilch Avocado"
  out = out.replace(/([a-zäöüß])([A-ZÄÖÜ])/g, '$1 $2');
  out = out.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
  return out;
}

function textHasQuantityMention(text) {
  const t = String(text || '');
  return /\b\d+[.,]?\d*\s*(g|kg|mg|ml|l|cl|el|tl|stk|stück|stueck)\b/i.test(t) ||
    /\b\d+[.,]?\d*(g|kg|mg|ml|l|cl)[A-Za-zÄÖÜäöüß]/i.test(t);
}

/**
 * Zutatennamen für Fließtext (Schritte/Analyse): ohne Klammerzusätze und ohne Stückzahl-Prefix.
 * Listen-displayName bleibt unangetastet — nur Prosa.
 *
 * @param {string} displayName
 * @param {{ pieces?: number|null, isEgg?: boolean }} [opts]
 * @returns {string}
 */
function proseIngredientName(displayName, opts) {
  const o = opts || {};
  let name = String(displayName || '').trim();
  if (!name) return '';

  // Alle Klammerzusätze entfernen: (Größe M, ca. 60 g je), (geräuchert), …
  name = name.replace(/\s*\([^)]*\)/g, '').trim();
  // Führende Stück-/Mengenzahl: "2 Eier" → "Eier", "1 Ei" → "Ei"
  name = name.replace(/^\d+[.,]?\d*\s+/, '').trim();
  name = name.replace(/\s{2,}/g, ' ').trim();

  const piecesRaw = o.pieces != null ? Number(o.pieces) : null;
  const pieces = Number.isFinite(piecesRaw) && piecesRaw > 0 ? piecesRaw : null;
  const eggish = o.isEgg === true || isEggIngredientName(name) || isEggIngredientName(displayName);

  if (eggish) {
    if (pieces != null && pieces > 1) {
      name = 'Eier';
    } else if (pieces === 1) {
      name = 'Ei';
    } else if (/^eier\b/i.test(name) || /\beier\b/i.test(name)) {
      name = 'Eier';
    } else {
      name = 'Ei';
    }
  }

  return name || String(displayName || '').replace(/\s*\([^)]*\)/g, '').trim();
}

/**
 * Glättet Artikel/Numerus und Rest-Klammern in Zubereitungstexten.
 * Beispiel: "die Ei …" → "die Eier …"
 */
function smoothProseIngredientGrammar(text) {
  let out = String(text == null ? '' : text);

  // Restliche Zutaten-Klammern im Fließtext entfernen
  out = out.replace(/\(\s*(?:Größe|Groesse|Size)\s*[^)]*\)/gi, '');
  out = out.replace(/\(\s*ca\.\s*\d+[.,]?\d*\s*(?:g|kg|mg|ml|l)\s*(?:je)?\s*\)/gi, '');
  out = out.replace(
    /\(\s*(?:geräuchert|geraeuchert|smoked|frisch|fresh|gehackt|geschnitten|in\s+Würfel[^)]*|gewürfelt|in\s+Scheiben[^)]*)\s*\)/gi,
    ''
  );
  // Generisch: Klammer direkt hinter typischem Zutatennamen
  out = out.replace(
    /\b(Ei|Eier|Speck|Bacon|Avocado|Lachs|Schinken|Tomaten?|Zwiebeln?|Karotten?|Sellerie|Olivenöl|Hackfleisch)\s*\([^)]*\)/gi,
    '$1'
  );

  // Technische Annotations-Klammern am Schrittende:
  // "( Zwiebel + Karotte + Sellerie + Olivenöl)" / "(Zwiebel, Karotte und Sellerie)"
  out = out.replace(/\s*\(([^)]*)\)\s*([.!?])?\s*$/g, function (_full, inner, punct) {
    const t = String(inner || '').trim();
    if (!t) return punct || '';
    // Zutaten-Verknüpfungen / Listen in Klammern → entfernen
    if (/[+/]/.test(t)) return punct || '';
    if (/,/.test(t) && !/\d/.test(t)) return punct || '';
    if (/\bund\b/i.test(t) && !/\d/.test(t) && t.length <= 100) return punct || '';
    const toks = t.split(/[\s+,;/&]+/).filter(Boolean);
    if (toks.length >= 2 && !/\d/.test(t) &&
        toks.every(function (w) { return /^[A-ZÄÖÜa-zäöüß][A-Za-zÄÖÜäöüß\-]*$/i.test(w); })) {
      return punct || '';
    }
    return '(' + inner + ')' + (punct || '');
  });

  // Artikel/Numerus für Eier
  out = out.replace(/\b([Dd]ie)\s+Ei\b/g, '$1 Eier');
  out = out.replace(/\b([Dd]as)\s+Eier\b/g, function (_m, art) {
    return (art === 'Das' ? 'Die' : 'die') + ' Eier';
  });
  out = out.replace(/\b([Dd]en)\s+Ei\b/g, function (_m, art) {
    return (art === 'Den' ? 'Das' : 'das') + ' Ei';
  });
  out = out.replace(/\b([Ee]in)\s+Eier\b/g, 'Eier');
  out = out.replace(/\b([Ee]inem)\s+Eier\b/g, '$1 Ei');
  out = out.replace(/\b([Dd]er)\s+Eier\b/g, function (_m, art) {
    return (art === 'Der' ? 'Die' : 'die') + ' Eier';
  });

  // Femininum Brust: „Den Hähnchenbrust“ → „Die Hähnchenbrust“
  out = out.replace(/\b([Dd])en\s+((?:H[äa]hnchen|Puten|Truthahn)?brust)\b/g, function (_m, d, noun) {
    return (d === 'D' ? 'Die' : 'die') + ' ' + noun;
  });
  // Adjektiv nach zum/den: „zum laktosefreier X“ → „zum laktosefreien X“
  out = out.replace(/\b(zum|den|einem)\s+laktosefreier\b/gi, function (_m, prep) {
    return prep + ' laktosefreien';
  });
  out = out.replace(/\b(zum|den|einem)\s+laktosefreie\b/gi, function (_m, prep) {
    return prep + ' laktosefreien';
  });

  // Führende Stückzahl vor Ei/Eier im Satz entfernen ("die 2 Eier" → "die Eier")
  out = out.replace(/\b(\d+[.,]?\d*)\s+(Eier|Ei)\b/gi, '$2');

  out = out.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
  return out;
}

/**
 * Ersetzt {0001} durch Anzeige-Token aus der Zutatenliste.
 * @param {string} text
 * @param {object} ingredientsById
 * @param {{ nameOnly?: boolean }} [opts] nameOnly=true → nur Zutatname (Steps/chef_analysis)
 */
function resolvePlaceholders(text, ingredientsById, opts) {
  const nameOnly = !!(opts && opts.nameOnly);
  const byId = ingredientsById || {};
  let out = stripRedundantBesidePlaceholders(text, byId);
  out = out.replace(/\{(\d{4})\}/g, function (_m, id) {
    const ing = byId[id];
    if (!ing) return '{' + id + '}';
    const rawName = String(ing.name || '').trim();
    if (nameOnly) {
      const pieces = ing._culinary_amount != null ? ing._culinary_amount
        : (ing._prosePieces != null ? ing._prosePieces : null);
      const clean = proseIngredientName(rawName, {
        pieces: pieces,
        isEgg: !!(ing._discrete && isEggIngredientName(rawName)) || isEggIngredientName(rawName),
      });
      return clean || '{' + id + '}';
    }
    const name = rawName;
    const amount = ing.amount;
    const unit = ing.unit || '';
    if (amount == null || amount === 0) return name;
    // Leerzeichen zwischen amount und unit — verhindert "85g" und Klebe-Effekte.
    return String(amount) + (unit ? ' ' + unit : '') + ' ' + name;
  });
  if (nameOnly) {
    out = smoothProseIngredientGrammar(out);
  }
  // Benachbarte Expansionen trennen: "…Milch85 g …" / "…Milch85gAvocado"
  out = out.replace(/([A-Za-zÄÖÜäöüß)])(?=\d)/g, '$1 ');
  out = out.replace(/([a-zäöüß])(?=[A-ZÄÖÜ])/g, '$1 ');
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
      const token = String(amount) + ' ' + unit + ' ' + name;
      const tokenGlued = String(amount) + unit + ' ' + name;
      const tokenRe = escapeRegExp(token);
      const tokenGluedRe = escapeRegExp(tokenGlued);
      out = out.replace(new RegExp(tokenRe + '\\s+' + nameRe + '\\b', 'gi'), token);
      out = out.replace(new RegExp(tokenGluedRe + '\\s+' + nameRe + '\\b', 'gi'), token);
      out = out.replace(new RegExp('\\b' + nameRe + '\\s+' + tokenRe, 'gi'), token);
      out = out.replace(new RegExp(tokenRe + '\\s*' + escapeRegExp(unit) + '\\b', 'gi'), token);
      out = out.replace(
        new RegExp('\\b' + nameRe + '\\s+' + escapeRegExp(String(amount) + '\\s*' + unit) + '\\s+' + nameRe +
          '(?:\\s*' + escapeRegExp(unit) + ')?\\b', 'gi'),
        token
      );
    }
  });
  out = out.replace(/\s+/g, ' ').trim();
  if (nameOnly) {
    out = smoothProseIngredientGrammar(out);
  }
  return out;
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

  // Freie Nährwert-Zahlen in chef_analysis (nicht {id}-Referenzen)
  if (chefAnalysis && /\d+[.,]?\d*\s*(g|kcal|kg)\b/i.test(chefAnalysis)) {
    problems.push(
      "chef_analysis enthält eine eigene Zahl statt Verweis auf 'nutrition': '" + chefAnalysis + "'"
    );
  }

  const validIds = {};
  (ingredients || []).forEach(function (ing) {
    if (ing && ing.id) validIds[String(ing.id)] = true;
  });

  // Platzhalter in steps + garnish + chef_analysis (Zutat-Referenz OK, Nährwert-Missbrauch nicht)
  const stepsText = list.map(function (s) { return (s && s.content) || ''; }).join(' ');
  const fieldTexts = [
    { name: 'steps', text: stepsText },
    { name: 'garnish', text: garnish || '' },
    { name: 'chef_analysis', text: chefAnalysis || '' },
  ];
  fieldTexts.forEach(function (ft) {
    validatePlaceholdersInText(ft.text, ft.name, validIds).forEach(function (p) {
      problems.push(p);
    });
  });

  // Unbekannte IDs: alle Felder (inkl. chef_analysis)
  let allText = fieldTexts.map(function (ft) { return ft.text; }).join(' ');
  const usedIdsAnywhere = {};
  const reAnywhere = /\{([a-zA-Z0-9_-]+)\}/g;
  let mAnywhere;
  while ((mAnywhere = reAnywhere.exec(allText))) usedIdsAnywhere[mAnywhere[1]] = true;

  const unknown = Object.keys(usedIdsAnywhere).filter(function (id) { return !validIds[id]; });
  if (unknown.length) problems.push('Referenzierte ingredient_ids ohne Zutateneintrag: ' + unknown.join(', '));

  // Nutzungspflicht: nur Zubereitung (steps + garnish). chef_analysis allein zählt NICHT —
  // sonst landen Eier/Hauptzutaten in der Liste, ohne dass die Schritte sagen, was damit passiert.
  const usedInPrep = {};
  const prepText = stepsText + ' ' + (garnish || '');
  const rePrep = /\{([a-zA-Z0-9_-]+)\}/g;
  let mPrep;
  while ((mPrep = rePrep.exec(prepText))) usedInPrep[mPrep[1]] = true;
  // Auch ingredientIds an Step-Objekten zählen
  list.forEach(function (s) {
    const ids = (s && (s.ingredientIds || s.ingredient_ids)) || [];
    if (Array.isArray(ids)) {
      ids.forEach(function (id) {
        if (id != null && String(id)) usedInPrep[String(id)] = true;
      });
    }
  });

  const unusedMain = [];
  (ingredients || []).forEach(function (ing) {
    if (!ing || !ing.id) return;
    const id = String(ing.id);
    if (usedInPrep[id]) return;
    if (isExemptFromUsageRequirement(ing)) return;
    unusedMain.push(id);
  });
  if (unusedMain.length) {
    problems.push('Zutaten nie referenziert (evtl. überflüssig): ' + unusedMain.join(', '));
  }

  return { ok: problems.length === 0, problems: problems };
}

/**
 * Kontextabhängige Platzhalter-Prüfung.
 * Erlaubt: „{0003} unterheben“ / „Die Zutat {0003} …“
 * Verboten: „{0003} kcal“, „{0003} g Protein“, „{0003}%“
 */
function validatePlaceholdersInText(text, fieldName, validIds) {
  const problems = [];
  const raw = String(text || '');
  if (!raw) return problems;
  const ids = validIds || {};
  const re = /\{([a-zA-Z0-9_-]+)\}/g;
  let m;
  const seenNutrient = {};
  const seenUnknown = {};
  while ((m = re.exec(raw))) {
    const id = m[1];
    if (!ids[id]) {
      if (!seenUnknown[id]) {
        seenUnknown[id] = true;
        problems.push(fieldName + ' verwendet unbekannte Zutat: {' + id + '}');
      }
    }
    const after = raw.slice(m.index + m[0].length, m.index + m[0].length + 48);
    // Nur direkter Nährwert-/Mengen-Kontext nach dem Platzhalter
    if (/^\s*(?:kcal|g\b|kg\b|ml\b|l\b|%|protein\b|fett\b|kohlenhydrate\b|kohlenhydraten\b|kalorien\b|netto-?kh\b)/i.test(after)) {
      if (!seenNutrient[id]) {
        seenNutrient[id] = true;
        problems.push(
          fieldName + ' verwendet {' + id + '} als Zahlen- oder Nährwertplatzhalter — ' +
          'Platzhalter nur als Zutatreferenz, nie vor kcal/g/ml/%/Protein/Fett/KH.'
        );
      }
    }
  }
  return problems;
}

/** @deprecated Alias – nutzt validatePlaceholdersInText (Nährwert-Missbrauch). */
function validateChefAnalysisPlaceholderMisuse(chefAnalysis, ingredients) {
  const validIds = {};
  (ingredients || []).forEach(function (ing) {
    if (ing && ing.id) validIds[String(ing.id)] = true;
  });
  // Ohne ingredients-Liste: nur Nährwert-Missbrauch prüfen (IDs als bekannt annehmen)
  const text = String(chefAnalysis || '');
  const problems = [];
  const re = /\{([a-zA-Z0-9_-]+)\}/g;
  let m;
  const seen = {};
  while ((m = re.exec(text))) {
    const id = m[1];
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 48);
    if (/^\s*(?:kcal|g\b|kg\b|ml\b|l\b|%|protein\b|fett\b|kohlenhydrate\b|kohlenhydraten\b|kalorien\b|netto-?kh\b)/i.test(after)) {
      if (!seen[id]) {
        seen[id] = true;
        problems.push(
          'chef_analysis missbraucht Zutat-Platzhalter {' + id + '} als Nährwert-Referenz — ' +
          'Platzhalter sind nur für Zutatennamen zulässig, nicht für Zahlen.'
        );
      }
    }
  }
  return { ok: problems.length === 0, problems: problems };
}

/**
 * Auto-Repair: {id} g Protein / {id} kcal → qualitative Formulierungen.
 */
function repairChefAnalysisPlaceholderMisuse(chefAnalysis) {
  let t = String(chefAnalysis || '');
  if (!t) return t;
  t = t.replace(/\{(\d{4})\}\s*g\s*Protein\b/gi, 'reichlich Protein');
  t = t.replace(/\{(\d{4})\}\s*g\s*Fett\b/gi, 'passendes Fett');
  t = t.replace(/\{(\d{4})\}\s*g\s*(?:Netto-?KH|Kohlenhydrate|KH)\b/gi, 'moderate Kohlenhydrate');
  t = t.replace(/\{(\d{4})\}\s*kcal\b/gi, 'eine passende Energiemenge');
  t = t.replace(/\{(\d{4})\}\s*%/gi, 'einem Anteil');
  t = t.replace(/\{(\d{4})\}\s*(?:g|kg|ml|l)\b/gi, 'dieser Zutat');
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t;
}

function isExemptFromUsageRequirement(ing) {
  if (!ing) return true;
  if (ing.optional === true) return true;
  const role = String(ing.culinaryRole || ing.role || '').toLowerCase();
  if (role === 'seasoning' || role === 'garnish') return true;
  const unit = String(ing.unit || '').toLowerCase();
  if (unit === 'prise' || unit === 'messerspitze') return true;
  if (isSeasoningSaltOrPepperName(ing.name)) return true;
  const n = String(ing.name || '').toLowerCase();
  if (/^(zimt|curry|paprika\s*pulver|muskat|oregano|basilikum|thymian|dill|petersilie)\b/i.test(n)) return true;
  return false;
}

/** Salz/Pfeffer als Gewürz — nicht „ungesalzen“, „salzarm“, Nussöle etc. */
function isSeasoningSaltOrPepperName(name) {
  const n = String(name || '').toLowerCase();
  if (!n) return false;
  if (/ungesalz|salzarm|salzfrei|ohne\s+salz|wenig\s+salz/.test(n)) return false;
  if (/(?:^|[^a-zäöüß])pfeffer(?:[^a-zäöüß]|$)/.test(n)) return true;
  // „Salz“, „Meersalz“, „Salz (jodiert)“ — nicht Teilwort in ungesalzen
  if (/(?:^|[^a-zäöüß])(?:meer)?salz(?:[^a-zäöüß]|$)/.test(n)) return true;
  return false;
}

/**
 * Gerichtskonzept aus Suchbegriff: Pflicht-Zutatenfamilien (gegen Titel-Drift).
 * z.B. „Joghurt und Nüsse“ → Rezept muss Joghurt + Nuss enthalten, nicht Hähnchen+Hafer.
 */
const DISH_CONCEPT_FAMILIES = [
  {
    id: 'yogurt',
    label: 'Joghurt',
    queryRe: /joghurt|yogurt|yoghurt|skyr/i,
    needRe: /joghurt|yogurt|yoghurt|skyr/i,
  },
  {
    id: 'nuts',
    label: 'Nüsse',
    queryRe: /n[uü]sse?\b|nuts?\b|mandeln?|cashews?|waln[uü]sse?|haseln[uü]sse?|pistazien?|pecans?/i,
    needRe: /n[uü]ss|nüsse|nusse|mandel|cashew|walnuss|haselnuss|pistazie|pecan|erdnuss/i,
  },
  {
    id: 'egg',
    label: 'Ei',
    queryRe: /r[uü]hrei|\beier?\b|scrambled\s+egg/i,
    needRe: /(?:^|[^a-zäöüß])ei(?:er)?(?:[^a-zäöüß]|$)/i,
  },
  {
    id: 'salmon',
    label: 'Lachs',
    queryRe: /lachs|salmon|räucherlachs|raeucherlachs/i,
    needRe: /lachs|salmon/i,
  },
  {
    id: 'pasta',
    label: 'Pasta',
    queryRe: /pasta|nudeln?|spaghetti|penne|fusilli/i,
    needRe: /pasta|nudel|spaghetti|penne|fusilli|macaroni/i,
  },
];

function ingredientMatchesDishNeed(ingName, needRe, familyId) {
  const n = String(ingName || '').toLowerCase();
  if (!n || !needRe.test(n)) return false;
  if (familyId === 'nuts' && isFatOrOilLikeName(n)) return false;
  if (familyId === 'egg' && /eiweiss|eiweiß|eiweis/.test(n)) return false;
  return true;
}

/**
 * @param {object} recipe
 * @param {string} dishQuery Suchbegriff / Gerichtstitel vom Nutzer
 * @returns {{ ok: boolean, problems: string[], missing: string[] }}
 */
function validateDishConceptFidelity(recipe, dishQuery) {
  const problems = [];
  const missing = [];
  const q = String(dishQuery || '').trim();
  if (!q) return { ok: true, problems: problems, missing: missing };

  const ingredients = Array.isArray(recipe && recipe.ingredients) ? recipe.ingredients : [];
  const names = ingredients.map(function (ing) { return String((ing && ing.name) || ''); });
  const blob = names.join('\n');

  DISH_CONCEPT_FAMILIES.forEach(function (fam) {
    if (!fam.queryRe.test(q)) return;
    const hit = names.some(function (nm) {
      return ingredientMatchesDishNeed(nm, fam.needRe, fam.id);
    });
    if (!hit) {
      missing.push(fam.label);
      problems.push(
        "Gerichtskonzept verfehlt: Der Titel verlangt '" + fam.label +
        "', aber keine passende Zutat ist gelistet. Behalte das Gericht – ersetze nur Allergene, erfinde kein anderes Gericht."
      );
    }
  });

  // Speziell: Joghurt+Nüsse-Snack darf nicht zu Fleisch- oder Ei-Gericht ohne Nüsse werden
  if (/joghurt|yogurt/i.test(q) && /n[uü]ss/i.test(q)) {
    const nutsFam = DISH_CONCEPT_FAMILIES.filter(function (f) { return f.id === 'nuts'; })[0];
    const hasNuts = names.some(function (nm) {
      return ingredientMatchesDishNeed(nm, nutsFam.needRe, 'nuts');
    });
    const hasMeat = /hähnchen|haehnchen|huhn|pute|rind|schwein|truthahn|fleisch/i.test(blob);
    const hasEgg = names.some(function (nm) {
      return ingredientMatchesDishNeed(nm, DISH_CONCEPT_FAMILIES.filter(function (f) { return f.id === 'egg'; })[0].needRe, 'egg');
    });
    if (hasMeat && !hasNuts) {
      problems.push(
        'Gerichtskonzept verfehlt: „Joghurt und Nüsse“ wurde durch ein Fleischgericht ohne Nüsse ersetzt. ' +
        'Pflicht: Joghurt (ggf. laktosefrei/Soja) + Nüsse; kein Hähnchen/Fleisch als Ersatzkonzept.'
      );
    }
    if (hasEgg && !hasNuts) {
      problems.push(
        'Gerichtskonzept verfehlt: „Joghurt und Nüsse“ wurde durch ein Ei-Gericht ohne Nüsse ersetzt. ' +
        'Pflicht: Joghurt (ggf. laktosefrei/Soja/Kokos) + Nüsse; kein Ei als Nuss-Ersatz.'
      );
    }
  }

  return { ok: problems.length === 0, problems: problems, missing: missing };
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

/** Hauptprotein-Keywords → main_protein / secondary_protein (Fallback-Klassifizierung). */
const PROTEIN_KEYWORDS_CORE = [
  'hähnchen', 'haehnchen', 'huhn', 'pute', 'rind', 'schwein', 'lachs', 'thunfisch', 'fisch',
  'ei', 'eier', 'tofu', 'quark', 'hüttenkäse', 'huettenkaese', 'linsen', 'kichererbsen',
  'bohnen', 'seitan', 'tempeh', 'garnelen', 'krabben', 'truthahn', 'speck',
];

/** Käse ≥ PROTEIN_SUBSTANTIAL_G → secondary_protein; Nüsse/Samen → topping (nie primary). */
const PROTEIN_KEYWORDS_SUBSTANTIAL = [
  'käse', 'kaese', 'gouda', 'cheddar', 'mozzarella', 'parmesan', 'feta', 'ricotta',
  'camembert', 'frischkäse', 'frischkaese', 'frischkase', 'mascarpone', 'schmand',
];

const PROTEIN_SUBSTANTIAL_G = 30;

const PRIMARY_PROTEIN_ROLES = ['main_protein', 'secondary_protein', 'protein_supplement'];

const CULINARY_ROLES = [
  'main_protein', 'secondary_protein', 'protein_supplement', 'base', 'carbohydrate',
  'vegetable', 'fruit', 'fat_source', 'topping', 'garnish', 'seasoning', 'liquid',
  'binder', 'sweetener',
];

function ingredientAmountGrams(ing) {
  const amount = Number(ing && ing.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const unit = String((ing && ing.unit) || '').toLowerCase();
  if (unit === 'prise' || unit === 'messerspitze') return 0;
  if (unit === 'stk') return amount * 60;
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
  if (/nuss|nüsse|nusse|mandel|cashew|erdnuss|haselnuss|walnuss|chia|lein/.test(kw) && isFatOrOilLikeName(nameLower)) {
    return false;
  }
  return true;
}

function isNutOrSeedName(nameLower) {
  if (!nameLower) return false;
  if (isFatOrOilLikeName(nameLower)) return false;
  return /n[uü]ss|nüsse|nusse|mandel|cashew|walnuss|haselnuss|erdnuss|pistazie|pecan|sonnenblumenkern|kürbiskern|kuerbiskern|chiasamen|leinsamen|leinsaat|pinienkern/.test(nameLower);
}

function isYogurtBaseName(nameLower) {
  return /joghurt|yogurt|yoghurt|skyr/.test(nameLower);
}

function isProteinSupplementName(nameLower) {
  return /protein\s*-?\s*pulver|proteinpulver|whey|casein|erbsen\s*-?\s*protein|pea\s*protein|protein\s*powder/.test(nameLower);
}

/**
 * Inferiert culinaryRole; Keywords nur als Fallback.
 * Nüsse/Samen → topping; Joghurt → base; Fleisch/Ei/Tofu → main_protein; Pulver → protein_supplement.
 */
function inferCulinaryRole(ing) {
  if (!ing || typeof ing !== 'object') return 'vegetable';
  const explicit = String(ing.culinaryRole || ing.role || '').toLowerCase().trim();
  if (explicit && CULINARY_ROLES.indexOf(explicit) >= 0) return explicit;

  const nameLower = String(ing.name || '').toLowerCase();
  if (!nameLower) return 'vegetable';
  const unit = String(ing.unit || '').toLowerCase();
  const grams = ingredientAmountGrams(ing);

  if (unit === 'prise' || unit === 'messerspitze' || isSeasoningSaltOrPepperName(ing.name)) return 'seasoning';
  if (isProteinSupplementName(nameLower)) return 'protein_supplement';
  if (isNutOrSeedName(nameLower)) return 'topping';
  if (isYogurtBaseName(nameLower)) return 'base';
  if (/[oö]l\b|oel\b|butter\b|ghee\b/.test(nameLower)) return 'fat_source';
  if (/wasser|brühe|bruehe|fond|wein\b/.test(nameLower)) return 'liquid';
  if (/hafer|pasta|nudel|reis|brot|quinoa|couscous|mehl/.test(nameLower)) return 'carbohydrate';
  if (/apfel|banane|beere|obst|frucht/.test(nameLower)) return 'fruit';
  if (/zucker|honig|sirup|süß|suess/.test(nameLower)) return 'sweetener';

  for (let i = 0; i < PROTEIN_KEYWORDS_CORE.length; i++) {
    if (nameMatchesProteinKeyword(nameLower, PROTEIN_KEYWORDS_CORE[i])) return 'main_protein';
  }
  for (let i = 0; i < PROTEIN_KEYWORDS_SUBSTANTIAL.length; i++) {
    if (!nameMatchesProteinKeyword(nameLower, PROTEIN_KEYWORDS_SUBSTANTIAL[i])) continue;
    if (grams >= PROTEIN_SUBSTANTIAL_G) return 'secondary_protein';
    return 'topping';
  }
  if (/gemüse|spinat|paprika|zucchini|tomate|salat|gurke|brokkoli/.test(nameLower)) return 'vegetable';
  return 'vegetable';
}

function countsAsPrimaryProteinSource(ing) {
  if (!ing) return false;
  if (ing.countsAsPrimaryProteinSource === true) return true;
  if (ing.countsAsPrimaryProteinSource === false) return false;
  const role = inferCulinaryRole(ing);
  return PRIMARY_PROTEIN_ROLES.indexOf(role) >= 0;
}

/**
 * Setzt culinaryRole + countsAsPrimaryProteinSource + protein_source konsistent.
 * @returns {{ primary: object[], corrections: string[] }}
 */
function applyCulinaryRoleInference(ingredients) {
  const corrections = [];
  const primary = [];
  (ingredients || []).forEach(function (ing) {
    if (!ing || typeof ing !== 'object') return;
    const role = inferCulinaryRole(ing);
    const primaryFlag = PRIMARY_PROTEIN_ROLES.indexOf(role) >= 0;
    // Explizites false vom Modell respektieren nur wenn Rolle nicht klar primary ist
    let counts = primaryFlag;
    if (ing.countsAsPrimaryProteinSource === false && !primaryFlag) counts = false;
    if (ing.countsAsPrimaryProteinSource === true && primaryFlag) counts = true;
    // Nüsse/Joghurt/Base/Topping nie als primary erzwingen
    if (role === 'topping' || role === 'base' || role === 'fat_source' || role === 'seasoning' ||
        role === 'garnish' || role === 'carbohydrate') {
      counts = false;
    }
    if (role === 'protein_supplement' || role === 'main_protein' || role === 'secondary_protein') {
      counts = true;
    }

    const prevRole = ing.culinaryRole || ing.role;
    const prevFlag = !!ing.protein_source;
    ing.culinaryRole = role;
    ing.role = role;
    ing.countsAsPrimaryProteinSource = counts;
    ing.protein_source = counts;
    if (prevFlag !== counts) {
      corrections.push(String(ing.name || '') + ': protein_source ' + prevFlag + '→' + counts + ' (role=' + role + ')');
    } else if (prevRole && String(prevRole) !== role) {
      corrections.push(String(ing.name || '') + ': role ' + prevRole + '→' + role);
    }
    if (counts) primary.push(ing);
  });
  return { primary: primary, corrections: corrections };
}

/**
 * Max. 2 primäre Proteinquellen — nach kulinarischer Rolle, nicht Keyword-Rohzählung.
 * @returns {{ ok: boolean, found: string[], primary: object[], corrections: string[] }}
 */
function validateMaxProteinSourcesByKeywords(ingredients, proteinSourceKeywords) {
  // proteinSourceKeywords: Legacy-Override (Tests) — dann alte Keyword-Logik
  if (Array.isArray(proteinSourceKeywords) && proteinSourceKeywords.length) {
    const found = [];
    (ingredients || []).forEach(function (ing) {
      const name = String((ing && ing.name) || '');
      const nameLower = name.toLowerCase();
      if (!nameLower) return;
      for (let i = 0; i < proteinSourceKeywords.length; i++) {
        if (nameMatchesProteinKeyword(nameLower, proteinSourceKeywords[i])) {
          if (found.indexOf(name) < 0) found.push(name);
          break;
        }
      }
    });
    return { ok: found.length <= 2, found: found, primary: [], corrections: [] };
  }

  const applied = applyCulinaryRoleInference(ingredients);
  const found = applied.primary.map(function (ing) { return String(ing.name || ''); });
  return {
    ok: found.length <= 2,
    found: found,
    primary: applied.primary,
    corrections: applied.corrections,
  };
}

function validateRecipeV2(recipe, opts) {
  const result = new ValidationResult();
  const o = opts && typeof opts === 'object' ? opts : {};
  const r = recipe && typeof recipe === 'object' ? recipe : {};
  const nutrition = r.nutrition || {};
  const ingredients = Array.isArray(r.ingredients) ? r.ingredients : [];
  const steps = Array.isArray(r.steps) ? r.steps : [];
  const garnish = typeof r.garnish === 'string' ? r.garnish : '';
  let chefAnalysis = typeof r.chef_analysis === 'string' ? r.chef_analysis : '';
  // Auto-Repair vor Validierung: {id} g Protein → qualitativ (sonst häufige 422-Schleife)
  if (chefAnalysis) {
    const repairedChef = repairChefAnalysisPlaceholderMisuse(chefAnalysis);
    if (repairedChef !== chefAnalysis) {
      r.chef_analysis = repairedChef;
      chefAnalysis = repairedChef;
      result.addWarning('chef_analysis: Platzhalter-Nährwert-Formulierungen qualitativ korrigiert');
    }
  }

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

  // Primäre Proteinquellen: kulinarische Rolle (max. 2). Auto-Korrektur, kein Keyword-Rohblock.
  const primaryInfo = validateMaxProteinSourcesByKeywords(ingredients);
  if (primaryInfo.corrections && primaryInfo.corrections.length) {
    console.log('[recipe-v92] culinary_role_corrections ' + primaryInfo.corrections.join(' | '));
    result.addWarning('protein_source/Rollen korrigiert: ' + primaryInfo.corrections.slice(0, 4).join('; '));
  }
  if (!primaryInfo.ok) {
    result.addError(
      'Mehr als 2 primäre Proteinquellen (culinaryRole main/secondary/supplement): ' +
      primaryInfo.found.join(', ')
    );
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
    if (isSeasoningSaltOrPepperName(ing.name) && ing.unit === 'g') {
      result.addError("'" + ing.name + "' ist in Gramm angegeben statt Prise/Messerspitze");
    }
  });

  const dishQuery = o.dishQuery != null ? o.dishQuery
    : (r._dishQuery != null ? r._dishQuery : '');
  if (dishQuery) {
    const fidelity = validateDishConceptFidelity(r, dishQuery);
    fidelity.problems.forEach(function (p) { result.addError(p); });
  }

  // Kulinarische Brauchbarkeit (Usage, generische Steps, dishPlan, Flüssigkeit)
  try {
    const culinaryUsability = require('./culinary-usability');
    const cu = culinaryUsability.evaluateCulinaryUsability(r);
    (cu.errors || []).forEach(function (p) { result.addError(p); });
    (cu.warnings || []).forEach(function (w) { result.addWarning(w); });
  } catch (eCu) {
    result.addWarning('culinary-usability check skipped: ' + (eCu && eCu.message));
  }

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
  stripQuantityMentionsFromText: stripQuantityMentionsFromText,
  textHasQuantityMention: textHasQuantityMention,
  proseIngredientName: proseIngredientName,
  smoothProseIngredientGrammar: smoothProseIngredientGrammar,
  computeNutritionFromIngredients: computeNutritionFromIngredients,
  isEggIngredientName: isEggIngredientName,
  validateNoFreeNumbersInProse: validateNoFreeNumbersInProse,
  validateChefAnalysisPlaceholderMisuse: validateChefAnalysisPlaceholderMisuse,
  validatePlaceholdersInText: validatePlaceholdersInText,
  repairChefAnalysisPlaceholderMisuse: repairChefAnalysisPlaceholderMisuse,
  isSeasoningSaltOrPepperName: isSeasoningSaltOrPepperName,
  isExemptFromUsageRequirement: isExemptFromUsageRequirement,
  inferCulinaryRole: inferCulinaryRole,
  countsAsPrimaryProteinSource: countsAsPrimaryProteinSource,
  applyCulinaryRoleInference: applyCulinaryRoleInference,
  validateDishConceptFidelity: validateDishConceptFidelity,
  evaluateCulinaryUsability: function (recipe) {
    return require('./culinary-usability').evaluateCulinaryUsability(recipe);
  },
  DISH_CONCEPT_FAMILIES: DISH_CONCEPT_FAMILIES,
  PRIMARY_PROTEIN_ROLES: PRIMARY_PROTEIN_ROLES,
  CULINARY_ROLES: CULINARY_ROLES,
  validateUnlistedStaplesInProse: validateUnlistedStaplesInProse,
  STAPLE_WHITELIST: STAPLE_WHITELIST,
  COLD_SENSITIVE_STEMS: COLD_SENSITIVE_STEMS,
  PROTEIN_KEYWORDS_CORE: PROTEIN_KEYWORDS_CORE,
  PROTEIN_KEYWORDS_SUBSTANTIAL: PROTEIN_KEYWORDS_SUBSTANTIAL,
  PROTEIN_SUBSTANTIAL_G: PROTEIN_SUBSTANTIAL_G,
};
