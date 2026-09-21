/**
 * Unit-Tests: recipe-validator v2 + pipeline v9.2 (Render, Retry).
 */
'use strict';

const assert = require('assert');
const validator = require('./recipe-validator');
const pipeline = require('./recipe-pipeline-v92');

const gutesBeispiel = {
  title: 'Schnelles High-Protein Pfannen-Hähnchen mit Ei-Spinat',
  servings: 1,
  prep_time_min: 20,
  nutrition: { kcal: 460, protein_g: 55, fat_g: 25, netto_kh_g: 3, ballaststoffe_g: 1 },
  diet_labels: ['high_protein'],
  target_deviation_note: '',
  ingredients: [
    { id: '0001', name: 'Hähnchenbrustfilet', amount: 150, unit: 'g', protein_source: true, netCarbs: 0, fat: 3.6, protein: 31, fiber: 0 },
    { id: '0002', name: 'Ei (Größe M, ca. 60 g)', amount: 2, unit: 'stk', protein_source: true, netCarbs: 0.7, fat: 10, protein: 13, fiber: 0 },
    { id: '0003', name: 'Spinat frisch', amount: 30, unit: 'g', protein_source: false, netCarbs: 1, fat: 0.3, protein: 2.5, fiber: 2 },
    { id: '0004', name: 'Olivenöl', amount: 8, unit: 'ml', protein_source: false, netCarbs: 0, fat: 100, protein: 0, fiber: 0 },
    { id: '0005', name: 'Pinienkerne', amount: 5, unit: 'g', protein_source: false, netCarbs: 10, fat: 68, protein: 14, fiber: 4 },
    { id: '0006', name: 'Salz', amount: 0, unit: 'prise', protein_source: false, netCarbs: 0, fat: 0, protein: 0, fiber: 0 },
  ],
  steps: [
    { title: 'Mise en Place', content: '{0001} in Streifen schneiden, {0002} verquirlen.', stove_level: 0, time_min: 5 },
    { title: 'Anbraten', content: '{0004} erhitzen, {0001} goldbraun braten.', stove_level: 6, time_min: 6 },
    { title: 'Ei & Spinat', content: '{0002} dazugeben, stocken lassen, {0003} unterheben, mit {0006} würzen.', stove_level: 4, time_min: 3 },
  ],
  garnish: 'Mit gerösteten {0005} bestreuen.',
  chef_analysis: 'Die Kombination aus {0001} und {0002} liefert eine hohe Proteinmenge bei wenig Kohlenhydraten, siehe nutrition.',
};

// TEST 2: valid
const result2 = validator.validateRecipeV2(gutesBeispiel);
assert.strictEqual(result2.ok, true, 'gutes Beispiel muss ok sein: ' + result2.errors.join('; '));
const rendered = pipeline.renderRecipeForDisplay(gutesBeispiel);
assert.ok(rendered, 'render liefert Rezept');
assert.ok(rendered.steps.some(function (s) { return s.indexOf('Olivenöl') >= 0; }), 'Placeholder nameOnly: ' + rendered.steps.join(' | '));
assert.ok(!rendered.steps.some(function (s) {
  return /\b\d+[.,]?\d*\s*(g|ml)\b/i.test(s) || /\b\d+(g|ml)\b/i.test(s);
}), 'Steps dürfen keine Mengen enthalten: ' + rendered.steps.join(' | '));
assert.ok(!/Kokosmilch\d|ml[A-ZÄÖÜ]/i.test(rendered.steps.join(' ')), 'keine geklebten Mengen');
// Zutatenliste behält Mengen
const oil = rendered.ingredients.find(function (i) { return /öl|oel/i.test(i.name); });
assert.ok(oil && oil.amount === 8 && oil.unit === 'ml', 'Zutatenliste Menge bleibt');
assert.strictEqual(rendered.self_check, '');
assert.ok(rendered.nutrition_note.indexOf('siehe nutrition') >= 0 || rendered.nutrition_note.length > 10);
assert.strictEqual(rendered.recipe_schema_version, 'v9.2');
// Ei stk → 120 g in Liste, aber nicht "30 g Ei" in Steps
const egg = rendered.ingredients.find(function (i) { return /ei/i.test(i.name); });
assert.ok(egg && egg.amount === 120 && egg.unit === 'g', 'Ei stk→g');
assert.ok(egg._culinary_amount === 2, 'Ei culinary amount');
console.log('OK validate+render valid v9.2 (nameOnly steps)');

// TEST 3: broken
const kaputt = JSON.parse(JSON.stringify(gutesBeispiel));
kaputt.steps = [
  { title: 'Anbraten', content: '15 ml Olivenöl erhitzen, Hähnchen goldbraun braten.', stove_level: 6, time_min: 6 },
];
kaputt.chef_analysis = 'Liefert ca. 64 g Protein und 30 g Fett pro Portion.';
const result3 = validator.validateRecipeV2(kaputt);
assert.strictEqual(result3.ok, false, 'kaputtes Beispiel muss failen');
assert.ok(result3.errors.some(function (e) { return /freie Mengen-Zahl|15 ml/i.test(e); }), 'erwartet free number error');
assert.ok(result3.errors.some(function (e) { return /chef_analysis|64 g|Protein/i.test(e); }), 'erwartet chef_analysis number error');
console.log('OK validate broken v9.2');

