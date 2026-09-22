/**
 * LabPlate – Supplement-Coach Kernlogik (Phase 3)
 * =================================================
 * Alltag-Orientierung bei Mangel & Vitaminen.
 * Keine Dosierungen, keine Diagnosen, kein automatischer Fachpersonal-Verweis.
 * Nutzt den Brief vom Mental-Verhalten-Coach.
 */
'use strict';

const recipeCore = require('./nutri-recipe-core');
const apiI18n = require('./api-i18n');

const TEAM_HANDOFF_BRIEF_MAX = 400;

/** Variante 4 – neutraler Footer für jeden Vitamin-Block (keine Dosierung, kein Verkauf). */
function supplementStandardFooter(lang) {
  return apiI18n.t('supplement_footer', lang || 'en');
}
const SUPPLEMENT_STANDARD_FOOTER = supplementStandardFooter('de');

/** Partner-/Kooperations-Hinweis – aktuell deaktiviert (kein Verkaufsimpuls). */
const SUPPLEMENT_PARTNER_HINT_ENABLED = false;
const SUPPLEMENT_PARTNER_HINT =
  'Manche Menschen informieren sich zusätzlich über hochwertige Ergänzungen. ' +
  'Wenn du möchtest, kannst du dich später über externe Anbieter informieren.';

const SUPPLEMENT_SYSTEM_PROMPT_BASE = [
  'Der Supplement-Coach gibt alltagsorientierte Hinweise zu Naehrstoffen und Mangelgefuehlen.',
  'Er ist kein Arzt und gibt keine Dosierungen, Diagnosen oder medizinischen Empfehlungen.',
  'Er nutzt den Brief aus dem Mental-Verhalten-Coach fuer Kontext.',
  'Er ist KEIN Koch und schreibt KEINE Rezepte, Mengen oder Zubereitungsschritte.',
  '',
  'Antwortstruktur (IMMER):',
  '1. Kurze Orientierung in Alltagssprache',
  '2. Lebensmittelgruppen / Alltagstipp (keine Rezepte, keine Mengen)',
  '3. Footer (Variante 4) bei Vitaminen: „Viele Menschen ergänzen dieses Vitamin… ärztliche Rücksprache.“',
  '4. next_step leer lassen (kein Chat wie „leite mich weiter“)',
  '5. handoff an koch mit brief:{theme,source:\"supplement\"} – Client zeigt Button „Rezept dazu anzeigen“',
  '',
  'Häufige Vitamine: Vitamin D, E, B12, Folat (B9), K2, B6 – jeweils Alltagstext + 3–4 Lebensmittel + Footer.',
  'KEINE Produktvorschläge, KEINE Verkaufsimpulse, KEINE Dosierungen.',
  '',
  'VERBOTEN: Rezepte, Zubereitung, Mengenangaben zum Kochen, mg/IE/µg, Einnahmeplaene, Diagnosen,',
  'Produktverkauf, „Bitte hole dir professionelle Hilfe“ als Standardtext.',
  '',
  'Antworte AUSSCHLIESSLICH als JSON:',
  '{"type":"advice","summary":"...","details":"...","next_step":"","items":["..."],"footer":"...","handoff":{"to":"koch","reason":"rezept_intent","brief":{"theme":"vitamin_d","source":"supplement"}},"auto_handoff":false}',
  'auto_handoff=true nur wenn der Nutzer klar kochen/Rezept will; sonst false (Client zeigt Button „Rezept dazu anzeigen“).',
].join('\n');

function truncateTeamBrief(text, maxLen) {
  let s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  const cap = (typeof maxLen === 'number' && maxLen > 0) ? maxLen : TEAM_HANDOFF_BRIEF_MAX;
  if (s.length <= cap) return s;
  return s.slice(0, cap).trim();
}

function sanitizeText(raw, max) {
  if (typeof raw !== 'string') return '';
  let t = raw.replace(/<[^>]*>/g, ' ');
  t = t.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ' ');
  t = t.replace(/[ \t]+/g, ' ').trim();
  return t.slice(0, max || 4000);
}

