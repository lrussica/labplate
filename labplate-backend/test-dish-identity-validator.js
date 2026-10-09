'use strict';
const { validate, validateComposite } = require('./dish-identity-validator');
const guard = require('./dish-identity-guard');

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

// --- Test 8: Spaghetti mit Tomatensoße + Haehnchen + Tofu
//               (Protein-Stuffing) -> core_protein_dominance
{
  const r = validate('A1_pasta', {
    ingredients: [
      { name: 'Spaghetti (trocken)',         amount: 90,  unit: 'g', _catalogKey: 'pasta_dry' },
      { name: 'Hähnchenbrustfilet',          amount: 125, unit: 'g', _catalogKey: 'chicken_breast' },
      { name: 'Tofu (fest)',                 amount: 40,  unit: 'g', _catalogKey: 'tofu_firm' },
      { name: 'Tomaten (frisch, gehackt)',   amount: 150, unit: 'g', _catalogKey: 'tomato' },
      { name: 'Olivenöl',                    amount: 8,   unit: 'ml', _catalogKey: 'olive_oil' },
      { name: 'Zwiebel',                     amount: 25,  unit: 'g', _catalogKey: 'onion_yellow' },
      { name: 'Knoblauchzehe',               amount: 5,   unit: 'g', _catalogKey: 'garlic' },
      { name: 'Salz',                        amount: 0,   unit: 'prise' },
      { name: 'Schwarzer Pfeffer',           amount: 0,   unit: 'prise' },
    ],
  });
  if (!r.ok) ok('Spaghetti + Haehnchen + Tofu -> abgelehnt');
  else bad('Spaghetti + Haehnchen + Tofu wurde NICHT abgelehnt');
  const hasDom = r.violations.some(v => v.code === 'core_protein_dominance');
  if (hasDom) ok('Violation core_protein_dominance erkannt');
  else bad('core_protein_dominance fehlt');
  const hasForbidden = r.violations.some(v => v.code === 'forbidden_used' && /tofu/.test(v.detail));
  if (hasForbidden) ok('Violation forbidden_used: tofu');
  else bad('forbidden_used tofu fehlt');
}

// --- Test 9: Klassische Carbonara (Ei + Pecorino dominieren nicht) -> OK
{
  const r = validate('A1_pasta', {
    ingredients: [
      { name: 'Spaghetti',       amount: 100, unit: 'g', _catalogKey: 'pasta_dry' },
      { name: 'Guanciale',       amount: 60,  unit: 'g', _catalogKey: 'guanciale' },
      { name: 'Eier',            amount: 100, unit: 'g', _catalogKey: 'egg' },
      { name: 'Pecorino Romano', amount: 50,  unit: 'g', _catalogKey: 'pecorino' },
    ],
  });
  // Guanciale ist im A1.core.sauce.allowed -> core
  // Ei und Pecorino ebenfalls core (A1.core.sauce)
  // Spaghetti ist core.pasta
  // => alles core, kein tolerated, ok=true erwartet
  if (r.ok) ok('Carbonara klassisch -> freigegeben');
  else bad('Carbonara klassisch abgelehnt: ' + JSON.stringify(r.violations));
}

// --- Test 10: Klassische Tomatensoße ohne Protein-Stuffing -> OK
{
  const r = validate('A1_pasta', {
    ingredients: [
      { name: 'Spaghetti (trocken)',       amount: 100, unit: 'g', _catalogKey: 'pasta_dry' },
      { name: 'Tomaten (frisch, gehackt)', amount: 300, unit: 'g', _catalogKey: 'tomato' },
      { name: 'Olivenöl',                  amount: 15,  unit: 'ml', _catalogKey: 'olive_oil' },
      { name: 'Knoblauch',                 amount: 5,   unit: 'g', _catalogKey: 'garlic' },
      { name: 'Basilikum',                 amount: 5,   unit: 'g', _catalogKey: 'basil' },
    ],
  });
  if (r.ok) ok('Klassische Tomatensosse -> freigegeben');
  else bad('Klassische Tomatensosse abgelehnt: ' + JSON.stringify(r.violations));
}

