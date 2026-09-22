/**
 * LabPlate Lexikon – Mehrsprachigkeit fuer Begriffe
 * Sprachen wie Kapitel/App: de, en, es, it, pt, fr, tr
 */

'use strict';

const LANGS = ['de', 'en', 'es', 'it', 'pt', 'fr', 'tr'];

const CATEGORY_I18N = {
  Vitamin: {
    de: 'Vitamin', en: 'Vitamin', es: 'Vitamina', it: 'Vitamina',
    pt: 'Vitamina', fr: 'Vitamine', tr: 'Vitamin',
  },
  Mineralstoff: {
    de: 'Mineralstoff', en: 'Mineral', es: 'Mineral', it: 'Minerale',
    pt: 'Mineral', fr: 'Minéral', tr: 'Mineral',
  },
  Spurenelement: {
    de: 'Spurenelement', en: 'Trace element', es: 'Oligoelemento', it: 'Oligoelemento',
    pt: 'Oligoelemento', fr: 'Oligoélément', tr: 'İz element',
  },
  Blutwert: {
    de: 'Blutwert', en: 'Blood value', es: 'Valor sanguíneo', it: 'Valore ematico',
    pt: 'Valor sanguíneo', fr: 'Valeur sanguine', tr: 'Kan değeri',
  },
  Stoffwechsel: {
    de: 'Stoffwechsel', en: 'Metabolism', es: 'Metabolismo', it: 'Metabolismo',
    pt: 'Metabolismo', fr: 'Métabolisme', tr: 'Metabolizma',
  },
  Nährstoff: {
    de: 'Nährstoff', en: 'Nutrient', es: 'Nutriente', it: 'Nutriente',
    pt: 'Nutriente', fr: 'Nutriment', tr: 'Besin öğesi',
  },
  Begriff: {
    de: 'Begriff', en: 'Term', es: 'Término', it: 'Termine',
    pt: 'Termo', fr: 'Terme', tr: 'Terim',
  },
};

function emptyLangMap(fallback) {
  const out = {};
  for (const lang of LANGS) out[lang] = fallback == null ? '' : String(fallback);
  return out;
}

function emptySynMap() {
  const out = {};
  for (const lang of LANGS) out[lang] = [];
  return out;
}

function isLangMap(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && LANGS.some((l) => Object.prototype.hasOwnProperty.call(value, l));
}

/** String oder {de,en,...} → vollstaendige Sprach-Map (fehlende Sprachen fallen auf de zurueck). */
function normalizeTextMap(value, fallbackDe) {
  if (isLangMap(value)) {
    const de = String(value.de || fallbackDe || '').trim();
    const out = emptyLangMap(de);
    for (const lang of LANGS) {
      const v = String(value[lang] || '').trim();
      out[lang] = v || de;
    }
    return out;
  }
  const de = String(value || fallbackDe || '').trim();
  return emptyLangMap(de);
}

/** Array oder {de:[],en:[]} → Synonym-Map je Sprache. */
function normalizeSynonymMap(value, fallbackDeArr) {
  if (Array.isArray(value)) {
    const de = value.map((s) => String(s || '').trim()).filter(Boolean);
    const out = emptySynMap();
    for (const lang of LANGS) out[lang] = de.slice();
    return out;
  }
  if (isLangMap(value)) {
    const de = Array.isArray(value.de)
      ? value.de.map((s) => String(s || '').trim()).filter(Boolean)
      : (Array.isArray(fallbackDeArr) ? fallbackDeArr.slice() : []);
    const out = emptySynMap();
    for (const lang of LANGS) {
      const arr = Array.isArray(value[lang])
        ? value[lang].map((s) => String(s || '').trim()).filter(Boolean)
        : [];
      out[lang] = arr.length ? arr : de.slice();
    }
    return out;
  }
  const de = Array.isArray(fallbackDeArr) ? fallbackDeArr.slice() : [];
  const out = emptySynMap();
  for (const lang of LANGS) out[lang] = de.slice();
  return out;
}

function categoryMapFromKey(categoryKeyOrMap) {
  if (isLangMap(categoryKeyOrMap)) return normalizeTextMap(categoryKeyOrMap);
  const key = String(categoryKeyOrMap || 'Begriff').trim();
  return CATEGORY_I18N[key] ? { ...CATEGORY_I18N[key] } : normalizeTextMap(key);
}

function termKeyFromRow(row) {
  if (row && row.term_key) return String(row.term_key).trim();
  if (isLangMap(row && row.term)) return String(row.term.de || '').trim();
  return String((row && row.term) || '').trim();
}

function flattenSearchText(row) {
  const parts = [];
  const term = normalizeTextMap(row.term);
  const category = normalizeTextMap(row.category);
  const desc = normalizeTextMap(row.short_description);
  const syns = normalizeSynonymMap(row.synonyms);
  for (const lang of LANGS) {
    parts.push(term[lang], category[lang], desc[lang]);
    parts.push.apply(parts, syns[lang]);
  }
  return parts.join('\n').toLowerCase();
}

function toStorageRow(row) {
  const termKey = termKeyFromRow(row);
  if (!termKey) return null;
  const term = normalizeTextMap(row.term, termKey);
  const synonyms = normalizeSynonymMap(row.synonyms);
  const category = categoryMapFromKey(row.category);
  const shortDescription = normalizeTextMap(row.short_description || row.shortDescription);
  if (!shortDescription.de) return null;
  return {
    term_key: termKey,
    term,
    synonyms,
    category,
    short_description: shortDescription,
    related_chapters: Array.isArray(row.related_chapters) ? row.related_chapters : (row.relatedChapters || []),
  };
}

function completenessReport(rows) {
  const missing = [];
  for (const row of rows) {
    const n = toStorageRow(row);
    if (!n) continue;
    for (const lang of LANGS) {
      if (!n.term[lang] || n.term[lang] === n.term.de && lang !== 'de' && !isLangMap(row.term)) {
        // only flag if original was supposed to be translated but fell back
      }
      if (!n.short_description[lang]) missing.push(n.term_key + ':' + lang + ':desc');
      if (!n.term[lang]) missing.push(n.term_key + ':' + lang + ':term');
      if (!n.category[lang]) missing.push(n.term_key + ':' + lang + ':cat');
    }
  }
  return missing;
}

module.exports = {
  LANGS,
  CATEGORY_I18N,
  normalizeTextMap,
  normalizeSynonymMap,
  categoryMapFromKey,
  termKeyFromRow,
  flattenSearchText,
  toStorageRow,
  completenessReport,
  isLangMap,
};
