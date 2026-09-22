/**
 * Fuegt Sprach-Dateien (en/es/it/pt/fr/tr) mit dem deutschen Katalog zusammen
 * und schreibt batch-*-i18n.json + regeneriert SQLite/Export.
 *
 * Erwartet Dateien:
 *   scripts/i18n-batches/lang-en.json ... lang-tr.json
 * Format je Datei:
 * {
 *   "Folsäure": {
 *     "term": "Folic acid",
 *     "synonyms": ["Folate", "Vitamin B9"],
 *     "short_description": "..."
 *   }
 * }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { CATALOG } = require('./lexicon-terms-catalog');
const { CATEGORY_I18N, LANGS } = require('../lexicon-i18n');
const lexiconDb = require('../lexicon-db');

const BATCH_DIR = path.join(__dirname, 'i18n-batches');
const TARGET = LANGS.filter((l) => l !== 'de');

function loadLang(lang) {
  const p = path.join(BATCH_DIR, 'lang-' + lang + '.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function main() {
  const maps = {};
  for (const lang of TARGET) {
    maps[lang] = loadLang(lang);
    if (!maps[lang]) {
      console.error('[assemble] FEHLT: lang-' + lang + '.json');
      process.exit(1);
    }
    console.log(`[assemble] ${lang}: ${Object.keys(maps[lang]).length} Eintraege`);
  }

  const out = [];
  let missing = 0;
  for (const row of CATALOG) {
    const term = { de: row.term };
    const synonyms = { de: Array.isArray(row.synonyms) ? row.synonyms.slice() : [] };
    const short_description = { de: row.short_description };
    const category = { ...(CATEGORY_I18N[row.category] || CATEGORY_I18N.Begriff) };

    for (const lang of TARGET) {
      const hit = maps[lang][row.term];
      if (!hit) {
        missing += 1;
        term[lang] = row.term;
        synonyms[lang] = synonyms.de.slice();
        short_description[lang] = row.short_description;
        continue;
      }
      term[lang] = String(hit.term || row.term).trim() || row.term;
      synonyms[lang] = Array.isArray(hit.synonyms) ? hit.synonyms.map(String) : synonyms.de.slice();
      short_description[lang] = String(hit.short_description || row.short_description).trim() || row.short_description;
    }

    out.push({
      term_key: row.term,
      term,
      synonyms,
      category,
      short_description,
      related_chapters: Array.isArray(row.related_chapters) ? row.related_chapters : [],
    });
  }

  fs.writeFileSync(path.join(BATCH_DIR, 'all-i18n.json'), JSON.stringify(out, null, 2));
  const size = 70;
  for (let b = 0, i = 0; i < out.length; i += size, b++) {
    fs.writeFileSync(path.join(BATCH_DIR, 'batch-' + b + '-i18n.json'), JSON.stringify(out.slice(i, i + size), null, 2));
  }

  if (fs.existsSync(lexiconDb.DB_PATH)) fs.unlinkSync(lexiconDb.DB_PATH);
  const db = lexiconDb.openDb();
  const n = lexiconDb.replaceAllTerms(db, out);
  const exported = lexiconDb.exportTermsToJs(db);
  db.close();

  console.log(`[assemble] ${out.length} Begriffe, missing fields≈${missing}, db=${n}`);
  console.log(`[assemble] Export: ${exported.path}`);
}

main();