// TEST 3b: Klartext-Basiszutat ohne ingredients-Eintrag ("etwas Öl")
const ohneOel = JSON.parse(JSON.stringify(gutesBeispiel));
ohneOel.ingredients = ohneOel.ingredients.filter(function (i) { return !/öl|oel/i.test(i.name); });
ohneOel.steps = [
  { title: 'Anbraten', content: 'Brate {0001} in etwas Öl bei mittlerer Hitze.', stove_level: 6, time_min: 6 },
  { title: 'Ei', content: '{0002} dazugeben, mit {0006} würzen.', stove_level: 4, time_min: 3 },
];
ohneOel.garnish = 'Mit gerösteten {0005} bestreuen.';
const resultOel = validator.validateRecipeV2(ohneOel);
assert.strictEqual(resultOel.ok, false, 'etwas Öl ohne Listen-Eintrag muss failen');
assert.ok(resultOel.errors.some(function (e) {
  return /Zutat 'Öl' im Text erwähnt, aber nicht in ingredients/i.test(e);
}), 'erwartet unlisted staple Öl: ' + resultOel.errors.join('; '));
console.log('OK unlisted staple Öl');

// TEST 3c: Fix B errorsToDirectives Protein
const fb = pipeline.buildRetryFeedbackMessage([
  'Mehr als 2 Proteinquellen (Keyword-Heuristik): Hähnchen, Tofu, Ei',
  'Modell hat protein_source falsch gesetzt für: [Tofu]',
]);
assert.ok(/KONKRETE KORREKTUR: Du hast 3 Proteinquellen/i.test(fb), 'Fix B Protein-Directive');
assert.ok(/entferne sie stattdessen ganz/i.test(fb), 'Fix B remove-not-hide');
const fb2 = pipeline.buildRetryFeedbackMessage([
  "Zutat 'Öl' im Text erwähnt, aber nicht in ingredients gelistet (Step 1 ('Anbraten'))",
]);
assert.ok(/KONKRETE KORREKTUR:.*Öl/i.test(fb2), 'Fix B staple directive');
assert.ok(/unit ml/i.test(fb2), 'Liquid staple soll ml erwähnen: ' + fb2);
const fbWater = pipeline.buildRetryFeedbackMessage([
  "Zutat 'Wasser' im Text erwähnt, aber nicht in ingredients gelistet (Step 1 ('Linsen kochen'))",
]);
assert.ok(/Wasser/i.test(fbWater) && /unit ml/i.test(fbWater), 'Wasser-Staple-Directive: ' + fbWater);
const fbKcal = pipeline.buildRetryFeedbackMessage([
  'Kalorien-Formel-Abweichung: berechnet 1114 kcal vs. deklariert 820 kcal (26.4% Abweichung, Limit 10%)',
]);
assert.ok(/4×protein_g|4\*protein/i.test(fbKcal) || /4×protein_g/.test(fbKcal), 'kcal directive: ' + fbKcal);
assert.ok(/±10|10 %/i.test(fbKcal), 'kcal tolerance in directive');
const fbUnused = pipeline.buildRetryFeedbackMessage([
  'Zutaten nie referenziert (evtl. überflüssig): 0001, 0002',
]);
assert.ok(/0001, 0002/.test(fbUnused) && /entferne ungenutzte|Referenziere JEDE/i.test(fbUnused), 'unused directive: ' + fbUnused);
const fbCold = pipeline.buildRetryFeedbackMessage([
  "Gerinnungsschutz: 'Frischkäse' ({0003}) wurde in Step 3 eingearbeitet; danach folgt Step 4 ('Rührei kochen') mit stove_level=5 — Hitze nach Einrühren verboten (auch wenn die Zutat nur noch als 'Mischung' vorkommt)",
]);
assert.ok(/Verschiebe das Einrühren von 'Frischkäse'/i.test(fbCold), 'Gerinnung directive: ' + fbCold);
assert.ok(/Herd ausgeschaltet|stove_level 0/i.test(fbCold), 'Gerinnung directive Herd AUS');
const fbHp = pipeline.buildRetryFeedbackMessage(['high_protein-Label, aber protein_g < 25']);
assert.ok(/KONKRETE KORREKTUR LABEL/i.test(fbHp) && /high_protein/i.test(fbHp), 'high_protein directive: ' + fbHp);
const fbWa = pipeline.buildRetryFeedbackMessage(['Wasser ohne passende Aktion (erhitzen, quellen oder einrühren).']);
assert.ok(/KONKRETE KORREKTUR WASSER/i.test(fbWa), 'water action directive: ' + fbWa);
console.log('OK errorsToDirectives Fix B + staple + kcal + unused + Gerinnung + label/water');

