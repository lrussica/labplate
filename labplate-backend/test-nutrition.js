// test-nutrition.js
// Golden-Set fuer Naehrwert-Katalog und Diaet-Labels.
// Aufruf: node test-nutrition.js
'use strict';

const catalog = require('./nutri-catalog');
const dl = require('./diet-labels');

let pass = 0, fail = 0;
const failures = [];

function ok(id, cond, detail) {
  if (cond) { pass++; return; }
  fail++;
  failures.push({ id, detail });
}

function eq(id, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  ok(id, a === e, 'erwartet ' + e + ', bekommen ' + a);
}

console.log('=== KATALOG-LOOKUP ===');
[
  // [id, name, erwarteter key]
  ['L01', 'Tofu (fest)', 'tofu_firm'],
  ['L02', 'Tofu fest', 'tofu_firm'],
  ['L03', 'TOFU', 'tofu_firm'],
  ['L04', 'Olivenöl', 'olive_oil'],
  ['L05', 'Olivenoel', 'olive_oil'],
  ['L06', 'Hähnchenbrust', 'chicken_breast'],
  ['L07', 'Haehnchenbrust', 'chicken_breast'],
  ['L08', 'Süßkartoffel', 'sweet_potato'],
  ['L09', 'Suesskartoffel', 'sweet_potato'],
  ['L10', 'Walnüsse', 'walnuts'],
  ['L11', 'Walnuesse', 'walnuts'],
  ['L12', 'Kokosöl', 'coconut_oil'],
  ['L13', 'Kokosoel', 'coconut_oil'],
  ['L14', 'Kokosmilch (light)', 'coconut_milk_light'],
  ['L15', 'Kokosmilch light', 'coconut_milk_light'],
  ['L16', 'Kokosmilch', 'coconut_milk_full'],
  ['L17', 'Brokkoli (frisch)', 'broccoli'],
  ['L18', 'Paprika (rot)', 'bell_pepper_red'],
  ['L19', 'Paprika rot', 'bell_pepper_red'],
  ['L20', 'Schwarzer Pfeffer', 'black_pepper'],
  ['L21', 'Zwiebel (gelb)', 'onion_yellow'],
  ['L22', 'Knoblauchzehe', 'garlic'],
  ['L23', 'Sesamsamen (geröstet)', 'sesame_seeds'],
  ['L24', 'Rapsöl', 'canola_oil'],
  ['L25', 'Limettensaft', 'lime_juice'],
  ['L26', 'Parmesan', 'parmesan'],
  ['L27', 'Mandelmehl', 'almond_flour'],
  ['L28', 'Frische Korianderblätter', 'coriander_fresh'],
  ['L28b', 'Voellig erfundene Zutat', null],
  ['L28c', 'Sternenstaub', null],
  ['L29', 'Irgendein exotisches Gewuerz', null],
].forEach(function (t) {
  const hit = catalog.lookupCatalog(t[1]);
  const key = hit ? hit.key : null;
  eq(t[0] + ' lookup "' + t[1] + '"', key, t[2]);
});

console.log('=== Tofu-Werte (USDA FDC 172475) ===');
const tofu = catalog.lookupCatalog('Tofu (fest)');
ok('V01 tofu matcht', !!tofu, 'lookup fehlgeschlagen');
if (tofu) {
  const p = tofu.entry.per100g;
  ok('V02 tofu protein ~17.3', Math.abs(p.protein - 17.3) < 0.1, 'protein=' + p.protein);
  ok('V03 tofu fat ~8.7', Math.abs(p.fat - 8.7) < 0.1, 'fat=' + p.fat);
  ok('V04 tofu source nennt 172475', /172475/.test(tofu.entry.source), 'source=' + tofu.entry.source);
}

console.log('=== DIET-LABELS: Schwellen ===');
eq('D01 keto bei 4g KH',
  dl.computeDietLabels({ protein_g: 15, netto_kh_g: 4 }, []),
  ['keto']);
eq('D02 kein keto bei 12g KH',
  dl.computeDietLabels({ protein_g: 15, netto_kh_g: 12 }, []),
  []);
eq('D03 keto exakt bei 9.9g',
  dl.computeDietLabels({ protein_g: 15, netto_kh_g: 9.9 }, []),
  ['keto']);
eq('D04 kein keto bei exakt 10g',
  dl.computeDietLabels({ protein_g: 15, netto_kh_g: 10 }, []),
  []);
eq('D05 high_protein ab 25g',
  dl.computeDietLabels({ protein_g: 25, netto_kh_g: 50 }, []),
  ['high_protein']);
eq('D06 kein high_protein bei 24.9g',
  dl.computeDietLabels({ protein_g: 24.9, netto_kh_g: 50 }, []),
  []);
eq('D07 kein high_protein bei 19.6g (heutiger Bug',
  dl.computeDietLabels({ protein_g: 19.6, netto_kh_g: 6.2 }, [
    { name: 'Tofu (fest)' }, { name: 'Brokkoli' }
  ]),
  ['keto', 'vegan', 'vegetarisch']);

console.log('=== DIET-LABELS: Zutaten-Klassifikation ===');
eq('C01 Hähnchen ist nicht vegetarisch',
  dl.computeDietLabels({ protein_g: 30, netto_kh_g: 5 }, [{ name: 'Hähnchenbrust' }]),
  ['keto', 'high_protein']);
eq('C02 Haehnchen (ohne Umlaut)',
  dl.computeDietLabels({ protein_g: 30, netto_kh_g: 5 }, [{ name: 'Haehnchenbrust' }]),
  ['keto', 'high_protein']);
eq('C03 Rind ist nicht vegetarisch',
  dl.computeDietLabels({ protein_g: 25, netto_kh_g: 5 }, [{ name: 'Rinderhackfleisch' }]),
  ['keto', 'high_protein']);
eq('C04 Lachs ist nicht vegetarisch',
  dl.computeDietLabels({ protein_g: 40, netto_kh_g: 3 }, [{ name: 'Lachs' }]),
  ['keto', 'high_protein']);
eq('C05 Ei ist nicht vegan aber vegetarisch',
  dl.computeDietLabels({ protein_g: 25, netto_kh_g: 5 }, [{ name: 'Ei (Größe M)' }]),
  ['keto', 'high_protein', 'vegetarisch']);
