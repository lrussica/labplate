'use strict';

const assert = require('assert');
const validator = require('./recipe-validator');

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log('OK', msg);
}

// Klammerzusätze
ok(
  validator.proseIngredientName('Ei (Größe M, ca. 60 g)') === 'Ei',
  'Ei ohne Größenklammer'
);
ok(
  validator.proseIngredientName('2 Eier (Größe M, ca. 60 g je)', { pieces: 2 }) === 'Eier',
  'Mehrere Eier → Eier'
);
ok(
  validator.proseIngredientName('1 Ei (Größe M, ca. 60 g)', { pieces: 1 }) === 'Ei',
  'Ein Ei → Ei'
);
ok(
  validator.proseIngredientName('Speck (geräuchert)') === 'Speck',
  'Speck ohne geräuchert'
);
ok(
  validator.proseIngredientName('Avocado (reif)') === 'Avocado',
  'Avocado ohne Klammer'
);

// Platzhalter-Auflösung + Grammatik
const byId = {
  '0002': {
    name: '2 Eier (Größe M, ca. 60 g je)',
    amount: 0,
    unit: '',
    _culinary_amount: 2,
    _discrete: true,
  },
};
const resolved = validator.resolvePlaceholders(
  'Anschließend die {0002} in einer Schüssel verquirlen.',
  byId,
  { nameOnly: true }
);
ok(resolved.indexOf('(') < 0, 'keine Klammern im Fließtext: ' + resolved);
ok(/\bEier\b/.test(resolved), 'Plural Eier: ' + resolved);
ok(!/\bdie Ei\b/i.test(resolved), 'kein „die Ei“: ' + resolved);
ok(
  /die Eier in einer Schüssel verquirlen/i.test(resolved),
  'erwarteter Satz: ' + resolved
);

ok(
  validator.smoothProseIngredientGrammar('Dann die Ei vorsichtig unterheben.') ===
    'Dann die Eier vorsichtig unterheben.',
  'Artikel-Glättung die Ei → die Eier'
);
ok(
  validator.smoothProseIngredientGrammar('Den Speck (geräuchert) anbraten.') ===
    'Den Speck anbraten.',
  'Speck-Klammer im Satz entfernt'
);
ok(
  validator.smoothProseIngredientGrammar(
    'Zwiebel, Karotte und Sellerie darin anschwitzen ( Zwiebel + Karotte + Sellerie + Olivenöl).'
  ) === 'Zwiebel, Karotte und Sellerie darin anschwitzen.',
  'Trailing + annotation stripped'
);
ok(
  validator.smoothProseIngredientGrammar(
    'Das Gemüse andünsten (Zwiebel, Karotte, Sellerie).'
  ) === 'Das Gemüse andünsten.',
  'Trailing comma list annotation stripped'
);
ok(
  /ca\.\s*2\s*Stunden/.test(
    validator.smoothProseIngredientGrammar('Bei niedriger Hitze köcheln lassen (ca. 2 Stunden).')
  ),
  'Zeit-Klammer am Ende bleibt erhalten'
);
ok(
  validator.smoothProseIngredientGrammar('Den Hähnchenbrust in Würfel schneiden.') ===
    'Die Hähnchenbrust in Würfel schneiden.',
  'Hähnchenbrust Femininum'
);
ok(
  validator.smoothProseIngredientGrammar('Den laktosefreier Sojajoghurt in eine Schüssel geben.') ===
    'Den laktosefreien Sojajoghurt in eine Schüssel geben.',
  'laktosefreier nach den'
);
ok(
  /zum laktosefreien Sojajoghurt/.test(
    validator.smoothProseIngredientGrammar('Die Haferflocken zum laktosefreier Sojajoghurt hinzufügen.')
  ),
  'laktosefreier nach zum'
);

// Doppel-Namen / Klammern um Platzhalter
const byWater = {
  '0001': { name: 'Wasser', amount: 250, unit: 'ml' },
  '0005': { name: 'Salz', amount: 0, unit: 'prise' },
};
const waterParen = validator.resolvePlaceholders(
  'Wasser ({0001}) in einem großen Topf zum Kochen bringen, salzen({0005}).',
  byWater,
  { nameOnly: true }
);
ok(waterParen.indexOf('(Wasser)') < 0, 'kein Wasser (Wasser): ' + waterParen);
ok(waterParen.indexOf('(Salz)') < 0, 'kein salzen(Salz): ' + waterParen);
ok(/\bWasser\b/.test(waterParen), 'Wasser einmal: ' + waterParen);
ok(/\bsalzen\b/i.test(waterParen), 'salzen bleibt: ' + waterParen);
ok(!/\bsalzen\s+Salz\b/i.test(waterParen), 'kein salzen Salz: ' + waterParen);
ok(
  validator.resolvePlaceholders('Wasser {0001} erhitzen.', byWater, { nameOnly: true }) ===
    'Wasser erhitzen.',
  'Wasser vor Platzhalter dedupliziert'
);

console.log('\nAll prose-ingredient-name tests passed.');
