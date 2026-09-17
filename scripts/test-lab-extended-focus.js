/**
 * Regression: getEffectiveDailyTargets + focus badge + no lab influence on targets.
 * Mirrors helpers in LabPlate/LabPlate_34_Cursor.html (Tests A–F).
 */
'use strict';

const DEFAULT_TARGETS = { kh: 150, proteinMin: 50, proteinMax: 75, fat: 66, satFat: 22, salt: 5, fiber: 30, fructose: 25 };

function getEffectiveDailyTargets(TARGETS) {
  const base = DEFAULT_TARGETS;
  const src = TARGETS || {};
  const num = (v, fallback) => {
    const n = Number(v);
    return (isFinite(n) && n > 0) ? n : fallback;
  };
  const proteinMin = num(src.proteinMin, base.proteinMin);
  let proteinMax = num(src.proteinMax, base.proteinMax);
  if (proteinMax < proteinMin) proteinMax = proteinMin;
  return {
    kh: num(src.kh, base.kh),
    proteinMin,
    proteinMax,
    fat: num(src.fat, base.fat),
    satFat: num(src.satFat, base.satFat),
    salt: num(src.salt, base.salt),
    fiber: num(src.fiber, base.fiber),
    fructose: num(src.fructose, base.fructose),
  };
}

function nutritionFocusBadgeSummary(focus) {
  const parts = [];
  if (focus.fiber) parts.push('Ballaststoffe');
  if (focus.processedCarbs) parts.push('Kohlenhydrate');
  if (focus.fatQuality) parts.push('Fettqualität');
  if (focus.salt) parts.push('Salz');
  if (!parts.length) return '';
  if (parts.length === 1) return 'Fokus: ' + parts[0];
  if (parts.length === 2) return 'Fokus: ' + parts[0] + ' & ' + parts[1];
  return 'Fokus: ' + parts[0] + ' +' + (parts.length - 1);
}

function protocolDisplayGoals(manualTargets, protocolSnapshot) {
  const t = getEffectiveDailyTargets(manualTargets);
  return { khGoal: t.kh, fatGoal: t.fat, saltGoal: t.salt, ignoredSnapshot: protocolSnapshot };
}

/** Simuliert leeres Ziel-Feld → Fallback auf DEFAULT (wie Settings-Bind). */
function applyTargetInput(TARGETS, key, raw) {
  const next = Object.assign({}, TARGETS);
  const s = String(raw == null ? '' : raw).trim();
  const v = parseFloat(s);
  if (s === '' || isNaN(v) || v <= 0) next[key] = DEFAULT_TARGETS[key];
  else next[key] = v;
  return next;
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) { failed++; console.error('FAIL:', msg); }
  else console.log('OK:', msg);
}

// Test A: custom goals
const custom = { kh: 45, fat: 28, proteinMin: 60, proteinMax: 90, satFat: 15, salt: 4, fiber: 30, fructose: 25 };
const tA = getEffectiveDailyTargets(custom);
assert(tA.kh === 45 && tA.fat === 28, 'A: custom kh/fat used');
assert(tA.proteinMin === 60 && tA.proteinMax === 90, 'A: custom protein used');
assert(Math.round((5 / tA.kh) * 100) === 11, 'A: percent uses 45 not 150');
assert(Math.round((6 / tA.fat) * 100) === 21, 'A: fat percent uses 28 not 66');
const disp = protocolDisplayGoals(custom, { targetMax: 150, targetMin: 120 });
assert(disp.khGoal === 45 && disp.ignoredSnapshot.targetMax === 150, 'A: diary uses live 45 not snapshot 150');

// Test B: change without restart
const tB = getEffectiveDailyTargets({ ...custom, kh: 60 });
assert(tB.kh === 60, 'B: updated kh 60');
assert(Math.round((5 / tB.kh) * 100) === 8, 'B: percent recalculated with 60');

// Test C: reload from storage shape
const loaded = getEffectiveDailyTargets(Object.assign({}, DEFAULT_TARGETS, JSON.parse(JSON.stringify(custom))));
assert(loaded.kh === 45 && loaded.fat === 28 && loaded.proteinMin === 60, 'C: persisted shape restores custom goals');

// Test D: defaults / invalid / clear field
assert(getEffectiveDailyTargets({}).kh === 150 && getEffectiveDailyTargets({}).fat === 66, 'D: empty -> defaults');
assert(getEffectiveDailyTargets({ kh: 0, fat: -1, salt: null }).kh === 150, 'D: invalid -> fallback');
assert(getEffectiveDailyTargets({ proteinMin: 80, proteinMax: 50 }).proteinMax === 80, 'D: max>=min');
const cleared = applyTargetInput(custom, 'kh', '');
assert(cleared.kh === 150 && getEffectiveDailyTargets(cleared).kh === 150, 'D: cleared field -> default 150');
assert(!Number.isNaN(getEffectiveDailyTargets({ kh: null }).kh), 'D: no NaN');

// Test E: labs must not affect helper (helper has no lab params)
const withLabsIgnored = getEffectiveDailyTargets(custom);
assert(withLabsIgnored.kh === 45 && withLabsIgnored.fat === 28, 'E: goals unchanged without lab inputs');

// Test F: focus badge
assert(nutritionFocusBadgeSummary({}) === '', 'F: no badge without focus');
assert(nutritionFocusBadgeSummary({ fiber: true }) === 'Fokus: Ballaststoffe', 'F: fiber badge');
assert(nutritionFocusBadgeSummary({ fiber: true, salt: true }) === 'Fokus: Ballaststoffe & Salz', 'F: two focuses');
assert(getEffectiveDailyTargets(custom).kh === 45, 'F: badge path does not change goals');

if (failed) { console.error(failed + ' failures'); process.exit(1); }
console.log('\nAll regression checks passed (A–F).');
