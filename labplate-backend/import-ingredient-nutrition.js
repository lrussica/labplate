'use strict';

/**
 * Imports only reviewed, explicitly sourced nutrition rows.
 *
 * Usage:
 *   node import-ingredient-nutrition.js source.csv mapping.csv output.json
 *
 * source.csv must be a USDA FoodData Central, CIQUAL, or BLS export normalized
 * to these columns:
 * source,source_id,source_name,kcal_100g,protein_g_100g,fat_g_100g,
 * carbs_g_100g,fiber_g_100g,salt_g_100g,density_g_per_ml,piece_weight_g
 *
 * This script never queries or fabricates data, never changes master_recipes.json,
 * and refuses rows without a source ID or required nutrient values.
 */
const fs = require('fs');

const [sourcePath, mappingPath, outputPath] = process.argv.slice(2);
if (!sourcePath || !mappingPath || !outputPath) {
  console.error('usage: node import-ingredient-nutrition.js source.csv mapping.csv output.json');
  process.exit(2);
}

const allowedSources = new Set(['USDA FoodData Central', 'CIQUAL', 'BLS']);
const required = [
  'kcal_100g', 'protein_g_100g', 'fat_g_100g', 'carbs_g_100g',
  'fiber_g_100g', 'salt_g_100g',
];

function csv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (const ch of `${text}\n`) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { row.push(cell); cell = ''; }
    else if (ch === '\n' && !quoted) { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  const [header, ...data] = rows.filter(r => r.some(Boolean));
  return data.map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] || '').trim()])));
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const sourceRows = csv(fs.readFileSync(sourcePath, 'utf8'));
const mappingRows = csv(fs.readFileSync(mappingPath, 'utf8'));
const bySourceId = new Map(sourceRows.map(row => [`${row.source}:${row.source_id}`, row]));
const errors = [];
const warnings = [];
const imported = [];

for (const mapping of mappingRows) {
  if (String(mapping.geprüft || '').trim().toLowerCase() !== 'ja' ||
      String(mapping.unsicher || '').trim().toLowerCase() !== 'false') {
    warnings.push({ ingredient_key: mapping.ingredient_key, reason: 'mapping not explicitly approved' });
    continue;
  }
  if (!mapping.source_id || !mapping.source) {
    warnings.push({ ingredient_key: mapping.ingredient_key, reason: 'no source mapping' });
    continue;
  }
  if (!allowedSources.has(mapping.source)) {
    errors.push({ ingredient_key: mapping.ingredient_key, reason: 'source not allowed' });
    continue;
  }
  const source = bySourceId.get(`${mapping.source}:${mapping.source_id}`);
  if (!source) {
    errors.push({ ingredient_key: mapping.ingredient_key, reason: 'source row missing' });
    continue;
  }
  const values = Object.fromEntries(required.map(key => [key, num(source[key])]));
  const missing = required.filter(key => values[key] == null);
  if (missing.length) {
    errors.push({ ingredient_key: mapping.ingredient_key, reason: `missing values: ${missing.join(', ')}` });
    continue;
  }
  if (values.kcal_100g < 0 || values.kcal_100g > 900 ||
      Object.values(values).some(value => value < 0)) {
    errors.push({ ingredient_key: mapping.ingredient_key, reason: 'value outside non-negative/plausibility bounds' });
    continue;
  }
  const macroKcal = values.protein_g_100g * 4 + values.carbs_g_100g * 4 + values.fat_g_100g * 9;
  if (Math.abs(macroKcal - values.kcal_100g) > Math.max(30, values.kcal_100g * 0.25)) {
    warnings.push({ ingredient_key: mapping.ingredient_key, reason: 'macro kcal outlier' });
  }
  imported.push({
    id: `src_${mapping.source.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${mapping.source_id}`,
    ingredientKey: mapping.ingredient_key,
    names: {
      de: mapping.canonical_name_de, it: mapping.name_it,
      fr: mapping.name_fr, tr: mapping.name_tr,
    },
    aliases: [],
    nutritionPer100g: {
      kcal: values.kcal_100g, protein: values.protein_g_100g,
      fat: values.fat_g_100g, carbohydrates: values.carbs_g_100g,
      fiber: values.fiber_g_100g, salt: values.salt_g_100g,
    },
    source: { name: mapping.source, id: mapping.source_id, sourceName: source.source_name || '' },
    density_g_per_ml: num(source.density_g_per_ml),
    piece_weight_g: num(source.piece_weight_g),
    allergenTags: [],
    culinaryRole: '',
  });
}

fs.writeFileSync(outputPath, JSON.stringify({
  version: 1,
  importedAt: new Date().toISOString(),
  sourcePolicy: 'named-source-only',
  ingredients: imported,
  errors,
  warnings,
}, null, 2) + '\n');
console.log(JSON.stringify({ imported: imported.length, errors: errors.length, warnings: warnings.length }, null, 2));
if (errors.length) process.exitCode = 1;
