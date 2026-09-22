'use strict';

const assert = require('assert');
const classic = require('./classic-culinary-standards');
const validator = require('./recipe-validator');
const gate = require('./recipe-quality-gate');
const core = require('./nutri-recipe-core');

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log('OK', msg);
}

// Detection
ok(!!classic.findClassicDishStandard({ dishQuery: 'Klassische italienische Lasagne' }), 'Lasagne erkannt');
ok(classic.shouldEnforceClassicCores({ dishQuery: 'Klassische italienische Lasagne' }), 'Lasagne Cores enforced');
ok(!classic.shouldEnforceClassicCores({
  dishQuery: 'Kalorienarme Lasagne light version',
}), 'Low-Cal hebt Core-Pflicht auf');
ok(classic.classicGenerationTemperature({ dishQuery: 'Lasagne' }, 0.2) === 0, 'Klassiker temperature 0');
ok(classic.classicGenerationTemperature({ dishQuery: 'Bowl mit Linsen' }, 0.2) === 0.2, 'Normal temperature 0.2');

const prompt = classic.buildClassicStandardsPromptRules({ dishQuery: 'Klassische Lasagne' });
ok(/LASAGNE-CORE/i.test(prompt), 'Prompt enthält Lasagne-Core');
ok(/unverhandelbar/i.test(prompt), 'Prompt unverhandelbar');

// Incomplete Lasagne → fail
const incompleteLasagne = {
  title: 'Klassische italienische Lasagne',
  ingredients: [
    { id: '0001', name: 'Rinderhackfleisch', amount: 500, unit: 'g', protein: 20, fat: 15, netCarbs: 0, fiber: 0 },
    { id: '0002', name: 'Tomatenpassata', amount: 400, unit: 'g', protein: 1, fat: 0, netCarbs: 4, fiber: 1 },
    { id: '0003', name: 'Mozzarella', amount: 200, unit: 'g', protein: 22, fat: 22, netCarbs: 2, fiber: 0 },
  ],
  steps: [{ title: 'Schichten', content: 'Ragù und Béchamel schichten.', stove_level: 0, time_min: 10 }],
  garnish: '',
  chef_analysis: 'Klassisch.',
  nutrition: { kcal: 800, protein_g: 40, fat_g: 40, netto_kh_g: 50, ballaststoffe_g: 5 },
  diet_labels: [],
};

const coreFail = classic.validateClassicCoreComponents(incompleteLasagne, {
  dishQuery: 'Klassische italienische Lasagne',
  title: incompleteLasagne.title,
});
ok(!coreFail.ok, 'unvollständige Lasagne failt Core');
ok(coreFail.problems.some(function (p) { return /Béchamel/i.test(p); }), 'Béchamel fehlt');
ok(coreFail.problems.some(function (p) { return /Sellerie|Karotte|Zwiebel|Sofrito|Ragù/i.test(p); }), 'Sofrito unvollständig');

const proseFail = classic.validateProseComponentCompleteness(incompleteLasagne);
ok(!proseFail.ok, 'Béchamel im Text ohne Rohzutaten failt');
ok(proseFail.problems.some(function (p) { return /Béchamel/i.test(p); }), 'Prosa-Béchamel-Fehler');

