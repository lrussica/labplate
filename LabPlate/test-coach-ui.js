/**
 * Frontend-Test: Coach-UI-Helfer + API (LabPlate_34_Cursor.html).
 *
 * Voraussetzung fuer Live-API: Backend auf Port 3004 (npm start / PORT=3004 node server.js).
 *
 *   node LabPlate/test-coach-ui.js
 */

'use strict';

const BASE = process.env.COACH_API_BASE || 'http://127.0.0.1:3004';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Spiegel der UI-Builder aus LabPlate_34_Cursor.html (SYNC halten). */
function buildCoachHealthScoreBadgeHtml(score) {
  if (score == null || !isFinite(Number(score))) return '';
  return '<span class="mrep-badge nutri-coach-pill">HealthScore ' + Math.round(Number(score)) + '</span>';
}
function buildCoachPerServingLineHtml(perServing) {
  // Makro-Einzeiler absichtlich deaktiviert – die Nährwert-Kacheln reichen aus.
  return '';
}
function buildCoachWarningsBadgesHtml(warnings) {
  if (!warnings || !warnings.length) return '';
  var badges = warnings.map(function (w) {
    var msg = (w && w.message) ? String(w.message) : String(w || '');
    if (/Portionsgröße geschätzt|Portionsangabe prüfen|portion_estimated/i.test(msg) ||
        (w && w.code === 'portion_estimated')) {
      return '';
    }
    return '<span class="mrep-badge nutri-coach-pill">' + esc(msg).slice(0, 80) + '</span>';
  }).filter(Boolean);
  if (!badges.length) return '';
  return badges.join('');
}
function buildCoachBadgesRowHtml(scoreBadgeHtml, warningsHtml) {
  var inner = String(scoreBadgeHtml || '') + String(warningsHtml || '');
  if (!inner) return '';
  return '<div class="nutri-recipe-coach-badges">' + inner + '</div>';
}
function buildCoachUsdaStatusHtml(analysis) {
  if (!analysis) return '<p class="nutri-recipe-match">Coach-Analyse läuft…</p>';
  const cov = analysis.coverage || {};
  const line = 'USDA/Coach: ' + (cov.withNutrition != null ? cov.withNutrition : '–') +
    '/' + (cov.total != null ? cov.total : '–') + ' Zutaten mit Nährwerten';
  return '<p class="nutri-recipe-match">' + esc(line) + '</p>';
}

async function postJson(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (_) {}
  return { ok: res.ok, status: res.status, data, text: text.slice(0, 240) };
}

(async () => {
  console.log('Coach-UI Test (API ' + BASE + ')\n');

  // --- UI-Builder (simuliert Render ohne DOM) ---
  const mockAnalysis = {
    healthScore: 90,
    perServing: { calories: 466.2, protein: 29.4, fat: 21.3, netCarbs: 31.8, fiber: 6.8 },
    warnings: [{ code: 'demo', message: 'Demo-Warnung' }],
    coverage: { withNutrition: 4, total: 4 },
  };
  const badge = buildCoachHealthScoreBadgeHtml(mockAnalysis.healthScore);
  assert(badge.indexOf('mrep-badge nutri-coach-pill') !== -1 && badge.indexOf('90') !== -1, 'HealthScore-Badge fehlt');
  const perLine = buildCoachPerServingLineHtml(mockAnalysis.perServing);
  assert(perLine === '', 'Per-Portion-Zeile soll leer sein');
  const warns = buildCoachWarningsBadgesHtml(mockAnalysis.warnings);
  assert(warns.indexOf('Demo-Warnung') !== -1 && warns.indexOf('mrep-badge nutri-coach-pill') !== -1, 'Warnungs-Badges fehlen');
  const row = buildCoachBadgesRowHtml(badge, warns);
  assert(row.indexOf('nutri-recipe-coach-badges') !== -1 && row.indexOf('HealthScore') !== -1 && row.indexOf('Demo-Warnung') !== -1, 'Badge-Row fehlt');
  const usda = buildCoachUsdaStatusHtml(mockAnalysis);
  assert(usda.indexOf('4/4') !== -1, 'USDA-Statuszeile fehlt');
  console.log('OK  UI-Builder: HealthScore / Warnungen (nutri-coach-pill) / Badge-Row / USDA-Status');

  // --- Live-API (wie LabPlateCoachApi.*) ---
  const sampleRecipe = {
    title: 'Lachs mit Quinoa und Brokkoli',
    servings: 2,
    ingredients: [
      { name: 'Atlantic salmon', amount: 200, unit: 'g', caloriesPer100g: 208, macrosPer100g: { protein: 20, fat: 13, netCarbs: 0, fiber: 0 } },
      { name: 'Quinoa, cooked', amount: 300, unit: 'g', caloriesPer100g: 120, macrosPer100g: { protein: 4.4, fat: 1.9, netCarbs: 18.5, fiber: 2.8 } },
      { name: 'Broccoli, raw', amount: 200, unit: 'g', caloriesPer100g: 34, macrosPer100g: { protein: 2.8, fat: 0.4, netCarbs: 4.0, fiber: 2.6 } },
      { name: 'Olive oil', amount: 10, unit: 'ml', caloriesPer100g: 884, macrosPer100g: { protein: 0, fat: 100, netCarbs: 0, fiber: 0 } },
    ],
    steps: ['Kochen'],
  };

  const analyzed = await postJson('/api/coach/analyze-recipe', { enrichUsda: false, recipe: sampleRecipe });
  assert(analyzed.ok, 'analyze-recipe HTTP ' + analyzed.status + ' ' + analyzed.text);
  assert(analyzed.data.healthScore != null, 'healthScore fehlt');
  assert(analyzed.data.perServing && analyzed.data.perServing.calories > 0, 'perServing.calories fehlt');
  console.log('OK  analyze-recipe: healthScore=' + analyzed.data.healthScore);

  console.log('\nAlle Coach-UI-Tests bestanden.');
})().catch((err) => {
  console.error('FAIL', err && err.message ? err.message : err);
  process.exit(1);
});
