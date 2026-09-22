/**
 * LabPlate – Mental-Coach Kernlogik (Phase 3 Korrektur)
 * =====================================================
 * Coach darf NIE Rezepte ausgeben. Bei Rezept-Intent → nur Handoff-JSON an den Koch.
 * Client spiegelt tryRezeptHandoffEarly / buildRezeptIntentHandoff.
 */
'use strict';

const TEAM_HANDOFF_BRIEF_MAX = 400;
const REZEPT_INTENT_BRIEF = 'Nutzer will ein Rezept. Bitte personalisiert antworten.';
const REZEPT_INTENT_REASON = 'rezept_intent';

function truncateTeamBrief(text, maxLen) {
  let s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  const cap = (typeof maxLen === 'number' && maxLen > 0) ? maxLen : TEAM_HANDOFF_BRIEF_MAX;
  if (s.length <= cap) return s;
  return s.slice(0, cap).trim();
}

/**
 * Rezept-Intent (Coach → Koch). Beispiele:
 * „Gib mir ein Rezept“, „Was soll ich kochen“, „Low-Carb Mahlzeit“,
 * „Mach mir ein Rezept“, „Ich will kochen“.
 */
function detectRecipeIntent(text) {
  if (!text) return false;
  const t = String(text);
  return /gib\s+mir\s+(ein\s+)?rezept|mach\s+mir\s+(ein\s+)?rezept|ich\s+will\s+kochen|was\s+(soll|kann)\s+ich\s+(heute\s+)?kochen|was\s+(soll|kann)\s+ich\s+(heute\s+)?essen|low[-\s]?carb\s*(mahlzeit|gericht|rezept)?|\brezept\b|rezeptidee|kochen|koch[e]?\s+mir|\bmahlzeit\b|abendessen|mittagessen|fruehstueck|frühstück|meal\s*idea|\brecipe\b|\bcook\b|something\s+to\s+(eat|cook)/i.test(t);
}

/** Emotion/Resignation – Coach bleibt, kein Rezept-Handoff. */
function detectEmotionalIntent(text) {
  if (!text) return false;
  const t = String(text);
  return /schaff(e)?\s+ich\s+((eh|sowieso)\s+)?nicht|bringt\s+(mir\s+)?nichts|lohnt\s+sich\s+nicht|zu\s+kompliziert|keine\s+zeit|zu\s+viel\s+aufwand|schon\s+wieder\s+kein\s+rezept|\bnervt\b|immer\s+das\s+gleiche|f[üu]hl(e)?\s+mich\s+schlecht|bin\s+enttäuscht|bin\s+enttaeuscht|(hab(e)?\s+)?keine\s+energie|i\s+can'?t\s+(do\s+)?(this|it)|what'?s\s+the\s+point|too\s+complicated|no\s+energy|i'?m\s+disappointed/i.test(t);
}

/**
 * Nur Handoff-JSON (kein Coach-Text, keine Emojis, keine Erklärungen).
 * @returns {{ handoff: { to: 'koch', brief: string, reason: 'rezept_intent', suggestedPrefill?: string, from?: string } }}
 */
function buildRezeptIntentHandoff(userText) {
  const prefill = truncateTeamBrief(userText || '', 200);
  return {
    handoff: {
      from: 'coach',
      to: 'koch',
      brief: REZEPT_INTENT_BRIEF,
      reason: REZEPT_INTENT_REASON,
      suggestedPrefill: prefill || REZEPT_INTENT_BRIEF,
    },
  };
}

/**
 * Früher Rezept-Handoff (kein Groq/Coach-LLM).
 * team_ai aus / Flag aus → null (normales Coaching).
 * Emotion hat Vorrang → null (Coach bleibt).
 */
function tryRezeptHandoffEarly(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  if (o.team_ai === false || o.teamAi === false) return null;
  const text = String(o.text || o.userText || o.prompt || '').trim();
  if (!text) return null;
  if (detectEmotionalIntent(text)) return null;
  if (!detectRecipeIntent(text)) return null;
  return buildRezeptIntentHandoff(text);
}

/**
 * Normalisiert Coach→Koch Handoff (Client/Server).
 */
function normalizeRezeptHandoff(raw, userText) {
  if (!raw || typeof raw !== 'object') return null;
  const inner = raw.handoff && typeof raw.handoff === 'object' ? raw.handoff : raw;
  const to = String(inner.to || '').toLowerCase();
  if (to !== 'koch') return null;
  return {
    from: 'coach',
    to: 'koch',
    reason: REZEPT_INTENT_REASON,
    brief: truncateTeamBrief(inner.brief || REZEPT_INTENT_BRIEF, TEAM_HANDOFF_BRIEF_MAX) || REZEPT_INTENT_BRIEF,
    suggestedPrefill: truncateTeamBrief(inner.suggestedPrefill || userText || '', 200),
    ts: inner.ts || new Date().toISOString(),
  };
}

module.exports = {
  TEAM_HANDOFF_BRIEF_MAX,
  REZEPT_INTENT_BRIEF,
  REZEPT_INTENT_REASON,
  truncateTeamBrief,
  detectRecipeIntent,
  detectEmotionalIntent,
  buildRezeptIntentHandoff,
  tryRezeptHandoffEarly,
  normalizeRezeptHandoff,
};
