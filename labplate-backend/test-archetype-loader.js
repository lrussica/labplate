'use strict';
const loader = require('./archetype-loader');

let pass = 0, fail = 0;
function ok(msg) { console.log('OK ' + msg); pass++; }
function bad(msg) { console.log('FAIL ' + msg); fail++; }

const expected = ['A1_pasta','A3_pan_dish','A4_stew_curry','A7_bowl_salad','A10_protein_with_side'];
const listed = loader.listArchetypes().slice().sort();
if (JSON.stringify(listed) === JSON.stringify(expected.slice().sort())) {
  ok('listArchetypes: ' + listed.length);
} else {
  bad('listArchetypes falsch: ' + listed.join(','));
}

for (const id of expected) {
  try {
    const a = loader.loadArchetype(id);
    if (a && a.archetype) ok('load ' + id + ' -> ' + a.archetype);
    else bad('load ' + id + ': kein archetype-Feld');
    const v = loader.validateArchetype(id);
    if (v.unknown.length === 0) {
      ok('validate ' + id + ': ' + v.yamlIds.length + ' IDs, alle bekannt');
    } else {
      bad('validate ' + id + ': ' + v.unknown.length + ' unbekannte IDs');
      v.unknown.forEach(u => console.log('    UNKNOWN: ' + u));
    }
  } catch (e) {
    bad('load ' + id + ': ' + e.message);
  }
}

// A1: kein Hafer in core.pasta
const a1 = loader.loadArchetype('A1_pasta');
const pastaCore = a1.core && a1.core.pasta && a1.core.pasta.allowed;
if (Array.isArray(pastaCore) && !pastaCore.includes('oats') && !pastaCore.includes('haferflocken')) {
  ok('A1.core.pasta ohne Hafer');
} else {
  bad('A1.core.pasta enthaelt Hafer oder ist kaputt');
}

// A1: side_policy korrekt
if (loader.getSidePolicy(a1) === 'only-if-requested') ok('A1 side_policy');
else bad('A1 side_policy: ' + loader.getSidePolicy(a1));

// A10: iPhone-Test-Bug geschlossen
const a10 = loader.loadArchetype('A10_protein_with_side');
if (loader.getSidePolicy(a10) === 'only-if-requested') ok('A10 side_policy (iPhone-Test-Bug geschlossen)');
else bad('A10 side_policy: ' + loader.getSidePolicy(a10));

// Catalog-Aufloesung: direkter Key
const ce = loader.getCatalogEntry('chicken_breast');
if (ce && ce.per100g && ce.per100g.protein > 20) ok('getCatalogEntry(chicken_breast) protein=' + ce.per100g.protein);
else bad('getCatalogEntry(chicken_breast) fehlgeschlagen');

// Catalog-Aufloesung: Alias
const ce2 = loader.getCatalogEntry('spaghetti');
if (ce2 && ce2.per100g && ce2.per100g.kcal > 300) ok('getCatalogEntry(spaghetti) -> pasta_dry kcal=' + ce2.per100g.kcal);
else bad('getCatalogEntry(spaghetti) fehlgeschlagen');

// Composite liefert null (erwartet)
const ce3 = loader.getCatalogEntry('carbonara');
if (ce3 === null) ok('getCatalogEntry(carbonara) = null (composite, erwartet)');
else bad('getCatalogEntry(carbonara) sollte null sein');

console.log();
console.log('Pass: ' + pass + '  Fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
