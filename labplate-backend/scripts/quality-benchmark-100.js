'use strict';
/**
 * Offline/mockable 100-request quality benchmark.
 * Report date is explicit so results remain reproducible without an API key.
 */
const fs = require('fs');
const path = require('path');
const quality = require('../ai-recipe-quality');
const REPORT_DATE = process.env.REPORT_DATE || new Date().toISOString().slice(0, 10);
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'ai-quality-benchmark-100.json'), 'utf8'));
const mockRecipe = (c) => ({ title: c.query, dishCategory: 'other', servings: 1,
  ingredients: [{ id: 'veg', name: 'Gemüse', amount: 300, unit: 'g', role: 'vegetable' }],
  steps: [{ order: 1, ingredientIds: ['veg'], action: 'chop', durationMin: 5, temperatureC: null }] });
async function main() {
  const rows = [];
  for (const c of fixture) {
    const started = Date.now();
    const result = await quality.generateAiRecipe({
      model: 'offline-mock', context: { dishCategory: 'other', ingredientDatabase: [{ id: 'veg', name: 'Gemüse', fiber: 3 }], allowedIngredients: [{ id: 'veg', name: 'Gemüse', fiber: 3 }], lang: c.lang },
      callGroq: async () => ({ data: mockRecipe(c) }),
    });
    rows.push({ id: c.id, ok: !!result.ok, attempts: result.attempts, latencyMs: Date.now() - started });
  }
  const metrics = { reportDate: REPORT_DATE, requests: rows.length, valid: rows.filter((r) => r.ok).length,
    validationRate: rows.filter((r) => r.ok).length / rows.length, averageAttempts: rows.reduce((s, r) => s + (r.attempts || 0), 0) / rows.length,
    p95LatencyMs: rows.map((r) => r.latencyMs).sort((a, b) => a - b)[Math.ceil(rows.length * 0.95) - 1],
    estimatedCostUsd: 0,
    mode: 'offline-mock' };
  const out = path.join(__dirname, 'quality-benchmark-100-report.json');
  fs.writeFileSync(out, JSON.stringify({ metrics, rows }, null, 2));
  console.log(JSON.stringify(metrics));
}
main().catch((e) => { console.error(e); process.exit(1); });
