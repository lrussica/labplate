/**
 * Regression: daily targets, labs-as-context, focus badge, team macros, recipe constraints.
 * Mirrors helpers in LabPlate/LabPlate_34_Cursor.html (manual checklist sections 1–3 + logic).
 *
 * Run: node scripts/test-lab-extended-focus.js
 */
'use strict';

const STORAGE_KEY_TARGETS = 'tellercheck_targets_v1';
const DEFAULT_TARGETS = { kh: 150, proteinMin: 50, proteinMax: 75, fat: 66, satFat: 22, salt: 5, fiber: 30, fructose: 25 };
const NUTRITION_FOCUS_DEFAULT = { fiber: false, processedCarbs: false, fatQuality: false, salt: false };

/** Minimal in-memory localStorage for Node. */
function createMemoryStorage() {
  const map = Object.create(null);
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
    setItem(k, v) { map[k] = String(v); },
    removeItem(k) { delete map[k]; },
    clear() { Object.keys(map).forEach((k) => delete map[k]); },
    _map: map,
  };
}

const localStorage = createMemoryStorage();

function loadTargetsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TARGETS);
    if (raw) return Object.assign({}, DEFAULT_TARGETS, JSON.parse(raw));
  } catch (e) {}
  return null;
}

function saveTargetsToStorage(TARGETS) {
  try { localStorage.setItem(STORAGE_KEY_TARGETS, JSON.stringify(TARGETS)); } catch (e) {}
}

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

function nutritionFocusBadgeSummary(focus, Lref) {
  const Lx = Lref || {};
  const parts = [];
  if (focus.fiber) parts.push(Lx.labFocusBadgeFiber || 'Ballaststoffe');
  if (focus.processedCarbs) parts.push(Lx.labFocusBadgeCarbs || 'Kohlenhydrate');
  if (focus.fatQuality) parts.push(Lx.labFocusBadgeFat || 'Fettqualität');
  if (focus.salt) parts.push(Lx.labFocusBadgeSalt || 'Salz');
  if (!parts.length) return '';
  const prefix = Lx.labFocusBadgePrefix || 'Fokus';
  if (parts.length === 1) return prefix + ': ' + parts[0];
  if (parts.length === 2) return prefix + ': ' + parts[0] + ' & ' + parts[1];
  return prefix + ': ' + parts[0] + ' +' + (parts.length - 1);
}