// --- Test 11: Linsen in Spaghetti mit Tomatensosse -> unknown_to_profile
{
  const r = validate('A1_pasta', {
    ingredients: [
      { name: 'Spaghetti (trocken)',    amount: 90,  unit: 'g', _catalogKey: 'pasta_dry' },
      { name: 'Linsen (trocken)',       amount: 50,  unit: 'g', _catalogKey: 'lentils_dry' },
      { name: 'Tomaten (frisch)',       amount: 100, unit: 'g', _catalogKey: 'tomato' },
      { name: 'Zwiebel',                amount: 40,  unit: 'g', _catalogKey: 'onion_yellow' },
      { name: 'Knoblauch',              amount: 5,   unit: 'g', _catalogKey: 'garlic' },
      { name: 'Olivenöl',               amount: 13,  unit: 'ml', _catalogKey: 'olive_oil' },
      { name: 'Salz',                   amount: 0,   unit: 'prise' },
    ],
  });
  if (!r.ok) ok('Linsen in A1 -> abgelehnt');
  else bad('Linsen in A1 wurden NICHT abgelehnt');
  const hasFit = r.violations.some(v => v.code === 'unknown_to_profile' && /linsen|lentils/i.test(v.detail));
  if (hasFit) ok('Violation unknown_to_profile fuer Linsen');
  else bad('unknown_to_profile fehlt: ' + JSON.stringify(r.violations.map(v => v.detail)));
}

// --- Test 12: Klassische Carbonara bleibt frei (keine unknown_to_profile)
{
  const r = validate('A1_pasta', {
    ingredients: [
      { name: 'Spaghetti',       amount: 100, unit: 'g', _catalogKey: 'pasta_dry' },
      { name: 'Guanciale',       amount: 60,  unit: 'g', _catalogKey: 'guanciale' },
      { name: 'Eier',            amount: 100, unit: 'g', _catalogKey: 'egg' },
      { name: 'Pecorino Romano', amount: 50,  unit: 'g', _catalogKey: 'pecorino' },
      { name: 'Schwarzer Pfeffer', amount: 0, unit: 'prise' },
    ],
  });
  if (r.ok) ok('Carbonara sauber -> freigegeben');
  else {
    const hasFit = r.violations.some(v => v.code === 'unknown_to_profile');
    if (hasFit) bad('Carbonara faelschlich unknown_to_profile: ' + JSON.stringify(r.violations));
    else ok('Carbonara -> abgelehnt, aber NICHT wegen unknown_to_profile');
  }
}

// --- Composite-Tests -------------------------------------------------

// --- C1: Pesto klassisch -> freigegeben
{
  const r = validateComposite('pesto', {
    ingredients: [
      { name: 'Spaghetti', _catalogKey: 'pasta_dry' },
      { name: 'Basilikum', _catalogKey: 'basil_fresh' },
      { name: 'Pinienkerne', _catalogKey: 'pine_nut' },
      { name: 'Knoblauch', _catalogKey: 'garlic' },
      { name: 'Parmigiano', _catalogKey: 'parmesan' },
      { name: 'Pecorino', _catalogKey: 'pecorino' },
      { name: 'Olivenöl', _catalogKey: 'olive_oil' },
      { name: 'Salz', _catalogKey: 'salt' },
    ],
  });
  if (r.ok) ok('Composite Pesto klassisch -> freigegeben');
  else bad('Composite Pesto klassisch abgelehnt: ' + JSON.stringify(r.violations));
}

// --- C2: Pesto mit Tomate -> composite_core_missing + composite_forbidden_used
{
  const r = validateComposite('pesto', {
    ingredients: [
      { name: 'Spaghetti', _catalogKey: 'pasta_dry' },
      { name: 'Tomaten', _catalogKey: 'tomato' },
      { name: 'Pinienkerne', _catalogKey: 'pine_nut' },
      { name: 'Parmigiano', _catalogKey: 'parmesan' },
      { name: 'Olivenöl', _catalogKey: 'olive_oil' },
    ],
  });
  if (!r.ok) ok('Composite Pesto mit Tomate -> abgelehnt');
  else bad('Pesto mit Tomate wurde NICHT abgelehnt');
  const hasCore = r.violations.some(v => v.code === 'composite_core_missing' && /basil/.test(v.detail));
  const hasForb = r.violations.some(v => v.code === 'composite_forbidden_used' && /tomato/.test(v.detail));
  if (hasCore && hasForb) ok('Violations composite_core_missing basil + composite_forbidden_used tomato');
  else bad('Violations fehlen: core=' + hasCore + ' forb=' + hasForb);
}