eq('C06 Butter ist nicht vegan aber vegetarisch',
  dl.computeDietLabels({ protein_g: 15, netto_kh_g: 5 }, [{ name: 'Butter' }]),
  ['keto', 'vegetarisch']);
eq('C07 Kokosmilch ist vegan (pflanzlich)',
  dl.computeDietLabels({ protein_g: 15, netto_kh_g: 5 }, [{ name: 'Kokosmilch' }]),
  ['keto', 'vegan', 'vegetarisch']);
eq('C08 Kokosöl ist vegan',
  dl.computeDietLabels({ protein_g: 15, netto_kh_g: 5 }, [{ name: 'Kokosöl' }]),
  ['keto', 'vegan', 'vegetarisch']);
eq('C09 Erdnussbutter ist nicht Milch',
  dl.computeDietLabels({ protein_g: 26, netto_kh_g: 6 }, [
    { name: 'Erdnussbutter' }, { name: 'Ei (Größe M)' }, { name: 'Butter' }
  ]),
  ['keto', 'high_protein', 'vegetarisch']);
eq('C10 Mandelmilch ist nicht Milch',
  dl.computeDietLabels({ protein_g: 20, netto_kh_g: 5 }, [{ name: 'Mandelmilch' }]),
  ['keto', 'vegan', 'vegetarisch']);
eq('C11 Parmesan ist nicht vegan',
  dl.computeDietLabels({ protein_g: 30, netto_kh_g: 3 }, [{ name: 'Parmesan' }]),
  ['keto', 'high_protein', 'vegetarisch']);
eq('C12 leere Zutaten = keine Diaet-Aussage',
  dl.computeDietLabels({ protein_g: 15, netto_kh_g: 5 }, []),
  ['keto']);

console.log('=== DISPLAY-FIXES: Katalog-Zutaten unangetastet ===');
(function () {
  const fx = require('./recipe-display-fixes');
  const cat = require('./nutri-catalog');
  const cases = [
    ['F01 Kuerbiskerne bleiben USDA',
      [{ name: 'Kürbiskerne', amount: 10, unit: 'g', macrosPer100g: { protein: 5, fat: 5, netCarbs: 5, fiber: 1 } }],
      'pumpkin_seeds', { protein: 30.2, fat: 49, netCarbs: 4.7, fiber: 6 }],
    ['F02 Walnuesse bleiben USDA',
      [{ name: 'Walnüsse', amount: 15, unit: 'g', macrosPer100g: { protein: 4, fat: 4, netCarbs: 4, fiber: 4 } }],
      'walnuts', { protein: 15.2, fat: 65.2, netCarbs: 7, fiber: 6.7 }],
    ['F03 Mandeln bleiben USDA',
      [{ name: 'Mandeln', amount: 20, unit: 'g', macrosPer100g: { protein: 5, fat: 5, netCarbs: 5, fiber: 5 } }],
      'almonds', { protein: 21.2, fat: 49.9, netCarbs: 9.1, fiber: 12.5 }],
    ['F04 Sesam bleibt USDA',
      [{ name: 'Sesamsamen', amount: 10, unit: 'g', macrosPer100g: { protein: 5, fat: 5, netCarbs: 5, fiber: 5 } }],
      'sesame_seeds', { protein: 17.7, fat: 49.7, netCarbs: 11.6, fiber: 11.8 }],
  ];
  cases.forEach(function (t) {
    const id = t[0], ings = t[1], key = t[2], expected = t[3];
    cat.applyCatalogOverride(ings);
    const recipe = { ingredients: ings, finalIngredients: ings };
    fx.applyRecipeDisplayFixes(recipe, { lang: 'de' });
    const m = ings[0].macrosPer100g;
    ok(id + ' key=' + key, ings[0]._catalogKey === key, '_catalogKey fehlt');
    ok(id + ' protein', Math.abs(m.protein - expected.protein) < 0.1,
      'protein=' + m.protein + ' erwartet ' + expected.protein);
    ok(id + ' fat', Math.abs(m.fat - expected.fat) < 0.1,
      'fat=' + m.fat + ' erwartet ' + expected.fat);
    ok(id + ' netCarbs', Math.abs(m.netCarbs - expected.netCarbs) < 0.1,
      'netCarbs=' + m.netCarbs + ' erwartet ' + expected.netCarbs);
  });
  // Negativ-Test: unbekannte Nuss wird weiterhin geklemmt
  const unknown = [{ name: 'Unbekannte-Nuss-XYZ', amount: 10, unit: 'g', macrosPer100g: { protein: 5, fat: 60, netCarbs: 5, fiber: 1 } }];
  fx.applyRecipeDisplayFixes({ ingredients: unknown, finalIngredients: unknown }, { lang: 'de' });
  ok('F05 unbekannte Nuss wird geklemmt', unknown[0].macrosPer100g.fat <= 45,
    'fat=' + unknown[0].macrosPer100g.fat + ' sollte <= 45 sein');
})();

console.log('=== KOCHWASSER: errorsToDirectives ===');
(function () {
  const pipeline = require('./recipe-pipeline-v92');
  const { errorsToDirectives } = pipeline;
  if (typeof errorsToDirectives !== 'function') {
    ok('K00 exports errorsToDirectives', false, 'Funktion fehlt');
    return;
  }
  ok('K00 exports errorsToDirectives', true, '');
  const errs1 = ["Step 5 ('Reis kochen'): enthält eine freie Mengen-Zahl im content-Text statt eines {ingredient_id}-Platzhalters: 'Den Reis mit 700 ml Wasser'"];
  const d1 = errorsToDirectives(errs1, {});
  const joined1 = d1.join(' ');
  ok('K01 Kochwasser-Directive ausgeloest', d1.length >= 1, 'keine Directive: ' + JSON.stringify(d1));
  ok('K02 erwaehnt eigene Zutat in ingredients', /ingredients\[\]/i.test(joined1), 'fehlt Hinweis ingredients[]: ' + joined1);
  ok('K03 erwaehnt Platzhalter-Format', /\{0013\}|Platzhalter/.test(joined1), 'fehlt Platzhalter-Hinweis: ' + joined1);
  ok('K04 verbietet freie Zahl explizit', /700 ml|freie|VERBOTEN/i.test(joined1), 'fehlt Verbot: ' + joined1);

  const errs2 = ["Step 3 ('Wasser erhitzen'): Wasser ohne passende Aktion"];
  const d2 = errorsToDirectives(errs2, {});
  ok('K05 Wasser-Directive weiterhin aktiv', d2.length >= 1, 'water-Action fehlt');
})();