// Complete Lasagne → pass
const completeLasagne = {
  title: 'Klassische italienische Lasagne',
  ingredients: [
    { id: '0001', name: 'Rinderhackfleisch', amount: 500, unit: 'g', protein: 20, fat: 15, netCarbs: 0, fiber: 0 },
    { id: '0002', name: 'Zwiebel', amount: 150, unit: 'g', protein: 1, fat: 0, netCarbs: 7, fiber: 2 },
    { id: '0003', name: 'Karotte', amount: 100, unit: 'g', protein: 1, fat: 0, netCarbs: 6, fiber: 2 },
    { id: '0004', name: 'Sellerie', amount: 80, unit: 'g', protein: 1, fat: 0, netCarbs: 2, fiber: 1 },
    { id: '0005', name: 'Tomatenpassata', amount: 400, unit: 'g', protein: 1, fat: 0, netCarbs: 4, fiber: 1 },
    { id: '0006', name: 'Butter', amount: 40, unit: 'g', protein: 0, fat: 82, netCarbs: 0, fiber: 0 },
    { id: '0007', name: 'Weizenmehl', amount: 40, unit: 'g', protein: 10, fat: 1, netCarbs: 70, fiber: 3 },
    { id: '0008', name: 'Vollmilch', amount: 500, unit: 'ml', protein: 3, fat: 3.5, netCarbs: 5, fiber: 0 },
    { id: '0009', name: 'Mozzarella', amount: 200, unit: 'g', protein: 22, fat: 22, netCarbs: 2, fiber: 0 },
    { id: '0010', name: 'Parmesan', amount: 60, unit: 'g', protein: 35, fat: 28, netCarbs: 0, fiber: 0 },
    { id: '0011', name: 'Lasagneplatten', amount: 300, unit: 'g', protein: 12, fat: 2, netCarbs: 70, fiber: 3 },
    { id: '0012', name: 'Olivenöl', amount: 20, unit: 'ml', protein: 0, fat: 100, netCarbs: 0, fiber: 0 },
    { id: '0013', name: 'Salz', amount: 0, unit: 'prise', protein: 0, fat: 0, netCarbs: 0, fiber: 0 },
  ],
  steps: [
    { title: 'Ragù', content: '{0002}, {0003} und {0004} anschwitzen, {0001} und {0005} zugeben.', stove_level: 5, time_min: 20 },
    { title: 'Béchamel', content: '{0006} schmelzen, {0007} einrühren, {0008} aufgießen.', stove_level: 3, time_min: 10 },
    { title: 'Schichten', content: '{0011} mit Ragù, Béchamel, {0009} und {0010} schichten.', stove_level: 0, time_min: 15 },
  ],
  garnish: '',
  chef_analysis: 'Klassische Lasagne mit Ragù und Béchamel.',
  nutrition: { kcal: 1200, protein_g: 80, fat_g: 60, netto_kh_g: 90, ballaststoffe_g: 10 },
  diet_labels: [],
  servings: 4,
};

const coreOk = classic.validateClassicCoreComponents(completeLasagne, {
  dishQuery: 'Klassische italienische Lasagne',
});
ok(coreOk.ok, 'vollständige Lasagne: Core OK — ' + coreOk.problems.join('; '));
const proseOk = classic.validateProseComponentCompleteness(completeLasagne);
ok(proseOk.ok, 'vollständige Lasagne: Prosa OK — ' + proseOk.problems.join('; '));

// Validator integration
const vFail = validator.validateRecipeV2(JSON.parse(JSON.stringify(incompleteLasagne)), {
  dishQuery: 'Klassische italienische Lasagne',
});
ok(!vFail.ok, 'validateRecipeV2 lehnt unvollständige Lasagne ab');
ok(vFail.errors.some(function (e) { return /Klassiker-Standard|Komponenten-Vollständigkeit/i.test(e); }),
  'Validator-Fehler nennt Klassiker/Komponente');

// QualityGate blocks incomplete
const q = gate.evaluateRecipeQuality(JSON.parse(JSON.stringify(incompleteLasagne)), {
  dishQuery: 'Klassische italienische Lasagne',
});
ok(q.qualityChecks.classicCompleteness, 'classicCompleteness check vorhanden');
ok(q.qualityChecks.classicCompleteness.status === 'fail', 'QualityGate classicCompleteness fail');
ok(q.qualityStatus === 'blocked' || (q.qualityErrors || []).length > 0, 'QualityGate blocked/errors');

// Groq request temperature for classic
const body = core.buildGroqRequest({
  structured: false,
  lang: 'de',
  mode: 'idea',
  pantry_ingredients: ['Klassische italienische Lasagne'],
  macros: {},
  micronutrient_gaps: [],
  allergens: [],
  ai_instruction: 'MODUS ORIGINALREZEPT: klassische Lasagne',
  team_ai: false,
});
ok(body.temperature === 0, 'buildGroqRequest Klassiker temperature=0, got ' + body.temperature);
const sys = (body.messages[0] && body.messages[0].content) || '';
ok(/LASAGNE-CORE|KLASSISCHER KULINARIK/i.test(sys), 'System-Prompt enthält Klassiker-Regeln');

// Dressing completeness
const salad = {
  title: 'Salat',
  ingredients: [{ id: '0001', name: 'Salatherz', amount: 200, unit: 'g', protein: 1, fat: 0, netCarbs: 2, fiber: 1 }],
  steps: [{ title: 'Anrichten', content: 'Mit dem Dressing beträufeln.', stove_level: 0, time_min: 2 }],
  garnish: '',
  chef_analysis: 'Frisch.',
};
const dress = classic.validateProseComponentCompleteness(salad);
ok(!dress.ok, 'Dressing ohne Öl/Säure failt');

console.log('test-classic-culinary-standards: ALL OK');
