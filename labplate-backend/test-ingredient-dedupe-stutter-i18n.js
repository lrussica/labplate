'use strict';

const assert = require('assert');
const validator = require('./recipe-validator');
const gate = require('./recipe-quality-gate');
const apiI18n = require('./api-i18n');
const coach = require('./coach/logic');

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log('OK', msg);
}

// --- 1) Ingredient merge ---
(function () {
  const list = [
    { id: '0001', name: 'Mozzarella, gerieben', amount: 40, unit: 'g', protein: 22, fat: 22, netCarbs: 2, fiber: 0 },
    { id: '0002', name: 'Tomate', amount: 100, unit: 'g', protein: 1, fat: 0, netCarbs: 3, fiber: 1 },
    { id: '0003', name: 'Mozzarella, gerieben', amount: 35, unit: 'g', protein: 22, fat: 22, netCarbs: 2, fiber: 0 },
  ];
  const m = validator.mergeDuplicateIngredients(list);
  assert.strictEqual(m.merged.length, 2, 'zwei Einträge nach Merge');
  const mozz = m.merged.find(function (i) { return /Mozzarella/i.test(i.name); });
  assert.ok(mozz, 'Mozzarella bleibt');
  assert.strictEqual(mozz.amount, 75, 'Mengen summiert: ' + mozz.amount);
  assert.strictEqual(m.idMap['0003'], '0001', 'Id 0003 → 0001');
  console.log('OK mergeDuplicateIngredients summiert Mengen');
})();

(function () {
  const recipe = {
    title: 'Test',
    ingredients: [
      { id: '0001', name: 'Olivenöl', amount: 5, unit: 'ml', protein: 0, fat: 100, netCarbs: 0, fiber: 0 },
      { id: '0002', name: 'Olivenöl', amount: 5, unit: 'ml', protein: 0, fat: 100, netCarbs: 0, fiber: 0 },
    ],
    steps: [
      { title: 'Erhitzen', content: '{0001} und {0002} erhitzen.', stove_level: 3, time_min: 1 },
    ],
    garnish: '',
    chef_analysis: 'Fett aus {0002}.',
    nutrition: { kcal: 90, protein_g: 0, fat_g: 10, netto_kh_g: 0, ballaststoffe_g: 0 },
    diet_labels: [],
  };
  const notes = validator.dedupeRecipeIngredients(recipe);
  assert.ok(notes.length, 'dedupe Notes');
  assert.strictEqual(recipe.ingredients.length, 1);
  assert.strictEqual(recipe.ingredients[0].amount, 10);
  assert.ok(!/\{0002\}/.test(recipe.steps[0].content), 'Platzhalter remapped: ' + recipe.steps[0].content);
  assert.ok(/\{0001\}/.test(recipe.steps[0].content));
  console.log('OK dedupeRecipeIngredients remapped Platzhalter');
})();

// --- 2) Prose stutter ---
ok(
  validator.proseIngredientName('Mozzarella, gerieben') === 'Mozzarella',
  'prose: Mozzarella ohne Komma-Zusatz'
);

(function () {
  const byId = {
    '0001': { name: 'Schwarzer Pfeffer', amount: 0, unit: 'prise' },
  };
  const out = validator.resolvePlaceholders(
    'Mit Salz und Pfeffer {0001} abschmecken.',
    byId,
    { nameOnly: true }
  );
  assert.ok(!/Pfeffer\s+Schwarzer\s+Pfeffer/i.test(out), 'kein Pfeffer Schwarzer Pfeffer: ' + out);
  assert.ok(/Schwarzer\s+Pfeffer|Pfeffer/i.test(out), 'Pfeffer-Form bleibt: ' + out);
  console.log('OK resolvePlaceholders Pfeffer-Anti-Stutter: ' + out);
})();

(function () {
  const byId = {
    '0001': { name: 'Mozzarella, gerieben', amount: 50, unit: 'g' },
  };
  const out = validator.resolvePlaceholders(
    'Den Mozzarella {0001} darüber streuen.',
    byId,
    { nameOnly: true }
  );
  assert.ok(!/Mozzarella\s+Mozzarella/i.test(out), 'kein Mozzarella Mozzarella: ' + out);
  assert.ok(/Mozzarella/i.test(out), 'Mozzarella einmal: ' + out);
  console.log('OK resolvePlaceholders Mozzarella-Anti-Stutter: ' + out);
})();

ok(
  validator.cleanupStepProseDuplicates('Pfeffer Schwarzer Pfeffer abschmecken.') ===
    'Schwarzer Pfeffer abschmecken.',
  'cleanupStepProseDuplicates Kurz+Lang'
);
ok(
  !/Mozzarella\s+Mozzarella/i.test(
    validator.cleanupStepProseDuplicates('Mozzarella Mozzarella, gerieben unterheben.', [
      { name: 'Mozzarella, gerieben' },
    ])
  ),
  'cleanupStepProseDuplicates Mozzarella Doppler'
);

