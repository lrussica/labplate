// seasoning-to-taste.js
// Fix 2026-10-08: Gewuerze mit amount=0/unit=prise|messerspitze muessen
// im Step-Text mit "nach Geschmack" (oder "nach Belieben") referenziert sein.
// Sonst suggeriert der Step eine konkrete Menge, die es nicht gibt.
// Grundsatz: MARKIEREN, nicht blockieren. Idempotent.
'use strict';

// Gewuerz-Namen, die als "nach Geschmack" markiert werden sollen.
// Bewusst breit: Salz, Pfeffer und andere klassische Streugewuerze.
const SEASONING_NAME_RE = /\b(salz|pfeffer|zimt|muskat|kurkuma|paprika|chili|cayenn|kreuzkuemmel|kuemmel|koriander|ingwer|oregano|thymian|rosmarin|majoran|lorbeer)\b/i;
// Verben, die typischerweise Gewuerze verwenden.
const SEASONING_VERB_RE = /\b(abscheck\w*|abschmeck\w*|abschm(?:[eä]|ae)ck\w*|w(?:[üu]|ue)rz\w*)\b/i;
// Bereits vorhandene "nach Geschmack"-Formulierungen (Idempotenz).
const TO_TASTE_RE = /\bnach\s+(geschmack|belieben|gusto)\b/i;
// unit-Marker fuer 0-Mengen-Gewuerze.
const PRISE_UNIT_RE = /^(prise|prisen|messerspitze|messerspitzen|msp)$/i;

function isZeroAmountSeasoning(ing) {
  if (!ing) return false;
  const n = String(ing.name || ing.displayName || '');
  if (!SEASONING_NAME_RE.test(n)) return false;
  const amt = Number(ing.amount);
  if (amt !== 0) return false;
  const unit = String(ing.unit || '').trim();
  if (!PRISE_UNIT_RE.test(unit)) return false;
  return true;
}

function hasZeroAmountSeasoning(ingredients) {
  if (!Array.isArray(ingredients)) return false;
  return ingredients.some(isZeroAmountSeasoning);
}

function ensureToTaste(content, ingredients) {
  const text = String(content || '');
  if (!text) return text;
  if (TO_TASTE_RE.test(text)) return text;
  if (!SEASONING_NAME_RE.test(text)) return text;
  if (!SEASONING_VERB_RE.test(text)) return text;
  if (!hasZeroAmountSeasoning(ingredients)) return text;
  // Insert "nach Geschmack" vor dem Gewuerz-Verb, wenn Salz/Pfeffer kurz davor steht.
  return text.replace(
    /(\b(?:salz|pfeffer)[^\n.!?]{0,40}?)\b(abscheck\w*|abschmeck\w*|abschm(?:[eä]|ae)ck\w*|w(?:[üu]|ue)rz\w*)\b/i,
    '$1nach Geschmack $2'
  );
}

module.exports = {
  ensureToTaste: ensureToTaste,
  hasZeroAmountSeasoning: hasZeroAmountSeasoning,
  isZeroAmountSeasoning: isZeroAmountSeasoning,
};
