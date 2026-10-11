#!/usr/bin/env node
import fs from 'node:fs';
const BASE_URL = process.env.BASE_URL || 'https://labplate.onrender.com';
const LANG = 'de';
const DELAY_MS = Number(process.env.LP_DELAY_MS || 3500);
const RETRIES_429 = 6;
const RETRY_BASE_MS = 8000;
const OUT_PATH = process.env.OUT || '/tmp/composite-audit-full.json';
const CASES = [
  { id: 'aglio_olio', query: 'Spaghetti Aglio e Olio' },
  { id: 'aioli', query: 'Aioli' },
  { id: 'amatriciana', query: "Pasta all'Amatriciana" },
  { id: 'arrabbiata', query: "Penne all'Arrabbiata" },
  { id: 'balsamic_glaze', query: 'Balsamico-Glasur' },
  { id: 'bearnaise', query: 'Béarnaise-Sauce' },
  { id: 'cacio_e_pepe', query: 'Cacio e Pepe' },
  { id: 'caesar', query: 'Caesar Salad' },
  { id: 'chimichurri', query: 'Chimichurri' },
  { id: 'hollandaise', query: 'Hollandaise' },
  { id: 'marinara', query: 'Marinara-Sauce' },
  { id: 'mushroom_sauce', query: 'Pilzsauce' },
  { id: 'napoletana', query: 'Napoletana-Sauce' },
  { id: 'norma', query: 'Pasta alla Norma' },
  { id: 'pesto', query: 'Pesto Genovese' },
  { id: 'puttanesca', query: 'Spaghetti alla Puttanesca' },
  { id: 'ragu_bianco', query: 'Ragù bianco' },
  { id: 'ragu_bolognese', query: 'Ragù alla Bolognese' },
  { id: 'ragu_salsiccia', query: 'Ragù di Salsiccia' },
  { id: 'tartar', query: 'Tartarsauce' },
  { id: 'vinaigrette', query: 'Vinaigrette' },
  { id: 'vodka_sauce', query: 'Penne alla Vodka' },
];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function postJson(body) {
  const res = await fetch(BASE_URL + '/api/nutri-recipe', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}
async function callOne(query) {
  const body = { mode: 'pantry', lang: LANG, pantry_ingredients: [query], target_servings: 2 };
  let last;
  for (let i = 0; i <= RETRIES_429; i++) {
    try { last = await postJson(body); } catch (e) { last = { status: 0, text: e.message }; }
    if (last.status !== 429) return last;
    await sleep(RETRY_BASE_MS * Math.pow(1.6, i));
  }
  return last;
}
function pickIngredients(j) {
  const arr = Array.isArray(j.finalIngredients) ? j.finalIngredients : (j.ingredients || []);
  return arr.map(i => ({ id: i._v92_id || i.id || null, name: i.name || i.displayName || null, amount: i.amount, unit: i.unit }));
}
async function main() {
  const report = { generatedAt: new Date().toISOString(), baseUrl: BASE_URL, cases: [] };
  for (const c of CASES) {
    const resp = await callOne(c.query);
    const row = { compositeId: c.id, query: c.query, httpStatus: resp.status, error: null, recipeSource: null, masterRecipeId: null, title: null, servings: null, ingredients: [], dishIdentity: null, blockViolations: [], warnViolations: [], blocked: false };
    if (resp.status !== 200 || !resp.json) { row.error = 'HTTP ' + resp.status; }
    else if (resp.json.error) { row.error = resp.json.error; }
    else {
      const j = resp.json;
      row.recipeSource = j.recipeSource || null;
      row.masterRecipeId = j.masterRecipeId || null;
      row.title = j.title || null;
      row.servings = j.finalServings ?? j.targetServings ?? null;
      row.ingredients = pickIngredients(j);
      const di = j._dish_identity || {};
      row.dishIdentity = { mode: di.mode || null, archetypeId: di.archetypeId || null, dishId: di.dishId || null, compositeId: di.compositeId || null, compositeConfidence: di.compositeConfidence ?? null, confidence: di.confidence ?? null, blocked: !!di.blocked };
      row.blocked = !!di.blocked;
      const v = Array.isArray(di.violations) ? di.violations : [];
      row.blockViolations = v.filter(x => x.severity === 'block');
      row.warnViolations = v.filter(x => x.severity === 'warn');
    }
    report.cases.push(row);
    console.log((row.error ? 'ERR ' : (row.blockViolations.length ? 'BLK ' : 'ok  ')) + ' | ' + c.id.padEnd(20) + ' | blocks=' + String(row.blockViolations.length).padStart(2) + ' warns=' + String(row.warnViolations.length).padStart(2));
    await sleep(DELAY_MS);
  }
  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log('\nReport: ' + OUT_PATH + ' (' + report.cases.length + ' cases)');
}
main().catch(e => { console.error(e); process.exit(2); });
