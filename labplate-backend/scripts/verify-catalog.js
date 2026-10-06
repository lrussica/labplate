'use strict';
// Verifiziert nutri-catalog.js gegen USDA FoodData Central.
// Aufruf: node /tmp/verify-catalog.js
// Liest USDA_API_KEY aus .env (dotenv oder manuell).

const fs = require('fs');
const path = require('path');

// .env laden (dotenv, falls vorhanden; sonst manuell)
(function loadEnv() {
  try { require('dotenv').config({ path: path.join(process.cwd(), '.env') }); } catch (_) {}
  if (process.env.USDA_API_KEY) return;
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(function (line) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  });
})();

if (!process.env.USDA_API_KEY) {
  console.error('FEHLER: USDA_API_KEY nicht in .env gefunden.');
  process.exit(1);
}

const usda = require('../api/usda');
const catalog = require('../nutri-catalog');

function fdcIdFromSource(source) {
  const m = String(source || '').match(/(\d{4,7})/);
  return m ? m[1] : null;
}

function fmt(n) { return (typeof n === 'number' ? n.toFixed(1) : '?'); }
function diff(a, b) { return Math.abs((a || 0) - (b || 0)); }

// Toleranz: ±0,5 g / ±2 kcal
const TOL = { protein: 0.5, fat: 0.5, netCarbs: 0.5, fiber: 0.5, kcal: 2 };

(async () => {
  const keys = Object.keys(catalog.CATALOG);
  console.log('Verifiziere ' + keys.length + ' Katalog-Eintraege gegen USDA FDC...\n');

  const results = [];
  let ok = 0, warn = 0, fail = 0, noId = 0;

  for (const key of keys) {
    const entry = catalog.CATALOG[key];
    const fdcId = fdcIdFromSource(entry.source);
    if (!fdcId) {
      console.log('[KEIN-ID] ' + key + ' – source: ' + entry.source);
      noId++;
      continue;
    }
    process.stdout.write('  ' + key.padEnd(22) + ' FDC ' + fdcId + ' ... ');
    let res;
    try {
      res = await usda.getFoodDetails(fdcId);
    } catch (e) {
      res = { error: 'exception: ' + (e && e.message) };
    }
    if (res.error) {
      console.log('FEHLER (' + res.error + ')');
      fail++;
      results.push({ key, fdcId, status: 'error', msg: res.error });
      await new Promise(r => setTimeout(r, 250));
      continue;
    }
    const d = res.data;
    const m = d.macrosPer100g || {};
    const k = catalog.CATALOG[key].per100g;

    const issues = [];
    if (diff(k.protein, m.protein) > TOL.protein) issues.push('protein ' + fmt(k.protein) + ' vs ' + fmt(m.protein));
    if (diff(k.fat, m.fat) > TOL.fat) issues.push('fat ' + fmt(k.fat) + ' vs ' + fmt(m.fat));
    if (diff(k.netCarbs, m.netCarbs) > TOL.netCarbs) issues.push('netCarbs ' + fmt(k.netCarbs) + ' vs ' + fmt(m.netCarbs));
    if (diff(k.fiber, m.fiber) > TOL.fiber) issues.push('fiber ' + fmt(k.fiber) + ' vs ' + fmt(m.fiber));
    if (diff(k.kcal, d.calories) > TOL.kcal) issues.push('kcal ' + fmt(k.kcal) + ' vs ' + fmt(d.calories));

    if (issues.length === 0) {
      console.log('OK   (' + (d.name || '').slice(0, 45) + ')');
      ok++;
    } else {
      console.log('ABWEICHUNG (' + (d.name || '').slice(0, 45) + ')');
      issues.forEach(i => console.log('        - ' + i));
      warn++;
    }
    results.push({ key, fdcId, status: issues.length ? 'diff' : 'ok', issues, usdaName: d.name });
    await new Promise(r => setTimeout(r, 300)); // Rate-Limit schonen
  }

  console.log('\n=== ZUSAMMENFASSUNG ===');
  console.log('  OK:           ' + ok);
  console.log('  Abweichung:   ' + warn);
  console.log('  Fehler:       ' + fail);
  console.log('  Kein FDC-ID:  ' + noId);
  console.log('  Gesamt:       ' + keys.length);

  fs.writeFileSync('/tmp/verify-catalog-result.json', JSON.stringify(results, null, 2));
  console.log('\nDetailliertes Ergebnis: /tmp/verify-catalog-result.json');
})();
