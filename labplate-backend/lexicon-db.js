/**
 * LabPlate – Lexikon-Begriff-Datenbank (SQLite)
 * =============================================
 * Tabelle lexicon_terms: term_key + mehrsprachige JSON-Felder
 * (term/synonyms/category/short_description) fuer de/en/es/it/pt/fr/tr.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const i18n = require('./lexicon-i18n');

const DB_PATH = path.join(__dirname, 'data', 'lexicon.db');
const EXPORT_JS_PATH = path.join(__dirname, '..', 'LabPlate', 'lexikon-terms.js');

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS lexicon_terms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  term_key TEXT NOT NULL UNIQUE,
  term TEXT NOT NULL,
  synonyms TEXT NOT NULL DEFAULT '{}',
  category TEXT NOT NULL,
  short_description TEXT NOT NULL,
  related_chapters TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_lexicon_terms_category ON lexicon_terms(category);
CREATE INDEX IF NOT EXISTS idx_lexicon_terms_term_key ON lexicon_terms(term_key);
`;

function ensureDataDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function openDb(dbPath) {
  ensureDataDir();
  const db = new DatabaseSync(dbPath || DB_PATH);
  // Altes Schema (einsprachig, Spalte term UNIQUE ohne term_key) neu aufsetzen.
  const cols = db.prepare('PRAGMA table_info(lexicon_terms)').all();
  const names = new Set(cols.map((c) => c.name));
  if (cols.length && !names.has('term_key')) {
    db.exec('DROP TABLE IF EXISTS lexicon_terms');
  }
  db.exec(CREATE_SQL);
  return db;
}

function normalizeChapters(related) {
  if (Array.isArray(related)) {
    return related.map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n) && n > 0);
  }
  if (typeof related === 'string' && related.trim()) {
    try {
      const parsed = JSON.parse(related);
      if (Array.isArray(parsed)) return normalizeChapters(parsed);
    } catch (_) { /* ignore */ }
  }
  return [];
}

function parseJsonField(raw, fallback) {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try { return JSON.parse(raw); } catch (_) { /* ignore */ }
  }
  return fallback;
}

function upsertTerm(db, row) {
  const normalized = i18n.toStorageRow(row);
  if (!normalized) return null;
  const relatedChapters = JSON.stringify(normalizeChapters(normalized.related_chapters));

  db.prepare(`
    INSERT INTO lexicon_terms (term_key, term, synonyms, category, short_description, related_chapters)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(term_key) DO UPDATE SET
      term = excluded.term,
      synonyms = excluded.synonyms,
      category = excluded.category,
      short_description = excluded.short_description,
      related_chapters = excluded.related_chapters
  `).run(
    normalized.term_key,
    JSON.stringify(normalized.term),
    JSON.stringify(normalized.synonyms),
    JSON.stringify(normalized.category),
    JSON.stringify(normalized.short_description),
    relatedChapters
  );

  return db.prepare('SELECT id FROM lexicon_terms WHERE term_key = ?').get(normalized.term_key);
}

function replaceAllTerms(db, rows) {
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM lexicon_terms');
    let n = 0;
    for (const row of rows) {
      if (upsertTerm(db, row)) n += 1;
    }
    db.exec('COMMIT');
    return n;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) { /* ignore */ }
    throw err;
  }
}

function rowToObject(row) {
  const term = i18n.normalizeTextMap(parseJsonField(row.term, row.term_key));
  const synonyms = i18n.normalizeSynonymMap(parseJsonField(row.synonyms, {}));
  const category = i18n.normalizeTextMap(parseJsonField(row.category, 'Begriff'));
  const shortDescription = i18n.normalizeTextMap(parseJsonField(row.short_description, ''));
  return {
    id: row.id,
    term_key: row.term_key,
    term,
    synonyms,
    category,
    short_description: shortDescription,
    related_chapters: normalizeChapters(row.related_chapters),
  };
}

function listTerms(db) {
  return db.prepare(`
    SELECT id, term_key, term, synonyms, category, short_description, related_chapters
    FROM lexicon_terms
    ORDER BY term_key COLLATE NOCASE
  `).all().map(rowToObject);
}

function searchTerms(db, query, lang) {
  const q = String(query || '').trim().toLowerCase();
  const all = listTerms(db);
  if (!q) return all;
  const langKey = i18n.LANGS.includes(lang) ? lang : null;
  return all.filter((t) => {
    const hay = langKey
      ? [
          t.term[langKey],
          t.category[langKey],
          t.short_description[langKey],
          ...(t.synonyms[langKey] || []),
          t.term.de,
          ...(t.synonyms.de || []),
        ].join('\n').toLowerCase()
      : i18n.flattenSearchText(t);
    return hay.includes(q);
  });
}

function countTerms(db) {
  const row = db.prepare('SELECT COUNT(*) AS n FROM lexicon_terms').get();
  return row ? row.n : 0;
}

function exportTermsToJs(db, outPath) {
  const terms = listTerms(db);
  const targets = outPath
    ? [outPath]
    : [
      EXPORT_JS_PATH,
      path.join(__dirname, '..', 'lexikon-terms.js'),
    ];
  const header = [
    '// LabPlate – Lexikon-Begriff-Datenbank (Export aus SQLite lexicon_terms).',
    '// Mehrsprachig: de/en/es/it/pt/fr/tr (wie lexikon-data.js Kapitel).',
    '// Einmalig per labplate-backend/scripts/generate-lexicon-terms.js erzeugt.',
    '// Wird von LabPlate_34_Cursor.html per <script src="lexikon-terms.js"> geladen.',
    'window.lexikonTerms = ',
  ].join('\n');
  const body = JSON.stringify(terms, null, 2);
  const payload = header + body + ';\n';
  const written = [];
  for (const target of targets) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, payload, 'utf8');
    written.push({ path: target, count: terms.length });
  }
  return written.length === 1 ? written[0] : { path: written.map((w) => w.path).join(', '), count: terms.length, files: written };
}

module.exports = {
  DB_PATH,
  EXPORT_JS_PATH,
  openDb,
  upsertTerm,
  replaceAllTerms,
  listTerms,
  searchTerms,
  countTerms,
  exportTermsToJs,
  normalizeChapters,
};
