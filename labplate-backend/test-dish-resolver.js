'use strict';
const resolver = require('./dish-resolver');
const guard = require('./dish-identity-guard');

let pass = 0, fail = 0;
function ok(m){ console.log('OK ' + m); pass++; }
function bad(m){ console.log('FAIL ' + m); fail++; }

// Resolver-Heuristik
const cases = [
  ['Spaghetti mit Tomatensauce', 'A1_pasta', 'classic'],
  ['Vollkornnudeln mit Pesto', 'A1_pasta', 'classic'],
  ['Rumpsteak', 'A10_protein_with_side', 'classic'],
  ['Bratkartoffeln mit Speck', 'A3_pan_dish', 'classic'],
  ['Rindergulasch', 'A4_stew_curry', 'classic'],
  ['Kuerbissuppe', 'A4_stew_curry', 'classic'],
  ['Kartoffelsalat', 'A7_bowl_salad', 'classic'],
  ['Caesar Salad', 'A7_bowl_salad', 'classic'],
  ['mach mir was Proteinreiches mit Tomate und Linsen', null, 'free'],
  ['Bowle mit Fruechten', null, 'free'],
];
for (const [q, expectedArch, expectedMode] of cases) {
  const r = resolver.resolve(q);
  const archOk = r.archetypeId === expectedArch;
  const modeOk = r.mode === expectedMode;
  if (archOk && modeOk) ok('resolve("' + q + '") -> ' + r.archetypeId + ' / ' + r.mode);
  else bad('resolve("' + q + '") -> erwartet ' + expectedArch + '/' + expectedMode + ', bekam ' + r.archetypeId + '/' + r.mode);
}

// Guard: freie Anfrage wird nicht validiert
{
  const g = guard.checkQuery('mach mir was Proteinreiches mit Tomate', {});
  if (g.ok && g.mode === 'free') ok('Guard freie Anfrage -> durchgewunken (mode free)');
  else bad('Guard freie Anfrage -> falsch: ' + JSON.stringify(g));
}

// Guard: klassische Anfrage + sauberes Rezept
{
  const g = guard.checkQuery('Spaghetti mit Tomatensauce', {
    ingredients: [
      { name: 'spaghetti' },
      { name: 'tomato_sauce' },
      { name: 'olive_oil' },
    ],
  });
  if (g.ok && g.mode === 'classic') ok('Guard klassisch + sauber -> freigegeben');
  else bad('Guard klassisch + sauber -> ' + JSON.stringify(g.violations));
}

// Guard: klassische Anfrage + verfaelscht
{
  const g = guard.checkQuery('Spaghetti mit Tomatensauce', {
    ingredients: [
      { name: 'spaghetti' },
      { name: 'tomato_sauce' },
      { name: 'haferflocken' },
    ],
  });
  if (!g.ok) ok('Guard klassisch + Haferflocken -> abgelehnt');
  else bad('Guard klassisch + Haferflocken wurde nicht abgelehnt');
}

console.log();
console.log('Pass: ' + pass + '  Fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