// --- 3) QualityGate auto cleanup ---
(function () {
  const recipe = {
    title: 'Pasta Test',
    finalServings: 1,
    sourceServings: 4,
    sourceServingsStatus: 'explicit',
    servingsStatus: 'scaled',
    nutritionSource: 'finalIngredients',
    finalNutrition: { calories: 400, protein: 30, fat: 15, netCarbs: 40, fiber: 5 },
    nutrition: { kcal: 400, protein_g: 30, fat_g: 15, netto_kh_g: 40, ballaststoffe_g: 5 },
    finalIngredients: [
      { name: 'Mozzarella, gerieben', amount: 40, unit: 'g', macrosPer100g: { protein: 22, fat: 22, netCarbs: 2, fiber: 0 } },
      { name: 'Mozzarella, gerieben', amount: 40, unit: 'g', macrosPer100g: { protein: 22, fat: 22, netCarbs: 2, fiber: 0 } },
      { name: 'Nudel', amount: 80, unit: 'g', macrosPer100g: { protein: 12, fat: 2, netCarbs: 70, fiber: 3 } },
    ],
    ingredients: [
      { id: '0001', name: 'Mozzarella, gerieben', amount: 160, unit: 'g', protein: 22, fat: 22, netCarbs: 2, fiber: 0 },
      { id: '0002', name: 'Mozzarella, gerieben', amount: 160, unit: 'g', protein: 22, fat: 22, netCarbs: 2, fiber: 0 },
      { id: '0003', name: 'Nudel', amount: 320, unit: 'g', protein: 12, fat: 2, netCarbs: 70, fiber: 3 },
    ],
    steps: [
      { content: 'Pfeffer Schwarzer Pfeffer und Mozzarella Mozzarella, gerieben untermischen.' },
    ],
    warnings: [
      { code: 'high_fat', message: 'High fat per serving – check portion size or preparation.' },
    ],
    coachWarnings: ['Low protein per serving – consider a protein-rich side or alternative.'],
  };
  const q = gate.evaluateRecipeQuality(JSON.parse(JSON.stringify(recipe)));
  assert.ok(q.qualityChecks.stepStutter, 'stepStutter check vorhanden');
  assert.ok(q.qualityChecks.coachLocalization, 'coachLocalization check vorhanden');
  assert.ok(q.qualityChecks.ingredientDedupe, 'ingredientDedupe check vorhanden');

  // Nach Gate: Steps bereinigt
  const stepText = String(
    (recipe.steps && recipe.steps[0] && (recipe.steps[0].content || recipe.steps[0].instruction)) || ''
  );
  // evaluate mutates a clone above — re-run on live object
  const live = JSON.parse(JSON.stringify(recipe));
  gate.evaluateRecipeQuality(live);
  const liveStep = String(live.steps[0].content || live.steps[0].instruction || '');
  assert.ok(!/Pfeffer\s+Schwarzer\s+Pfeffer/i.test(liveStep), 'Gate säubert Pfeffer-Stutter: ' + liveStep);
  assert.ok(!/Mozzarella\s+Mozzarella/i.test(liveStep), 'Gate säubert Mozzarella-Stutter: ' + liveStep);
  assert.ok(live.finalIngredients.length === 2, 'Gate dedupliziert finalIngredients: ' + live.finalIngredients.length);

  // EN → DE
  assert.ok(Array.isArray(live.warnings));
  assert.strictEqual(
    live.warnings[0].message,
    apiI18n.t('warn_high_fat', 'de'),
    'HealthScore Warning auf DE: ' + live.warnings[0].message
  );
  assert.strictEqual(
    live.coachWarnings[0],
    apiI18n.t('warn_low_protein', 'de'),
    'coachWarnings auf DE'
  );
  assert.ok(
    q.qualityChecks.coachLocalization.status === 'warning' ||
      live.warnings[0].message.indexOf('Fett') >= 0,
    'Localization-Check hat EN erkannt'
  );
  console.log('OK QualityGate Step-Cleanup + DE-Lokalisierung');
})();

// --- 4) Coach defaults to DE ---
(async function () {
  const sample = {
    title: 'Fettig',
    finalServings: 1,
    sourceServingsStatus: 'explicit',
    finalNutrition: { calories: 500, protein: 20, fat: 45, netCarbs: 10, fiber: 4 },
    finalIngredients: [
      { name: 'Öl', amount: 40, unit: 'g', macrosPer100g: { protein: 0, fat: 100, netCarbs: 0, fiber: 0 } },
    ],
    qualityStatus: 'ready',
  };
  const res = await coach.analyzeRecipe(sample, { enrichUsda: false });
  assert.ok(!res.error, 'analyzeRecipe ok: ' + (res.error || ''));
  const msgs = (res.data.warnings || []).map(function (w) { return w.message; });
  assert.ok(msgs.length, 'Warnings erwartet');
  msgs.forEach(function (m) {
    assert.ok(!/^High fat/i.test(m), 'keine EN High-fat Meldung: ' + m);
  });
  const fatWarn = msgs.find(function (m) { return /Fett/i.test(m); });
  assert.ok(fatWarn, 'DE Fett-Warnung: ' + msgs.join(' | '));
  console.log('OK Coach HealthScore Warnings default DE');
})().catch(function (err) {
  console.error('FAIL coach DE', err);
  process.exit(1);
}).then(function () {
  console.log('test-ingredient-dedupe-stutter-i18n: ALL OK');
});
