/**
 * Einmalige Generierung der Lexikon-Begriff-Datenbank (mehrsprachig).
 *
 * Bevorzugt fertige Sprachdateien lang-en.json … lang-tr.json
 * (via assemble-lexicon-i18n.js). Fallback: i18n-Batches, dann DE-Katalog.
 *
 *   npm run assemble-lexicon-i18n
 *   npm run generate-lexicon-terms
 */

'use strict';

const fs = require('fs');
const path = require('path');
const lexiconDb = require('../lexicon-db');
const i18n = require('../lexicon-i18n');
const { CATALOG } = require('./lexicon-terms-catalog');

const TARGET_MIN = 200;
const TARGET_MAX = 300;
const BATCH_DIR = path.join(__dirname, 'i18n-batches');

function hasLangPacks() {
  return i18n.LANGS.filter((l) => l !== 'de').every((lang) =>
    fs.existsSync(path.join(BATCH_DIR, 'lang-' + lang + '.json'))
  );
}

function loadI18nBatches() {
  if (!fs.existsSync(BATCH_DIR)) return null;
  const files = fs.readdirSync(BATCH_DIR)
    .filter((f) => /^batch-\d+-i18n\.json$/.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/batch-(\d+)/)[1], 10);
      const nb = parseInt(b.match(/batch-(\d+)/)[1], 10);
      return na - nb;
    });
  if (!files.length) return null;
  const all = [];
  const seen = new Set();
  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(BATCH_DIR, file), 'utf8'));
    if (!Array.isArray(raw)) throw new Error('Ungueltiges Batch-Format: ' + file);
    for (const row of raw) {
      const key = i18n.termKeyFromRow(row).toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      all.push(row);
    }
    console.log(`[generate] i18n-Batch ${file}: ${raw.length} Eintraege`);
  }
  return all;
}

function buildFromGermanCatalog() {
  return CATALOG.map((row) => ({
    term_key: row.term,
    term: row.term,
    synonyms: row.synonyms,
    category: row.category,
    short_description: row.short_description,
    related_chapters: row.related_chapters,
  }));
}

async function main() {
  if (hasLangPacks()) {
    console.log('[generate] Sprachpakete gefunden – assemble-lexicon-i18n.js');
    require('./assemble-lexicon-i18n.js');
    return;
  }

  let rows = loadI18nBatches();
  if (!rows || !rows.length) {
    console.log('[generate] Keine i18n-Daten – Fallback DE-Katalog');
    rows = buildFromGermanCatalog();
  } else {
    console.log('[generate] Modus: i18n-Batches');
  }

  if (rows.length < TARGET_MIN || rows.length > TARGET_MAX) {
    console.warn(`[generate] WARNUNG: ${rows.length} Begriffe (Ziel ${TARGET_MIN}-${TARGET_MAX})`);
  } else {
    console.log(`[generate] ${rows.length} Begriffe bereit`);
  }

  if (fs.existsSync(lexiconDb.DB_PATH)) fs.unlinkSync(lexiconDb.DB_PATH);
  const db = lexiconDb.openDb();
  const n = lexiconDb.replaceAllTerms(db, rows);
  const exported = lexiconDb.exportTermsToJs(db);
  console.log(`[generate] SQLite: ${n} Eintraege in ${lexiconDb.DB_PATH}`);
  console.log(`[generate] Export: ${exported.count} Eintraege -> ${exported.path}`);
  db.close();
}

main().catch((err) => {
  console.error('[generate] FEHLER:', err && err.message ? err.message : err);
  process.exit(1);
});
