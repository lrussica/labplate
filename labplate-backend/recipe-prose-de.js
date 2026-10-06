'use strict';
/**
 * recipe-prose-de.js — zentrale deutsche Post-Edit-Schicht.
 * Regeln laufen in dieser Reihenfolge:
 *   1) "und"-Insertion (Artikel-Muster P1/P2/P3/P4, Komma-Dreier, nackte Paare)
 *   2) Artikel-Korrektur NUR bei Genus-Mismatch (Plural-Schutz)
 *   3) Adjektivdeklination (stark/schwach/gemischt/Plural, Nom/Akk/Dat)
 *   4) Plural-Gefaesse bei 1 Portion
 *   5) Grossschreibung am Satzanfang
 * Sprach-Neutralitaet: lang !== 'de' => Text unveraendert.
 * Debug: PROSE_DE_DEBUG=1 in der Umgebung aktiviert Logs.
 */

const GENDER = {
  // feminin
  zwiebel:'f', karotte:'f', tomate:'f', zucchini:'f', aubergine:'f', avocado:'f',
  petersilie:'f', minze:'f', kokosmilch:'f', milch:'f', sahne:'f', butter:'f',
  soße:'f', sauce:'f', brust:'f', kartoffel:'f', linse:'f', kichererbse:'f',
  bohne:'f', paprika:'f', schale:'f', form:'f', schüssel:'f', schuessel:'f',
  gurke:'f', kurkuma:'f', vanille:'f', quinoa:'f',
  // maskulin
  tofu:'m', lachs:'m', reis:'m', brokkoli:'m', spinat:'m', kaese:'m', käse:'m',
  knoblauch:'m', ingwer:'m', essig:'m', senf:'m', honig:'m', joghurt:'m',
  fisch:'m', parmesan:'m', pfeffer:'m', koriander:'m', sellerie:'m', lauch:'m',
  eintopf:'m', auflauf:'m', teller:'m', zucker:'m', kreuzkümmel:'m', kürbis:'m',
  muskat:'m', bacon:'m', seitan:'m', tempeh:'m',
  // neutrum
  wasser:'n', oel:'n', öl:'n', olivenoel:'n', olivenöl:'n', salz:'n', mehl:'n',
  eiweiss:'n', eiweiß:'n', tomatenmark:'n', fleisch:'n', huhn:'n', haehnchen:'n',
  hähnchen:'n', hackfleisch:'n', curry:'n', fett:'n', ei:'n', gemüse:'n', gemuese:'n',
  filet:'n', gluten:'n',
  // Plural (nur unregelmaessige Endungen — "...en" wird heuristisch erkannt)
  eier:'p', zwiebeln:'p', nudeln:'p',
};

const ADJ_GROUPS = [
  ['schwarz'], ['weiß','weiss'], ['frisch'], ['gerieben','gerben'],
  ['rot'], ['gelb'], ['grün','gruen'], ['gehackt','gehakt'],
  ['getrocknet'], ['geräuchert','geraeuchert'], ['mild'], ['mager'],
  ['gemahlen'], ['fein'], ['fest'], ['weich'],
];

const ENDINGS = {
  none: { m:{nom:'er',akk:'en',dat:'em'}, f:{nom:'e',akk:'e',dat:'er'}, n:{nom:'es',akk:'es',dat:'em'}, p:{nom:'e',akk:'e',dat:'en'} },
  def:  { m:{nom:'e',akk:'en',dat:'en'},  f:{nom:'e',akk:'e',dat:'en'},  n:{nom:'e',akk:'e',dat:'en'},  p:{nom:'en',akk:'en',dat:'en'} },
  ind:  { m:{nom:'er',akk:'en',dat:'en'}, f:{nom:'e',akk:'e',dat:'en'},  n:{nom:'es',akk:'es',dat:'en'}, p:{nom:'en',akk:'en',dat:'en'} },
};

const ART = {
  m: { nom:'der', akk:'den', dat:'dem' },
  f: { nom:'die', akk:'die', dat:'der' },
  n: { nom:'das', akk:'das', dat:'dem' },
  p: { nom:'die', akk:'die', dat:'den' },
};

