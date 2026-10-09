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
  { pattern: /(spaghetti|penne|rigatoni|fusilli|tagliatelle|linguine|farfalle|orecchiette|bucatini|conchiglie|gemelli|trofie|fettuccine|pappardelle|ziti|cavatappi|pasta|nudeln|cacio\s*e\s*pepe|aglio\s*e\s*olio|pesto|puttanesca|alla\s+norma|alla\s+vodka|rag[uù](?=\s|$))/i,
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

// Composite-Saucen — parallele Achse zum Archetyp.
// Ein Rezept kann gleichzeitig A1_pasta UND ein Composite sein
// (z.B. "Spaghetti all'Amatriciana" -> A1_pasta + amatriciana).
const COMPOSITE_ALIASES = [
  { pattern: /(amar?atriciana|matriciana)/i, compositeId: 'amatriciana', confidence: 0.9 },
  { pattern: /(arrabbiata|all['']?arrabbiata)/i, compositeId: 'arrabbiata', confidence: 0.9 },
  { pattern: /(cacio\s*e\s*pepe)/i, compositeId: 'cacio_e_pepe', confidence: 0.95 },
  { pattern: /(pesto(?!\s*genovese\s*mild)|pesto genovese|basilico)/i, compositeId: 'pesto', confidence: 0.9 },
  { pattern: /(marinara)/i, compositeId: 'marinara', confidence: 0.9 },
  { pattern: /(napoletana|napoletan)/i, compositeId: 'napoletana', confidence: 0.9 },
  { pattern: /(aglio\s*(e|\s)?\s*olio|knoblauch.*oliven)/i, compositeId: 'aglio_olio', confidence: 0.9 },
  { pattern: /(puttanesca)/i, compositeId: 'puttanesca', confidence: 0.95 },
  { pattern: /(pasta\s+alla\s+norma|\bnorma\b)/i, compositeId: 'norma', confidence: 0.85 },
  { pattern: /(vodka[\s-]?sauce|alla\s+vodka|penne\s+alla\s+vodka)/i, compositeId: 'vodka_sauce', confidence: 0.9 },
  { pattern: /(mushroom\s+sauce|sugo\s+ai\s+funghi|funghi|pilzsauce)/i, compositeId: 'mushroom_sauce', confidence: 0.85 },
  { pattern: /(rag[uù]\s+bianco|weisses\s+ragout|white\s+rag[uù])/i, compositeId: 'ragu_bianco', confidence: 0.9 },
  { pattern: /(rag[uù][\s-]*(di[\s-]*)?salsiccia|salsiccia[\s-]*rag[uù])/i, compositeId: 'ragu_salsiccia', confidence: 0.9 },
  { pattern: /(rag[uù]\s+(alla\s+)?bolognese|bolognese|bologneser)/i, compositeId: 'ragu_bolognese', confidence: 0.9 },
  { pattern: /(caesar\s+dressing|caesar\s+sauce)/i, compositeId: 'caesar', confidence: 0.9 },
  { pattern: /(vinaigrette)/i, compositeId: 'vinaigrette', confidence: 0.95 },
  { pattern: /(aioli|allioli)/i, compositeId: 'aioli', confidence: 0.95 },
  { pattern: /(hollandaise)/i, compositeId: 'hollandaise', confidence: 0.95 },
  { pattern: /(b[eé]arnaise)/i, compositeId: 'bearnaise', confidence: 0.95 },
  { pattern: /(chimichurri)/i, compositeId: 'chimichurri', confidence: 0.95 },
  { pattern: /(sauce\s+tartare|tartar(?!\s*steak)|remoulade)/i, compositeId: 'tartar', confidence: 0.9 },
  { pattern: /(balsamic\s+glaze|balsamico[\s-]*reduktion|balsamic\s+reduction)/i, compositeId: 'balsamic_glaze', confidence: 0.9 },
];

function resolveComposite(query) {
  const q = String(query || '');
  if (!q) return null;
  let best = null;
  for (const a of COMPOSITE_ALIASES) {
    if (a.pattern.test(q)) {
      if (!best || a.confidence > best.confidence) {
        best = { compositeId: a.compositeId, confidence: a.confidence };
      }
    }
  }
  return best;
}

const FREE_MARKERS = /\b(kreativ|mach mir|was mit|proteinreich|inspiriert|frei)\b/i;

function resolve(query) {
  const q = String(query || '').trim();
  if (!q) return { archetypeId: null, dishId: null, compositeId: null, confidence: 0, mode: 'free' };

  const composite = resolveComposite(q);

  if (FREE_MARKERS.test(q)) {
    return { archetypeId: null, dishId: null, compositeId: composite ? composite.compositeId : null, confidence: 0, mode: 'free' };
  }

  let best = null;
  for (const a of ALIASES) {
    if (a.pattern.test(q)) {
      if (!best || a.confidence > best.confidence) {
        best = { archetypeId: a.archetypeId, dishId: a.dishId,
                 confidence: a.confidence, mode: 'classic',
                 compositeId: composite ? composite.compositeId : null,
                 compositeConfidence: composite ? composite.confidence : 0 };
      }
    }
  }
  if (best) return best;
  return { archetypeId: null, dishId: null, compositeId: composite ? composite.compositeId : null, confidence: 0, mode: 'free' };
}

module.exports = { resolve, resolveComposite };