// --- C3: Amatriciana klassisch -> freigegeben
{
  const r = validateComposite('amatriciana', {
    ingredients: [
      { name: 'Spaghetti', _catalogKey: 'pasta_dry' },
      { name: 'Guanciale', _catalogKey: 'guanciale' },
      { name: 'Tomaten', _catalogKey: 'tomato' },
      { name: 'Pecorino', _catalogKey: 'pecorino' },
    ],
  });
  if (r.ok) ok('Composite Amatriciana klassisch -> freigegeben');
  else bad('Amatriciana klassisch abgelehnt: ' + JSON.stringify(r.violations));
}

// --- C4: Amatriciana mit Knoblauch -> forbidden
{
  const r = validateComposite('amatriciana', {
    ingredients: [
      { name: 'Spaghetti', _catalogKey: 'pasta_dry' },
      { name: 'Guanciale', _catalogKey: 'guanciale' },
      { name: 'Tomaten', _catalogKey: 'tomato' },
      { name: 'Pecorino', _catalogKey: 'pecorino' },
      { name: 'Knoblauch', _catalogKey: 'garlic' },
    ],
  });
  if (!r.ok) ok('Amatriciana mit Knoblauch -> abgelehnt');
  else bad('Amatriciana mit Knoblauch wurde NICHT abgelehnt');
  const hasForb = r.violations.some(v => v.code === 'composite_forbidden_used' && /garlic/.test(v.detail));
  if (hasForb) ok('Violation composite_forbidden_used garlic');
  else bad('composite_forbidden_used garlic fehlt');
}

// --- C5: Cacio e Pepe klassisch -> freigegeben
{
  const r = validateComposite('cacio_e_pepe', {
    ingredients: [
      { name: 'Spaghetti', _catalogKey: 'pasta_dry' },
      { name: 'Pecorino Romano', _catalogKey: 'pecorino' },
      { name: 'Schwarzer Pfeffer', _catalogKey: 'black_pepper' },
      { name: 'Nudelwasser', _catalogKey: 'water' },
    ],
  });
  if (r.ok) ok('Composite Cacio e Pepe klassisch -> freigegeben');
  else bad('Cacio e Pepe klassisch abgelehnt: ' + JSON.stringify(r.violations));
}

// --- C6: Cacio e Pepe mit Butter -> forbidden
{
  const r = validateComposite('cacio_e_pepe', {
    ingredients: [
      { name: 'Spaghetti', _catalogKey: 'pasta_dry' },
      { name: 'Pecorino Romano', _catalogKey: 'pecorino' },
      { name: 'Schwarzer Pfeffer', _catalogKey: 'black_pepper' },
      { name: 'Nudelwasser', _catalogKey: 'water' },
      { name: 'Butter', _catalogKey: 'butter' },
    ],
  });
  if (!r.ok) ok('Cacio e Pepe mit Butter -> abgelehnt');
  else bad('Cacio e Pepe mit Butter wurde NICHT abgelehnt');
  const hasForb = r.violations.some(v => v.code === 'composite_forbidden_used' && /butter/.test(v.detail));
  if (hasForb) ok('Violation composite_forbidden_used butter');
  else bad('composite_forbidden_used butter fehlt');
}

// --- C7: Amatriciana + 8 ml Olivenöl -> Warn (Technik-Fett)
{
  const r = validateComposite('amatriciana', {
    ingredients: [
      { name: 'Spaghetti', _catalogKey: 'pasta_dry' },
      { name: 'Guanciale', _catalogKey: 'guanciale' },
      { name: 'Tomaten', _catalogKey: 'tomato' },
      { name: 'Pecorino', _catalogKey: 'pecorino' },
      { name: 'Olivenöl', amount: 8, unit: 'ml', _catalogKey: 'olive_oil' },
    ],
  });
  if (r.ok) ok('Amatriciana + 8ml Olivenöl -> freigegeben');
  else bad('Amatriciana + 8ml Olivenöl abgelehnt');
  const hasDev = r.violations.some(v => v.code === 'technique_fat_deviation');
  if (hasDev) ok('Violation technique_fat_deviation');
  else bad('technique_fat_deviation fehlt');
}