// Soft-Repair: high_protein bei protein < 25 → Label strippen, kein 422
const lowProteinCurry = {
  title: 'Vegetarisches Curry mit Kichererbsen und Kokosmilch',
  prep_time_min: 25,
  dishPlan: { dishType: 'general_cooked_main', requiredActions: ['saute', 'simmer', 'serve'] },
  nutrition: { kcal: 400, protein_g: 18, fat_g: 20, netto_kh_g: 30, ballaststoffe_g: 8 },
  diet_labels: ['high_protein', 'vegan'],
  ingredients: [
    { id: '0001', name: 'Kichererbsen (gekocht)', amount: 120, unit: 'g', protein_source: true, culinaryRole: 'main_protein', countsAsPrimaryProteinSource: true, netCarbs: 14, fat: 2, protein: 7, fiber: 6 },
    { id: '0002', name: 'Kokosmilch', amount: 150, unit: 'ml', protein_source: false, culinaryRole: 'fat_source', countsAsPrimaryProteinSource: false, netCarbs: 3, fat: 18, protein: 2, fiber: 0 },
    { id: '0003', name: 'Tomaten (passiert)', amount: 100, unit: 'g', protein_source: false, culinaryRole: 'vegetable', countsAsPrimaryProteinSource: false, netCarbs: 4, fat: 0, protein: 1, fiber: 1 },
    { id: '0004', name: 'Zwiebel', amount: 60, unit: 'g', protein_source: false, culinaryRole: 'vegetable', countsAsPrimaryProteinSource: false, netCarbs: 7, fat: 0, protein: 1, fiber: 1 },
    { id: '0005', name: 'Öl', amount: 10, unit: 'ml', protein_source: false, culinaryRole: 'fat_source', countsAsPrimaryProteinSource: false, netCarbs: 0, fat: 100, protein: 0, fiber: 0 },
    { id: '0006', name: 'Wasser', amount: 80, unit: 'ml', protein_source: false, culinaryRole: 'liquid', countsAsPrimaryProteinSource: false, netCarbs: 0, fat: 0, protein: 0, fiber: 0 },
    { id: '0007', name: 'Currypulver', amount: 1, unit: 'prise', protein_source: false, culinaryRole: 'seasoning', countsAsPrimaryProteinSource: false, netCarbs: 0, fat: 0, protein: 0, fiber: 0 },
  ],
  steps: [
    { title: 'Anschwitzen', content: '{0004} in {0005} anschwitzen.', stove_level: 5, time_min: 4 },
    { title: 'Curry', content: '{0003}, {0001} und {0006} dazugeben, {0007} einrühren.', stove_level: 4, time_min: 2 },
    { title: 'Köcheln', content: 'Mit {0002} aufgießen und 12 Min. köcheln lassen. Mit Salz und Pfeffer abschmecken.', stove_level: 3, time_min: 12 },
    { title: 'Servieren', content: 'Anrichten und sofort servieren.', stove_level: 0, time_min: 1 },
  ],
  garnish: '',
  chef_analysis: 'Cremiges Curry passend zu den Tageszielen.',
};
const softRepair = validator.validateRecipeV2(lowProteinCurry);
assert.strictEqual(softRepair.ok, true, 'Curry Soft-Repair muss ok sein: ' + softRepair.errors.join('; '));
assert.ok(!(lowProteinCurry.diet_labels || []).some(function (l) {
  return /high_protein/i.test(String(l));
}), 'high_protein muss gestrippt sein: ' + JSON.stringify(lowProteinCurry.diet_labels));
assert.ok(lowProteinCurry.ingredients.some(function (i) { return /^Salz$/i.test(i.name); }), 'Salz injiziert');
assert.ok(lowProteinCurry.ingredients.some(function (i) { return /^Pfeffer$/i.test(i.name); }), 'Pfeffer injiziert');
assert.ok(softRepair.warnings.some(function (w) { return /Gewürze ergänzt/i.test(w); }), 'Warnung Gewürze');
console.log('OK Soft-Repair Curry: labels + Salz/Pfeffer');

// TEST 3d: Fall 9 — Frischkäse kalt einrühren, danach Hitze (muss failen)
const fall9 = {
  title: 'Schnelles Rührei mit Räucherlachs und Frischkäse',
  prep_time_min: 14,
  nutrition: { kcal: 579, protein_g: 47, fat_g: 42, netto_kh_g: 3, ballaststoffe_g: 0 },
  diet_labels: ['keto', 'high_protein'],
  target_deviation_note: '',
  ingredients: [
    { id: '0001', name: 'Ei (Größe M, ca. 60 g)', amount: 3, unit: 'stk', protein_source: true, netCarbs: 1, fat: 10, protein: 13, fiber: 0 },
    { id: '0002', name: 'Räucherlachs', amount: 100, unit: 'g', protein_source: true, netCarbs: 0, fat: 5, protein: 20, fiber: 0 },
    { id: '0003', name: 'Frischkäse', amount: 50, unit: 'g', protein_source: false, netCarbs: 2, fat: 20, protein: 8, fiber: 0 },
    { id: '0004', name: 'Olivenöl', amount: 10, unit: 'ml', protein_source: false, netCarbs: 0, fat: 100, protein: 0, fiber: 0 },
    { id: '0005', name: 'Salz', amount: 0, unit: 'prise', protein_source: false, netCarbs: 0, fat: 0, protein: 0, fiber: 0 },
    { id: '0006', name: 'Pfeffer', amount: 0, unit: 'prise', protein_source: false, netCarbs: 0, fat: 0, protein: 0, fiber: 0 },
    { id: '0007', name: 'Frischer Dill', amount: 5, unit: 'g', protein_source: false, netCarbs: 2, fat: 0, protein: 1, fiber: 2 },
  ],
  steps: [
    { title: 'Zutaten vorbereiten', content: 'Alle Zutaten abwiegen: {0001}, {0002}, {0003}, {0004}, {0005}, {0006}, {0007}.', stove_level: 0, time_min: 5 },
    { title: 'Pfanne erhitzen', content: 'Pfanne auf mittlere Hitze stellen und {0004} hinzufügen.', stove_level: 6, time_min: 1 },
    { title: 'Eier verquirlen', content: '{0001} in einer Schüssel verquirlen, {0003} einrühren bis eine homogene Masse entsteht.', stove_level: 0, time_min: 2 },
    { title: 'Rührei kochen', content: 'Verquirlte Mischung in die Pfanne geben, kurz stocken lassen, dann {0002} hinzufügen und mit {0005} und {0006} abschmecken.', stove_level: 5, time_min: 4 },
    { title: 'Fertigstellen', content: 'Sorgfältig rühren bis das Rührei cremig-bissfest ist.', stove_level: 5, time_min: 2 },
  ],
  garnish: 'Mit {0007} bestreuen und sofort servieren.',
  chef_analysis: 'Siehe nutrition — cremige Textur und keto-Profil.',
};
const resultFall9 = validator.validateRecipeV2(fall9);
assert.strictEqual(resultFall9.ok, false, 'Fall 9 muss Gerinnung failen');
assert.ok(resultFall9.errors.some(function (e) {
  return /Gerinnungsschutz/i.test(e) && /Frischkäse/i.test(e) && /stove_level=5/i.test(e);
}), 'erwartet Gerinnung nach Einrühren: ' + resultFall9.errors.join('; '));
console.log('OK Fall 9 Gerinnung fail');

