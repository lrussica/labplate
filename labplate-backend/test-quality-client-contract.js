'use strict';
/**
 * Client-Vertrag: qualityStatus=blocked bleibt anzeigbar (außer Allergen /
 * unlesbares kanonisches Display). qualityWarnings müssen in die Karte.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(
  path.join(__dirname, '..', 'LabPlate', 'LabPlate_34_Cursor.html'),
  'utf8'
);

assert.ok(html.indexOf('function isHardQualityBlock(') >= 0, 'isHardQualityBlock fehlt');
assert.ok(html.indexOf('function buildRecipeQualityNoticeHtml(') >= 0, 'buildRecipeQualityNoticeHtml fehlt');
assert.ok(html.indexOf('LBL_RECIPE_QUALITY_SOFT_BLOCKED') >= 0, 'LBL_RECIPE_QUALITY_SOFT_BLOCKED fehlt');
assert.ok(html.indexOf('buildRecipeQualityNoticeHtml(rBase, escNutri)') >= 0, 'Notice nicht in Rezeptkarte');
assert.ok(html.indexOf('nutri-recipe-quality-notice') >= 0, 'Quality-Notice-CSS/Markup fehlt');

assert.ok(html.indexOf('if (isHardQualityBlock(gated))') >= 0, 'commit muss nur Allergen hart blocken');
assert.ok(
  !/if \(gated\.qualityStatus === 'blocked'\)/.test(html),
  'commit darf culinary blocked nicht mehr als Fehlerkarte behandeln'
);
assert.ok(
  !/if \(nutriRecipeState\.result\.qualityStatus === 'blocked'\)/.test(html),
  'Render darf blocked nicht mehr verwerfen'
);
assert.ok(
  !/if \(display\.qualityStatus === 'blocked'\)/.test(html),
  'Canonical-Render darf qualityStatus=blocked nicht mehr verwerfen'
);
assert.ok(html.indexOf('if (isHardQualityBlock(nutriScaledData))') >= 0, 'Chat-Allergen-Hard-Block fehlt');
assert.ok(
  html.indexOf("if (nutriScaledData.qualityStatus === 'blocked')") < 0,
  'Chat darf culinary blocked nicht mehr als reine Fehlerblase behandeln'
);

console.log('PASS quality client contract: soft-blocked usable, warnings on card, allergen hard-block');
