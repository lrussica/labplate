/**
 * LabPlate – Phase 3 KI-Team Router (Coach → Koch / Supplement / Einkauf)
 * ======================================================================
 * Intent-Erkennung, Handoff-Normalisierung, Kollegen-Systemprompts.
 * Client spiegelt detectCoachRouteIntent / normalizeTeamHandoff.
 */
'use strict';

const coachCore = require('./nutri-coach-core');
const supplementCore = require('./nutri-supplement-core');

const TEAM_HANDOFF_BRIEF_MAX = 400;
const TEAM_HANDOFF_TARGETS = ['koch', 'coach', 'supplement', 'einkauf'];
const TEAM_COLLEAGUE_AGENTS = ['supplement', 'einkauf'];
const REZEPT_INTENT_BRIEF = coachCore.REZEPT_INTENT_BRIEF;
const REZEPT_INTENT_REASON = coachCore.REZEPT_INTENT_REASON;

function truncateTeamBrief(text, maxLen) {
  let s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  const cap = (typeof maxLen === 'number' && maxLen > 0) ? maxLen : TEAM_HANDOFF_BRIEF_MAX;
  if (s.length <= cap) return s;
  return s.slice(0, cap).trim();
}

/** Strukturierter Supplement→Koch-Brief { theme, source } oder String (Legacy). */
function normalizeHandoffBrief(rawBrief, suggestedPrefill) {
  if (rawBrief && typeof rawBrief === 'object' && !Array.isArray(rawBrief)) {
    const themeRaw = rawBrief.theme != null ? String(rawBrief.theme).toLowerCase().trim() : '';
    const sourceRaw = rawBrief.source != null ? String(rawBrief.source).toLowerCase().trim() : '';
    if (sourceRaw === 'supplement' || themeRaw) {
      return {
        theme: themeRaw || null,
        source: sourceRaw || 'supplement',
      };
    }
  }
  return truncateTeamBrief(
    (typeof rawBrief === 'string' ? rawBrief : '') ||
    (typeof suggestedPrefill === 'string' ? suggestedPrefill : '') ||
    '',
    TEAM_HANDOFF_BRIEF_MAX
  );
}

function handoffBriefToText(brief, fallback) {
  if (brief && typeof brief === 'object' && !Array.isArray(brief)) {
    if (brief.theme) return truncateTeamBrief(String(brief.theme), 200);
    return truncateTeamBrief(fallback || '', 200);
  }
  return truncateTeamBrief(brief || fallback || '', 200);
}

function normalizeTeamHandoff(raw, fromDefault, toDefault) {
  if (!raw || typeof raw !== 'object') return null;
  let to = String(raw.to || '').toLowerCase();
  if (!to && toDefault) to = String(toDefault).toLowerCase();
  if (!to) return null;
  let from = String(raw.from || fromDefault || '').toLowerCase();
  if (TEAM_HANDOFF_TARGETS.indexOf(to) === -1) return null;
  if (TEAM_HANDOFF_TARGETS.indexOf(from) === -1) from = fromDefault || 'coach';
  const brief = normalizeHandoffBrief(raw.brief, raw.suggestedPrefill);
  const out = {
    from,
    to,
    reason: truncateTeamBrief(raw.reason || 'intent_routing', 80),
    brief,
    suggestedPrefill: truncateTeamBrief(
      (typeof raw.suggestedPrefill === 'string' && raw.suggestedPrefill) ||
      handoffBriefToText(brief, typeof raw.brief === 'string' ? raw.brief : ''),
      200
    ),
    ts: raw.ts || new Date().toISOString(),
  };
  // brief.theme an den Rezept-Coach weiterreichen
  if (brief && typeof brief === 'object' && brief.theme) {
    out.theme = brief.theme;
  } else if (typeof raw.theme === 'string' && raw.theme.trim()) {
    out.theme = raw.theme.toLowerCase().trim();
  }
  return out;
}