console.log('=== GARNITUR: isExemptUsage ===');
(function () {
  const cu = require('./culinary-usability');
  const cases = [
    ['G01 Koriander (Garnitur)', 'Frischer Koriander (Garnitur)', 'other', true],
    ['G02 Petersilie zum Garnieren', 'Petersilie, zum Garnieren', 'vegetable', true],
    ['G03 Sesam als Topping', 'Sesam (als Topping)', 'other', true],
    ['G04 Koriander ohne Marker wird geprueft', 'Frischer Koriander', 'other', false],
  ];
  cases.forEach(function (t) {
    const ing = { name: t[1], role: t[2], culinaryRole: t[2], unit: 'g', amount: 10 };
    const rec = { ingredients: [ing], finalIngredients: [ing], steps: [], garnish: '' };
    const res = cu.validateIngredientUsage(rec);
    const hasErr = (res.errors || []).some(function (e) {
      return /is not used in a preparation step/.test(e);
    });
    const istExempt = (hasErr === false);
    ok(t[0], istExempt === t[3],
      'erwartet ' + (t[3] ? 'EXEMPT' : 'GEPRUEFT') + ', bekommen ' + (istExempt ? 'EXEMPT' : 'GEPRUEFT'));
  });
})();

console.log('=== PLAUSIBILITAET: kulinarische Warnungen ===');
(function () {
  const p = require('./plausibility-checks');
  // Pro Fall: [Name, Zutaten, Titel, Muster, erwartet].
  // Muster = null bedeutet: gar keine Warnung erlaubt.
  // Der regelspezifische Muster-Filter verhindert, dass neue Regeln
  // (z.B. P5) einen Test kippen, der eigentlich nur R1 prueft.
  const cases = [
    ['P01 drei Fette warnen',
      [{ name: 'Olivenöl' }, { name: 'Butter' }, { name: 'Kokosöl' }, { name: 'Kartoffel' }],
      'Bratkartoffeln', /verschiedene Fette gleichzeitig/, true],
    ['P02 zwei Fette ok (keine R1-Warnung)',
      [{ name: 'Olivenöl' }, { name: 'Butter' }, { name: 'Kartoffel' }],
      'Bratkartoffeln', /verschiedene Fette gleichzeitig/, false],
    ['P03 Ballaststoff-Overload',
      [{ name: 'Chiasamen' }, { name: 'Leinsamen' }, { name: 'Psyllium' }, { name: 'Haferflocken' }],
      'Brei', /starke Ballaststoff-Traeger/, true],
    ['P04 Psyllium in Haehnchen',
      [{ name: 'Hähnchenbrust' }, { name: 'Reis' }, { name: 'Psyllium' }],
      'Hähnchen mit Reis', /Psyllium\/Flohsamen/, true],
    ['P05 Essig in Tofu-Curry',
      [{ name: 'Tofu' }, { name: 'Kokosmilch' }, { name: 'Essig' }, { name: 'Currypaste' }],
      'Tofu-Curry', /Essig in einem Tofu/, true],
    ['P06 sauberes Rezept',
      [{ name: 'Hähnchenbrust' }, { name: 'Brokkoli' }, { name: 'Olivenöl' }, { name: 'Reis' }],
      'Hähnchen mit Brokkoli', null, false],
  ];
  cases.forEach(function (t) {
    const rec = { title: t[2], ingredients: t[1], finalIngredients: t[1] };
    const r = p.evaluateAll(rec);
    let hit;
    if (t[3] === null) {
      hit = r.warnings.length > 0;
    } else {
      hit = (r.warnings || []).some(function (w) { return t[3].test(w); });
    }
    ok(t[0], hit === t[4], 'erwartet Warnung=' + t[4] + ', bekommen=' + hit + ' | warnings=' + JSON.stringify(r.warnings));
    ok(t[0] + ' keine Errors', r.errors.length === 0, 'Errors: ' + JSON.stringify(r.errors));
  });
})();

console.log('=== PLAUSIBILITAET: P1 Maillard vor Schmoren ===');
(function () {
  const p = require('./plausibility-checks');
  const cases = [
    ['P07 Gulasch ohne Anbraten -> Warnung', {
      title: 'Rindergulasch',
      ingredients: [{ name: 'Rindfleisch (Schulter)' }, { name: 'Zwiebel' }, { name: 'Rinderbrühe' }],
      steps: [
        'Das Rindfleisch in Wuerfel schneiden.',
        'Mit Rinderbruehe aufgiessen und zwei Stunden schmoren.'
      ],
    }, true],
    ['P08 Gulasch mit Anbraten -> keine Warnung', {
      title: 'Rindergulasch',
      ingredients: [{ name: 'Rindfleisch (Schulter)' }, { name: 'Zwiebel' }, { name: 'Rinderbrühe' }],
      steps: [
        'Das Rindfleisch kraeftig anbraten, bis es braun ist.',
        'Mit Rinderbruehe abloeschen und zwei Stunden schmoren.'
      ],
    }, false],
    ['P09 vegetarisch -> keine Warnung', {
      title: 'Kuerbissuppe',
      ingredients: [{ name: 'Kürbis' }, { name: 'Gemüsebrühe' }],
      steps: ['Den Kuerbis in Gemuesebruehe koecheln lassen.'],
    }, false],
    ['P10 ohne Fluessigkeit -> keine Warnung', {
      title: 'Rindersteak',
      ingredients: [{ name: 'Rindersteak' }, { name: 'Butter' }],
      steps: [
        'Das Steak scharf anbraten.',
        'Kurz ruhen lassen und servieren.'
      ],
    }, false],
  ];
  cases.forEach(function (t) {
    const rec = {
      title: t[1].title,
      ingredients: t[1].ingredients,
      finalIngredients: t[1].ingredients,
      steps: t[1].steps,
    };
    const r = p.evaluateAll(rec);
    const maillard = (r.warnings || []).filter(function (w) { return /Maillard/i.test(w); });
    const hit = maillard.length > 0;
    ok(t[0], hit === t[2], 'erwartet Warnung=' + t[2] + ', bekommen=' + hit + ' | warnings=' + JSON.stringify(r.warnings));
    ok(t[0] + ' keine Errors', r.errors.length === 0, 'Errors: ' + JSON.stringify(r.errors));
  });

  // P21 (Fix 2026-10-08): Reines Kochwasser (Topf/Kochen) darf NICHT als
  // Schmor-Fluessigkeit zaehlen. Steak wird angebrieten, kein P1-Fehler.
  const p21 = p.evaluateAll({
    title: 'Rumpsteak mit Kartoffeln',
    ingredients: [{ name: 'Rumpsteak' }, { name: 'Wasser' }, { name: 'Olivenoel' }, { name: 'Butter' }],
    finalIngredients: [{ name: 'Rumpsteak' }, { name: 'Wasser' }, { name: 'Olivenoel' }, { name: 'Butter' }],
    steps: [
      'Das Wasser in einem Topf zum Kochen bringen.',
      'Kartoffeln ins kochende Wasser geben und 15 Minuten kochen.',
      'Das Rumpsteak in Olivenoel und Butter scharf anbraten.',
      'Sofort servieren.'
    ],
  });
  const p21P1 = (p21.warnings || []).filter(function (w) { return /Maillard/i.test(w); });
  ok('P21 Kochwasser zaehlt nicht als Schmor-Fluessigkeit (kein Maillard-Fehler)',
    p21P1.length === 0, 'got: ' + JSON.stringify(p21P1));
})();

