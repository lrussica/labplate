#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MASTER_PATH = path.resolve(__dirname, '../data/master_recipes.json');
const BASE_URL = process.env.BASE_URL || 'https://labplate.onrender.com';
const LANG = process.env.LP_LANG || 'de';
const SERVINGS_LIST = [1, 2, 4];
const TOL_REL = 0.02;
const TOL_ABS = 0.5;
const DELAY_MS = Number(process.env.LP_DELAY_MS || 1500);
const RETRIES_429 = 6;
const RETRY_BASE_MS = 8000;
const EGG_GRAMS = 60;

const STAPLE_RE = /(wasser|salz|pfeffer|herstellerangabe)/i;

const filter = process.argv[2] || null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (m) => console.log('OK  ' + m);
const fail = (m) => console.error('ERR ' + m);
const warn = (m) => console.warn('WRN ' + m);

function parseAmount(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const m = v.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
    if (m) return Number(m[0]);
  }
  return NaN;
}
function isStapleName(name) { return !!name && STAPLE_RE.test(String(name)); }
function isEggName(name) { return !!name && /^(ei|eier|hühnerei(er)?)$/i.test(String(name).trim()); }

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}
async function callRecipe(pantryItem, servings) {
  const body = { mode: 'pantry', lang: LANG, pantry_ingredients: [pantryItem], target_servings: servings };
  let lastResp = null;
  for (let attempt = 0; attempt <= RETRIES_429; attempt++) {
    let resp;
    try { resp = await postJson(BASE_URL + '/api/nutri-recipe', body); }
    catch (e) {
      lastResp = { status: 0, text: String(e?.message || e), json: null };
      await sleep(RETRY_BASE_MS);
      continue;
    }
    lastResp = resp;
    if (resp.status !== 429) return resp;
    const wait = RETRY_BASE_MS * Math.pow(1.6, attempt);
    warn('429 - warte ' + Math.round(wait/1000) + 's (Versuch ' + (attempt+1) + '/' + (RETRIES_429+1) + ')');
    await sleep(wait);
  }
  return lastResp;
}
const pickSource = (r) => r?.json?.recipeSource ?? null;
const pickRecipe = (r) => r?.json ?? null;
function ingKeyFromResp(ing) {
  if (ing?._v92_id) return String(ing._v92_id);
  if (ing?.id) return String(ing.id);
  if (ing?.name) return 'name:' + String(ing.name).toLowerCase().trim();
  return null;
}
function ingKeyFromMaster(ing) {
  if (ing?.id) return String(ing.id);
  const n = ing?.names?.[LANG] || ing?.name || ing?.names?.en;
  return n ? 'name:' + String(n).toLowerCase().trim() : null;
}
function masterName(ing) {
  return ing?.names?.[LANG] || ing?.name || ing?.names?.en || '';
}