/** Emotion / Resignation – Coach bleibt selbst zuständig (kein Outbound-Handoff). */
function detectEmotionalIntent(text) {
  if (!text) return false;
  const t = String(text);
  return /schaff(e)?\s+ich\s+((eh|sowieso)\s+)?nicht|bringt\s+(mir\s+)?nichts|lohnt\s+sich\s+nicht|zu\s+kompliziert|keine\s+zeit|zu\s+viel\s+aufwand|schon\s+wieder\s+kein\s+rezept|\bnervt\b|immer\s+das\s+gleiche|f[üu]hl(e)?\s+mich\s+schlecht|bin\s+enttäuscht|bin\s+enttaeuscht|(hab(e)?\s+)?keine\s+energie|i\s+can'?t\s+(do\s+)?(this|it)|what'?s\s+the\s+point|too\s+complicated|no\s+energy|i'?m\s+disappointed/i.test(t);
}

function detectRecipeIntent(text) {
  return coachCore.detectRecipeIntent(text);
}

function detectSupplementIntent(text) {
  if (!text) return false;
  const t = String(text);
  return /mangel|supplement|nahrungserg[äa]nzung|einnehmen|dosier|vitamin\s*[a-z0-9]|vitamin\s*d|vitamin\s*b|eisen\s*(mangel|tablet|präpar|prepar)?|magnesium\s*(mangel|tablet)?|omega[-\s]?3|folsäure|folsaeure|zink\s*(mangel)?|selen|jod\b|was\s+soll\s+ich\s+einnehmen|brauche\s+ich\s+(ein\s+)?(vitamin|mineral|supplement)|deficiency|supplement\b|should\s+i\s+take|vitamin\s+d\b/i.test(t);
}

function detectShoppingIntent(text) {
  if (!text) return false;
  const t = String(text);
  return /einkauf|einkaufen|einkaufsliste|was\s+muss\s+ich\s+kaufen|was\s+soll\s+ich\s+kaufen|fehlt\s+(mir\s+)?etwas|was\s+fehlt|shopping\s*list|what\s+(do\s+i\s+)?need\s+to\s+buy|grocery|einkaufs/i.test(t);
}

/**
 * Coach-Router Intent. Priorität: Emotion → Rezept → Supplement → Einkauf → null (Coach normal).
 * @returns {{ to: string, reason: string, kind: string } | null}
 */
function detectCoachRouteIntent(text) {
  if (!text) return null;
  if (detectEmotionalIntent(text)) {
    return { to: 'coach', reason: 'intent_routing', kind: 'emotion' };
  }
  if (detectRecipeIntent(text)) {
    return { to: 'koch', reason: REZEPT_INTENT_REASON, kind: 'recipe' };
  }
  if (detectSupplementIntent(text)) {
    return { to: 'supplement', reason: 'intent_routing', kind: 'supplement' };
  }
  if (detectShoppingIntent(text)) {
    return { to: 'einkauf', reason: 'intent_routing', kind: 'shopping' };
  }
  return null;
}

function buildCoachHandoffFromIntent(userText, route) {
  if (!route || !route.to || route.to === 'coach') return null;
  // Rezept: festes Handoff-JSON (Coach gibt NIE Rezepttext aus).
  if (route.to === 'koch') {
    const early = coachCore.buildRezeptIntentHandoff(userText);
    return normalizeTeamHandoff(early.handoff, 'coach', 'koch');
  }
  const labels = {
    supplement: 'Supplement-/Mangel-Intent',
    einkauf: 'Einkaufs-Intent',
  };
  const label = labels[route.to] || 'Intent';
  return normalizeTeamHandoff({
    from: 'coach',
    to: route.to,
    reason: route.reason || 'intent_routing',
    brief: truncateTeamBrief(label + ': ' + String(userText || ''), TEAM_HANDOFF_BRIEF_MAX),
    suggestedPrefill: truncateTeamBrief(userText, 200),
  }, 'coach', route.to);
}

function sanitizeColleagueText(raw, max) {
  if (typeof raw !== 'string') return '';
  let t = raw.replace(/<[^>]*>/g, ' ');
  t = t.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ' ');
  t = t.replace(/[ \t]+/g, ' ').trim();
  return t.slice(0, max || 4000);
}