console.log('=== PLAUSIBILITAET: P5 Saeure-Korrektur ===');
(function () {
  const p = require('./plausibility-checks');
  const cases = [
    ['P11 zwei Fette ohne Saeure -> Warnung', {
      title: 'Bratkartoffeln',
      ingredients: [{ name: 'Olivenöl' }, { name: 'Butter' }, { name: 'Kartoffel' }],
    }, true],
    ['P12 zwei Fette + Zitronensaft -> keine Warnung', {
      title: 'Bratkartoffeln',
      ingredients: [{ name: 'Olivenöl' }, { name: 'Butter' }, { name: 'Zitronensaft' }, { name: 'Kartoffel' }],
    }, false],
    ['P13 zwei Fette + Mayonnaise -> keine Warnung', {
      title: 'Kartoffelsalat',
      ingredients: [{ name: 'Olivenöl' }, { name: 'Butter' }, { name: 'Mayonnaise' }, { name: 'Kartoffel' }],
    }, false],
    ['P14 Dessert (Titel) mit zwei Fetten ohne Saeure -> keine Warnung', {
      title: 'Schokoladenmousse',
      ingredients: [{ name: 'Butter' }, { name: 'Kokosöl' }, { name: 'Schokolade' }],
    }, false],
  ];
  cases.forEach(function (t) {
    const rec = {
      title: t[1].title,
      ingredients: t[1].ingredients,
      finalIngredients: t[1].ingredients,
      steps: ['Zubereiten und servieren.'],
    };
    const r = p.evaluateAll(rec);
    const acid = (r.warnings || []).filter(function (w) { return /Saeure-Korrektur/i.test(w); });
    const hit = acid.length > 0;
    ok(t[0], hit === t[2], 'erwartet Warnung=' + t[2] + ', bekommen=' + hit + ' | warnings=' + JSON.stringify(r.warnings));
  });
})();

console.log('=== SEASONING-TO-TASTE (nach Geschmack bei amount=0) ===');
(function () {
  const s = require('./seasoning-to-taste');
  const salzPfeffer = [
    { name: 'Salz', amount: 0, unit: 'prise' },
    { name: 'Schwarzer Pfeffer', amount: 0, unit: 'prise' },
  ];
  const salzMitMenge = [{ name: 'Salz', amount: 5, unit: 'g' }];

  // T1: klassischer Fall - abschmecken am Satzende
  const t1in = 'Mit Salz und Pfeffer abschmecken.';
  const t1out = s.ensureToTaste(t1in, salzPfeffer);
  ok('T1 nach Geschmack ergaenzt',
    t1out === 'Mit Salz und Pfeffer nach Geschmack abschmecken.',
    'got: ' + t1out);

  // T2: mitten im Satz - wuerzen
  const t2in = 'Das Haehnchen mit Salz und Pfeffer wuerzen und braten.';
  const t2out = s.ensureToTaste(t2in, salzPfeffer);
  ok('T2 nach Geschmack eingefuegt',
    t2out === 'Das Haehnchen mit Salz und Pfeffer nach Geschmack wuerzen und braten.',
    'got: ' + t2out);

  // T3: idempotent - "nach Geschmack" schon da
  const t3in = 'Mit Salz und Pfeffer nach Geschmack abschmecken.';
  const t3out = s.ensureToTaste(t3in, salzPfeffer);
  ok('T3 idempotent', t3out === t3in, 'got: ' + t3out);

  // T4: Salz mit konkreter Menge -> keine Aenderung
  const t4in = 'Mit Salz abschmecken.';
  const t4out = s.ensureToTaste(t4in, salzMitMenge);
  ok('T4 konkrete Menge unangetastet', t4out === t4in, 'got: ' + t4out);

  // T5: kein Gewuerz im Step -> keine Aenderung
  const t5in = 'Das Olivenoel erhitzen und die Kartoffeln anbraten.';
  const t5out = s.ensureToTaste(t5in, salzPfeffer);
  ok('T5 kein Gewuerz im Step', t5out === t5in, 'got: ' + t5out);

  // T6: "nach Belieben" schon vorhanden -> idempotent
  const t6in = 'Mit Salz und Pfeffer nach Belieben abschmecken.';
  const t6out = s.ensureToTaste(t6in, salzPfeffer);
  ok('T6 nach Belieben idempotent', t6out === t6in, 'got: ' + t6out);
})();

console.log('=== GROQ-TRANSIENT-RETRY ===');
(function () {
  const core = require('./nutri-recipe-core');
  ok('T-G1 empty_response retryable', core.shouldTransientRetry({ error: 'empty_response' }) === true);
  ok('T-G2 json_parse_failed retryable', core.shouldTransientRetry({ error: 'json_parse_failed' }) === true);
  ok('T-G3 provider_error nicht retryable',
    core.shouldTransientRetry({ error: 'provider_error', status: 500 }) === false);
  ok('T-G4 Erfolg nicht retryable', core.shouldTransientRetry({ data: {} }) === false);
  ok('T-G5 null nicht retryable', core.shouldTransientRetry(null) === false);
})();