// TEST 3e: korrekt — Hitze zuerst, Frischkäse erst nach Herd AUS
// (nur 2 Keyword-Proteine: Ei + Frischkäse; Lachs weggelassen, sonst ≥30g Frischkäse = 3.)
const fall9ok = JSON.parse(JSON.stringify(fall9));
fall9ok.ingredients = fall9ok.ingredients.filter(function (i) { return i.id !== '0002'; });
fall9ok.ingredients.forEach(function (i) {
  if (i.id === '0003') i.protein_source = true;
});
fall9ok.title = 'Schnelles Rührei mit Frischkäse';
fall9ok.steps = [
  { title: 'Zutaten vorbereiten', content: 'Alle Zutaten abwiegen: {0001}, {0003}, {0004}, {0005}, {0006}, {0007}.', stove_level: 0, time_min: 5 },
  { title: 'Pfanne erhitzen', content: 'Pfanne auf mittlere Hitze stellen und {0004} hinzufügen.', stove_level: 6, time_min: 1 },
  { title: 'Eier stocken', content: '{0001} in die Pfanne geben, stocken lassen, mit {0005} und {0006} würzen.', stove_level: 5, time_min: 4 },
  { title: 'Herd aus', content: 'Herd vollständig ausschalten, Pfanne vom Herd nehmen.', stove_level: 0, time_min: 1 },
  { title: 'Frischkäse unterheben', content: '{0003} unter das Rührei heben bis cremig.', stove_level: 0, time_min: 1 },
];
fall9ok.garnish = 'Mit {0007} bestreuen.';
const resultFall9ok = validator.validateRecipeV2(fall9ok);
assert.strictEqual(resultFall9ok.ok, true, 'korrektes Rührei muss ok sein: ' + resultFall9ok.errors.join('; '));
console.log('OK Fall 9 Gegentest (Frischkäse nach Herd AUS)');

// TEST 3f: direkte Hitze mit {id} im selben Step
const directHeat = JSON.parse(JSON.stringify(fall9));
directHeat.steps = [
  { title: 'Mise', content: '{0001} verquirlen.', stove_level: 0, time_min: 2 },
  { title: 'Garen', content: '{0001} stocken lassen, {0003} bei Hitze unterrühren.', stove_level: 4, time_min: 3 },
];
const resultDirect = validator.validateColdIngredientHeatSequence(directHeat);
assert.strictEqual(resultDirect.ok, false, 'direkte Hitze mit Frischkäse muss failen');
console.log('OK direkte Gerinnung Hitze+id');

// TEST 3g: Fall 6 — Joghurt + Nüsse (≥30 g) als Keyword-Proteine erkannt, ≤2 → ok
const fall6 = [
  { name: 'Griechischer Joghurt (10% Fett)', amount: 200, unit: 'g', protein_source: true },
  { name: 'Gemischte Nüsse (z. B. Mandeln, Walnüsse)', amount: 30, unit: 'g', protein_source: true },
  { name: 'Zimt', amount: 0, unit: 'prise', protein_source: false },
];
const kw6 = validator.validateMaxProteinSourcesByKeywords(fall6);
assert.ok(kw6.found.every(function (n) { return !/nüss|nuss|mandel|walnuss|joghurt/i.test(n); }),
  'Fall 6: Joghurt/Nüsse nicht als primary: ' + kw6.found.join(', '));
assert.strictEqual(kw6.ok, true, 'Fall 6: topping+base → ok');
assert.strictEqual(fall6[0].culinaryRole, 'base', 'Joghurt = base');
assert.strictEqual(fall6[1].culinaryRole, 'topping', 'Nüsse = topping');
assert.strictEqual(fall6[0].countsAsPrimaryProteinSource, false, 'Joghurt nicht primary');
assert.strictEqual(fall6[1].countsAsPrimaryProteinSource, false, 'Nüsse nicht primary');
console.log('OK Fall 6 Keyword Joghurt+Nüsse → base/topping');


// TEST 3h: Fall 7 — Eier + Gouda (≥30 g)
const fall7 = [
  { name: '3 Eier (Größe M, ca. 60 g je)', amount: 180, unit: 'g', protein_source: true },
  { name: 'Gouda (gerieben)', amount: 50, unit: 'g', protein_source: true },
  { name: 'Paprika (rot, gewürfelt)', amount: 80, unit: 'g', protein_source: false },
  { name: 'Spinat (frisch, grob gehackt)', amount: 50, unit: 'g', protein_source: false },
  { name: 'Olivenöl', amount: 10, unit: 'ml', protein_source: false },
];
const kw7 = validator.validateMaxProteinSourcesByKeywords(fall7);
assert.ok(kw7.found.some(function (n) { return /\bei/i.test(n); }), 'Fall 7: Ei erkannt');
assert.ok(kw7.found.some(function (n) { return /gouda|käse|kaese/i.test(n); }), 'Fall 7: Gouda erkannt: ' + kw7.found.join(', '));
assert.strictEqual(kw7.ok, true, 'Fall 7: genau 2 → ok');
console.log('OK Fall 7 Keyword Ei+Gouda');