async function testOne(master, alias, servings) {
  const id = master.id + ' | "' + alias + '" | ' + servings + 'P';
  const resp = await callRecipe(alias, servings);
  if (!resp) { fail(id + ' - keine Antwort'); return { ok: false, id, reason: 'no-resp' }; }
  if (resp.status !== 200) {
    fail(id + ' - HTTP ' + resp.status + ': ' + String(resp.text).slice(0, 180));
    return { ok: false, id, reason: 'http-' + resp.status };
  }
  const source = pickSource(resp);
  if (source !== 'master-classic') {
    fail(id + ' - recipeSource=' + source);
    return { ok: false, id, reason: 'source' };
  }
  const recipe = pickRecipe(resp);
  const rid = recipe?.masterRecipeId || recipe?.id || recipe?.recipeId;
  if (rid && rid !== master.id) {
    fail(id + ' - masterRecipeId=' + rid + ' != ' + master.id);
    return { ok: false, id, reason: 'id-mismatch' };
  }
  const outServings = Number(recipe?.finalServings ?? recipe?.targetServings ?? recipe?.servings ?? servings);
  if (outServings !== servings) {
    fail(id + ' - finalServings=' + outServings + ' (erwartet ' + servings + ')');
    return { ok: false, id, reason: 'servings' };
  }
  const baseServings = Number(master.servings) || 4;
  const factor = servings / baseServings;

  const respIngs = Array.isArray(recipe?.finalIngredients) ? recipe.finalIngredients : (recipe?.ingredients || []);
  const respByKey = new Map();
  for (const ing of respIngs) {
    const k = ingKeyFromResp(ing);
    if (k) respByKey.set(k, ing);
  }

  let checked = 0, bad = 0;
  for (const m of (master.ingredients || [])) {
    const k = ingKeyFromMaster(m);
    if (!k) continue;
    const name = masterName(m);
    const mAmount = parseAmount(m.amount);
    if (!isFinite(mAmount)) continue;
    const r = respByKey.get(k);
    if (!r) continue;
    const got = parseAmount(r.amount);

    if (isStapleName(name)) {
      checked++;
      if (got !== 0) { bad++; fail(id + ' - ' + k + ' (' + name + '): ' + got + ' (Staple, erwartet 0)'); }
      continue;
    }

    if (isEggName(name)) {
      const wantGrams = mAmount * factor * EGG_GRAMS;
      const tol = Math.max(EGG_GRAMS * 0.75, wantGrams * 0.35);
      checked++;
      if (!isFinite(got) || Math.abs(got - wantGrams) > tol) {
        bad++;
        fail(id + ' - ' + k + ' (' + name + '): ' + got + 'g (erwartet ~' + wantGrams.toFixed(0) + 'g ±' + tol.toFixed(0) + ')');
      }
      continue;
    }

    const want = mAmount * factor;
    const tol = Math.max(TOL_ABS, Math.abs(want) * TOL_REL, servings === 1 ? 5 : 0);
    checked++;
    if (!isFinite(got) || Math.abs(got - want) > tol) {
      bad++;
      fail(id + ' - ' + k + ' (' + name + '): ' + got + ' (erwartet ~' + want.toFixed(2) + ' ±' + tol.toFixed(2) + ')');
    }
  }

  if (checked === 0) {
    warn(id + ' - keine Mengen vergleichbar (Resp-IDs: ' + respIngs.slice(0,3).map(ingKeyFromResp).join(',') + ')');
    return { ok: false, id, reason: 'no-amounts' };
  }
  if (bad > 0) return { ok: false, id, reason: 'amounts' };
  ok(id + ' - OK (' + checked + ' Mengen)');
  return { ok: true, id };
}

async function main() {
  const store = JSON.parse(fs.readFileSync(MASTER_PATH, 'utf8'));
  const all = (store.recipes || []).filter((r) => r.immutable !== false);
  const sel = filter
    ? all.filter((r) => r.id === filter || (r.aliases?.[LANG] || []).includes(filter))
    : all;
  console.log('Master-classic Regression');
  console.log('  BASE_URL: ' + BASE_URL);
  console.log('  LANG:     ' + LANG);
  console.log('  Rezepte:  ' + sel.length + '/' + all.length);
  console.log('  Portionen: ' + SERVINGS_LIST.join(', '));
  console.log('  Delay:    ' + DELAY_MS + 'ms\n');
  const results = [];
  for (const r of sel) {
    const alias = (r.aliases?.[LANG] || [])[0] || r.titles?.[LANG] || r.titles?.en;
    if (!alias) { fail(r.id + ' - kein Alias fuer ' + LANG); results.push({ ok: false, id: r.id, reason: 'no-alias' }); continue; }
    for (const s of SERVINGS_LIST) {
      results.push(await testOne(r, alias, s));
      await sleep(DELAY_MS);
    }
  }
  const total = results.length;
  const passed = results.filter((x) => x.ok).length;
  const failed = total - passed;
  console.log('\n========================================');
  console.log('TOTAL: ' + passed + '/' + total + ' passed, ' + failed + ' failed');
  console.log('========================================');
  if (failed) {
    console.log('\nFehler:');
    for (const r of results.filter((x) => !x.ok)) console.log('  - ' + r.id + ' (' + r.reason + ')');
    process.exit(1);
  }
}
main().catch((e) => { console.error(e); process.exit(2); });
