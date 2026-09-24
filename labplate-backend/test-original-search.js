'use strict';

const assert = require('assert');
const store = require('./classic-master-store');
const searchLog = require('./original-search-log');

assert.strictEqual(store.resolveClassic('Lasagne').id, 'lasagne_classica');
assert.strictEqual(store.resolveClassic('Classic Italian Lasagna').id, 'lasagne_classica');
assert.strictEqual(store.resolveClassic('PAN-di-SPAGNA'), null);
assert.strictEqual(store.resolveClassic('İçli Köfte').id, 'koefte');
assert.strictEqual(store.resolveClassic('icli kofte').id, 'koefte');

assert.strictEqual(store.resolveClassic('lasagn'), null);
const typo = store.findClassicCandidates('lasagn', 'de', 5);
assert.ok(typo.some((candidate) => candidate.id === 'lasagne_classica'));

const data = store.loadMaster();
const originalStatus = data.recipes[0].status;
data.recipes[0].status = 'draft';
assert.strictEqual(store.resolveClassic('Lasagne'), null);
data.recipes[0].status = originalStatus;

assert.strictEqual(data.recipes[0].sourceType, 'labplate_original');
assert.strictEqual(data.recipes[0].canonicalName.de, data.recipes[0].titles.de);
assert.strictEqual(searchLog.sanitizeQuery('test@example.com'), '[redacted]');
assert.strictEqual(searchLog.sanitizeQuery(' Pan di Spagna '), 'Pan di Spagna');
console.log('test-original-search: ALL OK');