console.log('=== CHEF-ANALYSIS-REPAIR (freie Naehrwertzahlen) ===');
(function () {
  const v = require('./recipe-validator');
  const fix = v.repairChefAnalysisPlaceholderMisuse;

  // T-C1: freie Makro-Zahl ohne Platzhalter -> qualitativ
  const a = 'Das {0001} liefert die zentrale Proteinbasis, die das Ziel von 40 g Protein deckt.';
  const aOut = fix(a);
  ok('T-C1 40 g Protein qualitativ', !/\d+\s*g\s*Protein/i.test(aOut) && /reichlich Protein/i.test(aOut), 'got: ' + aOut);

  // T-C2: freie kcal-Zahl -> qualitativ
  const b = 'Zusammen ergeben die Zutaten rund 600 kcal pro Portion.';
  const bOut = fix(b);
  ok('T-C2 600 kcal qualitativ', !/\d+\s*kcal/i.test(bOut) && /passende Energiemenge/i.test(bOut), 'got: ' + bOut);

  // T-C3: Platzhalter-Variante bleibt funktional (Regression)
  const c = 'Das {0001} liefert 30 g Protein.';
  const cOut = fix(c);
  ok('T-C3 Platzhalter+Zahl weiterhin repariert', !/\d+\s*g\s*Protein/i.test(cOut), 'got: ' + cOut);

  // T-C4: saubere Analyse bleibt unveraendert
  const d = 'Das {0001} liefert reichlich Protein und passt zum Gericht.';
  const dOut = fix(d);
  ok('T-C4 sauberer Text unveraendert', dOut === d, 'got: ' + dOut);
})();

console.log('=== PLAUSIBILITAET: P2 Riposo della Carne ===');
(function () {
  const p = require('./plausibility-checks');
  function hasRiposo(r) {
    return (r.warnings || []).some(function (w) { return /Riposo/i.test(w); });
  }

  // P15: Steak ohne Ruheschritt -> Warnung
  const p15 = p.evaluateAll({
    title: 'Rumpsteak mit Butter',
    ingredients: [{ name: 'Rumpsteak' }, { name: 'Butter' }],
    finalIngredients: [{ name: 'Rumpsteak' }, { name: 'Butter' }],
    steps: [
      'Das Rumpsteak scharf anbraten und sofort servieren.',
      'Mit der Butter ueberziehen.'
    ],
  });
  ok('P15 Steak ohne Ruhen -> Warnung', hasRiposo(p15), 'got: ' + JSON.stringify(p15.warnings));

  // P16: Steak mit Ruhen -> keine Warnung
  const p16 = p.evaluateAll({
    title: 'Rumpsteak mit Butter',
    ingredients: [{ name: 'Rumpsteak' }, { name: 'Butter' }],
    finalIngredients: [{ name: 'Rumpsteak' }, { name: 'Butter' }],
    steps: [
      'Das Rumpsteak scharf anbraten.',
      'Fuenf Minuten ruhen lassen und dann servieren.'
    ],
  });
  ok('P16 Steak mit Ruhen -> keine Warnung', !hasRiposo(p16), 'got: ' + JSON.stringify(p16.warnings));

  // P17: Hackfleisch -> kein Riposo noetig
  const p17 = p.evaluateAll({
    title: 'Rinderhackpfanne',
    ingredients: [{ name: 'Rinderhackfleisch' }, { name: 'Zwiebel' }],
    finalIngredients: [{ name: 'Rinderhackfleisch' }, { name: 'Zwiebel' }],
    steps: [
      'Das Hackfleisch scharf anbraten.',
      'Zwiebeln zugeben und fertig garen.'
    ],
  });
  ok('P17 Hackfleisch -> keine Warnung', !hasRiposo(p17), 'got: ' + JSON.stringify(p17.warnings));

  // P18: Gulasch (geschmort) -> kein Riposo noetig
  const p18 = p.evaluateAll({
    title: 'Rindergulasch',
    ingredients: [{ name: 'Rindfleisch' }, { name: 'Zwiebel' }, { name: 'Rinderbrühe' }],
    finalIngredients: [{ name: 'Rindfleisch' }, { name: 'Zwiebel' }, { name: 'Rinderbrühe' }],
    steps: [
      'Das Rindfleisch kraeftig anbraten.',
      'Mit Bruehe aufgiessen und zwei Stunden schmoren.'
    ],
  });
  ok('P18 Gulasch (geschmort) -> keine Warnung', !hasRiposo(p18), 'got: ' + JSON.stringify(p18.warnings));

  // P19: Negation 'ohne Ruhen' darf NICHT als Ruheschritt zaehlen.
  const p19 = p.evaluateAll({
    title: 'Rumpsteak mit Butter',
    ingredients: [{ name: 'Rumpsteak' }, { name: 'Butter' }],
    finalIngredients: [{ name: 'Rumpsteak' }, { name: 'Butter' }],
    steps: [
      'Das Rumpsteak scharf anbraten.',
      'Das Steak anrichten und ohne Ruhen servieren.'
    ],
  });
  ok('P19 ohne Ruhen -> Warnung', hasRiposo(p19), 'got: ' + JSON.stringify(p19.warnings));

  // P20: Titel "scharf", aber Brat-Step fehlt – Titel-Fallback greift.
  const p20 = p.evaluateAll({
    title: 'Scharfes Rumpsteak mit Kartoffeln',
    ingredients: [{ name: 'Rumpsteak' }, { name: 'Butter' }],
    finalIngredients: [{ name: 'Rumpsteak' }, { name: 'Butter' }],
    steps: [
      'Die Pfanne erhitzen.',
      'Das Rumpsteak wuerzen und in die Pfanne geben.',
      'Sofort servieren.'
    ],
  });
  ok('P20 Titel scharf, kein Brat-Step -> Warnung', hasRiposo(p20), 'got: ' + JSON.stringify(p20.warnings));
})();