// Parmesan-Topping <30 g zählt nicht; 3. Hauptkäse ≥30 g schon
const topParmesan = [
  { name: 'Hähnchenbrust', amount: 150, unit: 'g' },
  { name: 'Ei (Größe M)', amount: 1, unit: 'stk' },
  { name: 'Parmesan', amount: 5, unit: 'g' },
];
assert.strictEqual(validator.validateMaxProteinSourcesByKeywords(topParmesan).ok, true, '5g Parmesan kein 3. Protein');
const thirdCheese = [
  { name: 'Hähnchenbrust', amount: 150, unit: 'g' },
  { name: 'Ei (Größe M)', amount: 1, unit: 'stk' },
  { name: 'Gouda', amount: 50, unit: 'g' },
];
assert.strictEqual(validator.validateMaxProteinSourcesByKeywords(thirdCheese).ok, false, '50g Gouda als 3. Protein');
assert.strictEqual(
  validator.validateMaxProteinSourcesByKeywords([{ name: 'Erdnussöl', amount: 15, unit: 'ml' }]).found.length,
  0,
  'Erdnussöl nicht als Nuss-Protein'
);
console.log('OK Käse-Mengenschwelle + Nussöl-Ausschluss');

// TEST 3i: Platzhalter-Missbrauch in chef_analysis ({id} als Nährwert-Ersatz)
const ketoHuehnchen = JSON.parse(JSON.stringify(gutesBeispiel));
ketoHuehnchen.title = 'Keto-Hähnchen-Rührei mit Zucchini';
ketoHuehnchen.ingredients = [
  { id: '0001', name: 'Hähnchenbrustfilet (roh)', amount: 150, unit: 'g', protein_source: true, netCarbs: 0, fat: 3.6, protein: 31, fiber: 0 },
  { id: '0002', name: 'Ei (Größe M, ca. 60 g)', amount: 2, unit: 'stk', protein_source: true, netCarbs: 0.7, fat: 10, protein: 13, fiber: 0 },
  { id: '0003', name: 'Zucchini', amount: 100, unit: 'g', protein_source: false, netCarbs: 2, fat: 0.3, protein: 1.2, fiber: 1 },
  { id: '0004', name: 'Olivenöl', amount: 8, unit: 'ml', protein_source: false, netCarbs: 0, fat: 100, protein: 0, fiber: 0 },
  { id: '0005', name: 'Salz', amount: 0, unit: 'prise', protein_source: false, netCarbs: 0, fat: 0, protein: 0, fiber: 0 },
];
ketoHuehnchen.steps = [
  { title: 'Mise', content: '{0001} würfeln, {0003} in Scheiben, {0002} verquirlen.', stove_level: 0, time_min: 5 },
  { title: 'Braten', content: '{0004} erhitzen, {0001} und {0003} anbraten, {0002} stocken lassen, mit {0005} würzen.', stove_level: 5, time_min: 8 },
];
ketoHuehnchen.garnish = '';
ketoHuehnchen.chef_analysis =
  'Die Zubereitung liefert rund {0001} g Protein und bleibt mit {0003} g Netto-KH ' +
  'deutlich unter 10 g, ideal für eine ketogene Ernährung.';
ketoHuehnchen.diet_labels = ['keto', 'high_protein'];
ketoHuehnchen.nutrition = { kcal: 420, protein_g: 48, fat_g: 22, netto_kh_g: 3, ballaststoffe_g: 1 };
// Isolierte Erkennung (vor Auto-Repair)
const misuseDetect = validator.validateChefAnalysisPlaceholderMisuse(ketoHuehnchen.chef_analysis);
assert.strictEqual(misuseDetect.ok, false, 'Platzhalter-Missbrauch muss erkannt werden');
assert.ok(misuseDetect.problems.some(function (e) {
  return /chef_analysis missbraucht Zutat-Platzhalter \{0001\} als Nährwert-Referenz/i.test(e);
}), 'erwartet spezifischen Missbrauch-Fehler für {0001}: ' + misuseDetect.problems.join('; '));
assert.ok(misuseDetect.problems.some(function (e) {
  return /chef_analysis missbraucht Zutat-Platzhalter \{0003\} als Nährwert-Referenz/i.test(e);
}), 'erwartet spezifischen Missbrauch-Fehler für {0003}: ' + misuseDetect.problems.join('; '));
// validateRecipeV2 auto-repariert Nährwert-Missbrauch; reine Zutatreferenz ist erlaubt
const repairedCopy = JSON.parse(JSON.stringify(ketoHuehnchen));
const resultPhMisuse = validator.validateRecipeV2(repairedCopy);
assert.ok(!resultPhMisuse.errors.some(function (e) { return /Nährwertplatzhalter|missbraucht Zutat-Platzhalter/i.test(e); }),
  'Auto-Repair entfernt Platzhalter-Fehler: ' + resultPhMisuse.errors.join('; '));
assert.ok(!/\{0001\}\s*g\s*Protein/i.test(repairedCopy.chef_analysis || ''),
  'chef_analysis nach Repair ohne {id} g Protein: ' + repairedCopy.chef_analysis);
// Erlaubte Zutatreferenz in chef_analysis
const okPhRef = JSON.parse(JSON.stringify(gutesBeispiel));
okPhRef.chef_analysis = '{0001} bildet die cremige Basis des Snacks.';
const okPhRes = validator.validateChefAnalysisPlaceholderMisuse(okPhRef.chef_analysis);
assert.strictEqual(okPhRes.ok, true, 'Zutatreferenz in chef_analysis erlaubt: ' + okPhRes.problems.join('; '));
// Isolierter Missbrauch
const onlyPh = JSON.parse(JSON.stringify(gutesBeispiel));
onlyPh.chef_analysis = 'Die Zubereitung liefert rund {0001} g Protein bei ausgewogener Sensorik.';
const misuseOnly = validator.validateChefAnalysisPlaceholderMisuse(onlyPh.chef_analysis);
assert.strictEqual(misuseOnly.ok, false, 'isolierter Platzhalter-Missbrauch muss erkannt werden');
assert.ok(misuseOnly.problems.some(function (e) {
  return /missbraucht Zutat-Platzhalter \{0001\}/i.test(e);
}), 'isoliert: spezifischer Fehlertyp: ' + misuseOnly.problems.join('; '));
const resultOnlyPh = validator.validateRecipeV2(onlyPh);
assert.ok(!resultOnlyPh.errors.some(function (e) { return /missbraucht Zutat-Platzhalter|Nährwertplatzhalter/i.test(e); }),
  'isoliert: Auto-Repair, kein Hard-Error: ' + resultOnlyPh.errors.join('; '));