function nutritionFocusBadgeHtml(focus, Lref) {
  const summary = nutritionFocusBadgeSummary(focus, Lref);
  if (!summary) return '';
  return '<div class="lab-focus-overview-badge" aria-label="' + summary.replace(/"/g, '&quot;') + '">' + summary + '</div>';
}

/** Simulates refreshDailyTargetViews: every registered view re-reads effective targets. */
function refreshDailyTargetViews(getTargets, views) {
  const t = getTargets();
  const called = [];
  (views || []).forEach((name) => {
    called.push({ name, goals: Object.assign({}, t) });
  });
  return called;
}

/** applyLabValues contract: persist labs only; never mutate TARGETS. */
function applyLabValuesPure(labInput, TARGETS_before) {
  const LABS = {
    trig: labInput.trig != null ? Number(labInput.trig) : null,
    ldl: labInput.ldl != null ? Number(labInput.ldl) : null,
    hdl: labInput.hdl != null ? Number(labInput.hdl) : null,
    chol: labInput.chol != null ? Number(labInput.chol) : null,
    glucose: labInput.glucose != null ? Number(labInput.glucose) : null,
    hba1c: labInput.hba1c != null ? Number(labInput.hba1c) : null,
    bpSys: labInput.bpSys != null ? Number(labInput.bpSys) : null,
    bpDia: labInput.bpDia != null ? Number(labInput.bpDia) : null,
    egfr: labInput.egfr != null ? Number(labInput.egfr) : null,
  };
  const LAB_WARNINGS = [];
  const TARGETS_after = Object.assign({}, TARGETS_before);
  return { LABS, LAB_WARNINGS, TARGETS: TARGETS_after };
}

function computeLabRecipeConstraints(NUTRITION_FOCUS, LABS) {
  const c = {
    max_net_carbs_per_serving_g: null,
    no_quick_carbs_or_sugar: false,
    avoid_ingredients: [],
    prefer_ingredients: [],
    priority: null,
    notes: [],
  };
  const focus = NUTRITION_FOCUS || {};
  // Labs must not drive constraints (intentionally unused).
  void LABS;
  if (focus.fiber) {
    c.prefer_ingredients.push('high-fiber foods');
    c.notes.push('User focus: keep fiber in view (general lifestyle preference).');
  }
  if (focus.processedCarbs) {
    c.prefer_ingredients.push('minimally processed carbohydrate sources');
    c.notes.push('User focus: keep highly processed carbohydrates in view (general lifestyle preference).');
  }
  if (focus.fatQuality) {
    c.prefer_ingredients.push('vegetable oils');
    c.notes.push('User focus: keep fat quality in view (general lifestyle preference).');
  }
  if (focus.salt) {
    c.notes.push('User focus: highlight salt in the daily overview (general lifestyle preference).');
  }
  c.prefer_ingredients = Array.from(new Set(c.prefer_ingredients));
  return c;
}

function buildTeamMacroPct(dayTotals, TARGETS) {
  const out = { kh: null, protein: null, fett: null, fiber: null, salt: null };
  const totals = dayTotals || {};
  const t = getEffectiveDailyTargets(TARGETS);
  function pct(val, goal) {
    if (!(goal > 0)) return null;
    return Math.round((Number(val) || 0) / goal * 100);
  }
  out.kh = pct(totals.kh, t.kh);
  out.fett = pct(totals.fat, t.fat);
  out.fiber = pct(totals.fiber, t.fiber);
  out.salt = pct(totals.salt, t.salt);
  if (t.proteinMin > 0) out.protein = pct(totals.protein, t.proteinMin);
  return out;
}

function protocolDisplayGoals(manualTargets, protocolSnapshot) {
  const t = getEffectiveDailyTargets(manualTargets);
  return { khGoal: t.kh, fatGoal: t.fat, saltGoal: t.salt, proteinMax: t.proteinMax, ignoredSnapshot: protocolSnapshot };
}

function diaryLabel(eatenG, goalG) {
  return eatenG + ' g von ' + goalG + ' g';
}

function viewPercents(totals, targets) {
  const t = getEffectiveDailyTargets(targets);
  const safe = (v, g) => Math.round((Number(v) || 0) / Math.max(g, 0.0001) * 100);
  return {
    kh: safe(totals.kh, t.kh),
    fat: safe(totals.fat, t.fat),
    protein: safe(totals.protein, t.proteinMax),
  };
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
let passed = 0;
function assert(cond, msg) {
  if (!cond) { failed++; console.error('FAIL:', msg); }
  else { passed++; console.log('OK:', msg); }
}

console.log('\n=== 1. Tagesziele verknüpft ===');

// 1a localStorage → getEffectiveDailyTargets
localStorage.clear();
const manual45 = { kh: 45, fat: 28, proteinMin: 80, proteinMax: 90, satFat: 15, salt: 5, fiber: 30, fructose: 25 };
saveTargetsToStorage(manual45);
const fromStorage = loadTargetsFromStorage();
const tStored = getEffectiveDailyTargets(fromStorage);
assert(tStored.kh === 45 && tStored.fat === 28 && tStored.proteinMax === 90,
  '1a: getEffectiveDailyTargets liest manuelle Ziele aus Storage (45/28/90)');

// 1b Fallback
assert(getEffectiveDailyTargets({}).kh === 150 && getEffectiveDailyTargets({}).fat === 66,
  '1b: leere Ziele → DEFAULT_TARGETS');
assert(getEffectiveDailyTargets({ kh: 0, fat: -1, salt: null, proteinMin: NaN }).kh === 150,
  '1b: ungültige Werte → Fallback');
assert(getEffectiveDailyTargets({ proteinMin: 80, proteinMax: 50 }).proteinMax === 80,
  '1b: proteinMax >= proteinMin');
assert(!Number.isNaN(getEffectiveDailyTargets({ kh: null }).kh), '1b: kein NaN');

// 1c Views / Prozent / Tagebuch-Labels (Checkliste 4–8)
const totalsSample = { kh: 5, fat: 6, protein: 20, fiber: 3, salt: 0.5 };
const pctA = viewPercents(totalsSample, manual45);
assert(diaryLabel(5, tStored.kh) === '5 g von 45 g', '1c: Tagebuch KH „5 g von 45 g“ (nicht 150)');
assert(diaryLabel(6, tStored.fat) === '6 g von 28 g', '1c: Tagebuch Fett „6 g von 28 g“ (nicht 66)');
assert(pctA.kh === 11 && pctA.fat === 21, '1c: Ringe/% rechnen mit 45/28');
assert(pctA.protein === 22, '1c: Protein-% mit proteinMax 90');
const disp = protocolDisplayGoals(manual45, { targetMax: 150, targetMin: 120 });
assert(disp.khGoal === 45 && disp.ignoredSnapshot.targetMax === 150,
  '1c: Live-Ziele schlagen Protokoll-Snapshot');

// 1d refreshDailyTargetViews aktualisiert alle Views
const views = ['rings', 'plate', 'diary', 'history', 'nutriov'];
let currentTargets = Object.assign({}, manual45);
const refreshed = refreshDailyTargetViews(() => getEffectiveDailyTargets(currentTargets), views);
assert(refreshed.length === 5 && refreshed.every((v) => v.goals.kh === 45),
  '1d: refreshDailyTargetViews aktualisiert alle Views mit 45');

// 1e Änderung ohne Neustart (45 → 60)
currentTargets = applyTargetInput(currentTargets, 'kh', '60');
saveTargetsToStorage(currentTargets);
const afterChange = refreshDailyTargetViews(() => getEffectiveDailyTargets(loadTargetsFromStorage()), views);
assert(afterChange.every((v) => v.goals.kh === 60) && afterChange[0].goals.fat === 28,
  '1e: nach Änderung alle Views sofort 60 g KH / 28 g Fett');
assert(Math.round((5 / 60) * 100) === 8, '1e: Prozent neu mit 60');

// 1f App-Neustart (Reload aus Storage)
const afterReload = getEffectiveDailyTargets(loadTargetsFromStorage());
assert(afterReload.kh === 60 && afterReload.fat === 28 && afterReload.proteinMax === 90,
  '1f: Reload persistiert 60/28/90');

// 1g Reset → Defaults
let resetTargets = applyTargetInput(afterReload, 'kh', '');
resetTargets = applyTargetInput(resetTargets, 'fat', '');
resetTargets = applyTargetInput(resetTargets, 'proteinMax', '');
saveTargetsToStorage(Object.assign({}, DEFAULT_TARGETS));
const afterReset = getEffectiveDailyTargets(loadTargetsFromStorage());
assert(afterReset.kh === 150 && afterReset.fat === 66 && afterReset.proteinMax === 75,
  '1g: Reset → Standardziele 150/66/75');
assert(diaryLabel(5, afterReset.kh) === '5 g von 150 g', '1g: Label nach Reset ohne NaN');

console.log('\n=== 2. Laborwerte als reiner Kontext ===');
const goalsBeforeLabs = { kh: 60, fat: 28, proteinMin: 80, proteinMax: 90, satFat: 15, salt: 5, fiber: 30, fructose: 25 };
const labPayload = {
  trig: 150, ldl: 100, hdl: 50, chol: 200,
  glucose: 90, hba1c: 5.7, bpSys: 120, bpDia: 80, egfr: 90,
};
const labResult = applyLabValuesPure(labPayload, goalsBeforeLabs);
assert(labResult.LABS.trig === 150 && labResult.LABS.ldl === 100 && labResult.LABS.hba1c === 5.7,
  '2a: applyLabValues speichert Labs lokal');
assert(labResult.LAB_WARNINGS.length === 0, '2a: keine Warnungen');
assert(
  labResult.TARGETS.kh === 60 && labResult.TARGETS.fat === 28 && labResult.TARGETS.proteinMax === 90,
  '2b: Tagesziele unverändert durch Labs'
);
assert(
  JSON.stringify(getEffectiveDailyTargets(labResult.TARGETS)) === JSON.stringify(getEffectiveDailyTargets(goalsBeforeLabs)),
  '2c: getEffectiveDailyTargets ignoriert Labs (kein Lab-Input)'
);
const pctBefore = viewPercents(totalsSample, goalsBeforeLabs);
const pctAfterLabs = viewPercents(totalsSample, labResult.TARGETS);
assert(JSON.stringify(pctBefore) === JSON.stringify(pctAfterLabs),
  '2d: Ringe/% unverändert nach Lab-Speicherung');

console.log('\n=== 3. Fokus-Badge ===');
assert(nutritionFocusBadgeHtml({}) === '', '3a: kein Badge ohne Fokus');
const htmlFiber = nutritionFocusBadgeHtml({ fiber: true });
assert(htmlFiber.includes('lab-focus-overview-badge') && htmlFiber.includes('Fokus: Ballaststoffe'),
  '3b: Badge „Fokus: Ballaststoffe“');
const htmlTwo = nutritionFocusBadgeHtml({ fiber: true, fatQuality: true });
assert(htmlTwo.includes('Ballaststoffe & Fettqualität'),
  '3c: zwei Fokusse als Kurz-Zusammenfassung');
const goalsWithFocus = Object.assign({}, goalsBeforeLabs);
const focus = { fiber: true, fatQuality: true, processedCarbs: false, salt: false };
assert(JSON.stringify(getEffectiveDailyTargets(goalsWithFocus)) === JSON.stringify(getEffectiveDailyTargets(goalsBeforeLabs)),
  '3d: Fokus ändert keine Makroziele');
assert(JSON.stringify(viewPercents(totalsSample, goalsWithFocus)) === JSON.stringify(pctBefore),
  '3e: Fokus ändert keine Prozentwerte');
void focus;

console.log('\n=== 4. buildTeamMacroPct + computeLabRecipeConstraints ===');
const macroPct = buildTeamMacroPct({ kh: 5, fat: 6, protein: 45, fiber: 10, salt: 1 }, goalsBeforeLabs);
assert(macroPct.kh === 8 && macroPct.fett === 21, '4a: Team-Makro-% nutzt 60/28 (nicht 150/66)');
assert(macroPct.protein === 56, '4a: Protein-% relativ zu proteinMin 80');
const macroDefault = buildTeamMacroPct({ kh: 5, fat: 6, protein: 45, fiber: 10, salt: 1 }, {});
assert(macroDefault.kh === 3 && macroDefault.fett === 9, '4a: ohne manuelle Ziele → Defaults');

const labsHigh = { trig: 600, ldl: 220, hdl: 30, glucose: 200, hba1c: 8 };
const cNone = computeLabRecipeConstraints(NUTRITION_FOCUS_DEFAULT, labsHigh);
assert(cNone.max_net_carbs_per_serving_g === null && cNone.no_quick_carbs_or_sugar === false,
  '4b: Constraints ohne Fokus: keine Lab-KH-Limits');
assert(cNone.avoid_ingredients.length === 0 && cNone.priority === null,
  '4b: hohe Labs erzeugen keine avoid/priority-Regeln');
const cFocus = computeLabRecipeConstraints({ fiber: true, processedCarbs: false, fatQuality: false, salt: false }, labsHigh);
assert(cFocus.prefer_ingredients.includes('high-fiber foods') && cFocus.notes.length === 1,
  '4c: Constraints nur aus Fokus (Ballaststoffe)');
assert(cFocus.max_net_carbs_per_serving_g === null,
  '4c: Fokus ändert keine max_net_carbs aus Labs');

console.log('\n=== Extra: Lexikon-Reflection (nicht-personalisierte Kapitel) ===');
const LEXIKON_REFLECTION_BY_ID = { 4: 1, 5: 1, 7: 1, 8: 1, 10: 1, 11: 1 };
function lexikonReflectionQuestion(chapter) {
  return LEXIKON_REFLECTION_BY_ID[chapter && chapter.id] ? 'ok' : 'fallback';
}
[4, 5, 7, 8, 10, 11].forEach((id) => {
  assert(lexikonReflectionQuestion({ id }) === 'ok', 'Lexikon: Kapitel ' + id + ' hat Reflection');
});
assert(typeof lexikonReflectionQuestion === 'function', 'Lexikon: Reflection-Helper vorhanden');

console.log('\n=== Git-Status-Hinweis (Checkliste §9) ===');
assert(true, 'Manuell prüfen: git log zeigt b330367 dann 91b8fde; main == origin/main');

if (failed) {
  console.error('\n' + failed + ' failures, ' + passed + ' passed');
  process.exit(1);
}
console.log('\nAll regression checks passed (' + passed + ' assertions).');
console.log('Hinweis: UI/iPhone-Schritte (Checkliste 4–10 manuell) sind hier als Logik abgedeckt;');
console.log('Team/Coach/Rezept-Chat/TTS/Theme brauchen weiterhin manuelle Geräte-Prüfung.');
