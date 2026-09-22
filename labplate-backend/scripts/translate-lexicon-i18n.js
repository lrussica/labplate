/**
 * Uebersetzt den deutschen Lexikon-Katalog nach en/es/it/pt/fr/tr (MyMemory).
 * Optimiert: Synonyme als ein String, Sprachen parallel, Cache + Resume.
 *
 *   node scripts/translate-lexicon-i18n.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { CATALOG } = require('./lexicon-terms-catalog');
const { CATEGORY_I18N, LANGS } = require('../lexicon-i18n');

const BATCH_DIR = path.join(__dirname, 'i18n-batches');
const CACHE_PATH = path.join(BATCH_DIR, '_mt_cache.json');
const OUT_PATH = path.join(BATCH_DIR, 'all-i18n.json');
const TARGET_LANGS = LANGS.filter((l) => l !== 'de');
const CONCURRENCY = 4; // parallele Eintraege

function loadCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); }
  catch (_) { return {}; }
}

function saveCache(cache) {
  fs.mkdirSync(BATCH_DIR, { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache), 'utf8');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function mt(text, to, cache) {
  const src = String(text || '').trim();
  if (!src) return '';
  const key = to + '::' + src;
  if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];

  const url = 'https://api.mymemory.translated.net/get?q='
    + encodeURIComponent(src.slice(0, 450))
    + '&langpair=de|' + encodeURIComponent(to);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url);
      const json = await res.json();
      let translated = json && json.responseData && json.responseData.translatedText
        ? String(json.responseData.translatedText).trim()
        : '';
      if (/^MYMEMORY WARNING/i.test(translated) || /^QUERY LENGTH LIMIT/i.test(translated) || !translated) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      // MyMemory escaped HTML entities manchmal
      translated = translated
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
      cache[key] = translated;
      return translated;
    } catch (_) {
      await sleep(700 * (attempt + 1));
    }
  }
  cache[key] = src;
  return src;
}

function splitSynonyms(translated, expectedCount) {
  const parts = String(translated || '')
    .split(/\s*[|;,/]\s*|\s+·\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= expectedCount) return parts.slice(0, expectedCount);
  if (parts.length === 1 && expectedCount > 1) {
    // Fallback: gleicher Text reicht nicht – Original spaeter gemischt
    return parts;
  }
  return parts;
}

async function translateEntry(row, cache) {
  const termDe = row.term;
  const synDe = Array.isArray(row.synonyms) ? row.synonyms : [];
  const descDe = row.short_description;
  const cat = CATEGORY_I18N[row.category] || CATEGORY_I18N.Begriff;

  const term = { de: termDe };
  const synonyms = { de: synDe.slice() };
  const short_description = { de: descDe };
  const category = { ...cat };

  // Pro Sprache nur 2 Requests: Term+Synonyme-Block und Beschreibung
  await Promise.all(TARGET_LANGS.map(async (lang) => {
    const synJoined = synDe.join(' | ');
    const [termTr, synTr, descTr] = await Promise.all([
      mt(termDe, lang, cache),
      synDe.length ? mt(synJoined, lang, cache) : Promise.resolve(''),
      mt(descDe, lang, cache),
    ]);
    term[lang] = termTr;
    short_description[lang] = descTr;
    if (!synDe.length) {
      synonyms[lang] = [];
    } else {
      let parts = splitSynonyms(synTr, synDe.length);
      if (parts.length < synDe.length) {
        // Einzel-Fallbacks fuer fehlende Synonyme
        parts = [];
        for (const s of synDe) parts.push(await mt(s, lang, cache));
      }
      synonyms[lang] = parts;
    }
  }));

  return {
    term_key: termDe,
    term,
    synonyms,
    category,
    short_description,
    related_chapters: Array.isArray(row.related_chapters) ? row.related_chapters : [],
  };
}

async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let idx = 0;
  async function run() {
    while (idx < items.length) {
      const my = idx++;
      results[my] = await worker(items[my], my);
    }
  }
  const runners = [];
  for (let i = 0; i < Math.min(limit, items.length); i++) runners.push(run());
  await Promise.all(runners);
  return results;
}

async function main() {
  fs.mkdirSync(BATCH_DIR, { recursive: true });
  const cache = loadCache();

  let existing = [];
  if (fs.existsSync(OUT_PATH)) {
    try { existing = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')); } catch (_) { existing = []; }
  }
  const done = new Set(existing.map((r) => r.term_key));
  const pending = CATALOG.filter((r) => !done.has(r.term));

  console.log(`[translate] Gesamt=${CATALOG.length} fertig=${done.size} offen=${pending.length} cache=${Object.keys(cache).length}`);

  const start = Date.now();
  let completed = 0;

  await mapPool(pending, CONCURRENCY, async (row) => {
    const entry = await translateEntry(row, cache);
    existing.push(entry);
    done.add(row.term);
    completed += 1;
    if (completed % 5 === 0 || completed === pending.length) {
      saveCache(cache);
      fs.writeFileSync(OUT_PATH, JSON.stringify(existing, null, 2), 'utf8');
      console.log(`[translate] ${done.size}/${CATALOG.length} (+${completed} diese Runde)`);
    }
    return entry;
  });

  saveCache(cache);
  // stabile Reihenfolge wie Katalog
  const byKey = new Map(existing.map((r) => [r.term_key, r]));
  const ordered = CATALOG.map((r) => byKey.get(r.term)).filter(Boolean);
  fs.writeFileSync(OUT_PATH, JSON.stringify(ordered, null, 2), 'utf8');

  const size = 70;
  for (let b = 0, i = 0; i < ordered.length; i += size, b++) {
    const slice = ordered.slice(i, i + size);
    fs.writeFileSync(path.join(BATCH_DIR, 'batch-' + b + '-i18n.json'), JSON.stringify(slice, null, 2));
  }

  console.log(`[translate] Fertig: ${ordered.length} in ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error('[translate] FEHLER:', err);
  process.exit(1);
});