assert.ok(!/\{0001\}\s*g/i.test(onlyPh.chef_analysis || ''), 'isoliert: Text repariert');
const fbPh = pipeline.buildRetryFeedbackMessage([
  'chef_analysis verwendet {0001} als Zahlen- oder Nährwertplatzhalter — Platzhalter nur als Zutatreferenz.',
]);
assert.ok(/\{0001\}/.test(fbPh), 'Retry-Directive Platzhalter: ' + fbPh);
console.log('OK chef_analysis Platzhalter: Referenz OK, Nährwert fail+repair');


// TEST: ungesalzen ≠ Salz-Gewürz; Joghurt+Nüsse mit Flag-Mismatch → ok nach Auto-Align
const snackNuts = {
  title: 'Proteinreicher Snack mit griechischem Joghurt und Nüssen',
  servings: 1,
  prep_time_min: 5,
  nutrition: { kcal: 350, protein_g: 25, fat_g: 22, netto_kh_g: 8, ballaststoffe_g: 3 },
  ingredients: [
    { id: '0001', name: 'Griechischer Joghurt (laktosefrei)', amount: 200, unit: 'g', protein_source: true, netCarbs: 4, fat: 5, protein: 10, fiber: 0 },
    { id: '0002', name: 'gemischte Nüsse (geröstet, ungesalzen)', amount: 35, unit: 'g', protein_source: false, netCarbs: 7, fat: 50, protein: 20, fiber: 7 },
    { id: '0003', name: 'Zimt', amount: 0, unit: 'prise', protein_source: false, netCarbs: 0, fat: 0, protein: 0, fiber: 0 },
  ],
  steps: [
    { title: 'Anrichten', content: '{0001} in eine Schale geben, {0002} grob hacken und darüber streuen, mit {0003} würzen.', stove_level: 0, time_min: 5 },
  ],
  garnish: '',
  chef_analysis: 'Cremiger Joghurt trifft knackige Nüsse – proteinreich und alltagstauglich.',
  diet_labels: [],
  target_deviation_note: '',
};
assert.strictEqual(validator.isSeasoningSaltOrPepperName('gemischte Nüsse (geröstet, ungesalzen)'), false, 'ungesalzen kein Salz-Gewürz');
assert.strictEqual(validator.isSeasoningSaltOrPepperName('Salz'), true, 'Salz ist Gewürz');
const snackResult = validator.validateRecipeV2(snackNuts);
assert.strictEqual(snackResult.ok, true, 'Joghurt+Nüsse-Snack muss ok sein: ' + snackResult.errors.join('; '));
assert.strictEqual(snackNuts.ingredients[1].protein_source, false, 'Nüsse nicht primary');
assert.strictEqual(snackNuts.ingredients[1].culinaryRole, 'topping', 'Nüsse = topping');
assert.strictEqual(snackNuts.ingredients[0].culinaryRole, 'base', 'Joghurt = base');
assert.ok(!snackResult.errors.some(function (e) { return /Prise\/Messerspitze/i.test(e); }), 'kein Prise-False-Positive');
console.log('OK Snack Joghurt+Nüsse (ungesalzen + roles base/topping)');


// Titel-Treue: Hähnchen statt Nüsse muss failen
const fakeChickenSnack = {
  title: 'Proteinreicher Snack mit griechischem Joghurt und Nüssen',
  servings: 1,
  prep_time_min: 15,
  nutrition: { kcal: 463, protein_g: 60, fat_g: 12, netto_kh_g: 29, ballaststoffe_g: 7 },
  ingredients: [
    { id: '0001', name: 'Hähnchenbrust (gegart, ohne Haut)', amount: 130, unit: 'g', protein_source: true, netCarbs: 0, fat: 2, protein: 30, fiber: 0 },
    { id: '0002', name: 'laktosefreier Sojajoghurt', amount: 175, unit: 'g', protein_source: true, netCarbs: 4, fat: 2, protein: 6, fiber: 0 },
    { id: '0003', name: 'Haferflocken', amount: 25, unit: 'g', protein_source: false, netCarbs: 55, fat: 7, protein: 13, fiber: 10 },
    { id: '0004', name: 'Salz', amount: 0, unit: 'prise', protein_source: false, netCarbs: 0, fat: 0, protein: 0, fiber: 0 },
    { id: '0005', name: 'Zimt', amount: 0, unit: 'prise', protein_source: false, netCarbs: 0, fat: 0, protein: 0, fiber: 0 },
  ],
  steps: [
    { title: 'Mix', content: '{0001} würfeln, mit {0002} und {0003} verrühren, mit {0004} und {0005} würzen.', stove_level: 0, time_min: 10 },
  ],
  garnish: '',
  chef_analysis: 'Proteinreich, aber falsches Konzept.',
  diet_labels: [],
};
const fakeRes = validator.validateRecipeV2(fakeChickenSnack, {
  dishQuery: 'Proteinreicher Snack mit griechischem Joghurt und Nüssen',
});
assert.strictEqual(fakeRes.ok, false, 'Hähnchen-Ersatzkonzept muss failen');
assert.ok(fakeRes.errors.some(function (e) { return /Gerichtskonzept verfehlt/i.test(e); }),
  'Titel-Treue-Fehler: ' + fakeRes.errors.join('; '));
assert.ok(fakeRes.errors.some(function (e) { return /Nüsse/i.test(e); }),
  'fehlende Nüsse: ' + fakeRes.errors.join('; '));
