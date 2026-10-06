'use strict';
/**
 * recipe-prose-de.js — zentrale deutsche Post-Edit-Schicht.
 * Regeln laufen in dieser Reihenfolge:
 *   1) "und"-Insertion (Artikel-Muster P1/P2/P3, Komma-Dreier, nackte Paare)
 *   2) Artikel-Korrektur NUR bei Genus-Mismatch (Plural-Schutz)
 *   3) Adjektivdeklination (stark/schwach/gemischt, Nom/Akk/Dat)
 *   4) Plural-Gefaesse bei 1 Portion
 *   5) Grossschreibung am Satzanfang
 * Sprach-Neutralitaet: lang !== 'de' => Text unveraendert.
 */

const GENDER = {
  zwiebel:'f', karotte:'f', tomate:'f', zucchini:'f', aubergine:'f', avocado:'f',
  petersilie:'f', minze:'f', kokosmilch:'f', milch:'f', sahne:'f', butter:'f',
  soße:'f', sauce:'f', brust:'f', kartoffel:'f', linse:'f', kichererbse:'f',
  bohne:'f', paprika:'f', schale:'f', form:'f', schüssel:'f', schuessel:'f',
  tofu:'m', lachs:'m', reis:'m', brokkoli:'m', spinat:'m', kaese:'m', käse:'m',
  knoblauch:'m', ingwer:'m', essig:'m', senf:'m', honig:'m', joghurt:'m',
  fisch:'m', parmesan:'m', pfeffer:'m', koriander:'m', sellerie:'m', lauch:'m',
  eintopf:'m', auflauf:'m', teller:'m',
  wasser:'n', oel:'n', öl:'n', olivenoel:'n', olivenöl:'n', salz:'n', mehl:'n',
  eiweiss:'n', eiweiß:'n', tomatenmark:'n', fleisch:'n', huhn:'n', haehnchen:'n',
  hähnchen:'n', hackfleisch:'n', curry:'n', fett:'n', ei:'n', gemüse:'n', gemuese:'n',
};

// ---------- Plural-Formen fuer den Karotte/Karotten-Match ----------
const PLURAL_MAP = {
  zwiebel:'Zwiebeln', karotte:'Karotten', tomate:'Tomaten',
  kartoffel:'Kartoffeln', linse:'Linsen', kichererbse:'Kichererbsen',
  bohne:'Bohnen', aubergine:'Auberginen', avocado:'Avocados',
  schale:'Schalen', gurke:'Gurken', zitrone:'Zitronen',
  pilz:'Pilze', apfel:'Äpfel', blatt:'Blätter',
};

const ADJ_GROUPS = [
  ['schwarz'], ['weiß','weiss'], ['frisch'], ['gerieben','gerben'],
  ['rot'], ['gelb'], ['grün','gruen'], ['gehackt','gehakt'],
  ['getrocknet'], ['geräuchert','geraeuchert'], ['mild'], ['mager'],
  ['gemahlen'], ['fein'], ['fest'], ['weich'],
];

const ENDINGS = {
  none: { m:{nom:'er',akk:'en',dat:'em'}, f:{nom:'e',akk:'e',dat:'er'}, n:{nom:'es',akk:'es',dat:'em'} },
  def:  { m:{nom:'e',akk:'en',dat:'en'},  f:{nom:'e',akk:'e',dat:'en'},  n:{nom:'e',akk:'e',dat:'en'} },
  ind:  { m:{nom:'er',akk:'en',dat:'en'}, f:{nom:'e',akk:'e',dat:'en'},  n:{nom:'es',akk:'es',dat:'en'} },
};

const ART = {
  m: { nom:'der', akk:'den', dat:'dem' },
  f: { nom:'die', akk:'die', dat:'der' },
  n: { nom:'das', akk:'das', dat:'dem' },
};

const DAT_PREP = /^(mit|in|auf|aus|zu|von|bei|an|über|unter|für|fuer)$/i;
const AKK_VERB = /^(hinzufügen|hinzufuegen|dazugeben|einrühren|einruehren|untermischen|schneiden|würfeln|wuerfeln|geben|gießen|giessen|bestreuen|anbraten|braten|anschwitzen|dünsten|duensten|kochen|garen|einstreuen|rösten|roesten|hacken|zerkleinern|reiben|raspeln|pressen|unterheben|verrühren|verruehren|mischen|vermengen|würzen|wuerzen|marinieren)$/i;