const DAT_PREP = /^(mit|in|auf|aus|zu|von|bei|an|über|unter|für|fuer)$/i;
const AKK_VERB = /^(hinzufügen|hinzufuegen|dazugeben|einrühren|einruehren|untermischen|schneiden|würfeln|wuerfeln|geben|gießen|giessen|bestreuen|anbraten|braten|anschwitzen|dünsten|duensten|kochen|garen|einstreuen|rösten|roesten|hacken|zerkleinern|reiben|raspeln|pressen|unterheben|verrühren|verruehren|mischen|vermengen|würzen|wuerzen|marinieren)$/i;

function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function cleanName(name) {
  return String(name || '')
    .split('(')[0]
    .split(',')[0]
    .replace(/^\s*\d+(?:[.,]\d+)?\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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
  if (last.endsWith('en')) return 'p';
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

function namePattern(name) {
  const c = cleanName(name);
  const parts = c.split(/\s+/).filter(Boolean);
  // Plural-Name matcht auch Singular ("Zwiebeln" === "Zwiebel")
  if (parts.length === 1 && confidentGender(c) === 'p') {
    const sing = c.replace(/n$/, '');
    if (sing.length >= 3 && sing !== c) {
      return '(?:' + escapeRegExp(c) + '|' + escapeRegExp(sing) + ')';
    }
  }
  if (parts.length >= 2) {
    const stem = adjStemOf(parts[0]);
    if (stem) {
      const nounPart = parts.slice(1).join(' ');
      return '(?:' + escapeRegExp(c)
        + '|' + adjAlternation(stem) + '(?:er|e|es|em|en)?\\s+' + escapeRegExp(nounPart)
        + '|' + escapeRegExp(nounPart) + ')';
    }
  }
  return escapeRegExp(c);
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
      // P1: beide haben Artikel -> BEIDE behalten
      out = out.replace(new RegExp('\\b(der|die|das|den|dem)\\s+(' + A + ')\\s+(der|die|das|den|dem)\\s+(' + B + ')\\b', 'gi'), '$1 $2 und $3 $4');
      // P2: nur erster hat Artikel -> beide Artikel WEG
      out = out.replace(new RegExp('\\b(der|die|das|den|dem)\\s+(' + A + ')\\s+(' + B + ')\\b', 'gi'), '$2 und $3');
      out = out.replace(new RegExp('\\b(' + A + ')\\s*,?\\s+(der|die|das|den|dem)\\s+(' + B + ')\\b', 'gi'), '$1 und $3');
      out = out.replace(new RegExp('(^|[^A-Za-zÄÖÜäöüß])(' + A + ')\\s+und\\s+(der|die|das|den|dem)\\s+(' + B + ')\\b', 'gi'), function (m, pre, nameA, art, nameB) {
        const before = sentenceBefore(out, out.indexOf(m));
        const words = before.match(/[A-Za-zÄÖÜäöüß]+/g) || [];
        const lastWordX = words.length ? words[words.length - 1].toLowerCase() : '';
        if (/^(der|die|das|den|dem|ein|eine|einen|einem|einer)$/.test(lastWordX)) return m;
        return pre + nameA + ' und ' + nameB;
      });
      // P5: "Artikel NAME1 und NAME2" (NAME2 ohne Artikel) -> Artikel WEG
      out = out.replace(
        new RegExp('(^|[^A-Za-zÄÖÜäöüß])(der|die|das|den|dem)\\s+(' + A + ')\\s+und\\s+(' + B + ')\\b', 'gi'),
        '$1$3 und $4');
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

function fixArticlesWithAdjective(out, names, nameSet) {
  // "die verquirlten Ei" -> "das verquirlte Ei" (Artikel + Adjektiv + Nomen)
  names.forEach(function (name) {
    const g = confidentGender(name);
    if (!g) return;
    const parts = cleanName(name).split(/\s+/);
    const noun = parts[parts.length - 1];
    if (!noun || noun.length < 2) return;
    // Match: Artikel + optionales Adjektiv + Nomen
    // Adjektiv = ein Wort, das auf typische Endung endet
    const adjOpt = '(?:([A-Za-zÄÖÜäöüß]{3,}(?:e|en|er|es|em))\\s+)?';
    out = out.replace(
      new RegExp('\\b(der|die|das|den|dem)\\s+' + adjOpt + '(' + escapeRegExp(noun) + ')\\b', 'gi'),
      function (m, art, adj, n) {
        const idx = out.indexOf(m);
        const before = sentenceBefore(out, idx);
        const words = before.match(/[A-Za-zÄÖÜäöüß]+/g) || [];
        const a = art.toLowerCase();
        let kase = caseFromWalk(words, nameSet)
          || (/^dem$/i.test(a) ? 'dat' : /^den$/i.test(a) ? 'akk' : 'nom');
        if (kase === 'nom' && /^(der|die|das)$/.test(a) && forwardHasAkkVerb(out, idx + m.length)) {
          kase = 'akk';
        }
        const correctArt = ART[g][kase];
        if (!adj) {
          // kein Adjektiv - nichts tun, fixArticles macht das
          return m;
        }
        // Adjektiv neu deklinieren (schwach, weil Artikel davor)
        const adjStem = adj.replace(/(e|en|er|es|em)$/, '');
        const correctAdj = adjStem + ENDINGS['def'][g][kase];
        return correctArt + ' ' + correctAdj + ' ' + n;
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
        let correct;
        if (g === 'p') {
          correct = a === 'das' ? 'die' : a === 'dem' ? 'den' : (a === 'der' ? (kase === 'dat' ? 'den' : 'die') : a);
        } else {
          correct = ART[g][kase];
        }
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

function fixPostposedAdjectives(out, names, nameSet) {
  // "Paprika rot" -> "rote Paprika", nur wenn Zutat "Rote Paprika" in ingredientNames steht.
  names.forEach(function (name) {
    const parts = cleanName(name).split(/\s+/).filter(Boolean);
    if (parts.length < 2) return;
    const stem = adjStemOf(parts[0]);
    if (!stem) return;
    const g = genderOf(name);
    const nounPart = parts.slice(1).join(' ');
    out = out.replace(
      new RegExp('\\b(' + escapeRegExp(nounPart) + ')\\s+(' + adjAlternation(stem) + ')\\b', 'gi'),
      function (m, noun, adj) {
        const idx = out.indexOf(m);
        const c = declineContext(out, idx, nameSet, g);
        return adjEnding(stem, g, c.kase, c.det) + ' ' + noun;
      });
  });
  return out;
}

function fixPortionVessels(out) {
  out = out.replace(/\bin\s+(?:Schalen|Schuesseln|Schüsseln)\s+(füllen|fuellen|gefüllt|gefuellt|geben|gegeben|verteilen|verteilt|anrichten|angerichtet)\b/gi, 'in eine Schale $1');
  out = out.replace(/\bauf\s+(?:Schalen|Tellern?)\s+(verteilen|verteilt|anrichten|angerichtet|servieren|serviert)\b/gi, 'auf einen Teller $1');
  return out;
}

function fixSentenceCase(out) {
  return out.replace(/(^|[.!?]\s+)([a-zäöüß])/g, function (m, p, ch) { return p + ch.toUpperCase(); });
}

let DEBUG_RUNTIME = false;
function debug(tag, val) {
  if (!DEBUG_RUNTIME) return;
  console.log('[prose-de] ' + tag + '=' + (typeof val === 'string' ? val : JSON.stringify(val)));
}

function polishStepText(text, ctx, lang) {
  let out = String(text == null ? '' : text);
  const c = ctx || {};
  DEBUG_RUNTIME = (process.env.PROSE_DE_DEBUG === '1') || (c.debugProse === true);
  debug('input', out);
  if (!out) return out;
  if (lang && String(lang).toLowerCase() !== 'de') return out;
  debug('ingredientNamesRaw', c.ingredientNames);
  const names = (c.ingredientNames || []).map(cleanName).filter(function (n) { return n.length >= 2; }).sort(function (a, b) { return b.length - a.length; });
  debug('ingredientNames', names);
  if (!names.length) return out;
  const nameSet = buildNameSet(names);
  out = insertUndArticlePatterns(out, names);
  out = insertUndBare(out, names);
  debug('afterUnd', out);
  out = fixPostposedAdjectives(out, names, nameSet);
  out = fixArticlesWithAdjective(out, names, nameSet);
  out = fixArticles(out, names, nameSet);
  out = fixAdjectives(out, names, nameSet);
  if (Number(c.portions) === 1) out = fixPortionVessels(out);
  out = fixSentenceCase(out);
  debug('output', out);
  return out;
}

module.exports = {
  polishStepText: polishStepText,
  genderOf: genderOf,
  GENDER: GENDER,
  adjStemOf: adjStemOf,
  adjEnding: adjEnding,
};