const okFidelity = validator.validateDishConceptFidelity(snackNuts,
  'Proteinreicher Snack mit griechischem Joghurt und Nüssen');
assert.strictEqual(okFidelity.ok, true, 'echter Nuss-Snack treu: ' + okFidelity.problems.join('; '));

// Ei statt Nüsse (Produktionsfall „Kokosjoghurt und Ei“)
const fakeEggSnack = {
  title: 'Kokosjoghurt und Ei',
  servings: 1,
  prep_time_min: 10,
  nutrition: { kcal: 320, protein_g: 22, fat_g: 18, netto_kh_g: 14, ballaststoffe_g: 3 },
  ingredients: [
    { id: '0001', name: 'Kokosjoghurt', amount: 200, unit: 'g', protein_source: false, netCarbs: 6, fat: 12, protein: 2, fiber: 0 },
    { id: '0002', name: 'Eier', amount: 3, unit: 'stk', protein_source: true, netCarbs: 1, fat: 10, protein: 13, fiber: 0 },
    { id: '0003', name: 'Haferflocken', amount: 40, unit: 'g', protein_source: false, netCarbs: 55, fat: 7, protein: 13, fiber: 10 },
  ],
  steps: [
    { title: 'Mix', content: 'Wasser bereitstellen. {0003} einrühren. Die Zutaten gründlich vermengen. Joghurt unterheben.', stove_level: 0, time_min: 8 },
  ],
  garnish: '',
  chef_analysis: '{0002} liefern Protein, {0001} die Basis.',
  diet_labels: [],
};
const eggOnlyInChef = validator.validateRecipeV2(fakeEggSnack, {
  dishQuery: 'Proteinreicher Snack mit griechischem Joghurt und Nüssen',
});
assert.strictEqual(eggOnlyInChef.ok, false, 'Ei-Snack ohne Nüsse muss failen');
assert.ok(eggOnlyInChef.errors.some(function (e) {
  return /Gerichtskonzept verfehlt/i.test(e) && /Nüsse|Ei/i.test(e);
}), 'Ei-statt-Nüsse: ' + eggOnlyInChef.errors.join('; '));
assert.ok(eggOnlyInChef.errors.some(function (e) {
  return /nie referenziert.*0002|0002/i.test(e);
}), 'Eier nur in chef_analysis zählen nicht als Zubereitung: ' + eggOnlyInChef.errors.join('; '));
console.log('OK Gerichtskonzept-Treue Joghurt+Nüsse');

// TEST 3j: Gegentest — korrekte Zutat-Platzhalter ohne Nährwertzahlen
const chefOk = JSON.parse(JSON.stringify(gutesBeispiel));
chefOk.chef_analysis =
  'Die Kombination aus {0001} und {0002} liefert eine hohe Proteinmenge bei wenig Kohlenhydraten.';
const resultChefOk = validator.validateRecipeV2(chefOk);
assert.strictEqual(resultChefOk.ok, true, 'korrekte chef_analysis muss ok sein: ' + resultChefOk.errors.join('; '));
console.log('OK chef_analysis Gegentest (Platzhalter nur für Namen)');

// TEST 3k: Bug A — 0 vs 0 kcal darf nicht als 100% Abweichung failen (magere Brühe)
const kcal00 = validator.validateKcalFormula(0, 0, 0, 0, 0);
assert.strictEqual(kcal00.ok, true, '0 vs 0 kcal muss ok sein');
assert.strictEqual(kcal00.kcalCalc, 0);
const kcalNear = validator.validateKcalFormula(1, 0, 1, 0, 5); // calc=8, decl=5, beide <20
assert.strictEqual(kcalNear.ok, true, 'nahe 0 mit ±15 absolut muss ok sein');
const kcalMismatch = validator.validateKcalFormula(0, 0, 0, 0, 100);
assert.strictEqual(kcalMismatch.ok, false, '0 calc vs 100 decl muss failen');
const brothZero = JSON.parse(JSON.stringify(gutesBeispiel));
brothZero.title = 'Klare Rinderbrühe (Test)';
brothZero.nutrition = { kcal: 0, protein_g: 0, fat_g: 0, netto_kh_g: 0, ballaststoffe_g: 0 };
brothZero.diet_labels = [];
const resultBrothKcal = validator.validateRecipeV2(brothZero);
assert.ok(!resultBrothKcal.errors.some(function (e) {
  return /Kalorien-Formel-Abweichung/i.test(e);
}), 'Brühe 0 kcal darf keinen kcal-Fehler erzeugen: ' + resultBrothKcal.errors.join('; '));
console.log('OK kcal near-zero Sonderregel (0 vs 0)');

// TEST 3l: nutrition wird aus Zutaten berechnet (LLM-kcal irrelevant)
const kcalOff = JSON.parse(JSON.stringify(gutesBeispiel));
const computedOff = validator.computeNutritionFromIngredients(kcalOff.ingredients);
kcalOff.nutrition.kcal = computedOff.kcal + 200;
kcalOff.nutrition.protein_g = computedOff.protein_g + 40;
const resultKcalFix = validator.validateRecipeV2(kcalOff);
assert.strictEqual(resultKcalFix.ok, true, 'inventierte nutrition darf nicht failen: ' + resultKcalFix.errors.join('; '));
assert.strictEqual(kcalOff.nutrition.protein_g, computedOff.protein_g, 'protein muss aus Zutaten kommen');
assert.strictEqual(kcalOff.nutrition.kcal, computedOff.kcal, 'kcal muss aus Zutaten kommen');
console.log('OK nutrition Bottom-up aus Zutaten');

