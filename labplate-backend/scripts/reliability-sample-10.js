'use strict';
/**
 * Breite Zuverlässigkeits-Stichprobe (10 Fälle) gegen Render.
 * Nutzt debug_v92_raw wenn Debug-Key verfügbar, sonst Prod ohne Flag.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const BASE = process.env.SAMPLE_BASE || 'https://labplate.onrender.com';
const OUT_DIR = path.join(__dirname, 'sample-runs');
const OUT_JSON = path.join(OUT_DIR, 'reliability-10-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');

const CASES = [
  { n: 1, q: 'Klassisches Keto-Frühstück mit Speck und Avocado', focus: ['keto'] },
  { n: 2, q: 'Veganer High-Protein-Bowl mit Linsen und Quinoa', focus: ['vegan'] },
  { n: 3, q: 'Schnelles Pasta-Gericht mit Lachs und Sahnesauce', focus: [] },
  { n: 4, q: 'Low-Carb-Abendessen mit Rindfleisch und Brokkoli', focus: [] },
  { n: 5, q: 'Vegetarisches Curry mit Kichererbsen und Kokosmilch', focus: ['veg'] },
  { n: 6, q: 'Proteinreicher Snack mit griechischem Joghurt und Nüssen', focus: [] },
  { n: 7, q: 'Glutenfreies Omelett mit Gemüse und Käse', focus: [] },
  { n: 8, q: 'Fitness-Smoothie-Bowl mit Whey-Protein und Beeren', focus: [] },
  { n: 9, q: 'Schnelles Rührei mit Räucherlachs und Frischkäse', focus: ['herd'] },
  { n: 10, q: 'Herzhafte Suppe mit Haferflocken und Gemüsebrühe', focus: ['liquid'] },
];

const PROTEIN_KW = [
  'hähnchen', 'haehnchen', 'huhn', 'pute', 'rind', 'schwein', 'lachs', 'thunfisch', 'fisch',
  'ei', 'eier', 'tofu', 'quark', 'hüttenkäse', 'huettenkaese', 'linsen', 'kichererbsen',
  'bohnen', 'protein', 'whey', 'seitan', 'tempeh', 'garnelen', 'krabben', 'truthahn',
  'speck', 'joghurt', 'frischkäse', 'frischkaese', 'käse', 'kaese',
];

const ANIMAL = [
  'fleisch', 'hähnchen', 'haehnchen', 'huhn', 'rind', 'schwein', 'speck', 'lachs', 'fisch',
  'ei', 'eier', 'milch', 'käse', 'kaese', 'joghurt', 'quark', 'sahne', 'butter', 'whey',
  'honig', 'frischkäse', 'frischkaese', 'mascarpone', 'schmand', 'creme fraiche', 'hütten',
];

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function fetchJson(url, opts) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const body = opts.body ? JSON.stringify(opts.body) : null;
    const req = lib.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      }, body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      timeout: opts.timeoutMs || 120000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) { json = { _raw: data.slice(0, 500) }; }
        resolve({ status: res.statusCode, headers: res.headers, json });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

function findProteinKeywords(ings) {
  const found = [];
  (ings || []).forEach((ing) => {
    const name = String((ing && ing.name) || '');
    const nl = name.toLowerCase();
    if (nl.includes('eiweiss') || nl.includes('eiweiß')) return;
    for (const kw of PROTEIN_KW) {
      if (!nl.includes(kw)) continue;
      if (kw === 'ei' || kw === 'eier') {
        if (!/(?:^|[^a-zäöüß])ei(?:er)?(?:[^a-zäöüß]|$)/i.test(nl)) continue;
      }
      if (!found.includes(name)) found.push(name);
      break;
    }
  });
  return found;
}

function kcalCheck(nutrition) {
  if (!nutrition) return { ok: null, note: 'keine nutrition' };
  const p = Number(nutrition.protein_g) || 0;
  const f = Number(nutrition.fat_g) || 0;
  const kh = Number(nutrition.netto_kh_g) || 0;
  const fib = Number(nutrition.ballaststoffe_g) || 0;
  const decl = Number(nutrition.kcal) || 0;
  const calc = p * 4 + kh * 4 + f * 9 + fib * 2;
  if (!decl && !calc) return { ok: null, note: 'kcal leer', calc, decl };
  const pct = decl === 0 ? 100 : Math.abs(calc - decl) / decl * 100;
  return { ok: pct <= 10, calc: Math.round(calc), decl, pct: Math.round(pct * 10) / 10 };
}

function hasAnimal(ings) {
  return (ings || []).filter((ing) => {
    const nl = String(ing.name || '').toLowerCase();
    return ANIMAL.some((a) => {
      if (a === 'ei' || a === 'eier') return /(?:^|[^a-zäöüß])ei(?:er)?(?:[^a-zäöüß]|$)/i.test(nl);
      return nl.includes(a);
    });
  }).map((i) => i.name);
}

function herdSafety(steps, ings) {
  const text = (steps || []).join(' \n ').toLowerCase();
  const hasFrisch = (ings || []).some((i) => /frischk[aä]se/i.test(i.name || '')) || /frischk[aä]se/.test(text);
  const hasLachs = (ings || []).some((i) => /lachs/i.test(i.name || '')) || /lachs/.test(text);
  if (!hasFrisch && !hasLachs) return { ok: null, note: 'keine Zielzutaten erkannt' };

  const findings = [];
  (steps || []).forEach((s, i) => {
    const t = String(s || '').toLowerCase();
    const mentionsSensitive = /frischk[aä]se|r[äa]ucherlachs|lachs/.test(t);
    if (!mentionsSensitive) return;
    const stoveOn = /stufe\s*[1-9]|herd\s*(an|ein)|erhitzen|braten|anbraten|kochen|d[üu]nsten|restw[äa]rme|warm(?:er|e)?\s+pfanne|in die pfanne/.test(t);
    const stoveOff = /herd\s*aus|ausschalten|vom herd|abk[üu]hlen|kalt|ohne hitze|nicht erhitzen|unterr[üu]hren/.test(t);
    if (stoveOn && !stoveOff) {
      findings.push('Step ' + (i + 1) + ': sensible Zutat + Hitze-Sprache ohne klares AUS');
    } else if (stoveOn && stoveOff) {
      findings.push('Step ' + (i + 1) + ': Hitze erwähnt, aber auch AUS/kalt (prüfen)');
    }
  });
  const risky = findings.filter((f) => f.includes('ohne klares AUS'));
  return {
    ok: risky.length === 0,
    findings,
    note: risky.length ? risky.join('; ') : (findings.length ? findings.join('; ') : 'kein offensichtliches Hitze-Risiko im gerenderten Text'),
  };
}

function liquidCompleteness(ings, steps) {
  const names = (ings || []).map((i) => String(i.name || '').toLowerCase());
  const text = (steps || []).join(' ').toLowerCase();
  const brothInList = names.some((n) => /br[üu]he|fond|gem[üu]sebr[üu]he|wasser/.test(n));
  const brothInText = /br[üu]he|fond|gem[üu]sebr[üu]he|\bwasser\b/.test(text);
  const brothIng = (ings || []).filter((i) => /br[üu]he|fond|gem[üu]sebr[üu]he|wasser/i.test(i.name || ''));
  const amounts = brothIng.map((i) => i.name + '=' + i.amount + i.unit);
  return {
    ok: !brothInText || brothInList,
    brothInList,
    brothInText,
    amounts,
    note: !brothInText ? 'keine Brühe/Wasser im Text' : (brothInList ? ('gelistet: ' + amounts.join(', ')) : 'im Text erwähnt, fehlt in ingredients'),
  };
}

function freeNumberHints(steps, garnish) {
  const blobs = [].concat(steps || [], [garnish || '']);
  const unresolved = [];
  const etwas = [];
  blobs.forEach((t, i) => {
    const s = String(t || '');
    const m = s.match(/\{\d{3,4}\}/g);
    if (m) unresolved.push(...m.map((x) => 'blob' + i + ':' + x));
    if (/etwas\s+(öl|oel|wasser|salz|butter|milch)/i.test(s)) etwas.push('blob' + i);
  });
  return { unresolvedIds: unresolved, etwasPhrases: etwas };
}

function stapleHints(steps, garnish, ings) {
  const stems = [
    { label: 'Öl', re: /\b[oö]l\b|oliven[oö]l|raps[oö]l|speise[oö]l/i },
    { label: 'Wasser', re: /\bwasser\b/i },
    { label: 'Salz', re: /\bsalz\b/i },
    { label: 'Butter', re: /\bbutter\b/i },
  ];
  const names = (ings || []).map((i) => String(i.name || '').toLowerCase()).join(' | ');
  const text = [].concat(steps || [], [garnish || '']).join(' \n ');
  const missing = [];
  stems.forEach((st) => {
    if (!st.re.test(text)) return;
    const inList = st.re.test(names) || (st.label === 'Öl' && /[oö]l/.test(names));
    if (!inList) missing.push(st.label);
  });
  return missing;
}

function dietHonesty(c, data) {
  const notes = [];
  const nut = data.nutrition || {};
  const labels = (data.diet_labels || []).map((x) => String(x).toLowerCase());
  const ings = data.ingredients || [];
  const animals = hasAnimal(ings);

  if (c.focus.includes('keto')) {
    const kh = Number(nut.netto_kh_g);
    if (labels.some((l) => l.includes('keto'))) {
      if (!(kh < 10)) notes.push('Keto-Label aber Netto-KH=' + kh + 'g (≥10)');
    } else {
      notes.push('Query „Keto“, aber diet_labels ohne keto: [' + labels.join(',') + ']; Netto-KH=' + kh);
      if (!(kh < 10) && Number.isFinite(kh)) notes.push('Netto-KH=' + kh + 'g nicht keto-tauglich (<10)');
    }
  }
  if (c.focus.includes('vegan')) {
    if (animals.length) notes.push('Query „vegan“, aber tierisch: ' + animals.join(', '));
    if (!labels.some((l) => l.includes('vegan'))) {
      notes.push('diet_labels ohne vegan: [' + labels.join(',') + ']');
    }
  }
  if (c.focus.includes('veg')) {
    const meat = animals.filter((n) => /fleisch|hähnchen|haehnchen|huhn|rind|schwein|speck|lachs|fisch|whey/i.test(n));
    if (meat.length) notes.push('Query vegetarisch, aber: ' + meat.join(', '));
  }
  return notes;
}

function analyze(c, status, data, usedDebug) {
  const issues = [];
  let validated = false;
  let attempts = null;
  let title = '—';

  if (status === 422 || (data && data.error === 'recipe_validation_failed')) {
    validated = false;
    attempts = data.attempts != null ? data.attempts : null;
    title = '(validation_exhausted)';
    issues.push('422 validation_exhausted: ' + ((data.errors || []).slice(0, 4).join(' | ') || 'keine errors'));
  } else if (status === 429 || (data && data.status === 429)) {
    validated = false;
    issues.push('429 rate limit / TPD/TPM');
    title = '(429)';
  } else if (status === 503 && data && data.error === 'debug_key_not_configured') {
    validated = false;
    issues.push('debug_key_not_configured');
    title = '(503 debug key)';
  } else if (status >= 400 || (data && data.error)) {
    validated = false;
    issues.push('HTTP ' + status + ' error=' + (data.error || '?') + ' ' + (data.message || ''));
    title = '(error)';
  } else if (data && data.title) {
    validated = true;
    title = data.title;
    const dbg = data._debug_v92 || data.debug_v92;
    if (dbg && dbg.attempts != null) attempts = dbg.attempts;
    else attempts = usedDebug ? null : '≥1 (kein Debug-Payload)';

    const ings = data.ingredients || [];
    const flagPs = ings.filter((i) => i._protein_source).map((i) => i.name);
    const kwPs = findProteinKeywords(ings);
    if (flagPs.length > 2) issues.push('>2 protein_source flags: ' + flagPs.join(', '));
    if (kwPs.length > 2) issues.push('>2 Protein-Keywords: ' + kwPs.join(', '));
    if (flagPs.length !== kwPs.length) {
      issues.push('Flag/Keyword-Mismatch Flags=[' + flagPs.join(', ') + '] KW=[' + kwPs.join(', ') + ']');
    }

    const fn = freeNumberHints(data.steps, data.garnish);
    if (fn.unresolvedIds.length) issues.push('ungelöste Platzhalter: ' + fn.unresolvedIds.join(','));
    if (fn.etwasPhrases.length) issues.push('"etwas …"-Phrase in Steps (mögliche Basiszutat ohne Menge)');

    const staples = stapleHints(data.steps, data.garnish, ings);
    if (staples.length) issues.push('mögl. unlisted staples im Text: ' + staples.join(', '));

    const kcal = kcalCheck(data.nutrition);
    if (kcal.ok === false) issues.push('kcal-Formel: calc=' + kcal.calc + ' decl=' + kcal.decl + ' Δ' + kcal.pct + '%');
    if (kcal.ok === null) issues.push('nutrition fehlt für kcal-Check');

    issues.push(...dietHonesty(c, data));

    if (c.focus.includes('herd')) {
      const h = herdSafety(data.steps, ings);
      if (h.ok === false) issues.push('Herd-Risiko: ' + h.note);
      else if (h.findings.length) issues.push('Herd prüfen: ' + h.note);
    }
    if (c.focus.includes('liquid')) {
      const liq = liquidCompleteness(ings, data.steps);
      if (!liq.ok) issues.push('Flüssigkeit: ' + liq.note);
    }

    data._analysis = {
      flagPs, kwPs, kcal, diet_labels: data.diet_labels,
      nutrition: data.nutrition,
      ingredientNames: ings.map((i) => i.name + ' (' + i.amount + i.unit + (i._protein_source ? ',P' : '') + ')'),
    };
  } else {
    validated = false;
    issues.push('unerwartete Antwort');
  }

  return {
    n: c.n,
    query: c.q,
    title,
    validated,
    attempts,
    issues: issues.length ? issues : ['keine'],
    clean: validated && issues.length === 0,
    http: status,
    key_type: (data && (data.key_type || (data._debug_v92 && data._debug_v92.key_type))) || null,
  };
}

async function callRecipe(query, useDebug) {
  const body = {
    pantry_ingredients: [query],
    mode: 'pantry',
    lang: 'de',
    team_ai: false,
    structured: false,
    macros: {
      netCarbs: { value: 30, goal: 80 },
      fat: { value: 40, goal: 70 },
      protein: { value: 60, goal: 120 },
    },
    ai_instruction: 'Erstelle genau EIN Rezept passend zur Anfrage: ' + query,
  };
  if (useDebug) {
    body.debug_v92_raw = true;
    body.groq_model = 'openai/gpt-oss-20b';
  }
  return fetchJson(BASE + '/api/nutri-recipe', { method: 'POST', body, timeoutMs: 120000 });
}

(async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const health = await fetchJson(BASE + '/health', { method: 'GET' });
  const debugOk = !!(health.json && health.json.debugKeyConfigured && health.json.debugKeyDistinctFromProd);
  let useDebug = debugOk;
  console.log('health.debugKeyConfigured=', health.json && health.json.debugKeyConfigured,
    'distinct=', health.json && health.json.debugKeyDistinctFromProd,
    '→ useDebug=', useDebug);
  if (!useDebug) {
    console.log('WARNUNG: Debug-Key fehlt → Läufe gehen über PROD-Key und verbrauchen Prod-TPD/TPM.');
    const probe = await callRecipe('Probe', true);
    if (probe.status === 503) {
      console.log('Bestätigt: debug_v92_raw → 503; wechsle auf Prod ohne debug_v92_raw.');
      useDebug = false;
    } else if (probe.status === 200 || probe.status === 422) {
      console.log('Unerwartet: Debug-Pfad antwortete HTTP', probe.status, 'key=', probe.json && probe.json.key_type);
      useDebug = true;
    }
  }

  const rows = [];
  const rawDump = [];

  for (const c of CASES) {
    console.log('\n==== Fall', c.n, '====', c.q);
    let attempt = 0;
    let res = null;
    while (attempt < 4) {
      attempt++;
      try {
        res = await callRecipe(c.q, useDebug);
      } catch (e) {
        console.log('Netzfehler:', e.message);
        await sleep(15000);
        continue;
      }
      console.log('HTTP', res.status, 'key_type=', res.json && (res.json.key_type || (res.json._debug_v92 && res.json._debug_v92.key_type)));
      if (res.status === 429) {
        const wait = 90000;
        console.log('429 – warte', wait / 1000, 's');
        await sleep(wait);
        continue;
      }
      break;
    }
    const row = analyze(c, res ? res.status : 0, res ? res.json : {}, useDebug);
    console.log('→', row.validated ? 'OK' : 'FAIL', 'attempts=', row.attempts, 'title=', row.title);
    console.log('  Auffälligkeiten:', row.issues.join(' // '));
    rows.push(row);
    rawDump.push({ case: c, http: res && res.status, body: res && res.json });
    if (c.n < CASES.length) await sleep(18000);
  }

  const ok = rows.filter((r) => r.validated);
  const fail422 = rows.filter((r) => r.http === 422);
  const failOther = rows.filter((r) => !r.validated && r.http !== 422);
  const clean = rows.filter((r) => r.clean);
  const numericAttempts = rows.filter((r) => typeof r.attempts === 'number');
  const neededRetry = numericAttempts.filter((r) => r.attempts > 1);

  const summary = {
    useDebug,
    prodQuotaWarning: !useDebug,
    clean_count: clean.length,
    validated_count: ok.length,
    fail_422: fail422.length,
    fail_other: failOther.length,
    needed_retry_known: neededRetry.length,
    rows,
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify({ summary, rawDump }, null, 2));
  console.log('\n\n========== TABELLE ==========');
  console.log('Fall | Titel | Validiert? | Attempts | Auffälligkeiten');
  rows.forEach((r) => {
    const v = r.validated ? '✓' : (r.http === 422 ? '✗ (422)' : '✗ (' + r.http + ')');
    const att = r.attempts == null ? '?' : String(r.attempts);
    const iss = r.issues.join('; ').replace(/\n/g, ' ');
    console.log([r.n, r.title.slice(0, 50), v, att, iss].join(' | '));
  });
  console.log('\nGesamt:');
  console.log('-', clean.length, 'von 10 ohne jede Auffälligkeit');
  console.log('-', ok.length, 'von 10 validiert (HTTP 200)');
  console.log('-', fail422.length, 'von 10 komplett gescheitert (422)');
  console.log('-', failOther.length, 'von 10 andere Fehler (429/5xx/…)');
  if (!useDebug) {
    console.log('- Attempts bei Erfolg nicht exakt bekannt (kein debug_v92_raw-Payload); bei 422 schon.');
    console.log('- WARNUNG: Prod-Kontingent wurde für diese Stichprobe verbraucht.');
  }
  console.log('Dump:', OUT_JSON);
})().catch((e) => { console.error(e); process.exit(1); });
