'use strict';
/**
 * archetype-loader.js
 * ====================
 * Laedt die Archetypen-YAMLs (Block E) und validiert jede verwendete
 * Zutaten-ID gegen id-registry.json.
 *
 * Zweck im grossen Ziel:
 *   Solver und Validator bekommen ueber dieses Modul die erlaubten
 *   Zutaten, Mengen, Ratios und Verbote. Erst damit kann das Backend
 *   pruefen, ob ein LLM-Generat die Gericht-Identitaet verletzt.
 *
 * Kein Schreiben, nur Lesen. Kein Netzwerk. Kein LLM.
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ARCH_DIR = path.join(__dirname, 'archetypes');
const REGISTRY_PATH = path.join(ARCH_DIR, 'id-registry.json');

const ARCHETYPE_FILES = {
  A1_pasta: 'A1_pasta.yaml',
  A3_pan_dish: 'A3_pan_dish.yaml',
  A4_stew_curry: 'A4_stew_curry.yaml',
  A7_bowl_salad: 'A7_bowl_salad.yaml',
  A10_protein_with_side: 'A10_protein_with_side.yaml',
};

let _registry = null;
function getRegistry() {
  if (_registry) return _registry;
  _registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  return _registry;
}

const _cache = {};
function loadArchetype(id) {
  if (_cache[id]) return _cache[id];
  const file = ARCHETYPE_FILES[id];
  if (!file) throw new Error('Unbekannter Archetyp: ' + id);
  const raw = fs.readFileSync(path.join(ARCH_DIR, file), 'utf8');
  const doc = yaml.load(raw);
  if (!doc || typeof doc !== 'object') {
    throw new Error('YAML leer oder ungueltig: ' + id);
  }
  _cache[id] = doc;
  return doc;
}

function listArchetypes() {
  return Object.keys(ARCHETYPE_FILES);
}

function resolveId(yamlId) {
  const reg = getRegistry();
  return reg.ids[yamlId] || null;
}

/**
 * Sammelt alle in einem Archetyp referenzierten Zutaten-IDs.
 * Beruecksichtigt: allowed (Liste und Map), forbidden, additions,
 * substitutions.
 */
function collectYamlIds(archetype) {
  const ids = new Set();
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    for (const [k, v] of Object.entries(node)) {
      if (k === 'allowed') {
        if (Array.isArray(v)) {
          v.forEach(x => { if (typeof x === 'string') ids.add(x); });
        } else if (v && typeof v === 'object') {
          Object.keys(v).forEach(x => ids.add(x));
        }
      } else if (k === 'forbidden' && Array.isArray(v)) {
        v.forEach(x => { if (typeof x === 'string') ids.add(x); });
      } else if (k === 'additions' && Array.isArray(v)) {
        v.forEach(a => {
          if (typeof a === 'string') ids.add(a);
          else if (a && typeof a === 'object' && a.id) ids.add(a.id);
        });
      } else if (k === 'substitutions' && v && typeof v === 'object') {
        for (const subs of Object.values(v)) {
          if (Array.isArray(subs)) subs.forEach(x => { if (typeof x === 'string') ids.add(x); });
        }
      } else {
        walk(v);
      }
    }
  }
  walk(archetype);
  return Array.from(ids);
}

function validateArchetype(id) {
  const arch = loadArchetype(id);
  const usedIds = collectYamlIds(arch);
  const unknown = usedIds.filter(yid => !resolveId(yid));
  return { archetypeId: id, yamlIds: usedIds, unknown };
}

function isForbidden(archetype, yamlId) {
  const arch = typeof archetype === 'string' ? loadArchetype(archetype) : archetype;
  const f = arch.forbidden || [];
  return f.includes(yamlId);
}

function getCoreSlots(archetype) {
  const arch = typeof archetype === 'string' ? loadArchetype(archetype) : archetype;
  return Object.keys(arch.core || {});
}

function getToleratedSlots(archetype) {
  const arch = typeof archetype === 'string' ? loadArchetype(archetype) : archetype;
  return Object.keys(arch.tolerated || {});
}

function getSidePolicy(archetype) {
  const arch = typeof archetype === 'string' ? loadArchetype(archetype) : archetype;
  return arch.side_policy || null;
}

/**
 * Liefert den Catalog-Eintrag (Naehrwerte) fuer eine YAML-ID.
 * Loest nutrient und alias auf. Bei composite/selector/placeholder
 * wird null zurueckgegeben — die brauchen Runtime-Aufloesung.
 */
function getCatalogEntry(yamlId) {
  const r = resolveId(yamlId);
  if (!r) return null;
  const cat = require('./nutri-catalog');
  if (r.kind === 'nutrient') return cat.CATALOG[r.catalog_key] || null;
  if (r.kind === 'alias' && r.target) return cat.CATALOG[r.target] || null;
  return null;
}

module.exports = {
  loadArchetype,
  listArchetypes,
  resolveId,
  collectYamlIds,
  validateArchetype,
  isForbidden,
  getCoreSlots,
  getToleratedSlots,
  getSidePolicy,
  getCatalogEntry,
};
