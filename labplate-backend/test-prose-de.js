'use strict';
/**
 * Test-Suite für recipe-prose-de.js — Golden Set (Stand 2026-10-06).
 * Aufruf: node test-prose-de.js
 * Exit 0 = alle grün. Exit 1 = mindestens ein Fehler.
 *
 * Format: [id, input, ingredientNames, portions, erwartet]
 */
const prose = require('./recipe-prose-de');

const CASES = [
  // ─── A: fehlendes "und" zwischen bekannten Zutaten ─────────────────────
  ['A1', 'Die Zwiebel Knoblauchzehe hinzufügen und kurz anbraten.',
    ['Zwiebel', 'Knoblauchzehe'], 1,
    'Zwiebel und Knoblauchzehe hinzufügen und kurz anbraten.'],
  ['A2', 'Den Knoblauch den Ingwer hinzufügen.',
    ['Knoblauch', 'Ingwer'], 1,
    'Den Knoblauch und den Ingwer hinzufügen.'],
  ['A3', 'Currypulver das Salz einstreuen und kurz anrösten.',
    ['Currypulver', 'Salz'], 1,
    'Currypulver und Salz einstreuen und kurz anrösten.'],
  ['A4', 'Zwiebel, Karotte Sellerie fein hacken.',
    ['Zwiebel', 'Karotte', 'Sellerie'], 1,
    'Zwiebel, Karotte und Sellerie fein hacken.'],
  ['A5', 'Paprika die Zucchini dazugeben.',
    ['Paprika', 'Zucchini'], 1,
    'Paprika und Zucchini dazugeben.'],

  // ─── B: falscher Artikel / Genus / fehlende Deklination ────────────────
  ['B1', 'Mit Schwarzer Pfeffer abschmecken.',
    ['Schwarzer Pfeffer'], 1,
    'Mit schwarzem Pfeffer abschmecken.'],
  ['B2', 'Mit Frischer Koriander bestreuen.',
    ['Frischer Koriander'], 1,
    'Mit frischem Koriander bestreuen.'],
  ['B3', 'Den Weißer Reis garen.',
    ['Weißer Reis'], 1,
    'Den weißen Reis garen.'],
  ['B4', 'mit der Knoblauch hinzufügen.',
    ['Knoblauch'], 1,
    'Mit dem Knoblauch hinzufügen.'],
  ['B5', 'Das Hähnchenbrust garen.',
    ['Hähnchenbrust'], 1,
    'Die Hähnchenbrust garen.'],
  ['B6', 'mit dem Gerbener Parmesan bestreuen.',
    ['Geriebener Parmesan'], 1,
    'Mit dem geriebenen Parmesan bestreuen.'],

  // ─── C: doppelte Adjektive ─────────────────────────────────────────────
  ['C1', 'Mit schwarzem Schwarzer Pfeffer würzen.',
    ['Schwarzer Pfeffer'], 1,
    'Mit schwarzem Pfeffer würzen.'],
  ['C2', 'Mit frischem Frischer Koriander bestreuen.',
    ['Frischer Koriander'], 1,
    'Mit frischem Koriander bestreuen.'],

  // ─── E: Plural-Gefäße bei 1 Portion ────────────────────────────────────
  ['E1', 'Den Eintopf in Schalen füllen.',
    ['Eintopf'], 1,
    'Den Eintopf in eine Schale füllen.'],
  ['E2', 'Das Curry auf Tellern verteilen.',
    ['Curry'], 1,
    'Das Curry auf einen Teller verteilen.'],

  // ─── K: bereits korrekt → unverändert ──────────────────────────────────
  ['K1', 'Die Zwiebel schälen und fein würfeln.',
    ['Zwiebel'], 1,
    'Die Zwiebel schälen und fein würfeln.'],
  ['K2', 'Mit Salz und schwarzem Pfeffer abschmecken.',
    ['Salz', 'Schwarzer Pfeffer'], 1,
    'Mit Salz und schwarzem Pfeffer abschmecken.'],
  ['K3', 'mit der Zwiebel glasig dünsten.',
    ['Zwiebel'], 1,
    'Mit der Zwiebel glasig dünsten.'],

  // ─── L: Live-Fälle (Dezember/Dezember-Klammern, Plural-Namen) ──────────
  ['L1', 'Die Paprika Zucchini hinzufügen und kurz mit anbraten.',
    ['Paprika', 'Zucchini'], 1,
    'Paprika und Zucchini hinzufügen und kurz mit anbraten.'],
  ['L4', 'Die Paprika Zucchini hinzufügen.',
    ['Rote Paprika (in Streifen)', 'Zucchini, klein gewürfelt'], 1,
    'Paprika und Zucchini hinzufügen.'],
  ['L5', 'Mit Salz, schwarzem Pfeffer Kreuzkümmel abschmecken und den Eintopf weiter köcheln lassen.',
    ['Salz', 'Schwarzer Pfeffer', 'Kreuzkümmel', 'Eintopf'], 1,
    'Mit Salz, schwarzem Pfeffer und Kreuzkümmel abschmecken und den Eintopf weiter köcheln lassen.'],
  ['L6', 'Die rote Linsen in einem Sieb abspülen.',
    ['Rote Linsen'], 1,
    'Die roten Linsen in einem Sieb abspülen.'],
  ['L7', 'Karotten und die Tomaten in Würfel schneiden.',
    ['Karotten', 'Tomaten'], 1,
    'Karotten und Tomaten in Würfel schneiden.'],
  ['L9', 'Die Hähnchenbrustfilet in Stücke schneiden.',
    ['Hähnchenbrustfilet'], 1,
    'Das Hähnchenbrustfilet in Stücke schneiden.'],

  // ─── N: Artikel-Regel B (beide behalten oder beide weg) ────────────────
  ['N1', 'Den Brokkoli die Karotten hinzufügen.',
    ['Brokkoli', 'Karotten'], 1,
    'Den Brokkoli und die Karotten hinzufügen.'],
  ['N2', 'Der Brokkoli Karotten hinzufügen.',
    ['Brokkoli', 'Karotten'], 1,
    'Brokkoli und Karotten hinzufügen.'],
  ['N3', 'Brokkoli die Karotten hinzufügen.',
    ['Brokkoli', 'Karotten'], 1,
    'Brokkoli und Karotten hinzufügen.'],
  ['N4', 'Der Brokkoli und Karotten hinzufügen.',
    ['Brokkoli', 'Karotten'], 1,
    'Brokkoli und Karotten hinzufügen.'],
  ['N5', 'Brokkoli Karotten hinzufügen.',
    ['Brokkoli', 'Karotten'], 1,
    'Brokkoli und Karotten hinzufügen.'],

  // ─── P/R: Live-Restfehler (Paprika rot, Bindestrich, weitere) ──────────
  ['P1', 'Die Paprika rot, Zucchini, in Halbmonden Karotten hinzufügen und anbraten.',
    ['Paprika rot', 'Zucchini, in Halbmonden', 'Karotten'], 1,
    'Die rote Paprika, Zucchini, in Halbmonden Karotten hinzufügen und anbraten.'],
  ['P2', 'Die Paprika rot in Streifen schneiden.',
    ['Paprika rot'], 1,
    'Die rote Paprika in Streifen schneiden.'],
  ['P3', 'Den Paprika rot waschen und schneiden.',
    ['Paprika rot'], 1,
    'Die rote Paprika waschen und schneiden.'],
  ['P4', 'die Kokosmilch und weitere Wasser zugießen',
    ['Kokosmilch', 'Wasser'], 1,
    'Die Kokosmilch und weiteres Wasser zugießen'],
  ['P5', 'die Kokosmilch und das weitere Wasser zugießen',
    ['Kokosmilch', 'Wasser'], 1,
    'Die Kokosmilch und das weitere Wasser zugießen'],
  ['P6', 'die Tomaten und weitere Tomaten hinzufügen',
    ['Tomaten'], 1,
    'Die Tomaten und weitere Tomaten hinzufügen'],
  ['P7', 'das Rote Currypaste-Curry darüber geben',
    ['Rote Currypaste'], 1,
    'Das rote Currypaste-Curry darüber geben'],
  ['P8', 'Das Gemüse-Mix wird gewürfelt und beiseite gestellt.',
    ['Gemüse-Mix'], 1,
    'Der Gemüse-Mix wird gewürfelt und beiseite gestellt.'],

  // ─── R: Live-Fälle aus Rendering-Pipeline ──────────────────────────────
  ['R1', 'Zwiebel Karotte fein würfeln und zusammen mit dem Sellerie in den Topf geben.',
    ['Zwiebeln', 'Karotten', 'Sellerie'], 1,
    'Zwiebel und Karotte fein würfeln und zusammen mit dem Sellerie in den Topf geben.'],
  ['R2', 'Das fertige Curry wird auf Schalen verteilt und mit dem frischen Koriander bestreut serviert.',
    ['Curry', 'Frischer Koriander'], 1,
    'Das fertige Curry wird auf einen Teller verteilt und mit dem frischen Koriander bestreut serviert.'],
  ['R2b', 'Der Eintopf wird in Schalen gefüllt und kalt gestellt.',
    ['Eintopf'], 1,
    'Der Eintopf wird in eine Schale gefüllt und kalt gestellt.'],
  ['R3', 'Die Zwiebel, Karotten, Paprika rot und Zucchini werden in Stücke geschnitten und serviert.',
    ['Zwiebel', 'Karotten', 'Rote Paprika', 'Zucchini'], 1,
    'Die Zwiebel, Karotten, rote Paprika und Zucchini werden in Stücke geschnitten und serviert.'],
  ['R3b', 'Zwiebel fein würfeln und beiseite stellen.',
    ['Zwiebel'], 1,
    'Zwiebel fein würfeln und beiseite stellen.'],

  // ─── D: Ei-Sonderfall ──────────────────────────────────────────────────
  ['D1', 'die verquirlten Ei darüber gießen',
    ['Ei'], 1,
    'Das verquirlte Ei darüber gießen'],
  ['D2', 'Das verquirlte Ei darüber gießen.',
    ['Ei'], 1,
    'Das verquirlte Ei darüber gießen.'],

  // ─── X: Spezialfälle (Plural-Marker, Bindestrich-Kompositum) ───────────
  ['X1', 'Zum Schluss wird das Curry mit den Geröstete Erdnüsse bestreut.',
    ['Geröstete Erdnüsse'], 1,
    'Zum Schluss wird das Curry mit den Gerösteten Erdnüsse bestreut.'],
];

let failures = 0;
CASES.forEach(function (c) {
  const got = prose.polishStepText(c[1], { ingredientNames: c[2], portions: c[3] });
  const ok = got === c[4];
  if (!ok) failures++;
  console.log((ok ? 'OK  ' : 'FAIL') + ' [' + c[0] + ']');
  if (!ok) {
    console.log('  eingabe: ' + c[1]);
    console.log('  bekam : ' + got);
    console.log('  soll  : ' + c[4]);
  }
});
console.log('\n' + (CASES.length - failures) + '/' + CASES.length + ' Tests bestanden');
process.exit(failures ? 1 : 0);
