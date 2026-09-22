'use strict';
/**
 * Kanonisches Display-Modell für die sichtbare Rezeptkarte.
 * Nur Whitelist-Felder – keine Legacy-Step-Titel/Namenlisten.
 */

const HERB_RE = /petersilie|parsley|prezzemolo|perejil|persil|basilikum|basil|oregano|thymian|thyme|rosmarin|rosemary|schnittlauch|chives|koriander|cilantro|dill|minze|mint|kr[aä]uter|(^|\b)herb/i;
const MAIN_ING_RE = /hack|fleisch|zwiebel|karotte|sellerie|olivenöl|öl|tomate|wein|rind|schwein|beef|pork/i;

const ACTION_SENTENCES = {
  heat_oil: 'Das Olivenöl in einem schweren Topf erhitzen.',
  saute: 'Zwiebel, Karotte und Sellerie darin bei mittlerer Hitze langsam anschwitzen, bis das Gemüse weich ist.',
  brown: 'Das Rinderhackfleisch hinzufügen und unter Rühren krümelig anbraten.',
  deglaze: 'Mit dem Rotwein ablöschen und kurz einkochen lassen.',
  tomato: 'Passierte Tomaten und Tomatenmark einrühren.',
  simmer: 'Das Ragù bei niedriger Hitze etwa zwei Stunden sanft köcheln lassen und gelegentlich umrühren.',
  season: 'Mit Salz und Pfeffer abschmecken.',
  mix: 'Die Zutaten gründlich vermengen.',
  serve: 'Anrichten und servieren.',
};

const FORBIDDEN_VISIBLE_RE = [
  /Olivenöl\s+Zwiebel\s+Karotte\s+Sellerie/i,
  /Rinderhackfleisch\s+Schweinehackfleisch/i,
  /Passierte Tomaten\s+Tomatenmark/i,
  /Garnitur:\s*(Rinderhackfleisch|Zwiebel|Karotte|Sellerie|Olivenöl)/i,
  /\bself_check\b/i,
  /\bai_instruction\b/i,
  /\bpantry_ingredients\b/i,
  /\brawIngredients\b/i,
  /\bnutritionSource\b/i,
  /\boperationId\b/i,
];

function isBareNameList(text) {
  const t = String(text || '').trim();
  if (!t || /[.!?]/.test(t)) return false;
  if (/\b(und|mit|erhitzen|braten|kochen|dünsten|mischen|geben|anschwitzen|ablöschen|einrühren|köcheln|abschmecken|servieren|lassen|sanft)\b/i.test(t)) {
    return false;
  }
  const toks = t.split(/\s+/).filter(Boolean);
  return toks.length >= 1 && toks.length <= 12;
}

function naturalizeFromTitle(title) {
  const t = String(title || '').toLowerCase();
  if (/öl|erhitz/i.test(t)) return ACTION_SENTENCES.heat_oil;
  if (/anschwitz|gemüse|soffritto/i.test(t)) return ACTION_SENTENCES.saute;
  if (/brat|fleisch|hack/i.test(t)) return ACTION_SENTENCES.brown;
  if (/ablösch|wein/i.test(t)) return ACTION_SENTENCES.deglaze;
  if (/tomate|hinzufüg/i.test(t)) return ACTION_SENTENCES.tomato;
  if (/köchel|schmor|simmer|langsam/i.test(t)) return ACTION_SENTENCES.simmer;
  if (/würz|abschmeck|season/i.test(t)) return ACTION_SENTENCES.season;
  if (/servier|anricht/i.test(t)) return ACTION_SENTENCES.serve;
  if (title) return String(title).replace(/:\s*$/, '') + '.';
  return ACTION_SENTENCES.mix;
}

