'use strict';
/**
 * P2: weiche Laktose-/Allergen-Formulierungen + i18n-Konsistenz (DE/EN/ES/IT/PT/FR/TR).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const lactoseHonesty = require('./lactose-honesty');

const LANGS = ['de', 'en', 'es', 'it', 'pt', 'fr', 'tr'];
const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

(function testBackendFallbackSoft() {
  const src = read('labplate-backend/recipe-display-fixes.js');
  assert.ok(!/Laktoseunverträglichkeit/i.test(src));
  assert.ok(/Weil du Laktose meidest/i.test(src));
  console.log('PASS backend adaptation fallback soft');
}());

(function testBackendMessagesAllLangs() {
  LANGS.forEach(function (lang) {
    const a = lactoseHonesty.buildLactoseHonestyMessage('adapted', 'X', '', lang);
    const i = lactoseHonesty.buildLactoseHonestyMessage('impossible', 'Y', '', lang);
    const alt = lactoseHonesty.buildLactoseHonestyMessage('alternative_available', 'Z', 'Alt', lang);
    assert.ok(a && i && alt);
    assert.ok(!/Laktoseunverträglichkeit/i.test(a + i + alt));
  });
  assert.ok(/Because you avoid lactose/i.test(
    lactoseHonesty.buildLactoseHonestyMessage('adapted', 'Pasta', '', 'en')
  ));
  assert.ok(!/Weil du Laktose/i.test(
    lactoseHonesty.buildLactoseHonestyMessage('adapted', 'Pasta', '', 'en')
  ));
  console.log('PASS backend lactose messages all langs');
}());

(function testHtmlAllergenNeutral() {
  ['index.html', path.join('LabPlate', 'LabPlate_34_Cursor.html')].forEach(function (rel) {
    const src = read(rel);
    assert.strictEqual((src.match(/\baiRuleAllergenWarning:/g) || []).length, 7, rel + ' allergen keys');
    assert.ok(!/verträgt folgende Stoffe NICHT/i.test(src), rel);
    assert.ok(!/CANNOT tolerate/i.test(src), rel);
    assert.ok(!/NO tolera/i.test(src), rel);
    assert.ok(!/NON tollera/i.test(src), rel);
    assert.ok(!/NÃO tolera/i.test(src), rel);
    assert.ok(!/NE tolère PAS/i.test(src), rel);
    assert.ok(!/TOLERE EDEMİYOR/i.test(src), rel);
    assert.ok(/soll folgende Stoffe NICHT enthalten/i.test(src), rel + ' DE');
    assert.ok(/should NOT contain/i.test(src), rel + ' EN');
    assert.ok(/NO debe contener/i.test(src), rel + ' ES');
    assert.ok(/NON deve contenere/i.test(src), rel + ' IT');
    assert.ok(/NÃO deve conter/i.test(src), rel + ' PT');
    assert.ok(/ne doit PAS contenir/i.test(src), rel + ' FR');
    assert.ok(/İÇERMEMELİ/i.test(src), rel + ' TR');
    // Laktose-Honesty in Allergen-Warnung (alle Sprachen)
    assert.ok(/Bei Laktose:|For lactose:|Para lactosa:|Per il lattosio:|Para lactose:|Pour le lactose|Laktoz için:/i.test(src));
  });
  console.log('PASS allergen warnings neutral + lactose note all langs');
}());

(function testHtmlLactoseLbls() {
  ['index.html', path.join('LabPlate', 'LabPlate_34_Cursor.html')].forEach(function (rel) {
    const src = read(rel);
    ['LBL_RECIPE_DAIRY_FREE_ADAPTATION', 'LBL_RECIPE_LACTOSE_ALTERNATIVE',
      'LBL_RECIPE_LACTOSE_IMPOSSIBLE', 'LBL_RECIPE_LACTOSE_ALTERNATIVE_CTA'].forEach(function (k) {
      assert.ok(src.indexOf(k) >= 0, rel + ' ' + k);
    });
    assert.ok(/Weil du Laktose meidest/i.test(src), rel);
    assert.ok(/Because you avoid lactose/i.test(src), rel);
    assert.ok(!/Laktoseunverträglichkeit angegeben/i.test(src), rel);
    // microGroupIntro soft
    assert.ok(/Nach Themen sortiert/i.test(src), rel);
    assert.ok(!/medizinischer Relevanz/i.test(src), rel);
    assert.ok(!/clinical relevance/i.test(src), rel);
  });
  console.log('PASS lactose LBLs + soft microGroupIntro');
}());

(function testExtraPhrasesLactose() {
  ['index.html', path.join('LabPlate', 'LabPlate_34_Cursor.html')].forEach(function (rel) {
    const src = read(rel);
    assert.ok(/lactose:\s*\[[\s\S]*?Milch[\s\S]*?Sahne[\s\S]*?Butter/i.test(src), rel);
  });
  console.log('PASS EXTRA_PHRASES.lactose expanded');
}());

(function testFreesearchAllLangs() {
  ['index.html', path.join('LabPlate', 'LabPlate_34_Cursor.html')].forEach(function (rel) {
    const src = read(rel);
    const m = src.match(/LBL_RECIPE_FREESEARCH_AI_INSTRUCTION\s*=\s*\{([\s\S]*?)\n\s*\};/);
    assert.ok(m, rel + ' fresearch block');
    LANGS.forEach(function (lang) {
      assert.ok(new RegExp('\\b' + lang + ':\\s*\'').test(m[1]), rel + ' fresearch ' + lang);
      const langBlock = m[1].match(new RegExp(lang + ':\\s*\'((?:\\\\.|[^\'])*)\''));
      assert.ok(langBlock && /LACTOSE_HONESTY/.test(langBlock[1]), rel + ' sentinel ' + lang);
    });
  });
  console.log('PASS fresearch instruction all langs + sentinel');
}());

console.log('\nAll P2 wording/i18n tests passed.');