function buildSharedContextLines(userSlice) {
  const user = userSlice && typeof userSlice === 'object' ? userSlice : {};
  const profile = user.profile || {};
  const today = user.today || {};
  const macros = today.macrosPct || {};
  const gaps = Array.isArray(today.topMicroGaps) ? today.topMicroGaps.slice(0, 6) : [];
  const allergens = Array.isArray(user.allergens) ? user.allergens.slice(0, 8) : [];
  const gapText = gaps.map((g) => (g && g.label ? (g.label + (g.pct != null ? ' (~' + g.pct + '%)' : '')) : '')).filter(Boolean).join(', ');
  return [
    'TEAM-KONTEXT (datensparsam, keine Diagnosen, keine Lab-Rohwerte, keine Dosierungen):',
    '- Profil: Altersband ' + (profile.ageBand || 'n/a') + ', Gender-Code ' + (profile.gender || 'n/a') + ', Aktivitaet ' + (profile.activityLevel || 'n/a') + '.',
    '- Makro-Fortschritt heute (%): KH ' + (macros.kh != null ? macros.kh + '%' : 'n/a') +
      ', Protein ' + (macros.protein != null ? macros.protein + '%' : 'n/a') +
      ', Fett ' + (macros.fett != null ? macros.fett + '%' : 'n/a') +
      ', Ballast ' + (macros.fiber != null ? macros.fiber + '%' : 'n/a') + '.',
    gapText ? '- Mikro-Luecken (Labels): ' + gapText + '.' : '- Keine kritischen Mikro-Luecken unter 70%.',
    allergens.length ? '- Allergene: ' + allergens.join(', ') + '.' : '- Keine gespeicherten Allergene.',
  ].join('\n');
}

function buildSupplementSystemPrompt(opts) {
  const o = opts || {};
  const lang = o.lang || 'de';
  const handoffBrief = truncateTeamBrief(o.handoffBrief || '', TEAM_HANDOFF_BRIEF_MAX);
  const langLine = lang === 'en' ? 'Respond in English only.'
    : lang === 'es' ? 'Responde solo en español.'
      : lang === 'it' ? 'Rispondi solo in italiano.'
        : 'Antworte ausschliesslich auf Deutsch.';
  return [
    SUPPLEMENT_SYSTEM_PROMPT_BASE,
    langLine,
    buildSharedContextLines(o.userSlice),
    handoffBrief ? ('HANDOFF VOM MENTAL-VERHALTEN-COACH (max 400 Zeichen): ' + handoffBrief) : '',
    'Schreibe KEIN Rezept und KEINE Einkaufsliste. Kein Coaching ersetzen.',
  ].filter(Boolean).join('\n');
}

function buildSupplementMessages(userText, opts) {
  const system = buildSupplementSystemPrompt(opts);
  const history = Array.isArray(opts && opts.history) ? opts.history.slice(-6) : [];
  return [{ role: 'system', content: system }]
    .concat(history)
    .concat([{ role: 'user', content: sanitizeText(userText, 800) }]);
}

function buildSupplementGroqRequest(userText, opts) {
  return {
    model: (opts && opts.model) || undefined,
    temperature: 0.55,
    max_tokens: 1200,
    response_format: { type: 'json_object' },
    messages: buildSupplementMessages(userText, opts),
  };
}

/**
 * Rezept-Handoff-Brief mit Nährstoff-Thema aus dem eingehenden Brief anreichern,
 * damit der Rezept-Coach passende Lebensmittel wählen kann.
 * @returns {string} Legacy-Textbrief (für Nicht-Koch-Pfade / Prefill)
 */
function enrichKochBriefWithTopic(baseBrief, topicContext) {
  const topic = truncateTeamBrief(topicContext || '', 220);
  if (!topic) {
    return truncateTeamBrief(baseBrief || 'Nutzer möchte ein Rezept passend zum Supplement-Thema.', TEAM_HANDOFF_BRIEF_MAX);
  }
  return truncateTeamBrief(
    'Nutzer möchte ein Rezept passend zum Supplement-Thema. Kontext: ' + topic,
    TEAM_HANDOFF_BRIEF_MAX
  );
}

/**
 * Strukturierter Themen-Brief für Supplement → Koch.
 * { theme: "eisen"|"vitamin_b"|…|null, source: "supplement" }
 */
function buildKochThemeBrief(topicContext) {
  const detected = recipeCore.detectNutrientTheme(String(topicContext || ''));
  return {
    theme: detected ? detected.key : null,
    source: 'supplement',
  };
}