function sanitizeLegacyStepInstruction(raw, index, total) {
  let t = String(raw == null ? '' : raw).trim();
  if (!t) return { instruction: '', blocked: true, reason: 'empty' };

  t = t.replace(/^(?:Stufe\s+\d+\s+von\s+9\.\s*)+(?:ca\.\s*\d+\s*Min\.\s*)+/i, '').trim();

  const legacy = t.match(
    /^([^:]{2,50}):\s*(?:Stufe\s+\d+\s+von\s+9\.\s*)?(?:ca\.\s*\d+\s*Min\.\s*)?(.*)$/i
  );
  if (legacy) {
    const title = legacy[1].trim();
    let rest = String(legacy[2] || '').trim();
    rest = rest.replace(/^(?:Stufe\s+\d+\s+von\s+9\.\s*)+(?:ca\.\s*\d+\s*Min\.\s*)+/i, '').trim();
    if (!rest || isBareNameList(rest)) {
      return { instruction: naturalizeFromTitle(title), repaired: true, legacy: true };
    }
    if (/[.!?]/.test(rest) || /\b(und|mit|lassen|erhitzen|braten|anschwitzen)\b/i.test(rest)) {
      return { instruction: rest, repaired: true, legacy: true };
    }
    return { instruction: naturalizeFromTitle(title), repaired: true, legacy: true };
  }

  if (isBareNameList(t)) {
    return {
      instruction: index >= (total || 1) - 1 ? ACTION_SENTENCES.serve : ACTION_SENTENCES.mix,
      repaired: true,
      legacy: true,
    };
  }

  t = t.replace(/\bStufe\s+\d+\s+von\s+9\.\s*/gi, '').replace(/\bca\.\s*\d+\s*Min\.\s*/gi, '').replace(/\s{2,}/g, ' ').trim();

  if (!t || isBareNameList(t)) {
    return { instruction: ACTION_SENTENCES.mix, repaired: true, blocked: !t };
  }
  return { instruction: t, repaired: false };
}

function formatNutritionSummary(finalNutrition) {
  const n = finalNutrition || {};
  const netCarbs = Number(
    n.netto_kh_g != null ? n.netto_kh_g : (n.netCarbs != null ? n.netCarbs : n.carbs)
  ) || 0;
  return {
    calories: Math.round(Number(n.kcal != null ? n.kcal : n.calories) || 0),
    carbs: Math.round(netCarbs),
    netCarbs: Math.round(netCarbs * 10) / 10,
    fat: Math.round((Number(n.fat_g != null ? n.fat_g : n.fat) || 0) * 10) / 10,
    protein: Math.round((Number(n.protein_g != null ? n.protein_g : n.protein) || 0) * 10) / 10,
    fiber: Math.round((Number(n.ballaststoffe_g != null ? n.ballaststoffe_g : n.fiber) || 0) * 10) / 10,
  };
}

function toCanonicalGarnish(garnish, finalIngredients) {
  const ings = Array.isArray(finalIngredients) ? finalIngredients : [];
  const ingNames = ings.map(function (i) {
    return String((i && (i.displayName || i.name)) || '').toLowerCase();
  });

  function isAllowedGarnishName(name) {
    const n = String(name || '').trim();
    if (!n) return false;
    if (HERB_RE.test(n)) return true;
    if (MAIN_ING_RE.test(n) && !HERB_RE.test(n)) return false;
    if (ingNames.some(function (x) { return x && n.toLowerCase().indexOf(x) >= 0 && MAIN_ING_RE.test(x); })) {
      return false;
    }
    return false;
  }

  if (!garnish) return [];
  if (Array.isArray(garnish)) {
    return garnish.map(function (g) {
      if (typeof g === 'string') return { displayName: g.trim() };
      return {
        ingredientId: g.ingredientId || g.id || null,
        displayName: String(g.displayName || g.name || '').trim(),
      };
    }).filter(function (g) {
      return g.displayName && isAllowedGarnishName(g.displayName);
    });
  }
  const s = String(garnish).trim();
  if (!s) return [];
  if (HERB_RE.test(s) && !MAIN_ING_RE.test(s.replace(HERB_RE, ''))) {
    const m = s.match(/petersilie|parsley|basilikum|basil|oregano|thymian|rosmarin|schnittlauch|dill|minze/i);
    return [{ displayName: m ? m[0].charAt(0).toUpperCase() + m[0].slice(1).toLowerCase() : s }];
  }
  if (isAllowedGarnishName(s)) return [{ displayName: s }];
  return [];
}