function buildOnboardingContextLine(onboarding) {
  const ob = onboarding && typeof onboarding === 'object' ? onboarding : null;
  if (!ob || !ob.completedAt) return '';
  const bits = [];
  if (ob.dietStyle) {
    bits.push(
      'Ernaehrungsstil ' + ob.dietStyle +
      (ob.dietStyleOther ? ' (' + String(ob.dietStyleOther).slice(0, 40) + ')' : '')
    );
  }
  if (ob.mainGoal) bits.push('Hauptziel ' + ob.mainGoal);
  if (ob.energyProfile) bits.push('Energie ' + ob.energyProfile);
  if (ob.stressLevel) bits.push('Stress ' + ob.stressLevel);
  if (ob.cookingFrequency) bits.push('Kochen ' + ob.cookingFrequency);
  if (ob.mealTime) bits.push('Zeit ' + ob.mealTime);
  if (ob.tastePreference) {
    bits.push('Geschmack ' + (Array.isArray(ob.tastePreference) ? ob.tastePreference.join('/') : ob.tastePreference));
  }
  if (ob.supplements) {
    const list = ob.supplementsList || ob.supplementsDetail || '';
    bits.push(
      'Supplements ' + ob.supplements +
      (list ? ' (' + String(list).slice(0, 60) + ')' : '')
    );
  }
  if (Array.isArray(ob.noGos) && ob.noGos.length) {
    bits.push(
      'No-Gos ' + ob.noGos.join('/') +
      (ob.noGosOther ? '/' + String(ob.noGosOther).slice(0, 40) : '')
    );
  }
  if (Array.isArray(ob.allergies) && ob.allergies.length && ob.allergies.indexOf('none') === -1) {
    bits.push('Onboarding-Allergien ' + ob.allergies.join('/'));
  }
  return bits.length ? '- Onboarding: ' + bits.join('; ') + '.' : '';
}

function buildSharedContextLines(userSlice) {
  const user = userSlice && typeof userSlice === 'object' ? userSlice : {};
  const profile = user.profile || {};
  const today = user.today || {};
  const macros = today.macrosPct || {};
  const gaps = Array.isArray(today.topMicroGaps) ? today.topMicroGaps.slice(0, 6) : [];
  const allergens = Array.isArray(user.allergens) ? user.allergens.slice(0, 8) : [];
  const gapText = gaps.map((g) => (g && g.label ? (g.label + (g.pct != null ? ' (~' + g.pct + '%)' : '')) : '')).filter(Boolean).join(', ');
  const onboardingLine = buildOnboardingContextLine(user.onboarding);
  return [
    'TEAM-KONTEXT (datensparsam, keine Diagnosen, keine Lab-Rohwerte, keine Dosierungen):',
    '- Profil: Altersband ' + (profile.ageBand || 'n/a') + ', Gender-Code ' + (profile.gender || 'n/a') + ', Aktivitaet ' + (profile.activityLevel || 'n/a') + '.',
    '- Makro-Fortschritt heute (%): KH ' + (macros.kh != null ? macros.kh + '%' : 'n/a') +
      ', Protein ' + (macros.protein != null ? macros.protein + '%' : 'n/a') +
      ', Fett ' + (macros.fett != null ? macros.fett + '%' : 'n/a') +
      ', Ballast ' + (macros.fiber != null ? macros.fiber + '%' : 'n/a') + '.',
    gapText ? '- Mikro-Luecken (Labels): ' + gapText + '.' : '- Keine kritischen Mikro-Luecken unter 70%.',
    allergens.length ? '- Allergene: ' + allergens.join(', ') + '.' : '- Keine gespeicherten Allergene.',
    onboardingLine,
  ].filter(Boolean).join('\n');
}

