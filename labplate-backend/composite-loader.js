'use strict';
/**
 * composite-loader.js
 * ====================
 * Laedt die Composite-YAMLs (Sugo-Sorten, Pesto, Cacio e Pepe).
 * Parallel zu archetype-loader.js.
 *
 * Composite = benannte Sauce mit definierter Zutatenbasis.
 * Der Guard nutzt diese Profile, um zu pruefen, ob eine KI-generierte
 * Sauce als "Pesto" oder "Amatriciana" durchgeht oder verfaelscht ist.
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const COMP_DIR = path.join(__dirname, 'composites');
const _cache = {};

function listComposites() {
  if (!fs.existsSync(COMP_DIR)) return [];
  return fs.readdirSync(COMP_DIR)
    .filter(f => f.endsWith('.yaml'))
    .map(f => f.replace(/\.yaml$/, ''));
}

function loadComposite(id) {
  if (_cache[id]) return _cache[id];
  const file = path.join(COMP_DIR, id + '.yaml');
  if (!fs.existsSync(file)) throw new Error('Unbekanntes Composite: ' + id);
  const doc = yaml.load(fs.readFileSync(file, 'utf8'));
  if (!doc || typeof doc !== 'object') throw new Error('YAML leer: ' + id);
  _cache[id] = doc;
  return doc;
}

function collectCompositeIds(composite) {
  const ids = new Set();
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    for (const [k, v] of Object.entries(node)) {
      if (k === 'allowed') {
        if (Array.isArray(v)) v.forEach(x => { if (typeof x === 'string') ids.add(x); });
        else if (v && typeof v === 'object') Object.keys(v).forEach(x => ids.add(x));
      } else if (k === 'forbidden' && Array.isArray(v)) {
        v.forEach(x => { if (typeof x === 'string') ids.add(x); });
      } else {
        walk(v);
      }
    }
  }
  walk(composite);
  return Array.from(ids);
}

module.exports = {
  listComposites,
  loadComposite,
  collectCompositeIds,
  COMP_DIR,
};