console.log('=== ESSIG/SENF/SAUCE NICHT BLOCKEND ===');
(function () {
  const cu = require('./culinary-usability');
  const recipe = {
    title: 'Steak mit Essig-Dressing',
    ingredients: [
      { name: 'Rumpsteak', amount: 200, unit: 'g' },
      { name: 'Essig', amount: 0, unit: 'prise' },
      { name: 'Dijon-Senf', amount: 5, unit: 'g' },
      { name: 'Zitronensaft', amount: 10, unit: 'ml' },
    ],
    finalIngredients: [
      { name: 'Rumpsteak', amount: 200, unit: 'g' },
      { name: 'Essig', amount: 0, unit: 'prise' },
      { name: 'Dijon-Senf', amount: 5, unit: 'g' },
      { name: 'Zitronensaft', amount: 10, unit: 'ml' },
    ],
    steps: ['Das Steak anbraten.'],
  };
  const r = cu.evaluateCulinaryUsability(recipe);
  const errBlob = JSON.stringify(r.errors || []).toLowerCase();
  ok('P22 Essig blockt nicht', errBlob.indexOf('essig') < 0, 'got errors: ' + JSON.stringify(r.errors));
  ok('P22 Dijon-Senf blockt nicht', errBlob.indexOf('senf') < 0, 'got errors: ' + JSON.stringify(r.errors));
  ok('P22 Zitronensaft blockt nicht', errBlob.indexOf('zitronensaft') < 0, 'got errors: ' + JSON.stringify(r.errors));
})();

console.log('=== PLAUSIBILITAET: P4 Deglassatura ===');
(function () {
  const p = require('./plausibility-checks');
  function hasDegl(r) {
    return (r.warnings || []).some(function (w) { return /Deglassatura/i.test(w); });
  }

  // P23: Gulasch mit Anbraten + Koecheln, kein Loeschen -> Warnung
  const p23 = p.evaluateAll({
    title: 'Rindergulasch',
    ingredients: [{ name: 'Rindfleisch' }, { name: 'Zwiebel' }],
    finalIngredients: [{ name: 'Rindfleisch' }, { name: 'Zwiebel' }],
    steps: [
      'Das Rindfleisch scharf anbraten.',
      'Zwiebeln zugeben und 60 Minuten koecheln lassen.'
    ],
  });
  ok('P23 Gulasch ohne Abloeschen -> Warnung', hasDegl(p23), 'got: ' + JSON.stringify(p23.warnings));

  // P24: Gulasch mit Abloeschen -> keine Warnung
  const p24 = p.evaluateAll({
    title: 'Rindergulasch',
    ingredients: [{ name: 'Rindfleisch' }, { name: 'Zwiebel' }, { name: 'Rotwein' }],
    finalIngredients: [{ name: 'Rindfleisch' }, { name: 'Zwiebel' }, { name: 'Rotwein' }],
    steps: [
      'Das Rindfleisch scharf anbraten.',
      'Mit Rotwein abloeschen und 60 Minuten koecheln lassen.'
    ],
  });
  ok('P24 Gulasch mit Abloeschen -> keine Warnung', !hasDegl(p24), 'got: ' + JSON.stringify(p24.warnings));

  // P25: Steak anbraten + servieren -> keine Warnung (kein Saucen-Kontext)
  const p25 = p.evaluateAll({
    title: 'Rumpsteak',
    ingredients: [{ name: 'Rumpsteak' }, { name: 'Butter' }],
    finalIngredients: [{ name: 'Rumpsteak' }, { name: 'Butter' }],
    steps: [
      'Das Rumpsteak scharf anbraten.',
      'Fuenf Minuten ruhen lassen und servieren.'
    ],
  });
  ok('P25 Steak ohne Saucen-Kontext -> keine Warnung', !hasDegl(p25), 'got: ' + JSON.stringify(p25.warnings));

  // P26: Gulasch mit Abloeschen im selben Step wie Anbraten -> keine Warnung
  const p26 = p.evaluateAll({
    title: 'Rindergulasch',
    ingredients: [{ name: 'Rindfleisch' }, { name: 'Rinderbruehe' }],
    finalIngredients: [{ name: 'Rindfleisch' }, { name: 'Rinderbruehe' }],
    steps: [
      'Rindfleisch scharf anbraten und mit Rinderbruehe abloeschen.',
      'Eine Stunde koecheln lassen.'
    ],
  });
  ok('P26 Abloeschen im selben Step -> keine Warnung', !hasDegl(p26), 'got: ' + JSON.stringify(p26.warnings));
})();

console.log('=== PLAUSIBILITAET: P9 Emulsion ===');
(function () {
  const p = require('./plausibility-checks');
  function hasEmul(r) {
    return (r.warnings || []).some(function (w) { return /Emulsion ohne Bindemittel|Vinaigrette ohne Senf/i.test(w); });
  }

  // P27: Aioli ohne Ei -> Warnung
  const p27 = p.evaluateAll({
    title: 'Aioli',
    ingredients: [{ name: 'Olivenoel' }, { name: 'Knoblauch' }],
    finalIngredients: [{ name: 'Olivenoel' }, { name: 'Knoblauch' }],
    steps: ['Knoblauch mit Olivenoel verruehren.'],
  });
  ok('P27 Aioli ohne Ei -> Warnung', hasEmul(p27), 'got: ' + JSON.stringify(p27.warnings));

  // P28: Aioli mit Ei -> keine Warnung
  const p28 = p.evaluateAll({
    title: 'Aioli',
    ingredients: [{ name: 'Olivenoel' }, { name: 'Eigelb' }, { name: 'Knoblauch' }],
    finalIngredients: [{ name: 'Olivenoel' }, { name: 'Eigelb' }, { name: 'Knoblauch' }],
    steps: ['Eigelb mit Olivenoel emulgieren.'],
  });
  ok('P28 Aioli mit Ei -> keine Warnung', !hasEmul(p28), 'got: ' + JSON.stringify(p28.warnings));

  // P29: Vinaigrette ohne Senf -> Warnung
  const p29 = p.evaluateAll({
    title: 'Vinaigrette',
    ingredients: [{ name: 'Olivenoel' }, { name: 'Weisswein Essig' }, { name: 'Salz' }],
    finalIngredients: [{ name: 'Olivenoel' }, { name: 'Weisswein Essig' }, { name: 'Salz' }],
    steps: ['Alles verruehren.'],
  });
  ok('P29 Vinaigrette ohne Senf -> Warnung', hasEmul(p29), 'got: ' + JSON.stringify(p29.warnings));

  // P30: Vinaigrette mit Senf -> keine Warnung
  const p30 = p.evaluateAll({
    title: 'Vinaigrette',
    ingredients: [{ name: 'Olivenoel' }, { name: 'Weisswein Essig' }, { name: 'Dijon Senf' }],
    finalIngredients: [{ name: 'Olivenoel' }, { name: 'Weisswein Essig' }, { name: 'Dijon Senf' }],
    steps: ['Alles verruehren.'],
  });
  ok('P30 Vinaigrette mit Senf -> keine Warnung', !hasEmul(p30), 'got: ' + JSON.stringify(p30.warnings));

  // P31: generische Emulsion ohne Bindemittel -> Warnung
  const p31 = p.evaluateAll({
    title: 'Sauce',
    ingredients: [{ name: 'Butter' }, { name: 'Wasser' }],
    finalIngredients: [{ name: 'Butter' }, { name: 'Wasser' }],
    steps: ['Butter und Wasser kräftig verruehren.'],
  });
  ok('P31 Fett+Wasser verruehrt ohne Emulgator -> Warnung', hasEmul(p31), 'got: ' + JSON.stringify(p31.warnings));
})();