function buildColleagueSystemPrompt(agent, opts) {
  const o = opts || {};
  const lang = o.lang || 'de';
  const handoffBrief = truncateTeamBrief(o.handoffBrief || '', TEAM_HANDOFF_BRIEF_MAX);
  const shared = buildSharedContextLines(o.userSlice);
  const langLine = lang === 'en' ? 'Respond in English only.'
    : lang === 'es' ? 'Responde solo en español.'
      : lang === 'it' ? 'Rispondi solo in italiano.'
        : 'Antworte ausschliesslich auf Deutsch.';

  const common = [
    'Du bist Teil des LabPlate KI-Teams. Der Mental-Coach hat den Nutzer an dich uebergeben.',
    'Antworte AUSSCHLIESSLICH als valides JSON-Objekt (kein Markdown, kein Begleittext).',
    'JSON-Felder: {"type":"advice"|"off_topic"|"crisis","summary":"...","details":"...","next_step":"...","items":[],"handoff":null|{"to":"koch"|"einkauf"|"coach","reason":"...","brief":"..."}}.',
    'items: optionale kurze Stichpunkte (Strings). Bei type crisis/off_topic: leere Strings, items=[], handoff null (ausser Emotion → coach).',
    'Keine Diagnosen, keine Heilversprechen, keine Medikamenten-Therapie.',
    langLine,
    shared,
    handoffBrief ? ('HANDOFF VOM MENTAL-COACH (max 400 Zeichen) – nutze ihn als Kontext: ' + handoffBrief) : '',
  ].filter(Boolean).join('\n');

  if (agent === 'supplement') {
    // Prompt aus nutri-supplement-core.js (Orientierung, kein Medizin-Fallback).
    return supplementCore.buildSupplementSystemPrompt({
      lang,
      handoffBrief,
      userSlice: o.userSlice,
    });
  }

  if (agent === 'einkauf') {
    return [
      common,
      'ROLLE: Einkaufs-Coach. Hilf bei Einkaufsliste / was fehlt / was kaufen – alltagstauglich.',
      'Orientierung an Tageszielen/Mikro-Luecken/Allergenen. KEINE Rezept-Zubereitungsschritte.',
      'KEINE Supplement-Dosierungen. items = konkrete Einkaufspunkte (Lebensmittel, Mengen nur grob wenn sinnvoll).',
      'summary: kurze Antwort; details: Begründung; next_step: ein praktischer Schritt.',
      'Handoff nur bei Emotion → coach, oder klarer Rezeptwunsch → koch; sonst handoff:null.',
    ].join('\n');
  }

  return common;
}

function buildColleagueMessages(agent, userText, opts) {
  const system = buildColleagueSystemPrompt(agent, opts);
  const history = Array.isArray(opts && opts.history) ? opts.history.slice(-6) : [];
  return [{ role: 'system', content: system }]
    .concat(history)
    .concat([{ role: 'user', content: sanitizeColleagueText(userText, 800) }]);
}

function buildColleagueGroqRequest(agent, userText, opts) {
  if (agent === 'supplement') {
    return supplementCore.buildSupplementGroqRequest(userText, opts);
  }
  return {
    model: (opts && opts.model) || undefined,
    temperature: 0.5,
    max_tokens: 1200,
    response_format: { type: 'json_object' },
    messages: buildColleagueMessages(agent, userText, opts),
  };
}

/**
 * Supplement-Coach ausführen (Prompt aus nutri-supplement-core).
 * callGroqFn: async (body, opts) => { data|error }
 */
