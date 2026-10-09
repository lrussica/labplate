'use strict';
const { validate } = require('./dish-identity-validator');

let pass = 0, fail = 0;
function ok(m) { console.log('OK ' + m); pass++; }
function bad(m) { console.log('FAIL ' + m); fail++; }

// --- Test 1: KORREKTES A1-Rezept -> freigegeben
{
  const r = validate('A1_pasta', {
    ingredients: [
      { name: 'spaghetti',  amount: 100, unit: 'g' },
      { name: 'tomato_sauce', amount: 200, unit: 'g' },
      { name: 'olive_oil',  amount: 15,  unit: 'ml' },
      { name: 'basil',      amount: 5,   unit: 'g' },
    ],
    steps: [],
  });
  if (r.ok) ok('A1 sauberes Rezept -> freigegeben');
  else { bad('A1 sauberes Rezept abgelehnt: ' + JSON.stringify(r.violations)); }
}

// --- Test 2: iPhone-Test-Bug -> abgelehnt (Haferflocken)
{
  const r = validate('A1_pasta', {
    ingredients: [
      { name: 'spaghetti',  amount: 100, unit: 'g' },
      { name: 'tomato_sauce', amount: 200, unit: 'g' },
      { name: 'chicken_breast', amount: 150, unit: 'g' },
      { name: 'haferflocken', amount: 40, unit: 'g' },
    ],
    steps: [],
  });
  if (!r.ok) ok('A1 mit Haferflocken -> abgelehnt');
  else bad('A1 mit Haferflocken wurde NICHT abgelehnt');
  const hasForbidden = r.violations.some(v => v.code === 'forbidden_used');
  if (hasForbidden) ok('Violation forbidden_used erkannt');
  else bad('forbidden_used fehlt');
}

// --- Test 3: A1 ohne Pasta -> abgelehnt (core.pasta fehlt)
{
  const r = validate('A1_pasta', {
    ingredients: [
      { name: 'tomato_sauce', amount: 200, unit: 'g' },
      { name: 'olive_oil',    amount: 15,  unit: 'ml' },
    ],
    steps: [],
  });
  if (!r.ok) ok('A1 ohne Pasta -> abgelehnt');
  else bad('A1 ohne Pasta wurde NICHT abgelehnt');
  const hasCore = r.violations.some(v => v.code === 'core_slot_missing' && /pasta/.test(v.detail));
  if (hasCore) ok('Violation core_slot_missing pasta');
  else bad('core_slot_missing pasta fehlt');
}

// --- Test 4: A10 (Rumpsteak) ohne Beilage -> OK (side_policy only-if-requested)
{
  const r = validate('A10_protein_with_side', {
    ingredients: [
      { name: 'beef_steak', amount: 200, unit: 'g' },
      { name: 'salt',       amount: 2,   unit: 'g' },
    ],
    steps: [],
  });
  if (r.ok) ok('A10 Rumpsteak ohne Beilage -> freigegeben (iPhone-Test-Fix)');
  else bad('A10 Rumpsteak ohne Beilage abgelehnt: ' + JSON.stringify(r.violations));
}

// --- Test 5: A10 mit ungefragter Beilage -> abgelehnt
{
  const r = validate('A10_protein_with_side', {
    ingredients: [
      { name: 'beef_steak', amount: 200, unit: 'g', role: 'protein' },
      { name: 'potato_boiled', amount: 150, unit: 'g', role: 'side' },
    ],
    steps: [],
  });
  if (!r.ok) ok('A10 mit ungefragter Beilage -> abgelehnt');
  else bad('A10 mit ungefragter Beilage wurde NICHT abgelehnt');
  const hasSide = r.violations.some(v => v.code === 'side_not_requested');
  if (hasSide) ok('Violation side_not_requested erkannt');
  else bad('side_not_requested fehlt');
}

// --- Test 6: A10 mit Beilage + side_requested=true -> freigegeben
{
  const r = validate('A10_protein_with_side', {
    side_requested: true,
    ingredients: [
      { name: 'beef_steak', amount: 200, unit: 'g', role: 'protein' },
      { name: 'potato_boiled', amount: 150, unit: 'g', role: 'side' },
    ],
    steps: [],
  });
  if (r.ok) ok('A10 mit angeforderter Beilage -> freigegeben');
  else bad('A10 mit angeforderter Beilage abgelehnt: ' + JSON.stringify(r.violations));
}

// --- Test 7: leeres Rezept -> malformed
{
  const r = validate('A1_pasta', {});
  if (!r.ok) ok('Leeres Rezept -> abgelehnt (malformed)');
  else bad('Leeres Rezept wurde NICHT abgelehnt');
}

console.log();
console.log('Pass: ' + pass + '  Fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
