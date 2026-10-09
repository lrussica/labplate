'use strict';
/**
 * test-prompt-invariants.js
 * =========================
 * Stellt sicher, dass der generative Prompt keine Erlaubnisse
 * enthaelt, die der KI das Erfinden von Zutaten erlauben.
 *
 * Claude-Diagnose 10. Okt 2026.
 */
const suggestions = require('./recipe-suggestions');

let pass = 0, fail = 0;
function ok(m) { console.log('OK ' + m); pass++; }
function bad(m) { console.log('FAIL ' + m); fail++; }

// Simulation langer Client-Text
const LANGER_TEXT = 'MODUS GENERATIV / FREISUCHE: Erstelle ein Rezept fuer "Spaghetti mit Tomatensoße". Du DARFST Mengen und Zutatendetails an die unten genannten Tagesziele anpassen. Erstelle Rezepte mit Fokus auf die Makro-Ziele des Nutzers (passendes Protein). Variation-Seed: 050900-hi90g.';

function buildPrompt(aiInstruction, extraOpts) {
  const payload = Object.assign({
    mode: 'ai',
    lang: 'de',
    pantry_ingredients: ['Spaghetti', 'Tomaten', 'Olivenoel'],
    ai_instruction: aiInstruction,
    allergens: [],
    macros: { protein_g: 90, kcal: 1800 },
    micronutrient_gaps: [],
    lab_guideline_constraints: null,
    target_servings: 1,
    team_ai: true,
    theme: null,
  }, extraOpts || {});
  const req = suggestions.buildRequest(payload, 'openai/gpt-oss-120b');
  const user = req.messages.find(m => m.role === 'user').content;
  const system = req.messages.find(m => m.role === 'system').content;
  return { user: user, system: system, combined: user + '\n' + system };
}

// --- T1: User-Prompt enthaelt KEINEN Client-Text mehr
{
  const r = buildPrompt(LANGER_TEXT);
  const verboten = ['DARFST', 'Variation-Seed', '050900-hi90g', 'THEMEN-HINWEIS'];
  let clean = true;
  for (const v of verboten) {
    if (r.user.includes(v)) { bad('T1 User-Prompt enthaelt: ' + v); clean = false; }
  }
  if (clean) ok('T1 User-Prompt enthaelt keinen Client-Text');
}

// --- T2: User-Prompt ist kurz
{
  const r = buildPrompt(LANGER_TEXT);
  if (r.user.length < 800) ok('T2 User-Prompt kurz (' + r.user.length + ' Zeichen)');
  else bad('T2 User-Prompt zu lang: ' + r.user.length);
}

// --- T3: Bei Gerichtsname KEIN THEMEN-HINWEIS
{
  const r = buildPrompt(LANGER_TEXT, { theme: 'protein' });
  if (!r.user.includes('THEMEN-HINWEIS')) ok('T3 kein THEMEN-HINWEIS im User-Prompt');
  else bad('T3 THEMEN-HINWEIS trotz Gerichtsname');
  if (!r.system.includes('THEMEN-REZEPT (vom Kollegen-Brief')) ok('T3 kein THEMEN-REZEPT im System');
  else bad('T3 THEMEN-REZEPT trotz Gerichtsname im System');
}

// --- T4: Im Ideen-Flow (leeres ai_instruction) bleibt Theme aktiv
// Realer Client: Chips senden theme, aber keinen ai_instruction-Text.
{
  const r = buildPrompt('', { theme: 'protein' });
  if (r.user.includes('THEMEN-HINWEIS') || r.system.includes('THEMEN-REZEPT')) {
    ok('T4 Ideen-Flow (leeres ai_instruction): Theme bleibt aktiv');
  } else {
    bad('T4 Ideen-Flow: Theme wurde faelschlich gesperrt');
  }
}

// --- T5: Verbotene Erlaubnis-Phrasen aus dem User-Prompt
{
  const r = buildPrompt(LANGER_TEXT);
  const phrasen = [
    'an die Tagesziele anpassen',
    'an die unten genannten Tagesziele',
    'an Nutzer-Tagesziele',
    'passendes Protein',
    'Makro-Ziele des Nutzers',
    'Erstelle Rezepte mit Fokus',
  ];
  let clean = true;
  for (const p of phrasen) {
    if (r.user.includes(p)) { bad('T5 User-Prompt enthaelt: ' + p); clean = false; }
  }
  if (clean) ok('T5 User-Prompt frei von Erlaubnis-Phrasen');
}

// --- T6: Gerichtsname wird korrekt extrahiert
{
  const r = buildPrompt(LANGER_TEXT);
  if (r.user.includes('Spaghetti mit Tomatensoße')) ok('T6 Gerichtsname extrahiert');
  else bad('T6 Gerichtsname fehlt: ' + r.user.slice(0, 200));
}

// --- T7: Bei kurzem ai_instruction direkt uebernehmen
{
  const r = buildPrompt('Spaghetti Carbonara');
  if (r.user.includes('Spaghetti Carbonara')) ok('T7 kurzer Text direkt uebernommen');
  else bad('T7 kurzer Text nicht uebernommen');
}

console.log();
console.log('Pass: ' + pass + '  Fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