async function runSupplementCoach(brief, payload, callGroqFn, groqOpts) {
  const text = (payload && payload.text) || '';
  const handoffBrief = truncateTeamBrief(brief || (payload && payload.handoffBrief) || '', TEAM_HANDOFF_BRIEF_MAX);

  // Intent-Erkennung (Rezept / Einkauf / Emotion) vor dem LLM.
  // handoffBrief mitgeben, damit Rezept-Handoffs das Nährstoff-Thema tragen.
  const early = supplementCore.trySupplementHandoffEarly(text, 'supplement', handoffBrief);
  if (early && early.handoff) {
    early.handoff = normalizeTeamHandoff(early.handoff, 'supplement', early.handoff.to) || early.handoff;
    return early;
  }

  const requestBody = supplementCore.buildSupplementGroqRequest(text, {
    model: groqOpts && groqOpts.model,
    lang: (payload && payload.lang) || 'de',
    handoffBrief,
    userSlice: (payload && payload.userSlice) || {},
    history: (payload && payload.history) || [],
  });

  if (typeof callGroqFn !== 'function') {
    return supplementCore.buildSupplementOrientationFallback(text, handoffBrief);
  }

  const result = await callGroqFn(requestBody, groqOpts || {});
  if (!result || result.error || !result.data) {
    return supplementCore.buildSupplementOrientationFallback(text, handoffBrief);
  }
  const validated = supplementCore.validateSupplementResponse(result.data);
  if (!validated) {
    return supplementCore.buildSupplementOrientationFallback(text, handoffBrief);
  }
  // Nach dem LLM: Komfort-Flow – Orientierung behalten, Koch-Handoff + auto_handoff setzen.
  const forced = supplementCore.detectSupplementRouteIntent(text, handoffBrief);
  if (forced && forced.handoff && forced.handoff.to === 'koch') {
    const comfort = supplementCore.buildSupplementComfortResponse(text, handoffBrief, {
      forceAutoHandoff: true,
      from: 'supplement',
    });
    // Orientierung aus dem Modell behalten, wenn brauchbar; Handoff/Auto vom Komfort-Flow.
    validated.handoff = normalizeTeamHandoff(comfort.handoff, 'supplement', 'koch') || comfort.handoff;
    validated.auto_handoff = true;
    if (!validated.items || !validated.items.length) validated.items = comfort.items;
    validated.next_step = '';
  } else if (forced && forced.handoff && !validated.handoff) {
    validated.handoff = normalizeTeamHandoff(
      Object.assign({ from: 'supplement' }, forced.handoff),
      'supplement',
      forced.handoff.to
    );
  } else if (validated.handoff) {
    validated.handoff = normalizeTeamHandoff(validated.handoff, 'supplement', validated.handoff.to) || validated.handoff;
    if (validated.handoff.to === 'koch') {
      const themed = supplementCore.buildKochThemeBrief(handoffBrief);
      if (!validated.handoff.brief || typeof validated.handoff.brief !== 'object' || !validated.handoff.brief.theme) {
        validated.handoff.brief = themed.theme
          ? themed
          : (validated.handoff.brief && typeof validated.handoff.brief === 'object'
            ? validated.handoff.brief
            : themed);
      } else {
        validated.handoff.brief.source = 'supplement';
      }
      if (validated.handoff.brief && validated.handoff.brief.theme) {
        validated.handoff.theme = validated.handoff.brief.theme;
      }
      if (!validated.handoff.suggestedPrefill) {
        validated.handoff.suggestedPrefill = truncateTeamBrief(handoffBrief || validated.handoff.theme || '', 200);
      }
      // Ohne expliziten Rezept-Intent: Button statt Auto-Handoff.
      if (validated.auto_handoff !== true) validated.auto_handoff = false;
      validated.next_step = '';
    }
  } else {
    // Mangel-Orientierung ohne Handoff → trotzdem Rezept-Button anbieten.
    const comfort = supplementCore.buildSupplementComfortResponse(text, handoffBrief, { from: 'supplement' });
    validated.handoff = normalizeTeamHandoff(comfort.handoff, 'supplement', 'koch') || comfort.handoff;
    validated.auto_handoff = false;
    if (!validated.items || !validated.items.length) validated.items = comfort.items;
    validated.next_step = '';
  }
  return validated;
}

