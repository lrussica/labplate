'use strict';
/**
 * Backend API / Coach messages – EN default + 7-lang coverage.
 */
const assert = require('assert');
const apiI18n = require('./api-i18n');
const coachLogic = require('./coach/logic');
const core = require('./nutri-recipe-core');

const LANGS = ['de', 'en', 'es', 'it', 'pt', 'fr', 'tr'];

(function testMessagePackCoverage() {
  const keys = Object.keys(apiI18n.MESSAGES);
  assert.ok(keys.length >= 20, 'expected many message keys');
  keys.forEach(function (key) {
    const pack = apiI18n.MESSAGES[key];
    LANGS.forEach(function (lang) {
      assert.ok(pack[lang] && String(pack[lang]).length > 0, key + ' missing ' + lang);
    });
    assert.ok(pack.en, key + ' needs EN base');
  });
  console.log('PASS api-i18n MESSAGES all langs, keys=' + keys.length);
}());

(function testDefaultEn() {
  assert.strictEqual(apiI18n.normalizeLang('xx'), 'en');
  assert.strictEqual(apiI18n.t('provider_spoonacular', 'en'), apiI18n.MESSAGES.provider_spoonacular.en);
  assert.notStrictEqual(apiI18n.t('provider_spoonacular', 'de'), apiI18n.t('provider_spoonacular', 'en'));
  assert.ok(/Spoonacular reported/.test(apiI18n.t('provider_spoonacular')));
  console.log('PASS default EN + DE override');
}());

(function testCoachDailyPlanI18n() {
  const de = coachLogic.generateDailyPlan({ calories: 2000, protein: 120, fat: 60, carbs: 180 }, { lang: 'de' });
  const en = coachLogic.generateDailyPlan({ calories: 2000, protein: 120, fat: 60, carbs: 180 }, { lang: 'en' });
  const pt = coachLogic.generateDailyPlan({ calories: 2000, protein: 120, fat: 60, carbs: 180 }, { lang: 'pt' });
  assert.strictEqual(de.data.meals[0].label, 'Frühstück');
  assert.strictEqual(en.data.meals[0].label, 'Breakfast');
  assert.strictEqual(pt.data.meals[0].label, 'Pequeno-almoço');
  assert.ok(/Verteilung/.test(de.data.notes[0]));
  assert.ok(/Split:/.test(en.data.notes[0]));
  console.log('PASS generateDailyPlan i18n');
}());

(function testProviderMessages() {
  const tpdBody = JSON.stringify({ error: { message: 'tokens per day (TPD)' } });
  assert.ok(/Tageskontingent/.test(core.providerErrorClientMessage(429, tpdBody, {}, 'de')));
  assert.ok(/Daily AI provider quota/.test(core.providerErrorClientMessage(429, tpdBody, {}, 'en')));
  assert.ok(/schema/i.test(core.providerErrorClientMessage(400, '', {}, 'en')));
  console.log('PASS providerErrorClientMessage i18n');
}());

(function testVars() {
  const s = apiI18n.t('warn_added_sugar', 'en', { names: 'honey' });
  assert.ok(s.indexOf('honey') >= 0);
  assert.ok(s.indexOf('{names}') < 0);
  console.log('PASS template vars');
}());

console.log('\nAll api-i18n tests passed.');