function toCanonicalSteps(steps) {
  const arr = Array.isArray(steps) ? steps : [];
  const out = [];
  let blocked = false;
  const issues = [];

  arr.forEach(function (step, i) {
    let raw = '';
    let durationMinutes = null;
    let heatLevel = null;
    let ingredientIds = [];
    if (typeof step === 'string') {
      raw = step;
    } else if (step && typeof step === 'object') {
      // Nur Instruction-Text – niemals title/ingredientNames/ingredients zusammenbauen
      raw = String(step.instruction || step.text || step.content || '').trim();
      if (!raw && step.title) {
        raw = naturalizeFromTitle(step.title);
      }
      durationMinutes = step.durationMinutes != null ? Number(step.durationMinutes)
        : (step.time_min != null ? Number(step.time_min) : null);
      heatLevel = step.heatLevel != null ? step.heatLevel : step.stove_level;
      ingredientIds = Array.isArray(step.ingredientIds) ? step.ingredientIds.slice() : [];
    }
    const cleaned = sanitizeLegacyStepInstruction(raw, i, arr.length);
    if (cleaned.blocked && !cleaned.instruction) {
      blocked = true;
      issues.push('Schritt ' + (i + 1) + ' ohne gültige Instruction');
      return;
    }
    let instruction = cleaned.instruction;
    try {
      const validator = require('./recipe-validator');
      instruction = validator.smoothProseIngredientGrammar(instruction);
    } catch (_e) { /* optional */ }
    if (FORBIDDEN_VISIBLE_RE.some(function (re) { return re.test(instruction); })) {
      blocked = true;
      issues.push('Schritt ' + (i + 1) + ' enthält verbotenes sichtbares Muster');
      return;
    }
    if (isBareNameList(instruction)) {
      blocked = true;
      issues.push('Schritt ' + (i + 1) + ' ist Rohdaten-Zutatenliste');
      return;
    }
    out.push({
      stepNumber: i + 1,
      instruction: instruction,
      durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : null,
      heatLevel: heatLevel != null ? heatLevel : null,
      ingredientIds: ingredientIds,
    });
  });

  return { steps: out, blocked: blocked, issues: issues };
}

function toCanonicalTiming(recipe, steps) {
  let total = 0;
  (steps || []).forEach(function (s) {
    total += Number(s.durationMinutes) || 0;
  });
  const fromTiming = recipe.timing && Number(recipe.timing.totalMinutes);
  const fromTotal = Number(recipe.totalMinutes);
  const totalMinutes = Math.max(total, fromTiming || 0, fromTotal || 0);
  function label(mins) {
    const m = Math.max(0, Math.round(Number(mins) || 0));
    if (m <= 0) return '';
    if (m < 60) return m + ' Minuten';
    const h = Math.floor(m / 60);
    const rest = m % 60;
    if (rest === 0) return h === 1 ? 'ca. 1 Stunde' : ('ca. ' + h + ' Stunden');
    if (h === 1) return 'ca. 1 Stunde ' + rest + ' Minuten';
    return 'ca. ' + h + ' Stunden ' + rest + ' Minuten';
  }
  return {
    prepMinutes: (recipe.timing && recipe.timing.prepMinutes) || null,
    cookMinutes: (recipe.timing && recipe.timing.cookMinutes) || total || null,
    totalMinutes: totalMinutes || null,
    timingStatus: total > 0 ? 'calculated' : ((recipe.timing && recipe.timing.timingStatus) || 'unknown'),
    label: label(totalMinutes),
  };
}