function isStructuredThemeBrief(brief) {
  return !!(brief && typeof brief === 'object' && !Array.isArray(brief) &&
    (brief.source === 'supplement' || brief.theme != null));
}

function normalizeSupplementHandoffBrief(brief, to, topicContext) {
  if (to === 'koch') {
    if (isStructuredThemeBrief(brief) && brief.theme) {
      return { theme: String(brief.theme).toLowerCase().trim() || null, source: 'supplement' };
    }
    return buildKochThemeBrief(
      [topicContext, typeof brief === 'string' ? brief : ''].filter(Boolean).join(' ')
    );
  }
  if (isStructuredThemeBrief(brief)) {
    return enrichKochBriefWithTopic('Nutzer braucht Zutaten passend zum Supplement-Thema.', topicContext || brief.theme || '');
  }
  return truncateTeamBrief(brief || '', TEAM_HANDOFF_BRIEF_MAX);
}

/**
 * Intent-Erkennung für Weiterleitungen (Rezept / Einkauf / Emotion).
 * Robust für freie Alltagssprache. Kein Match → null (dann normale Alltag-Orientierung).
 * @param {string} userMessage
 * @param {string} [topicContext] optional: eingehender Supplement-Brief (z. B. „Eisenmangel“)
 * @returns {{ handoff: { to: string, brief: string|{theme:string|null,source:string}, reason: string } } | null}
 */
function detectSupplementRouteIntent(userMessage, topicContext) {
  const msg = String(userMessage == null ? '' : userMessage);
  if (!msg.trim()) return null;
  const topicBlob = [topicContext, msg].filter(Boolean).join(' ');

  // Rezept-Intent: Keywords + natürliche Formulierungen
  if (
    msg.match(/\brezept\b|\bgericht\b|\bmahlzeit\b|\bdish\b|\bmeal\b/i) ||
    msg.match(/\bkochen\b|\bkoch\b|\bzubereiten\b/i) ||
    msg.match(/mach\s+mir\s+(etwas|was|ein\s+gericht)/i) ||
    msg.match(/etwas\s+dazu\s+(essen|kochen)/i) ||
    msg.match(/(was\s+)?passt\s+dazu/i) ||
    msg.match(/ich\s+will\s+etwas\s+dazu/i) ||
    msg.match(/ich\s+brauche\s+ein\s+gericht\s+dazu/i) ||
    msg.match(/leite\s+mich\s+weiter/i) ||
    msg.match(/bring\s+mich\s+zum\s+koch/i) ||
    msg.match(/kannst\s+du\s+mir\s+etwas\s+kochen/i) ||
    msg.match(/ich\s+will\s+ein\s+rezept\s+dazu/i) ||
    msg.match(/ich\s+will\s+ein\s+gericht\s+mit\s+(diesen\s+)?lebensmitteln/i) ||
    msg.match(/weiterleiten/i)
  ) {
    return {
      handoff: {
        to: 'koch',
        brief: buildKochThemeBrief(topicBlob),
        reason: 'rezept_intent',
      },
    };
  }

  if (msg.match(/einkauf|kaufen|zutaten/i)) {
    const topic = truncateTeamBrief(topicBlob, 220);
    return {
      handoff: {
        to: 'einkauf',
        brief: truncateTeamBrief(
          topic
            ? 'Nutzer braucht Zutaten passend zum Supplement-Thema. Kontext: ' + topic
            : 'Nutzer braucht Zutaten passend zum Supplement-Thema.',
          TEAM_HANDOFF_BRIEF_MAX
        ),
        reason: 'einkauf_intent',
      },
    };
  }

  if (msg.match(/schaffe.*nicht|überfordert|ueberfordert|hilfe/i)) {
    return {
      handoff: {
        to: 'coach',
        brief: 'Nutzer zeigt Emotion.',
        reason: 'emotion_intent',
      },
    };
  }

  return null;
}

/**
 * Früher Handoff: bei Rezept-Intent IMMER zuerst Orientierung + auto_handoff.
 * Bei Einkauf/Emotion: Weiterleitungshinweis (kein Koch).
 */