// --- C8: Amatriciana + 25 ml Olivenöl -> ueber Limit
{
  const r = validateComposite('amatriciana', {
    ingredients: [
      { name: 'Spaghetti', _catalogKey: 'pasta_dry' },
      { name: 'Guanciale', _catalogKey: 'guanciale' },
      { name: 'Tomaten', _catalogKey: 'tomato' },
      { name: 'Pecorino', _catalogKey: 'pecorino' },
      { name: 'Olivenöl', amount: 25, unit: 'ml', _catalogKey: 'olive_oil' },
    ],
  });
  if (!r.ok) ok('Amatriciana + 25ml Olivenöl -> abgelehnt');
  else bad('Amatriciana + 25ml Olivenöl NICHT abgelehnt');
  const hasExc = r.violations.some(v => v.code === 'technique_fat_excess');
  if (hasExc) ok('Violation technique_fat_excess');
  else bad('technique_fat_excess fehlt');
}

// --- C9: Amatriciana + 5 g Butter -> forbidden
{
  const r = validateComposite('amatriciana', {
    ingredients: [
      { name: 'Spaghetti', _catalogKey: 'pasta_dry' },
      { name: 'Guanciale', _catalogKey: 'guanciale' },
      { name: 'Tomaten', _catalogKey: 'tomato' },
      { name: 'Pecorino', _catalogKey: 'pecorino' },
      { name: 'Butter', amount: 5, unit: 'g', _catalogKey: 'butter' },
    ],
  });
  if (!r.ok) ok('Amatriciana + 5g Butter -> abgelehnt');
  else bad('Amatriciana + 5g Butter NICHT abgelehnt');
  const hasForb = r.violations.some(v => v.code === 'composite_forbidden_used' && /butter/.test(v.detail));
  if (hasForb) ok('Violation composite_forbidden_used butter');
  else bad('composite_forbidden_used butter fehlt');
}

// --- BRIDGE-Tests: Archetyp + Composite zusammen --------------------

// --- B1: Bolognese klassisch (mit Soffritto, Pancetta, Wein) -> freigegeben
{
  const g = guard.checkQuery('Spaghetti Bolognese', {
    ingredients: [
      { name: 'Spaghetti', _catalogKey: 'pasta_dry' },
      { name: 'Rinderhack', _catalogKey: 'beef_mince' },
      { name: 'Pancetta', _catalogKey: 'pancetta' },
      { name: 'Zwiebel', _catalogKey: 'onion_yellow' },
      { name: 'Karotte', _catalogKey: 'carrot' },
      { name: 'Sellerie', _catalogKey: 'celery' },
      { name: 'Rotwein', _catalogKey: 'red_wine' },
      { name: 'Tomaten (Passata)', _catalogKey: 'tomato_canned' },
      { name: 'Tomatenmark', _catalogKey: 'tomato_paste' },
      { name: 'Brühe', _catalogKey: 'vegetable_broth' },
      { name: 'Salz', _catalogKey: 'salt' },
    ],
  });
  if (g.ok) ok('Bridge: Bolognese klassisch -> freigegeben');
  else bad('Bridge: Bolognese klassisch abgelehnt: ' + JSON.stringify(g.violations.map(v => v.code + ':' + v.detail.slice(0,60))));
  if (g.resolved && g.resolved.compositeId === 'ragu_bolognese') ok('Bridge: compositeId erkannt');
  else bad('Bridge: compositeId falsch');
}

// --- B2: Bolognese mit Soffritto (Karotte/Sellerie) -> KEINE unknown_to_profile
{
  const g = guard.checkQuery('Spaghetti Bolognese', {
    ingredients: [
      { name: 'Spaghetti', _catalogKey: 'pasta_dry' },
      { name: 'Rinderhack', _catalogKey: 'beef_mince' },
      { name: 'Pancetta', _catalogKey: 'pancetta' },
      { name: 'Karotte', _catalogKey: 'carrot' },
      { name: 'Sellerie', _catalogKey: 'celery' },
      { name: 'Rotwein', _catalogKey: 'red_wine' },
      { name: 'Tomaten (Passata)', _catalogKey: 'tomato_canned' },
      { name: 'Tomatenmark', _catalogKey: 'tomato_paste' },
      { name: 'Brühe', _catalogKey: 'vegetable_broth' },
      { name: 'Zwiebel', _catalogKey: 'onion_yellow' },
      { name: 'Salz', _catalogKey: 'salt' },
    ],
  });
  const unknownKarotte = g.violations.some(v => v.code === 'unknown_to_profile' && /karotte/i.test(v.detail));
  const unknownSellerie = g.violations.some(v => v.code === 'unknown_to_profile' && /sellerie/i.test(v.detail));
  if (!unknownKarotte && !unknownSellerie) ok('Bridge: Karotte + Sellerie NICHT als unknown_to_profile');
  else bad('Bridge: Fehlalarm fuer Soffritto: karotte=' + unknownKarotte + ' sellerie=' + unknownSellerie);
}

