/**
 * Live-Diagnose: ein generativer v9.2-Lauf „Hähnchen-Tofu-Ei-Rührei“
 * mit Raw-JSON-Logging (schreibt auch raw-out.json).
 */
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const core = require('../nutri-recipe-core');

const GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim();
const GROQ_MODEL = (process.env.GROQ_MODEL || core.DEFAULT_MODEL).trim();

if (!GROQ_API_KEY) {
  console.error('GROQ_API_KEY fehlt – Abbruch');
  process.exit(1);
}

const payload = {
  mode: 'pantry',
  lang: 'de',
  pantry_ingredients: ['Hähnchen-Tofu-Ei-Rührei'],
  macros: {
    netCarbs: { value: 40, goal: 100 },
    fat: { value: 50, goal: 70 },
    protein: { value: 80, goal: 140 },
  },
  micronutrient_gaps: [],
  lab_guideline_constraints: null,
  ai_instruction: 'Erstelle ein High-Protein Rührei/Pfannengericht mit Hähnchen, Tofu und Ei.',
  allergens: [],
  structured: false,
  team_ai: false,
};

(async function main() {
  console.log('=== LIVE TEST Hähnchen-Tofu-Ei-Rührei ===');
  console.log('model=', GROQ_MODEL);
  console.log('flow= default generative (structured=false) → useV92Pipeline=true');

  const out = await core.generateValidatedRecipe({
    payload: payload,
    groqOpts: { apiKey: GROQ_API_KEY, timeoutMs: 90000 },
    callGroq: core.callGroq,
    buildRequestBody: function (p) {
      return core.buildGroqRequest(p, GROQ_MODEL);
    },
  });

  const attemptRaws = out.attempt_raws || [];
  const dumpPath = path.join(__dirname, 'debug-raw-haehnchen-tofu-ei.json');
  fs.writeFileSync(dumpPath, JSON.stringify({
    ok: !!out.ok,
    error: out.error || null,
    attempts: out.attempts,
    errors: out.errors || null,
    flow: 'suggestions',
    useV92Pipeline: true,
    attempt_raws: attemptRaws,
    raw: out.raw || out.last_raw || null,
    recipe_title: out.recipe && out.recipe.title,
    recipe_steps_preview: out.recipe && out.recipe.steps,
    recipe_ingredients_preview: out.recipe && out.recipe.ingredients && out.recipe.ingredients.map(function (i) {
      return { name: i.name, amount: i.amount, unit: i.unit, protein_source: i._protein_source };
    }),
  }, null, 2));
  console.log('Wrote', dumpPath);

  console.log('\n=== ATTEMPT RAWS (kompakt) count=' + attemptRaws.length + ' ===');
  attemptRaws.forEach(function (a) {
    const raw = a.raw || {};
    console.log('\n--- attempt', a.attempt, '---');
    console.log('ingredients:', JSON.stringify((raw.ingredients || []).map(function (ing) {
      return {
        id: ing && ing.id,
        name: ing && ing.name,
        amount: ing && ing.amount,
        unit: ing && ing.unit,
        protein_source: !!(ing && ing.protein_source),
      };
    }), null, 2));
    console.log('step_contents:', JSON.stringify((raw.steps || []).map(function (s, i) {
      return { i: i + 1, title: s && s.title, content: s && s.content };
    }), null, 2));
  });

  if (!attemptRaws.length && (out.raw || out.last_raw)) {
    const raw = out.raw || out.last_raw;
    console.log('\n=== STEP CONTENTS (RAW, fallback) ===');
    (raw.steps || []).forEach(function (s, i) {
      console.log('--- step', i + 1, s.title || '', '---');
      console.log(s.content);
    });
    console.log('\n=== INGREDIENTS (RAW) ===');
    console.log(JSON.stringify(raw.ingredients, null, 2));
  }

  if (out.error) {
    console.log('\nRESULT ERROR:', out.error, out.errors);
    process.exit(2);
  }
  console.log('\nRESULT OK attempts=', out.attempts);
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