function validateColleagueResponse(data, fromAgent) {
  if (fromAgent === 'supplement') {
    const v = supplementCore.validateSupplementResponse(data);
    if (!v) return null;
    if (v.handoff) {
      v.handoff = normalizeTeamHandoff(v.handoff, 'supplement', v.handoff.to) || v.handoff;
    }
    return v;
  }
  if (!data || typeof data !== 'object') return null;
  if (['advice', 'off_topic', 'crisis'].indexOf(data.type) === -1) return null;
  const from = fromAgent === 'einkauf' ? 'einkauf' : 'supplement';
  if (data.type !== 'advice') {
    return { type: data.type, summary: '', details: '', next_step: '', items: [], handoff: null };
  }
  const items = Array.isArray(data.items)
    ? data.items.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 12)
    : [];
  let handoff = null;
  if (data.handoff && typeof data.handoff === 'object') {
    const to = String(data.handoff.to || '').toLowerCase();
    if (to === 'koch' || to === 'einkauf' || to === 'coach') {
      handoff = normalizeTeamHandoff({
        from,
        to,
        reason: data.handoff.reason || (to === 'koch' ? 'rezept_intent' : 'intent_routing'),
        brief: data.handoff.brief || data.handoff.suggestedPrefill || '',
        suggestedPrefill: data.handoff.suggestedPrefill || data.handoff.brief || '',
      }, from, to);
    }
  }
  return {
    type: 'advice',
    summary: sanitizeColleagueText(data.summary || '', 600),
    details: sanitizeColleagueText(data.details || '', 1200),
    next_step: sanitizeColleagueText(data.next_step || '', 400),
    items,
    handoff,
  };
}

/**
 * Garantie-Handoffs vom Supplement-Coach (ohne LLM): Rezept / Einkauf / Emotion.
 * Nutzt nutri-supplement-core Intent-Erkennung. Normale Mangel-Fragen → null.
 */
function trySupplementOutboundHandoff(userText, fromAgent, topicContext) {
  const detected = supplementCore.detectSupplementRouteIntent(userText, topicContext);
  if (!detected || !detected.handoff) return null;
  const from = fromAgent || 'supplement';
  const h = detected.handoff;
  return normalizeTeamHandoff({
    from,
    to: h.to,
    reason: h.reason,
    brief: h.brief,
    suggestedPrefill: truncateTeamBrief(topicContext || userText, 200),
  }, from, h.to);
}

function validateIncomingColleague(body) {
  if (!body || typeof body !== 'object') return null;
  const agent = String(body.agent || '').toLowerCase();
  if (TEAM_COLLEAGUE_AGENTS.indexOf(agent) === -1) return null;
  const text = sanitizeColleagueText(body.text || body.message || '', 800);
  if (!text) return null;
  return {
    agent,
    text,
    lang: typeof body.lang === 'string' && /^[a-z]{2}$/.test(body.lang) ? body.lang : 'de',
    handoffBrief: truncateTeamBrief(body.handoff_brief || body.handoffBrief || '', TEAM_HANDOFF_BRIEF_MAX),
    userSlice: body.user_slice && typeof body.user_slice === 'object' ? body.user_slice : (body.userSlice || {}),
    history: Array.isArray(body.history) ? body.history.slice(0, 6).map((m) => ({
      role: m && (m.role === 'assistant' || m.role === 'user') ? m.role : 'user',
      content: sanitizeColleagueText(m && m.content, 600),
    })).filter((m) => m.content) : [],
  };
}

module.exports = {
  TEAM_HANDOFF_BRIEF_MAX,
  TEAM_HANDOFF_TARGETS,
  TEAM_COLLEAGUE_AGENTS,
  REZEPT_INTENT_BRIEF,
  REZEPT_INTENT_REASON,
  truncateTeamBrief,
  normalizeHandoffBrief,
  handoffBriefToText,
  normalizeTeamHandoff,
  detectEmotionalIntent,
  detectRecipeIntent,
  detectSupplementIntent,
  detectShoppingIntent,
  detectCoachRouteIntent,
  buildCoachHandoffFromIntent,
  buildSharedContextLines,
  buildOnboardingContextLine,
  buildColleagueSystemPrompt,
  buildColleagueMessages,
  buildColleagueGroqRequest,
  runSupplementCoach,
  validateColleagueResponse,
  trySupplementOutboundHandoff,
  validateIncomingColleague,
  sanitizeColleagueText,
  supplementCore,
};
