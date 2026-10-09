'use strict';
/**
 * dish-resolver.js
 * =================
 * Bestimmt den Archetyp fuer eine Nutzer-Anfrage.
 *
 * V1-Ansatz: Regex-Heuristik plus Alias-Tabelle. Kein LLM-Aufruf.
 * Ziel: bekannte Gerichte sicher erkennen, unbekannte als "free" markieren.
 *
 * Rueckgabe:
 *   { archetypeId, dishId, confidence, mode }
 *   mode: 'classic' | 'free'
 *   confidence: 0..1
 */
const ALIASES = [
  // A1 Pasta — Substring-Match (Vollkornnudeln, Pastasauce, ...)
  { pattern: /(spaghetti|penne|rigatoni|fusilli|tagliatelle|linguine|farfalle|orecchiette|bucatini|conchiglie|gemelli|trofie|fettuccine|pappardelle|ziti|cavatappi|pasta|nudeln)/i,
    archetypeId: 'A1_pasta', dishId: 'pasta.generic', confidence: 0.85 },
  // A3 Pfanne — "hash" mit rechter Grenze (sonst "Hashtag")
  { pattern: /(bratkartoffeln|wok|shakshuka|fried rice|pfannengericht|ruehrei|omelett|hash(?![a-zäöüß]))/i,
    archetypeId: 'A3_pan_dish', dishId: 'pfanne.generic', confidence: 0.8 },
  // A4 Eintopf / Curry — Substring (Rindergulasch, Kuerbissuppe, ...)
  { pattern: /(eintopf|gulasch|chili|curry|stew|ragout|suppe|bouillon|chana masala)/i,
    archetypeId: 'A4_stew_curry', dishId: 'eintopf.generic', confidence: 0.85 },
  // A7 Bowl / Salat — "bowl" mit rechter Grenze (sonst "Bowle")
  { pattern: /(bowl(?![a-zäöüß])|salat|poke|buddha bowl|griechischer salat|choriatiki|caesar salad)/i,
    archetypeId: 'A7_bowl_salad', dishId: 'bowl.generic', confidence: 0.85 },
  // A10 Protein + Beilage
  { pattern: /(rumpsteak|steak|kotelett|filet|schnitzel|haehnchenbrust|lachsfilet|entenbrust)/i,
    archetypeId: 'A10_protein_with_side', dishId: 'protein.generic', confidence: 0.8 },
];

const FREE_MARKERS = /\b(kreativ|mach mir|was mit|proteinreich|inspiriert|frei)\b/i;

function resolve(query) {
  const q = String(query || '').trim();
  if (!q) return { archetypeId: null, dishId: null, confidence: 0, mode: 'free' };

  if (FREE_MARKERS.test(q)) {
    return { archetypeId: null, dishId: null, confidence: 0, mode: 'free' };
  }

  let best = null;
  for (const a of ALIASES) {
    if (a.pattern.test(q)) {
      if (!best || a.confidence > best.confidence) {
        best = { archetypeId: a.archetypeId, dishId: a.dishId,
                 confidence: a.confidence, mode: 'classic' };
      }
    }
  }
  if (best) return best;
  return { archetypeId: null, dishId: null, confidence: 0, mode: 'free' };
}

module.exports = { resolve };
