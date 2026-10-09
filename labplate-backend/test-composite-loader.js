'use strict';
const loader = require('./composite-loader');
const registry = require('./archetypes/id-registry.json');

let pass = 0, fail = 0;
function ok(m) { console.log('OK ' + m); pass++; }
function bad(m) { console.log('FAIL ' + m); fail++; }

const expected = ['amatriciana','arrabbiata','cacio_e_pepe','marinara','napoletana','pesto'];
const listed = loader.listComposites().slice().sort();
if (JSON.stringify(listed) === JSON.stringify(expected.slice().sort())) {
  ok('listComposites: ' + listed.length);
} else {
  bad('listComposites falsch: ' + listed.join(','));
}

for (const id of expected) {
  try {
    const c = loader.loadComposite(id);
    if (c && c.composite === id) ok('load ' + id + ' -> ' + c.displayName);
    else bad('load ' + id + ': composite-Feld falsch');
  } catch (e) {
    bad('load ' + id + ': ' + e.message);
  }
}

// Pesto-Kernpruefung
const p = loader.loadComposite('pesto');
if (p.core.basil && p.core.pine_nut && p.core.parmesan && p.core.pecorino) {
  ok('Pesto.core enthaelt basil + pine_nut + parmesan + pecorino');
} else {
  bad('Pesto.core unvollstaendig');
}
if ((p.forbidden || []).includes('tomato') && (p.forbidden || []).includes('cream_heavy')) {
  ok('Pesto.forbidden enthaelt tomato + cream_heavy');
} else {
  bad('Pesto.forbidden unvollstaendig');
}

// Amatriciana-Kernpruefung
const a = loader.loadComposite('amatriciana');
if ((a.forbidden || []).includes('garlic') && (a.forbidden || []).includes('onion') && (a.forbidden || []).includes('olive_oil')) {
  ok('Amatriciana.forbidden enthaelt garlic + onion + olive_oil');
} else {
  bad('Amatriciana.forbidden unvollstaendig');
}

// Cacio e Pepe: nur 3 Kern-Slots
const c = loader.loadComposite('cacio_e_pepe');
const coreCount = Object.keys(c.core || {}).length;
if (coreCount === 3) ok('Cacio e Pepe hat exakt 3 core-Slots');
else bad('Cacio e Pepe hat ' + coreCount + ' core-Slots, erwartet 3');
if ((c.forbidden || []).includes('olive_oil') && (c.forbidden || []).includes('cream_heavy')) {
  ok('Cacio e Pepe.forbidden enthaelt olive_oil + cream_heavy');
} else {
  bad('Cacio e Pepe.forbidden unvollstaendig');
}

// Registry-Abgleich: alle composite-IDs muessen in Registry sein
let missing = [];
for (const id of expected) {
  const r = registry.ids[id];
  if (!r) missing.push(id);
  else if (r.kind !== 'composite') missing.push(id + '(kind=' + r.kind + ')');
}
if (missing.length === 0) ok('alle 6 Compositen in Registry als kind=composite');
else bad('fehlend in Registry: ' + missing.join(', '));

console.log();
console.log('Pass: ' + pass + '  Fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
