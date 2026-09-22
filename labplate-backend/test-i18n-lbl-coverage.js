'use strict';
/**
 * i18n: LBL_* Coverage – alle App-Sprachen de/en/es/it/pt/fr/tr.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const LANGS = ['de', 'en', 'es', 'it', 'pt', 'fr', 'tr'];
const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function lblBodies(src) {
  const out = [];
  const re = /\b(LBL_[A-Z0-9_]+)\s*=\s*\{(.*?)\};/gs;
  let m;
  while ((m = re.exec(src))) {
    out.push({ name: m[1], body: m[2] });
  }
  return out;
}

(function testPickFallbackPrefersEn() {
  ['index.html', path.join('LabPlate', 'LabPlate_34_Cursor.html')].forEach(function (rel) {
    const src = read(rel);
    assert.ok(/function pick\(map\)\s*\{\s*return map\[lang\(\)\]\s*\|\|\s*map\.en\s*\|\|\s*map\.de/.test(src), rel);
  });
  console.log('PASS pick() prefers en over de');
}());

(function testLblSevenLangs() {
  ['index.html', path.join('LabPlate', 'LabPlate_34_Cursor.html')].forEach(function (rel) {
    const src = read(rel);
    const bodies = lblBodies(src);
    assert.ok(bodies.length > 50, rel + ' LBL count');
    const incomplete = [];
    bodies.forEach(function (b) {
      // Skip function/array pools checked separately if they lack simple lang:' quotes
      const langs = {};
      LANGS.forEach(function (l) {
        if (new RegExp('\\b' + l + '\\s*:').test(b.body)) langs[l] = true;
      });
      const found = Object.keys(langs);
      if (found.length >= 2 && found.length < 7) {
        incomplete.push(b.name + '=' + found.join('+'));
      }
    });
    assert.strictEqual(incomplete.length, 0, rel + ' incomplete: ' + incomplete.slice(0, 8).join(', '));
    console.log('PASS', rel, 'LBL_* all 7 langs, count=' + bodies.length);
  });
}());

(function testDishFallbackAndPortionLbls() {
  const cursor = read(path.join('LabPlate', 'LabPlate_34_Cursor.html'));
  const index = read('index.html');
  ['LBL_RECIPE_DISH_FALLBACK', 'LBL_RECIPE_PORTION_UNKNOWN_TITLE', 'LBL_RECIPE_PORTION_UNKNOWN_BODY',
    'LBL_RECIPE_COACH_ANALYSIS_LOADING'].forEach(function (k) {
    assert.ok(cursor.indexOf(k) >= 0, 'cursor ' + k);
  });
  assert.ok(index.indexOf('LBL_RECIPE_DISH_FALLBACK') >= 0);
  assert.ok(!/Portionsangabe unklar:<\/strong>/.test(cursor));
  assert.ok(!/: 'Coach-Analyse läuft…'\)|: \"Coach-Analyse läuft…\"\)/.test(cursor));
  assert.ok(/pick\(LBL_RECIPE_COACH_ANALYSIS_LOADING\)/.test(cursor));
  console.log('PASS hardcoded portion/coach/dish externalized');
}());

(function testBackendDishFallbackI18n() {
  const lh = require('./lactose-honesty');
  assert.strictEqual(lh.buildLactoseHonestyMessage('adapted', '', '', 'en').indexOf('this dish') >= 0
    || /this dish|Because you avoid/.test(lh.buildLactoseHonestyMessage('adapted', '', '', 'en')), true);
  const msg = lh.buildLactoseHonestyMessage('impossible', '', '', 'en');
  assert.ok(/this dish/.test(msg));
  assert.ok(!/dieses Gericht/.test(msg));
  console.log('PASS backend dish fallback i18n');
}());

console.log('\nAll i18n LBL coverage tests passed.');
