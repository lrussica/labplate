'use strict';

const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, 'data', 'original_search_misses.jsonl');
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

function sanitizeQuery(value) {
  const query = String(value || '').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  return EMAIL_RE.test(query) ? '[redacted]' : query;
}

function recordMiss(query, language, country) {
  const normalizedQuery = sanitizeQuery(query).toLowerCase();
  if (!normalizedQuery || normalizedQuery === '[redacted]') return;
  const row = { normalizedQuery, language: String(language || 'de').slice(0, 2), country: country || null, timestamp: new Date().toISOString() };
  fs.appendFileSync(LOG_PATH, `${JSON.stringify(row)}\n`, { encoding: 'utf8' });
}

function topMisses(limit) {
  if (!fs.existsSync(LOG_PATH)) return [];
  const counts = new Map();
  fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean).forEach((line) => {
    try {
      const row = JSON.parse(line);
      const key = `${row.normalizedQuery}\u0000${row.country || ''}`;
      const current = counts.get(key) || { query: row.normalizedQuery, country: row.country || null, count: 0 };
      current.count += 1;
      counts.set(key, current);
    } catch (_) {}
  });
  return Array.from(counts.values()).sort((a, b) => b.count - a.count).slice(0, limit || 20);
}

module.exports = { LOG_PATH, recordMiss, topMisses, sanitizeQuery };
