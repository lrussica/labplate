'use strict';
/**
 * pipeline-trace.js
 * =================
 * Debug-Helper. Aktiv nur, wenn PIPELINE_TRACE=1 gesetzt ist (ENV)
 * oder der Request ?trace=1 enthaelt.
 *
 * Bei jeder aktiven Anfrage wird pro Stufe eine kompakte und eine
 * vollstaendige Aufzeichnung der Recipe-Struktur ausgegeben:
 *   [pipeline-trace] <trace_id> <stage> SUMMARY { title, ingredients[], steps[] }
 *   [pipeline-trace] <trace_id> <stage> FULL { ...gesamtes JSON... }
 *
 * Zusaetzlich landet alles in /tmp/pipeline_trace_<trace_id>.jsonl
 * als JSON-Lines, damit man es lokal oder per Render-Shell lesen kann.
 *
 * Keine Auswirkung auf das Rezept. Kein Mutation. Read-only Beobachter.
 */
const fs = require('fs');
const path = require('path');

const TRACE_FILE_DIR = '/tmp';
const ENABLED_ENV = process.env.PIPELINE_TRACE === '1'
  || process.env.PIPELINE_TRACE === 'true'
  || process.env.PIPELINE_TRACE === true;

function isEnabled(payload) {
  if (ENABLED_ENV) return true;
  if (!payload || typeof payload !== 'object') return false;
  const t = payload.trace || payload.debug_trace || payload.pipeline_trace;
  return t === 1 || t === '1' || t === true;
}

function makeTraceId() {
  return 'tr-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function _clipTraceValue(v, max) {
  if (v == null) return 'null';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  if (s == null) return 'null';
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function logRequestStart(traceId, payload) {
  if (!traceId || !payload) return;
  const p = payload;
  const parts = [
    'ai_instruction=' + _clipTraceValue(p.ai_instruction || p.aiInstruction, 250),
    'pantry=' + _clipTraceValue(p.pantry_ingredients || [], 200),
    'theme=' + _clipTraceValue(p.theme, 120),
    'handoff_brief=' + _clipTraceValue(p.handoff_brief, 250),
    'macros=' + _clipTraceValue(p.macros, 250),
    'lab_guideline_constraints=' + _clipTraceValue(p.lab_guideline_constraints, 400),
    'target_servings=' + _clipTraceValue(p.target_servings, 20),
    'allergens=' + _clipTraceValue(p.allergens, 150),
  ];
  console.log('[pipeline-trace] ' + traceId + ' REQUEST-START ' + parts.join(' '));
}

function compact(recipe) {
  if (!recipe || typeof recipe !== 'object') return { note: 'no recipe object' };
  const ings = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
  return {
    title: recipe.title || null,
    servings: recipe.servings != null ? recipe.servings : null,
    ingredientsCount: ings.length,
    ingredients: ings.map(function (i) {
      return {
        id: (i && i.id) || null,
        name: (i && i.name) || null,
        amount: (i && i.amount) != null ? i.amount : null,
        unit: (i && i.unit) || null,
        repaired: !!(i && i._repairedStaple),
      };
    }),
    stepsCount: steps.length,
    steps: steps.map(function (s, ix) {
      const c = String((s && s.content) || (s && s.instruction) || '');
      return {
        i: ix + 1,
        title: (s && s.title) || null,
        contentPreview: c.length > 140 ? c.slice(0, 140) + '…' : c,
      };
    }),
  };
}

function traceSnapshot(traceId, stage, recipe) {
  if (!traceId) return;
  const stamp = new Date().toISOString();
  const summary = compact(recipe);
  // Zwei Log-Zeilen: eine kompakt fuer schnelles Lesen, eine voll fuer Diff
  console.log('[pipeline-trace] ' + traceId + ' ' + stage + ' SUMMARY ' + JSON.stringify(summary));
  console.log('[pipeline-trace] ' + traceId + ' ' + stage + ' FULL ' + JSON.stringify(recipe));
  // Auch im Speicher ablegen
  recordStage(traceId, stage, recipe);

  // Auch auf Platte
  try {
    const file = path.join(TRACE_FILE_DIR, 'pipeline_trace_' + traceId + '.jsonl');
    const line = JSON.stringify({ ts: stamp, stage: stage, recipe: recipe }) + '\n';
    fs.appendFileSync(file, line, 'utf8');
  } catch (_) { /* best effort */ }
}

// In-Memory-Speicher fuer aktive Traces, damit wir den Verlauf in die
// Response haengen koennen (fuer ?trace=1 ohne Render-Dashboard).
const _activeTraces = new Map();

function startTrace(traceId) {
  if (!traceId) return;
  _activeTraces.set(traceId, []);
}

function recordStage(traceId, stage, recipe) {
  if (!traceId) return;
  if (!_activeTraces.has(traceId)) _activeTraces.set(traceId, []);
  _activeTraces.get(traceId).push({
    stage: stage,
    summary: compact(recipe),
  });
}

function getTrace(traceId) {
  return _activeTraces.get(traceId) || null;
}

function endTrace(traceId) {
  // Nicht loeschen, damit die Response ihn noch lesen kann.
  // Garbage-Collection spaeter via zyklischem Aufraeumen moeglich.
  // Fuer den Debug-Modus reicht das.
}

module.exports = {
  isEnabled: isEnabled,
  makeTraceId: makeTraceId,
  snapshot: traceSnapshot,
  compact: compact,
  startTrace: startTrace,
  recordStage: recordStage,
  getTrace: getTrace,
  endTrace: endTrace,
  logRequestStart: logRequestStart,
};
