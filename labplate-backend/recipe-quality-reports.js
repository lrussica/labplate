'use strict';
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'data', 'recipe_quality_reports.jsonl');
const CATEGORIES = ['Menge', 'Anleitung', 'Zutat', 'Sonstiges'];

function record(input) {
  const body = input || {};
  const category = CATEGORIES.includes(body.category) ? body.category : null;
  const recipeId = String(body.recipeId || '').replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 100);
  const ruleVersion = String(body.ruleVersion || '').slice(0, 40);
  if (!category || !recipeId || !ruleVersion) return { ok: false, error: 'invalid_report' };
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.appendFileSync(FILE, JSON.stringify({ category, recipeId, ruleVersion, timestamp: new Date().toISOString() }) + '\n');
  return { ok: true };
}
function top(limit) {
  if (!fs.existsSync(FILE)) return [];
  const counts = new Map();
  fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean).forEach((line) => {
    try { const r = JSON.parse(line); const key = r.category + '|' + r.recipeId + '|' + r.ruleVersion; counts.set(key, (counts.get(key) || 0) + 1); } catch (_) {}
  });
  return Array.from(counts.entries()).map(([key, count]) => {
    const [category, recipeId, ruleVersion] = key.split('|'); return { category, recipeId, ruleVersion, count };
  }).sort((a, b) => b.count - a.count).slice(0, Math.min(Number(limit) || 20, 100));
}
module.exports = { CATEGORIES, record, top, FILE };