// --- B3: Bolognese -> KEIN core_protein_dominance (Bridge skipCoreShare)
{
  const g = guard.checkQuery('Spaghetti Bolognese', {
    ingredients: [
      { name: 'Spaghetti', _catalogKey: 'pasta_dry' },
      { name: 'Rinderhack', _catalogKey: 'beef_mince' },
      { name: 'Pancetta', _catalogKey: 'pancetta' },
      { name: 'Karotte', _catalogKey: 'carrot' },
      { name: 'Sellerie', _catalogKey: 'celery' },
      { name: 'Rotwein', _catalogKey: 'red_wine' },
      { name: 'Tomaten (Passata)', _catalogKey: 'tomato_canned' },
      { name: 'Tomatenmark', _catalogKey: 'tomato_paste' },
      { name: 'Brühe', _catalogKey: 'vegetable_broth' },
      { name: 'Zwiebel', _catalogKey: 'onion_yellow' },
      { name: 'Salz', _catalogKey: 'salt' },
    ],
  });
  const hasDom = g.violations.some(v => v.code === 'core_protein_dominance');
  if (!hasDom) ok('Bridge: core_protein_dominance bei Composite uebersprungen');
  else bad('Bridge: core_protein_dominance greift faelschlich');
}

// --- B4: Bolognese ohne Pancetta -> composite_core_missing
{
  const g = guard.checkQuery('Spaghetti Bolognese', {
    ingredients: [
      { name: 'Spaghetti', _catalogKey: 'pasta_dry' },
      { name: 'Rinderhack', _catalogKey: 'beef_mince' },
      { name: 'Zwiebel', _catalogKey: 'onion_yellow' },
      { name: 'Karotte', _catalogKey: 'carrot' },
      { name: 'Sellerie', _catalogKey: 'celery' },
      { name: 'Rotwein', _catalogKey: 'red_wine' },
      { name: 'Tomaten (Passata)', _catalogKey: 'tomato_canned' },
      { name: 'Tomatenmark', _catalogKey: 'tomato_paste' },
      { name: 'Brühe', _catalogKey: 'vegetable_broth' },
      { name: 'Salz', _catalogKey: 'salt' },
    ],
  });
  if (!g.ok) ok('Bridge: Bolognese ohne Pancetta -> abgelehnt');
  else bad('Bridge: Bolognese ohne Pancetta NICHT abgelehnt');
  const hasMissing = g.violations.some(v => v.code === 'composite_core_missing' && /pancetta/i.test(v.detail));
  if (hasMissing) ok('Bridge: composite_core_missing pancetta');
  else bad('Bridge: composite_core_missing pancetta fehlt');
}

// --- B5: Bolognese ohne ai_instruction-Treffer -> kein Composite
{
  const g = guard.checkQuery('Spaghetti mit Tomatensoße', {
    ingredients: [
      { name: 'Spaghetti', _catalogKey: 'pasta_dry' },
      { name: 'Tomaten', _catalogKey: 'tomato' },
      { name: 'Olivenöl', _catalogKey: 'olive_oil' },
      { name: 'Zwiebel', _catalogKey: 'onion_yellow' },
      { name: 'Knoblauch', _catalogKey: 'garlic' },
    ],
  });
  if (g.ok) ok('Bridge: Tomatensoße (kein Composite) -> freigegeben');
  else bad('Bridge: Tomatensoße abgelehnt: ' + JSON.stringify(g.violations));
  if (!g.resolved.compositeId) ok('Bridge: kein compositeId fuer einfache Tomatensoße');
  else bad('Bridge: falscher compositeId: ' + g.resolved.compositeId);
}

// --- AMOUNT-Tests: Mengenbereiche ----------------------------------

