'use strict';

const fs = require('fs');
const path = require('path');

const masterPath = path.join(__dirname, 'data', 'master_recipes.json');
const draftPath = path.join(__dirname, 'data', 'master_recipe_drafts_40.json');
const importReportPath = path.join(__dirname, 'data', 'ingredient-nutrition-import-report.json');

const master = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
const drafts = JSON.parse(fs.readFileSync(draftPath, 'utf8'));
const resolvableIds = new Set(
  (master.recipes || []).flatMap(recipe => (recipe.ingredients || []).map(ingredient => ingredient.id))
);
const imported = fs.existsSync(importReportPath)
  ? JSON.parse(fs.readFileSync(importReportPath, 'utf8'))
  : { ingredients: [] };
const importedKeys = new Set((imported.ingredients || []).map(ingredient => ingredient.ingredientKey));

const forbidden = /\betwas\b|nach Belieben|Minuten(?!\s+\d)/i;
const ids = new Set();
const results = [];

for (const recipe of drafts.recipes || []) {
  const violations = [];
  const missingIngredients = [];
  if (ids.has(recipe.id)) violations.push('duplicate recipe id');
  ids.add(recipe.id);
  if (recipe.status !== 'draft') violations.push('status must be draft');
  if (recipe.sourceType !== 'labplate_original') violations.push('sourceType');
  if (!['DE', 'IT', 'FR', 'TR'].includes(recipe.country)) violations.push('country');
  if (!recipe.titles || !recipe.aliases ||
      !['de', 'it', 'fr', 'tr'].every(lang => recipe.titles[lang] && recipe.aliases[lang])) {
    violations.push('localized titles/aliases');
  }

  const ingredientIds = new Set();
  for (const ingredient of recipe.ingredients || []) {
    if (ingredientIds.has(ingredient.id)) violations.push('duplicate ingredient id');
    ingredientIds.add(ingredient.id);
    const key = ingredient.id.startsWith('unresolved:')
      ? ingredient.id.slice('unresolved:'.length)
      : null;
    if (!resolvableIds.has(ingredient.id) && !importedKeys.has(key)) {
      missingIngredients.push(ingredient.name && ingredient.name.de);
    }
    if (ingredient.id === '0013' && Number(ingredient.amount) > 2) violations.push('salt > 2 g');
    if (ingredient.id === '0001' && Number(ingredient.amount) / Number(recipe.servings) < 120) {
      violations.push('meat < 120 g/serving');
    }
  }

  const usedIds = new Set();
  for (const step of recipe.steps || []) {
    if (forbidden.test(step.text || '')) violations.push('forbidden pattern');
    for (const ingredientId of step.ingredientIds || []) usedIds.add(ingredientId);
  }
  if (usedIds.size !== ingredientIds.size ||
      [...ingredientIds].some(id => !usedIds.has(id))) {
    violations.push('ingredientIds mismatch');
  }

  results.push({
    id: recipe.id,
    status: missingIngredients.length
      ? 'blocked_missing_ingredients'
      : violations.length ? 'violations' : 'passed',
    missingIngredients,
    violations,
  });
}

const summary = results.reduce((counts, result) => {
  counts[result.status] = (counts[result.status] || 0) + 1;
  return counts;
}, {});

console.log(JSON.stringify({ total: results.length, summary, results }, null, 2));
if (results.some(result => result.status === 'violations')) process.exitCode = 1;