function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function cleanName(name) { return String(name || '').split('(')[0].replace(/\s+/g, ' ').trim(); }
function lastWord(name) {
  const parts = cleanName(name).split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1].toLowerCase() : '';
}
function confidentGender(name) {
  const last = lastWord(name);
  if (!last) return null;
  if (GENDER[last]) return GENDER[last];
  const keys = Object.keys(GENDER).sort(function (a, b) { return b.length - a.length; });
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].length >= 3 && last.endsWith(keys[i])) return GENDER[keys[i]];
  }
  if (/(chen|lein|ment|püree|pulver|wasser|öl|oel|salz|mark)$/.test(last)) return 'n';
  if (last.endsWith('e') && !/^(gemuese|gemüse)$/.test(last)) return 'f';
  return null;
}
function genderOf(name) { return confidentGender(name) || 'm'; }
function adjStemOf(token) {
  const t = String(token || '').toLowerCase();
  const candidates = [t, t.replace(/(er|e|es|em|en)$/, '')];
  for (let i = 0; i < ADJ_GROUPS.length; i++) {
    const group = ADJ_GROUPS[i];
    if (group.indexOf(candidates[0]) >= 0 || group.indexOf(candidates[1]) >= 0) return group[0];
  }
  return null;
}
function adjAlternation(canonical) {
  for (let i = 0; i < ADJ_GROUPS.length; i++) {
    if (ADJ_GROUPS[i][0] === canonical) {
      return '(?:' + ADJ_GROUPS[i].map(escapeRegExp).join('|') + ')';
    }
  }
  return '(?:' + escapeRegExp(canonical) + ')';
}
function adjEnding(stem, g, kase, det) { return stem + ENDINGS[det][g][kase]; }
function sentenceBefore(text, idx) {
  const head = text.slice(0, idx);
  let cut = -1;
  ['.', '!', '?'].forEach(function (sep) {
    const i = head.lastIndexOf(sep);
    if (i > cut) cut = i;
  });
  return head.slice(cut + 1).slice(-120).trim();
}
function caseFromWalk(words, nameSet) {
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i].toLowerCase();
    if (w === 'und' || w === 'oder' || w === 'sowie') continue;
    if (nameSet && (nameSet[w] || nameSet[words[i]])) continue;
    if (DAT_PREP.test(w)) return 'dat';
    if (AKK_VERB.test(w)) return 'akk';
    break;
  }
  return null;
}
function buildNameSet(names) {
  const set = {};
  names.forEach(function (n) {
    const c = cleanName(n).toLowerCase();
    if (!c) return;
    set[c] = true;
    const parts = c.split(/\s+/);
    set[parts[parts.length - 1]] = true;
  });
  return set;
}
function declineContext(text, idx, nameSet, g) {
  const before = sentenceBefore(text, idx);
  const words = before.match(/[A-Za-zÄÖÜäöüß]+/g) || [];
  const last = words.length ? words[words.length - 1].toLowerCase() : '';
  let det = 'none';
  if (/^(der|die|das|den|dem)$/.test(last)) det = 'def';
  else if (/^ein(?:e|en|em)?$/.test(last)) det = 'ind';
  let kase;
  if (det !== 'none') {
    kase = caseFromWalk(words.slice(0, -1), nameSet);
    if (!kase) {
      if (last === 'dem' || last === 'einem') kase = 'dat';
      else if (last === 'den' || last === 'einen') kase = 'akk';
      else if (last === 'der') kase = (g === 'f') ? 'dat' : 'nom';
      else kase = 'nom';
    }
  } else {
    kase = caseFromWalk(words, nameSet) || 'nom';
  }
  return { det: det, kase: kase };
}
function pluralOfName(name) {
  const last = lastWord(name);
  if (!last) return null;
  if (PLURAL_MAP[last]) return PLURAL_MAP[last];
  if (/el$/.test(last)) return last + 'n';
  if (/e$/.test(last) && !/ee$/.test(last)) return last + 'n';
  return null;
}
function namePattern(name) {
  const c = cleanName(name);
  const parts = c.split(/\s+/).filter(Boolean);
  let base;
  if (parts.length >= 2) {
    const stem = adjStemOf(parts[0]);
    if (stem) {
      base = '(?:' + adjAlternation(stem) + '(?:er|e|es|em|en)?\\s+'
        + escapeRegExp(parts.slice(1).join(' ')) + '|' + escapeRegExp(c) + ')';
    }
  }
  if (!base) base = escapeRegExp(c);
  const plural = pluralOfName(name);
  if (plural && plural.toLowerCase() !== lastWord(name)) {
    const plName = parts.slice(0, -1).concat(plural).join(' ');
    base = '(?:' + base + '|' + escapeRegExp(plName) + ')';
  }
  return base;
}
function forwardHasAkkVerb(text, idx) {
  const tail = text.slice(idx);
  const cut = tail.search(/[.!?]/);
  const seg = cut >= 0 ? tail.slice(0, cut) : tail;
  const words = seg.match(/[A-Za-zÄÖÜäöüß]+/g) || [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i].toLowerCase();
    if (w === 'und' || w === 'oder' || w === 'sowie') continue;
    if (AKK_VERB.test(w)) return true;
  }
  return false;
}
function insertUndArticlePatterns(out, names) {
  names.forEach(function (a) {
    names.forEach(function (b) {
      if (a === b) return;
      const A = namePattern(a), B = namePattern(b);
      out = out.replace(new RegExp('\\b(der|die|das|den|dem)\\s+(' + A + ')\\s+(der|die|das|den|dem)\\s+(' + B + ')\\b', 'gi'), '$2 und $4');
      out = out.replace(new RegExp('\\b(der|die|das|den|dem)\\s+(' + A + ')\\s+(' + B + ')\\b', 'gi'), '$1 $2 und $3');
      out = out.replace(new RegExp('\\b(' + A + ')\\s*,?\\s+(der|die|das|den|dem)\\s+(' + B + ')\\b', 'gi'), '$1 und $3');
    });
  });
  return out;
}
function insertUndBare(out, names) {
  names.forEach(function (a) {
    names.forEach(function (b) {
      names.forEach(function (c) {
        if (a === b || b === c || a === c) return;
        out = out.replace(new RegExp('\\b(' + namePattern(a) + '),\\s+(' + namePattern(b) + ')\\s+(' + namePattern(c) + ')\\b', 'gi'), '$1, $2 und $3');
      });
    });
  });
  names.forEach(function (a) {
    names.forEach(function (b) {
      if (a === b) return;
      out = out.replace(new RegExp('\\b(' + namePattern(a) + ')\\s+(?!(?:und|oder|sowie|mit|in|auf|zu|von|bei|aus|an|etwas)\\b)(' + namePattern(b) + ')\\b', 'gi'), '$1 und $2');
    });
  });
  return out;
}
function fixArticles(out, names, nameSet) {
  names.forEach(function (name) {
    const g = confidentGender(name);
    if (!g) return;
    const parts = cleanName(name).split(/\s+/);
    const variants = [cleanName(name)];
    if (parts.length > 1) variants.push(parts[parts.length - 1]);
    variants.forEach(function (v) {
      out = out.replace(new RegExp('\\b(der|die|das|den|dem)\\s+(' + escapeRegExp(v) + ')\\b', 'gi'), function (m, art, noun) {
        const idx = out.indexOf(m);
        const before = sentenceBefore(out, idx);
        const words = before.match(/[A-Za-zÄÖÜäöüß]+/g) || [];
        const a = art.toLowerCase();
        let kase = caseFromWalk(words, nameSet)
          || (/^dem$/i.test(a) ? 'dat' : /^den$/i.test(a) ? 'akk' : 'nom');
        if (kase === 'nom' && /^(der|die|das)$/.test(a) && forwardHasAkkVerb(out, idx + m.length)) {
          kase = 'akk';
        }
        const correct = ART[g][kase];
        if (correct === a) return m;
        return correct + ' ' + noun;
      });
    });
  });
  return out;
}
function fixAdjectives(out, names, nameSet) {
  names.forEach(function (name) {
    const parts = cleanName(name).split(/\s+/).filter(Boolean);
    if (parts.length < 2) return;
    const stem = adjStemOf(parts[0]);
    if (!stem) return;
    const g = genderOf(name);
    const nounPart = parts.slice(1).join(' ');
    const adjRe = adjAlternation(stem) + '(?:er|e|es|em|en)?';
    const nounRe = escapeRegExp(nounPart);
    const fullRe = escapeRegExp(cleanName(name));
    out = out.replace(new RegExp('\\b' + adjRe + '\\s+' + fullRe + '\\b', 'gi'), function (m) {
      const idx = out.indexOf(m);
      const c = declineContext(out, idx, nameSet, g);
      return adjEnding(stem, g, c.kase, c.det) + ' ' + nounPart;
    });
    out = out.replace(new RegExp('\\b' + adjRe + '\\s+(' + nounRe + ')\\b', 'gi'), function (m, noun) {
      const idx = out.indexOf(m);
      const c = declineContext(out, idx, nameSet, g);
      return adjEnding(stem, g, c.kase, c.det) + ' ' + noun;
    });
  });
  return out;
}
function fixPortionVessels(out) {
  out = out.replace(/\bin\s+(?:Schalen|Schuesseln|Schüsseln)\s+(füllen|fuellen|geben|verteilen|anrichten)\b/gi, 'in eine Schale $1');
  out = out.replace(/\bauf\s+(?:Schalen|Tellern?)\s+(verteilen|anrichten|servieren)\b/gi, 'auf einen Teller $1');
  return out;
}
function fixSentenceCase(out) {
  return out.replace(/(^|[.!?]\s+)([a-zäöüß])/g, function (m, p, ch) { return p + ch.toUpperCase(); });
}
function polishStepText(text, ctx, lang) {
  let out = String(text == null ? '' : text);
  if (!out) return out;
  if (lang && String(lang).toLowerCase() !== 'de') return out;
  const c = ctx || {};
  const names = (c.ingredientNames || []).map(cleanName).filter(function (n) { return n.length >= 2; }).sort(function (a, b) { return b.length - a.length; });
  if (!names.length) return out;
  const nameSet = buildNameSet(names);
  out = insertUndArticlePatterns(out, names);
  out = insertUndBare(out, names);
  out = fixArticles(out, names, nameSet);
  out = fixAdjectives(out, names, nameSet);
  if (Number(c.portions) === 1) out = fixPortionVessels(out);
  out = fixSentenceCase(out);
  return out;
}
module.exports = {
  polishStepText: polishStepText,
  genderOf: genderOf,
  GENDER: GENDER,
  adjStemOf: adjStemOf,
  adjEnding: adjEnding,
};