// TEST 3m: Doppel-String-Fix resolvePlaceholders
const byIdDbl = {
  '0004': { id: '0004', name: 'Olivenöl', amount: 10, unit: 'ml' },
  '0005': { id: '0005', name: 'Salz', amount: 0, unit: 'prise' },
  '0007': { id: '0007', name: 'Wasser', amount: 1000, unit: 'ml' },
};
assert.strictEqual(
  validator.resolvePlaceholders('{0005} Salz', byIdDbl),
  'Salz',
  'Salz Salz vermeiden'
);
assert.strictEqual(
  validator.resolvePlaceholders('Olivenöl {0004}', byIdDbl),
  '10 ml Olivenöl',
  'Olivenöl Doppler vermeiden'
);
assert.strictEqual(
  validator.resolvePlaceholders('Wasser {0007} ml', byIdDbl),
  '1000 ml Wasser',
  'Wasser ml Doppler vermeiden'
);
assert.strictEqual(
  validator.resolvePlaceholders('Die Kombi aus {0004} und {0005}', byIdDbl, { nameOnly: true }),
  'Die Kombi aus Olivenöl und Salz',
  'chef_analysis nameOnly'
);
const gluedResolved = validator.resolvePlaceholders('{0004}{0007}', byIdDbl);
assert.ok(/10 ml Olivenöl/.test(gluedResolved) && /1000 ml Wasser/.test(gluedResolved), 'beide Tokens: ' + gluedResolved);
assert.ok(/Olivenöl\s+1000/.test(gluedResolved), 'benachbarte Expansionen getrennt: ' + gluedResolved);
const strippedQty = validator.stripQuantityMentionsFromText(
  '170 g Lachsfilet und 100ml Kokosmilch30g Avocado unterrühren.'
);
assert.ok(!/\d+\s*(g|ml)\b/i.test(strippedQty), 'strip qty: ' + strippedQty);
assert.ok(/Lachsfilet/.test(strippedQty) && /Avocado/.test(strippedQty), 'Namen bleiben: ' + strippedQty);
assert.ok(!validator.textHasQuantityMention('Das Lachsfilet anbraten.'));
assert.ok(validator.textHasQuantityMention('170 g Lachs anbraten.'));
console.log('OK resolvePlaceholders Anti-Doppel');

// TEST 3n: Eier nur stk ganze Zahlen; kein Garnitur-Step
const badEgg = JSON.parse(JSON.stringify(gutesBeispiel));
badEgg.ingredients[1] = { id: '0002', name: 'Ei', amount: 30, unit: 'g', protein_source: true, netCarbs: 0.7, fat: 10, protein: 13, fiber: 0 };
const resultBadEgg = validator.validateRecipeV2(badEgg);
assert.ok(resultBadEgg.errors.some(function (e) { return /Eier müssen unit="stk"/i.test(e); }), '30g Ei muss failen');
const garnishStep = JSON.parse(JSON.stringify(gutesBeispiel));
garnishStep.steps.push({ title: 'Garnitur', content: 'Mit {0005} bestreuen.', stove_level: 0, time_min: 1 });
const resultGarn = validator.validateRecipeV2(garnishStep);
assert.ok(resultGarn.errors.some(function (e) { return /kein separater Garnitur-Schritt/i.test(e); }), 'Garnitur-Step muss failen');
console.log('OK Eier-stk + Garnitur-Step-Verbot');

// Retry: first fail, second ok
let calls = 0;
async function mockCallGroq() {
  calls += 1;
  if (calls === 1) return { data: kaputt };
  return { data: gutesBeispiel };
}
(async function () {
  const out = await pipeline.generateValidatedRecipe({
    payload: {},
    callGroq: mockCallGroq,
    buildRequestBody: function () { return { messages: [{ role: 'system', content: 'x' }] }; },
  });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.attempts, 2);
  assert.ok(out.recipe && out.recipe.title);
  console.log('OK retry succeeds on 2nd attempt');

  // Exhausted
  calls = 0;
  const fail = await pipeline.generateValidatedRecipe({
    payload: {},
    callGroq: async function () { calls += 1; return { data: kaputt }; },
    buildRequestBody: function () { return { messages: [] }; },
  });
  assert.strictEqual(fail.error, 'validation_exhausted');
  assert.strictEqual(fail.attempts, 3);
  assert.ok(!fail.recipe);
  assert.ok(fail.errors && fail.errors.length);
  console.log('OK exhausted after 3 attempts');

  // Faktor-2-Regression: Zutatenliste skaliert, Steps bleiben mengenfrei (nameOnly).
  const factor2Base = JSON.parse(JSON.stringify(gutesBeispiel));
  factor2Base.ingredients[0].amount = 170; // KI liefert oft 2-Personen-Mengen
  const renderedFull = pipeline.renderRecipeForDisplay(factor2Base);
  // Simuliere Frontend-Skalierung nur auf ingredients (wie scaleLocalRecipe)
  const scaledIngs = renderedFull.ingredients.map(function (ing) {
    return Object.assign({}, ing, { amount: Math.round((ing.amount * 0.5) / 5) * 5 || ing.amount });
  });
  const salmonList = scaledIngs.find(function (i) { return /lachs|hähnchen|haehnchen/i.test(i.name); });
  assert.ok(salmonList && salmonList.amount <= 90, 'skalierte Liste ~85g: ' + (salmonList && salmonList.amount));
  assert.ok(!renderedFull.steps.some(function (s) {
    return /\b\d+[.,]?\d*\s*(g|ml)\b/i.test(s);
  }), 'Steps ohne Mengen trotz Skalierung: ' + renderedFull.steps.join(' | '));
  assert.ok(!/KokosmilchAvocado|ml[A-ZÄÖÜ]/.test(renderedFull.steps.join('')), 'keine Klebe-Strings');
  console.log('OK Faktor-2-Regression (Steps nameOnly)');

  console.log('\nAll recipe-v92 pipeline tests passed.');
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
