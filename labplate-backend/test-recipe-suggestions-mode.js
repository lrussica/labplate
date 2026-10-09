'use strict';
const suggestions = require('./recipe-suggestions');

let pass = 0, fail = 0;
function ok(m) { console.log('OK ' + m); pass++; }
function bad(m) { console.log('FAIL ' + m); fail++; }

function check(label, p, expected) {
  const got = suggestions.shouldTreatAsStructured(p);
  if (got === expected) ok(label + ' -> ' + got);
  else bad(label + ' -> erwartet ' + expected + ', bekam ' + got);
}

// mode=ai + ai_instruction: IMMER generativ
check('mode=ai, 3 Zutaten, ai_instruction', {
  mode: 'ai', ai_instruction: 'Bratkartoffeln',
  pantry_ingredients: ['Kartoffeln','Zwiebel','Speck'],
}, false);

check('mode=ai, 6 Zutaten, ai_instruction', {
  mode: 'ai', ai_instruction: 'Spaghetti Bolognese',
  pantry_ingredients: ['Spaghetti','Hack','Tomaten','Zwiebel','Karotte','Sellerie'],
}, false);

// mode=pantry OHNE ai_instruction: Heuristik greift
check('mode=pantry, 3 Zutaten, kein ai_instruction', {
  mode: 'pantry',
  pantry_ingredients: ['200g Kartoffeln','1 Zwiebel','100g Speck'],
}, true);

check('mode=pantry, 1 Zutat mit Mengen', {
  mode: 'pantry',
  pantry_ingredients: ['200g Kartoffeln'],
}, false);

// explizit structured=true -> immer true
check('structured=true', {
  structured: true, mode: 'ai',
  pantry_ingredients: ['irgendwas'],
}, true);

console.log();
console.log('Pass: ' + pass + '  Fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