// --- M1: Spaghetti deutlich zu viel (250g/Portion, max=150) -> amount_out_of_range
{
  const r = validate('A1_pasta', {
    servings: 1,
    ingredients: [
      { name: 'Spaghetti', amount: 250, unit: 'g', _catalogKey: 'pasta_dry' },
      { name: 'Tomaten', amount: 200, unit: 'g', _catalogKey: 'tomato' },
      { name: 'Olivenöl', amount: 15, unit: 'ml', _catalogKey: 'olive_oil' },
    ],
  });
  const hasRange = r.violations.some(v => v.code === 'amount_out_of_range' && /spaghetti/i.test(v.detail));
  if (hasRange) ok('M1: Spaghetti 250g/Portion -> amount_out_of_range');
  else bad('M1: amount_out_of_range fuer Spaghetti fehlt');
}

// --- M2: Spaghetti im oberen Rand (140g/Portion, max=150) -> ok
{
  const r = validate('A1_pasta', {
    servings: 1,
    ingredients: [
      { name: 'Spaghetti', amount: 140, unit: 'g', _catalogKey: 'pasta_dry' },
      { name: 'Tomaten', amount: 200, unit: 'g', _catalogKey: 'tomato' },
      { name: 'Olivenöl', amount: 15, unit: 'ml', _catalogKey: 'olive_oil' },
    ],
  });
  const hasRange = r.violations.some(v => v.code === 'amount_out_of_range' && /spaghetti/i.test(v.detail));
  if (!hasRange) ok('M2: Spaghetti 140g/Portion -> keine Range-Verletzung');
  else bad('M2: Fehlalarm bei Spaghetti 140g: ' + JSON.stringify(r.violations.filter(v => /spaghetti/i.test(v.detail))));
}

// --- M3: Spaghetti minimal (60g/Portion, min=70) -> amount_near_boundary
{
  const r = validate('A1_pasta', {
    servings: 1,
    ingredients: [
      { name: 'Spaghetti', amount: 55, unit: 'g', _catalogKey: 'pasta_dry' },
      { name: 'Tomaten', amount: 200, unit: 'g', _catalogKey: 'tomato' },
      { name: 'Olivenöl', amount: 15, unit: 'ml', _catalogKey: 'olive_oil' },
    ],
  });
  const hasNear = r.violations.some(v => v.code === 'amount_near_boundary' && /spaghetti/i.test(v.detail));
  if (hasNear) ok('M3: Spaghetti 55g/Portion -> amount_near_boundary');
  else bad('M3: amount_near_boundary fuer Spaghetti fehlt');
}

// --- M4: Cacio e Pepe mit 250g Pecorino (max=120) -> amount_out_of_range
{
  const r = validateComposite('cacio_e_pepe', {
    servings: 1,
    ingredients: [
      { name: 'Spaghetti', amount: 100, unit: 'g', _catalogKey: 'pasta_dry' },
      { name: 'Pecorino Romano', amount: 250, unit: 'g', _catalogKey: 'pecorino' },
      { name: 'Schwarzer Pfeffer', amount: 5, unit: 'g', _catalogKey: 'black_pepper' },
      { name: 'Nudelwasser', amount: 150, unit: 'g', _catalogKey: 'water' },
    ],
  });
  const hasRange = r.violations.some(v => v.code === 'amount_out_of_range' && /pecorino/i.test(v.detail));
  if (hasRange) ok('M4: Pecorino 250g -> amount_out_of_range');
  else bad('M4: amount_out_of_range fuer Pecorino fehlt: ' + JSON.stringify(r.violations));
}

// --- M5: Multi-Portion-Berechnung. 2 Portionen, 280g Spaghetti
//         = 140g/Portion. Im Toleranzband, kein Blocker.
{
  const r = validate('A1_pasta', {
    servings: 2,
    ingredients: [
      { name: 'Spaghetti', amount: 280, unit: 'g', _catalogKey: 'pasta_dry' },
      { name: 'Tomaten', amount: 400, unit: 'g', _catalogKey: 'tomato' },
      { name: 'Olivenöl', amount: 30, unit: 'ml', _catalogKey: 'olive_oil' },
    ],
  });
  const hasRange = r.violations.some(v => v.code === 'amount_out_of_range' && /spaghetti/i.test(v.detail));
  if (!hasRange) ok('M5: Spaghetti 280g fuer 2 Portionen (140g/P) -> ok');
  else bad('M5: Fehlalarm bei 280g/2P');
}

console.log();
console.log('Pass: ' + pass + '  Fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);