console.log('=== PLAUSIBILITAET: P6 Umami-Anker ===');
(function () {
  const p = require('./plausibility-checks');
  function hasUmami(r) {
    return (r.warnings || []).some(function (w) { return /Umami-Anker fehlt/i.test(w); });
  }

  // P32: Gemuese-Curry ohne Umami-Traeger -> Warnung
  const p32 = p.evaluateAll({
    title: 'Gemuese-Curry',
    dishCategory: 'main_vegetarian',
    ingredients: [{ name: 'Blumenkohl' }, { name: 'Kokosmilch' }, { name: 'Kartoffel' }],
    finalIngredients: [{ name: 'Blumenkohl' }, { name: 'Kokosmilch' }, { name: 'Kartoffel' }],
    steps: ['Alles koecheln lassen.'],
  });
  ok('P32 Gemuese-Curry ohne Umami -> Warnung', hasUmami(p32), 'got: ' + JSON.stringify(p32.warnings));

  // P33: Gemuese-Curry mit Tomatenmark -> keine Warnung
  const p33 = p.evaluateAll({
    title: 'Gemuese-Curry',
    dishCategory: 'main_vegetarian',
    ingredients: [{ name: 'Blumenkohl' }, { name: 'Kokosmilch' }, { name: 'Tomatenmark' }],
    finalIngredients: [{ name: 'Blumenkohl' }, { name: 'Kokosmilch' }, { name: 'Tomatenmark' }],
    steps: ['Alles koecheln lassen.'],
  });
  ok('P33 Gemuese-Curry mit Tomatenmark -> keine Warnung', !hasUmami(p33), 'got: ' + JSON.stringify(p33.warnings));

  // P34: Fleischgericht -> keine Warnung (Fleisch ist Umami)
  const p34 = p.evaluateAll({
    title: 'Rindergulasch',
    dishCategory: 'main_meat',
    ingredients: [{ name: 'Rindfleisch' }, { name: 'Zwiebel' }, { name: 'Rinderbruehe' }],
    finalIngredients: [{ name: 'Rindfleisch' }, { name: 'Zwiebel' }, { name: 'Rinderbruehe' }],
    steps: ['Schmoren lassen.'],
  });
  ok('P34 Fleischgericht -> keine Warnung', !hasUmami(p34), 'got: ' + JSON.stringify(p34.warnings));

  // P35: Gurkensalat -> keine Warnung (Kategorie salad)
  const p35 = p.evaluateAll({
    title: 'Gurkensalat mit Dill',
    dishCategory: 'salad',
    ingredients: [{ name: 'Gurke' }, { name: 'Dill' }, { name: 'Essig' }],
    finalIngredients: [{ name: 'Gurke' }, { name: 'Dill' }, { name: 'Essig' }],
    steps: ['Alles vermengen.'],
  });
  ok('P35 Gurkensalat -> keine Warnung', !hasUmami(p35), 'got: ' + JSON.stringify(p35.warnings));

  // P36: Gemuesesuppe -> keine Warnung (Kategorie soup)
  const p36 = p.evaluateAll({
    title: 'Kuerbissuppe',
    dishCategory: 'soup',
    ingredients: [{ name: 'Kuerbis' }, { name: 'Gemuesebruehe' }],
    finalIngredients: [{ name: 'Kuerbis' }, { name: 'Gemuesebruehe' }],
    steps: ['Kochen.'],
  });
  ok('P36 Gemuesesuppe -> keine Warnung', !hasUmami(p36), 'got: ' + JSON.stringify(p36.warnings));

  // P37: Gemuese-Pfanne mit Parmesan -> keine Warnung
  const p37 = p.evaluateAll({
    title: 'Gemuese-Pfanne',
    dishCategory: 'main_vegetarian',
    ingredients: [{ name: 'Zucchini' }, { name: 'Paprika' }, { name: 'Parmesan' }],
    finalIngredients: [{ name: 'Zucchini' }, { name: 'Paprika' }, { name: 'Parmesan' }],
    steps: ['Anbraten.'],
  });
  ok('P37 Gemuese-Pfanne mit Parmesan -> keine Warnung', !hasUmami(p37), 'got: ' + JSON.stringify(p37.warnings));
})();

console.log('=== PLAUSIBILITAET: P4 Kokosmilch als Abloeschung ===');
(function () {
  const p = require('./plausibility-checks');
  function hasDegl(r) {
    return (r.warnings || []).some(function (w) { return /Deglassatura/i.test(w); });
  }
  // P38: Curry mit Kokosmilch — Kokosmilch loest den Fond, keine P4-Warnung.
  const p38 = p.evaluateAll({
    title: 'Gemuese-Curry',
    dishCategory: 'main_vegetarian',
    ingredients: [{ name: 'Blumenkohl' }, { name: 'Kokosmilch' }, { name: 'Zwiebel' }],
    finalIngredients: [{ name: 'Blumenkohl' }, { name: 'Kokosmilch' }, { name: 'Zwiebel' }],
    steps: [
      'Zwiebel scharf anbraten.',
      'Kokosmilch angiessen und 20 Minuten koecheln lassen.'
    ],
  });
  ok('P38 Kokosmilch loest Fond -> keine P4-Warnung', !hasDegl(p38), 'got: ' + JSON.stringify(p38.warnings));

  // P39: Tomatensauce mit Tomatendose — gleiche Logik.
  const p39 = p.evaluateAll({
    title: 'Tomatensauce',
    dishCategory: 'main_vegetarian',
    ingredients: [{ name: 'Zwiebel' }, { name: 'Tomatendose' }, { name: 'Olivenoel' }],
    finalIngredients: [{ name: 'Zwiebel' }, { name: 'Tomatendose' }, { name: 'Olivenoel' }],
    steps: [
      'Zwiebel scharf anbraten.',
      'Tomatendose hinzufuegen und 15 Minuten koecheln lassen.'
    ],
  });
  ok('P39 Tomatendose loest Fond -> keine P4-Warnung', !hasDegl(p39), 'got: ' + JSON.stringify(p39.warnings));
})();

