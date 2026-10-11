#!/usr/bin/env node
// Audit: 22 Composites gegen Live-API.
// Für jedes Composite: Query schicken, dish_identity auswerten,
// zählen wie viele Block-Violations es gibt.
// Aufruf:
//   node tests/composite-audit.mjs
// Env:
//   BASE_URL, LP_DELAY_MS

const BASE_URL = process.env.BASE_URL || 'https://labplate.onrender.com';
const LANG = 'de';
const DELAY_MS = Number(process.env.LP_DELAY_MS || 3500);
const RETRIES_429 = 6;
const RETRY_BASE_MS = 8000;

// Mapping Composite-ID → typische Nutzer-Eingabe
const CASES = [
  { id: 'aglio_olio',      query: 'Spaghetti Aglio e Olio' },
  { id: 'aioli',           query: 'Aioli' },
  { id: 'amatriciana',     query: 'Pasta all\'Amatriciana' },
  { id: 'arrabbiata',      query: 'Penne all\'Arrabbiata' },
  { id: 'balsamic_glaze',  query: 'Balsamico-Glasur' },
  { id: 'bearnaise',       query: 'Béarnaise-Sauce' },
  { id: 'cacio_e_pepe',    query: 'Cacio e Pepe' },
  { id: 'caesar',          query: 'Caesar Salad' },
  { id: 'chimichurri',     query: 'Chimichurri' },
  { id: 'hollandaise',     query: 'Hollandaise' },
  { id: 'marinara',        query: 'Marinara-Sauce' },
  { id: 'mushroom_sauce',  query: 'Pilzsauce' },
  { id: 'napoletana',      query: 'Napoletana-Sauce' },
  { id: 'norma',           query: 'Pasta alla Norma' },
  { id: 'pesto',           query: 'Pesto Genovese' },
  { id: 'puttanesca',      query: 'Spaghetti alla Puttanesca' },
  { id: 'ragu_bianco',     query: 'Ragù bianco' },
  { id: 'ragu_bolognese',  query: 'Ragù alla Bolognese' },
  { id: 'ragu_salsiccia',  query: 'Ragù di Salsiccia' },
  { id: 'tartar',          query: 'Tartarsauce' },
  { id: 'vinaigrette',     query: 'Vinaigrette' },
  { id: 'vodka_sauce',     query: 'Penne alla Vodka' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function postJson(body) {
  const res = await fetch(BASE_URL + '/api/nutri-recipe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}
async function callOne(query) {
  const body = { mode: 'pantry', lang: LANG, pantry_ingredients: [query], target_servings: 2 };
  let last;
  for (let i = 0; i <= RETRIES_429; i++) {
    try { last = await postJson(body); } catch (e) { last = { status: 0, text: e.message }; }
    if (last.status !== 429) return last;
    const wait = RETRY_BASE_MS * Math.pow(1.6, i);
    console.warn('  429 - warte ' + Math.round(wait/1000) + 's');
    await sleep(wait);
  }
  return last;
}

async function main() {
  console.log('Composite Audit — ' + BASE_URL);
  console.log('Delay: ' + DELAY_MS + 'ms | Cases: ' + CASES.length + '\n');

  const report = [];
  for (const c of CASES) {
    const resp = await callOne(c.query);
    let row = { id: c.id, query: c.query, status: resp.status };

    if (resp.status !== 200 || !resp.json || resp.json.error) {
      row.note = resp.json?.error || ('HTTP ' + resp.status);
      row.blockViolations = null;
      console.log('-- ' + c.id.padEnd(20) + ' | ' + (row.note || '?'));
    } else {
      const j = resp.json;
      const di = j._dish_identity || {};
      const blocks = (di.violations || []).filter(v => v.severity === 'block');
      const warns  = (di.violations || []).filter(v => v.severity === 'warn');
      row.compositeId = di.compositeId;
      row.title = j.title;
      row.blockViolations = blocks.length;
      row.warnViolations = warns.length;
      row.wouldBlock = di.blocked === true;   // echte Server-Entscheidung
      row.rawBlocks = blocks.length;         // rohe Violation-Zahl (Log)
      row.blockCodes = [...new Set(blocks.map(v => v.code))];

      const mark = row.wouldBlock ? 'BLOCK' : 'ok   ';
      console.log(
        mark + ' | ' + c.id.padEnd(20) +
        ' | blocks=' + String(blocks.length).padStart(2) +
        ' warns=' + String(warns.length).padStart(2) +
        ' | ' + (di.compositeId || '—')
      );
    }
    report.push(row);
    await sleep(DELAY_MS);
  }

  const total = report.length;
  const wouldBlock = report.filter(r => r.wouldBlock).length;
  const pass = total - wouldBlock;
  console.log('\n========================================');
  console.log('Würde im Block-Modus abgelehnt: ' + wouldBlock + '/' + total);
  console.log('Würde durchgehen:               ' + pass + '/' + total);
  console.log('========================================');
  if (wouldBlock) {
    console.log('\nBlockierte:');
    for (const r of report.filter(x => x.wouldBlock)) {
      console.log('  - ' + r.id + '  (codes: ' + (r.blockCodes || []).join(',') + ')');
    }
  }
}

main().catch(e => { console.error(e); process.exit(2); });