function trySupplementHandoffEarly(userMessage, fromAgent, topicContext) {
  const detected = detectSupplementRouteIntent(userMessage, topicContext);
  if (!detected || !detected.handoff) return null;
  const h = detected.handoff;
  const from = fromAgent || 'supplement';

  if (h.to === 'koch') {
    // Komfort: Orientierung zuerst, Client macht Auto-Handoff ohne Button.
    return buildSupplementComfortResponse(userMessage, topicContext, { forceAutoHandoff: true, from });
  }

  const brief = normalizeSupplementHandoffBrief(h.brief, h.to, topicContext);
  const handoff = {
    from,
    to: h.to,
    brief,
    reason: h.reason,
    suggestedPrefill: truncateTeamBrief(topicContext || userMessage, 200),
  };
  if (h.to === 'einkauf') {
    return {
      type: 'advice',
      summary: 'Klingt nach fehlenden Zutaten oder einer Einkaufsliste.',
      details: 'Dafür ist der Einkaufs-Coach zuständig – ich erstelle selbst keine Einkaufsliste.',
      next_step: '',
      items: [],
      handoff,
      auto_handoff: false,
    };
  }
  return {
    type: 'advice',
    summary: 'Das klingt eher nach einer belastenden Situation als nach einer Nährstofffrage.',
    details: 'Dafür ist der Mental- & Verhaltencoach besser geeignet – ich ersetze kein Coaching.',
    next_step: '',
    items: [],
    handoff,
    auto_handoff: false,
  };
}

/** Erkennt Thema + Lebensmittelgruppen (keine Rezepte/Mengen). */
function buildOrientationContent(userText, handoffBrief) {
  const blob = String(handoffBrief || '') + ' ' + String(userText || '');
  const t = blob.toLowerCase();
  let topic = 'Naehrstoffe';
  let foods = ['Huelsenfruechte', 'Vollkorn', 'gruenes Blattgemuese', 'Nuesse'];
  let tip = 'Im Alltag helfen oft kleine, regelmaessige Bausteine in den Mahlzeiten – ohne Druck und ohne Dosierungen.';
  let isVitamin = false;

  // Spezifische Vitamine zuerst (häufig unzureichend abgedeckt).
  if (/vitamin\s*-?\s*d\b|\bvit\.?\s*d\b/.test(t)) {
    topic = 'Vitamin D';
    foods = ['Fetter Fisch', 'Eier', 'Angereicherte Lebensmittel', 'Tageslicht'];
    tip = 'Im Alltag spielen Tageslicht und abwechslungsreiche Mahlzeiten eine große Rolle.';
    isVitamin = true;
  } else if (/vitamin\s*-?\s*e\b|\bvit\.?\s*e\b|tocopherol/.test(t)) {
    topic = 'Vitamin E';
    foods = ['Nüsse', 'Samen', 'Pflanzenöle', 'Avocado'];
    tip = 'Im Alltag steckt Vitamin E oft in Nüssen, Samen, Pflanzenölen und Avocado.';
    isVitamin = true;
  } else if (/vitamin\s*-?\s*b\s*12\b|\bb12\b|cobalamin/.test(t)) {
    topic = 'Vitamin B12';
    foods = ['Eier', 'Milchprodukte', 'Fisch', 'Angereicherte Pflanzenmilch'];
    tip = 'Im Alltag kommen B12-Quellen oft aus tierischen Lebensmitteln oder angereicherten Alternativen.';
    isVitamin = true;
  } else if (/\bfolat\b|\bfolsäure\b|\bfolsaeure\b|vitamin\s*-?\s*b\s*9\b|\bb9\b/.test(t)) {
    topic = 'Folat (B9)';
    foods = ['Grünes Blattgemüse', 'Hülsenfrüchte', 'Vollkorn', 'Spargel'];
    tip = 'Folat steckt oft in grünem Blattgemüse, Hülsenfrüchten und Vollkorn – alltagsnah und ohne Dosierung hier.';
    isVitamin = true;
  } else if (/vitamin\s*-?\s*k\s*2\b|\bk2\b|menachinon/.test(t)) {
    topic = 'Vitamin K2';
    foods = ['Fermentierte Lebensmittel', 'Käse', 'Eier', 'Fleisch in Maßen'];
    tip = 'Im Alltag taucht K2 vor allem in fermentierten und einigen tierischen Lebensmitteln auf.';
    isVitamin = true;
  } else if (/vitamin\s*-?\s*b\s*6\b|\bb6\b|pyridoxin/.test(t)) {
    topic = 'Vitamin B6';
    foods = ['Kartoffeln', 'Banane', 'Geflügel', 'Vollkorn'];
    tip = 'B6 lässt sich im Alltag oft über Kartoffeln, Obst, Geflügel oder Vollkorn einbauen.';
    isVitamin = true;
  } else if (/vitamin\s*-?\s*b\b|b\-?vitamine?/.test(t)) {
    topic = 'Vitamin B';
    foods = ['Hülsenfrüchte', 'Vollkorn', 'grünes Blattgemüse', 'Nüsse'];
    tip = 'B-Vitamine stecken oft in Hülsenfrüchten, Vollkorn, Blattgemüse und Nüssen – ohne Dosierungen von mir.';
    isVitamin = true;
  } else if (/eisen|iron/.test(t)) {
    topic = 'Eisen';
    foods = ['Linsen', 'Spinat', 'Kichererbsen', 'Haferflocken'];
    tip = 'Im Alltag helfen oft Lebensmittel wie Linsen, Spinat, Kichererbsen oder Haferflocken.';
  } else if (/magnesium/.test(t)) {
    topic = 'Magnesium';
    foods = ['Kürbiskerne', 'Mandeln', 'Vollkorn', 'Spinat'];
    tip = 'Kleine Alltagsbausteine wie Kerne, Nüsse oder Vollkorn lassen sich leicht einbauen.';
  } else if (/muede|müde|fatigue|energie|tired/.test(t)) {
    topic = 'Energie im Alltag';
    foods = ['Haferflocken', 'Hülsenfrüchte', 'Obst', 'Pausen'];
    tip = 'Bei Müdigkeit helfen oft kleine Schritte: regelmässige Mahlzeiten, etwas Bewegung und genug Pausen.';
  } else if (/vitamin|mangel|deficien|supplement|einnehmen|spurenelement/.test(t)) {
    topic = 'Vitamine & Spurenelemente';
    tip = 'Statt Tabletten zuerst alltagsnahe Lebensmittelquellen – ich gebe keine Dosierungen und keine Diagnosen.';
    isVitamin = true;
  }

  const theme = recipeCore.detectNutrientTheme(blob);
  return {
    topic,
    foods,
    tip,
    isVitamin,
    footer: isVitamin ? SUPPLEMENT_STANDARD_FOOTER : '',
    themeKey: theme ? theme.key : null,
    topicBlob: truncateTeamBrief(blob, 220),
  };
}