console.log('=== PLAUSIBILITAET: P10 Drei Cremes ===');
(function () {
  const p = require('./plausibility-checks');
  function hasCreams(r) {
    return (r.warnings || []).some(function (w) { return /Drei Cremes gleichzeitig/i.test(w); });
  }

  // P40: Sahne + Kokosmilch + Frischkäse -> Warnung
  const p40 = p.evaluateAll({
    title: 'Pasta',
    ingredients: [{ name: 'Sahne' }, { name: 'Kokosmilch' }, { name: 'Frischkäse' }],
    finalIngredients: [{ name: 'Sahne' }, { name: 'Kokosmilch' }, { name: 'Frischkäse' }],
    steps: ['Alles verruehren.'],
  });
  ok('P40 drei Cremes -> Warnung', hasCreams(p40), 'got: ' + JSON.stringify(p40.warnings));

  // P41: zwei Cremes -> keine Warnung
  const p41 = p.evaluateAll({
    title: 'Pasta',
    ingredients: [{ name: 'Sahne' }, { name: 'Kokosmilch' }],
    finalIngredients: [{ name: 'Sahne' }, { name: 'Kokosmilch' }],
    steps: ['Alles verruehren.'],
  });
  ok('P41 zwei Cremes -> keine Warnung', !hasCreams(p41), 'got: ' + JSON.stringify(p41.warnings));

  // P42: Sahne + Kochsahne + Kokosmilch -> keine Warnung (Sahne/Kochsahne = eine Creme)
  const p42 = p.evaluateAll({
    title: 'Pasta',
    ingredients: [{ name: 'Sahne' }, { name: 'Kochsahne' }, { name: 'Kokosmilch' }],
    finalIngredients: [{ name: 'Sahne' }, { name: 'Kochsahne' }, { name: 'Kokosmilch' }],
    steps: ['Alles verruehren.'],
  });
  ok('P42 Sahne + Kochsahne dedupliziert -> keine Warnung', !hasCreams(p42), 'got: ' + JSON.stringify(p42.warnings));

  // P43: Mascarpone + Schmand + Sahne + Doppelrahm -> Warnung
  const p43 = p.evaluateAll({
    title: 'Dessert',
    ingredients: [{ name: 'Mascarpone' }, { name: 'Schmand' }, { name: 'Sahne' }, { name: 'Doppelrahm' }],
    finalIngredients: [{ name: 'Mascarpone' }, { name: 'Schmand' }, { name: 'Sahne' }, { name: 'Doppelrahm' }],
    steps: ['Alles verruehren.'],
  });
  ok('P43 vier Cremes -> Warnung', hasCreams(p43), 'got: ' + JSON.stringify(p43.warnings));
})();

console.log('=== PLAUSIBILITAET: P3 Riduzione ===');
(function () {
  const p = require('./plausibility-checks');
  function hasRed(r) {
    return (r.warnings || []).some(function (w) { return /Reduktion ohne Fluessigkeit/i.test(w); });
  }

  // P44: Wein angiessen, dann reduzieren -> keine Warnung
  const p44 = p.evaluateAll({
    title: 'Sauce',
    ingredients: [{ name: 'Wein' }, { name: 'Zwiebel' }],
    finalIngredients: [{ name: 'Wein' }, { name: 'Zwiebel' }],
    steps: [
      'Zwiebel anbraten.',
      'Wein angiessen und auf die Haelfte reduzieren.'
    ],
  });
  ok('P44 Wein + Reduktion -> keine Warnung', !hasRed(p44), 'got: ' + JSON.stringify(p44.warnings));

  // P45: Reduktion ohne Fluessigkeit -> Warnung
  const p45 = p.evaluateAll({
    title: 'Sauce',
    ingredients: [{ name: 'Zwiebel' }],
    finalIngredients: [{ name: 'Zwiebel' }],
    steps: [
      'Zwiebel anbraten.',
      'Die Sauce auf die Haelfte reduzieren.'
    ],
  });
  ok('P45 Reduktion ohne Fluessigkeit -> Warnung', hasRed(p45), 'got: ' + JSON.stringify(p45.warnings));

  // P46: "Hitze reduzieren" -> keine Warnung
  const p46 = p.evaluateAll({
    title: 'Braten',
    ingredients: [{ name: 'Fleisch' }],
    finalIngredients: [{ name: 'Fleisch' }],
    steps: [
      'Fleisch anbraten.',
      'Die Hitze reduzieren und 20 Minuten garen.'
    ],
  });
  ok('P46 Hitze reduzieren -> keine Warnung', !hasRed(p46), 'got: ' + JSON.stringify(p46.warnings));

  // P47: Sahne + einkochen -> keine Warnung
  const p47 = p.evaluateAll({
    title: 'Pasta',
    ingredients: [{ name: 'Sahne' }],
    finalIngredients: [{ name: 'Sahne' }],
    steps: [
      'Sahne angiessen und 5 Minuten einkochen lassen.'
    ],
  });
  ok('P47 Sahne + einkochen -> keine Warnung', !hasRed(p47), 'got: ' + JSON.stringify(p47.warnings));

  // P48: Reduktion ohne Fluessigkeit (Ingredients leer) -> Warnung
  const p48 = p.evaluateAll({
    title: 'Fleisch',
    ingredients: [{ name: 'Steak' }],
    finalIngredients: [{ name: 'Steak' }],
    steps: [
      'Steak anbraten.',
      'Auf die Haelfte einreduzieren.'
    ],
  });
  ok('P48 Reduktion ohne Fluessigkeit (2) -> Warnung', hasRed(p48), 'got: ' + JSON.stringify(p48.warnings));
})();

console.log('=== ZUSAMMENFASSUNG ===');
console.log('  OK:   ' + pass);
console.log('  FAIL: ' + fail);
if (fail > 0) {
  console.log('');
  console.log('Fehlgeschlagene Tests:');
  failures.forEach(f => console.log('  [' + f.id + '] ' + f.detail));
  process.exit(1);
}
console.log('Alle Tests bestanden.');