function validateVisibleDisplayRecipe(display) {
  const issues = [];
  const forbiddenFound = [];
  if (!display || !display.title) issues.push('Titel fehlt');
  if (!display.finalIngredients || !display.finalIngredients.length) issues.push('finalIngredients fehlt');
  if (!display.finalNutrition) issues.push('finalNutrition fehlt');
  if (!display.steps || !display.steps.length) issues.push('Keine Schritte');

  (display.steps || []).forEach(function (s, i) {
    if (!s.instruction || isBareNameList(s.instruction)) {
      issues.push('Schritt ' + (i + 1) + ' ohne natürlichen Satz');
    }
    FORBIDDEN_VISIBLE_RE.forEach(function (re) {
      if (re.test(s.instruction)) {
        forbiddenFound.push(String(re));
        issues.push('Verbotenes Muster in Schritt ' + (i + 1));
      }
    });
    if (/\bStufe\s+\d+\s+von\s+9\b/i.test(s.instruction)) {
      issues.push('Legacy Herdstufe in Instruction Schritt ' + (i + 1));
    }
  });

  (display.garnish || []).forEach(function (g) {
    if (MAIN_ING_RE.test(g.displayName) && !HERB_RE.test(g.displayName)) {
      issues.push('Falsche Garnitur: ' + g.displayName);
      forbiddenFound.push('bad_garnish');
    }
  });

  const blob = [
    display.title,
    display.subtitle,
    (display.steps || []).map(function (s) { return s.instruction; }).join('\n'),
    (display.garnish || []).map(function (g) { return 'Garnitur: ' + g.displayName; }).join('\n'),
  ].join('\n');

  FORBIDDEN_VISIBLE_RE.forEach(function (re) {
    if (re.test(blob)) {
      forbiddenFound.push(String(re));
      issues.push('Verbotenes Muster im Gesamtdisplay');
    }
  });

  if (/\bself_check\b|\bai_instruction\b|\bnutritionSource\b/i.test(blob)) {
    issues.push('Interne Feldnamen sichtbar');
  }

  return {
    status: issues.length ? 'fail' : 'pass',
    issues: issues,
    forbiddenPatternsFound: forbiddenFound,
    renderer: 'canonical',
  };
}

function toCanonicalDisplayRecipe(finalRecipe) {
  const r = finalRecipe && typeof finalRecipe === 'object' ? finalRecipe : {};
  const finalIngredients = Array.isArray(r.finalIngredients) && r.finalIngredients.length
    ? r.finalIngredients.map(function (ing) {
        return {
          id: ing.id || ing._v92_id || null,
          displayName: String(ing.displayName || ing.name || '').trim(),
          amount: Number(ing.amount) || 0,
          unit: ing.unit === 'ml' ? 'ml' : (ing.unit || 'g'),
          optional: !!ing.optional,
          role: ing.role || null,
        };
      }).filter(function (ing) { return !!ing.displayName; })
    : [];

  const finalNutrition = r.finalNutrition && typeof r.finalNutrition === 'object'
    ? {
        kcal: Number(r.finalNutrition.kcal != null ? r.finalNutrition.kcal : r.finalNutrition.calories) || 0,
        protein_g: Number(r.finalNutrition.protein_g != null ? r.finalNutrition.protein_g : r.finalNutrition.protein) || 0,
        fat_g: Number(r.finalNutrition.fat_g != null ? r.finalNutrition.fat_g : r.finalNutrition.fat) || 0,
        netto_kh_g: Number(r.finalNutrition.netto_kh_g != null ? r.finalNutrition.netto_kh_g : r.finalNutrition.netCarbs) || 0,
        ballaststoffe_g: Number(r.finalNutrition.ballaststoffe_g != null ? r.finalNutrition.ballaststoffe_g : r.finalNutrition.fiber) || 0,
      }
    : null;

  // Prefer cleaned steps[] (instruction strings/objects) over legacy structuredSteps
  const stepsSrc = (function pickSteps() {
    const a = Array.isArray(r.steps) ? r.steps : [];
    const b = Array.isArray(r.structuredSteps) ? r.structuredSteps : [];
    function hasInstruction(step) {
      if (typeof step === 'string') return !!String(step).trim();
      if (!step || typeof step !== 'object') return false;
      return !!(step.instruction || step.text || step.content);
    }
    if (a.length && a.some(hasInstruction)) return a;
    return b.length ? b : a;
  }());
  const stepResult = toCanonicalSteps(stepsSrc);
  const garnish = toCanonicalGarnish(r.garnish, finalIngredients);
  const timing = toCanonicalTiming(r, stepResult.steps);
  const nutritionSummary = finalNutrition ? formatNutritionSummary(finalNutrition) : null;

  const display = {
    title: String(r.title || '').trim(),
    subtitle: String(r.subtitle || '').trim(),
    finalIngredients: finalIngredients,
    finalNutrition: finalNutrition,
    nutritionSummary: nutritionSummary,
    steps: stepResult.steps,
    garnish: garnish,
    timing: timing,
    qualityStatus: r.qualityStatus || null,
    qualityWarnings: Array.isArray(r.qualityWarnings) ? r.qualityWarnings.slice() : [],
    adaptationFlags: Array.isArray(r.adaptationFlags) ? r.adaptationFlags.slice() : [],
    adaptationNote: r.adaptationNote || null,
    servings: Number(r.finalServings != null ? r.finalServings : r.servings) || 1,
    finalServings: Number(r.finalServings != null ? r.finalServings : r.servings) || 1,
    portionWarning: r.portionDisplayHint || null,
    operationId: r.renderedOperationId || r.operationId || null,
  };

  const visibleCheck = validateVisibleDisplayRecipe(display);
  display._visibleOutput = visibleCheck;
  if (stepResult.blocked || visibleCheck.status === 'fail') {
    display.qualityStatus = 'blocked';
    display.qualityWarnings = (display.qualityWarnings || []).concat(stepResult.issues).concat(visibleCheck.issues);
  }

  display.steps.forEach(function (s) {
    if ('title' in s || 'ingredientNames' in s || 'ingredients' in s || 'label' in s) {
      throw new Error('Legacy step field leaked into canonical display');
    }
  });

  return display;
}