/**
 * Komfort-Flow: IMMER Orientierung, dann Koch-Handoff.
 * auto_handoff=true bei klarem Rezept-Intent (Client leitet ohne Button weiter).
 * auto_handoff=false → Client zeigt nur „Rezept dazu anzeigen“.
 */
function buildSupplementComfortResponse(userText, handoffBrief, opts) {
  opts = opts || {};
  const from = opts.from || 'supplement';
  const content = buildOrientationContent(userText, handoffBrief);
  const intent = detectSupplementRouteIntent(userText, handoffBrief);
  const forceAuto = !!opts.forceAutoHandoff;
  const wantsRecipe = forceAuto || !!(intent && intent.handoff && intent.handoff.to === 'koch');

  if (intent && intent.handoff && intent.handoff.to === 'einkauf' && !forceAuto) {
    return trySupplementHandoffEarly(userText, from, handoffBrief);
  }
  if (intent && intent.handoff && intent.handoff.to === 'coach' && !forceAuto) {
    return trySupplementHandoffEarly(userText, from, handoffBrief);
  }

  const handoff = {
    from,
    to: 'koch',
    brief: buildKochThemeBrief(content.topicBlob || [handoffBrief, userText].join(' ')),
    reason: 'rezept_intent',
    suggestedPrefill: truncateTeamBrief(content.topicBlob || handoffBrief || userText || '', 200),
  };
  if (handoff.brief && handoff.brief.theme) handoff.theme = handoff.brief.theme;

  return {
    type: 'advice',
    summary: 'Ich sehe im Brief, dass ' + content.topic + ' ein Thema für dich ist.',
    details: content.tip,
    next_step: '',
    items: content.foods,
    footer: content.footer || '',
    partner_hint: SUPPLEMENT_PARTNER_HINT_ENABLED ? SUPPLEMENT_PARTNER_HINT : '',
    handoff,
    auto_handoff: wantsRecipe,
  };
}

