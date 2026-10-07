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