function buildCanonicalVisibleText(display) {
  const lines = [];
  lines.push(display.title || '');
  if (display.subtitle) lines.push(display.subtitle);
  if (display.adaptationNote) lines.push(display.adaptationNote);
  if (display.timing && display.timing.label) lines.push('Zeit: ' + display.timing.label);
  if (display.nutritionSummary) {
    const n = display.nutritionSummary;
    lines.push(n.calories + ' kcal');
    lines.push(Math.round(n.protein) + ' g Protein');
    lines.push(Math.round(n.fat) + ' g Fett');
    lines.push(Math.round(n.netCarbs) + ' g Netto-KH');
    lines.push(Math.round(n.fiber) + ' g Ballaststoffe');
  }
  (display.finalIngredients || []).forEach(function (ing) {
    lines.push(ing.displayName + (ing.amount ? (' ' + ing.amount + ' ' + ing.unit) : ''));
  });
  (display.steps || []).forEach(function (s) {
    lines.push(s.instruction);
  });
  if (display.garnish && display.garnish.length) {
    lines.push('Garnitur: ' + display.garnish.map(function (g) { return g.displayName; }).join(', '));
  }
  return lines.filter(Boolean).join('\n');
}

module.exports = {
  FORBIDDEN_VISIBLE_RE: FORBIDDEN_VISIBLE_RE,
  ACTION_SENTENCES: ACTION_SENTENCES,
  isBareNameList: isBareNameList,
  sanitizeLegacyStepInstruction: sanitizeLegacyStepInstruction,
  naturalizeFromTitle: naturalizeFromTitle,
  formatNutritionSummary: formatNutritionSummary,
  toCanonicalGarnish: toCanonicalGarnish,
  toCanonicalSteps: toCanonicalSteps,
  toCanonicalTiming: toCanonicalTiming,
  toCanonicalDisplayRecipe: toCanonicalDisplayRecipe,
  validateVisibleDisplayRecipe: validateVisibleDisplayRecipe,
  buildCanonicalVisibleText: buildCanonicalVisibleText,
};