/**
 * Lokale Orientierung (kein Groq) – Komfort-Flow.
 * Nie „Bitte hole dir professionelle Hilfe.“
 */
function buildSupplementOrientationFallback(userText, handoffBrief) {
  return buildSupplementComfortResponse(userText, handoffBrief, { from: 'supplement' });
}

function validateSupplementResponse(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.type === 'crisis' || data.type === 'off_topic') {
    return buildSupplementOrientationFallback('', '');
  }
  if (data.type !== 'advice') return null;
  const items = Array.isArray(data.items)
    ? data.items.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 12)
    : [];
  let handoff = null;
  if (data.handoff && typeof data.handoff === 'object') {
    const to = String(data.handoff.to || '').toLowerCase();
    if (to === 'koch' || to === 'einkauf' || to === 'coach') {
      const rawBrief = data.handoff.brief;
      const brief = to === 'koch'
        ? normalizeSupplementHandoffBrief(rawBrief, 'koch', typeof rawBrief === 'string' ? rawBrief : '')
        : truncateTeamBrief(
          (typeof rawBrief === 'string' ? rawBrief : '') || data.handoff.suggestedPrefill || '',
          TEAM_HANDOFF_BRIEF_MAX
        );
      handoff = {
        from: 'supplement',
        to,
        reason: String(data.handoff.reason || (to === 'koch' ? 'rezept_intent' : 'intent_routing')),
        brief,
        suggestedPrefill: truncateTeamBrief(
          data.handoff.suggestedPrefill ||
          (isStructuredThemeBrief(brief) ? brief.theme : brief) ||
          '',
          200
        ),
      };
      if (to === 'koch' && brief && brief.theme) handoff.theme = brief.theme;
    }
  }
  const summary = sanitizeText(data.summary || '', 600);
  const details = sanitizeText(data.details || '', 1200);
  let nextStep = sanitizeText(data.next_step || '', 400);
  if (!summary && !details) return null;
  const banned = /bitte hole dir professionelle hilfe|seek professional help|busca ayuda profesional/i;
  if (banned.test(summary) || banned.test(details) || banned.test(nextStep)) {
    return buildSupplementOrientationFallback(summary + ' ' + details, '');
  }
  // Kein Chat-Bestätigungstext – Button/Auto-Handoff steuern den Flow.
  if (/leite\s+(mich|dich|uns)\s+weiter|weiterleiten|zum\s+Rezept-Coach\s+weiter|ja[,.]?\s*bitte/i.test(nextStep)) {
    nextStep = '';
  }
  const autoHandoff = data.auto_handoff === true || data.autoHandoff === true;
  let footer = sanitizeText(data.footer || '', 500);
  if (!footer && /vitamin|folat|b12|b6|k2/i.test(summary + ' ' + details)) {
    footer = SUPPLEMENT_STANDARD_FOOTER;
  }
  const partnerHint = SUPPLEMENT_PARTNER_HINT_ENABLED
    ? sanitizeText(data.partner_hint || SUPPLEMENT_PARTNER_HINT, 400)
    : '';
  return {
    type: 'advice',
    summary: summary || 'Kurze Orientierung zu deinem Nährstoff-Thema.',
    details,
    next_step: nextStep,
    items,
    footer,
    partner_hint: partnerHint,
    handoff,
    auto_handoff: autoHandoff,
  };
}

module.exports = {
  TEAM_HANDOFF_BRIEF_MAX,
  SUPPLEMENT_STANDARD_FOOTER,
  supplementStandardFooter,
  SUPPLEMENT_PARTNER_HINT_ENABLED,
  SUPPLEMENT_PARTNER_HINT,
  SUPPLEMENT_SYSTEM_PROMPT_BASE,
  truncateTeamBrief,
  buildSupplementSystemPrompt,
  buildSupplementMessages,
  buildSupplementGroqRequest,
  enrichKochBriefWithTopic,
  buildKochThemeBrief,
  isStructuredThemeBrief,
  normalizeSupplementHandoffBrief,
  detectSupplementRouteIntent,
  trySupplementHandoffEarly,
  buildOrientationContent,
  buildSupplementComfortResponse,
  buildSupplementOrientationFallback,
  validateSupplementResponse,
};
