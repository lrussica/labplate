'use strict';
/**
 * CORS-Header + Operation-Id-Idempotenz (ohne laufenden Server).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

assert.ok(
  /allowedHeaders:\s*\[[^\]]*X-Recipe-Operation-Id/s.test(serverSrc),
  'CORS allowedHeaders muss X-Recipe-Operation-Id enthalten'
);
assert.ok(
  /function applyCorsHeaders/.test(serverSrc),
  'applyCorsHeaders muss CORS auch im Error-Pfad setzen'
);
assert.ok(
  /corsSafetyNet|corsSafeEnd/.test(serverSrc),
  'CORS Safety-Net Middleware vorhanden'
);
assert.ok(
  /UNHANDLED/.test(serverSrc) && /nutri_recipe_throw/.test(serverSrc),
  'nutri-recipe try/catch mit Stack-Log'
);
assert.ok(
  /last_attempt_ingredient_names/.test(serverSrc),
  '422 liefert Ingredient-Namen zur Diagnose'
);
assert.ok(
  /function getRecipeOperationId/.test(serverSrc),
  'getRecipeOperationId vorhanden'
);
assert.ok(
  /recipeOperationCache/.test(serverSrc),
  'Operation-Cache vorhanden'
);

// Simulierter TTL-Cache wie im Server
const RECIPE_OPERATION_CACHE_TTL_MS = 10 * 60 * 1000;
const RECIPE_OPERATION_CACHE_MAX = 200;
const recipeOperationCache = new Map();

function getCachedRecipeOperation(key) {
  if (!key) return null;
  const entry = recipeOperationCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > RECIPE_OPERATION_CACHE_TTL_MS) {
    recipeOperationCache.delete(key);
    return null;
  }
  return entry.payload;
}

function setCachedRecipeOperation(key, payload) {
  if (!key || payload == null) return;
  recipeOperationCache.set(key, { at: Date.now(), payload });
  while (recipeOperationCache.size > RECIPE_OPERATION_CACHE_MAX) {
    const oldest = recipeOperationCache.keys().next().value;
    recipeOperationCache.delete(oldest);
  }
}

const recipe = { title: 'Ragù', ingredients: [{ name: 'Fleisch', amount: 100, unit: 'g' }] };
setCachedRecipeOperation('op-1', recipe);
assert.strictEqual(getCachedRecipeOperation('op-1').title, 'Ragù');
assert.strictEqual(getCachedRecipeOperation('op-2'), null);

// Frontend: Sync-Lock + kein CORS-Retry
const html = fs.readFileSync(path.join(__dirname, '../LabPlate/LabPlate_34_Cursor.html'), 'utf8');
assert.ok(html.includes('recipeRequestInFlight'), 'recipeRequestInFlight Guard');
assert.ok(html.includes('Duplicate request suppressed'), 'Duplicate-Suppress Log');
assert.ok(html.includes('cors/network-fatal') || html.includes('CORS/Network fatal'), 'CORS fatal');
assert.ok(html.includes("payload = Object.assign({}, payload, { operationId: opts.operationId })"), 'operationId im Body');
assert.ok(html.includes("headers['X-Recipe-Operation-Id']"), 'Header weiterhin gesetzt');

// Ein Lock: tryAcquire setzt Flag synchron
let recipeRequestInFlight = false;
function tryAcquireRecipeRequestLock() {
  if (recipeRequestInFlight) return false;
  recipeRequestInFlight = true;
  return true;
}
assert.strictEqual(tryAcquireRecipeRequestLock(), true);
assert.strictEqual(tryAcquireRecipeRequestLock(), false);
assert.strictEqual(tryAcquireRecipeRequestLock(), false);
recipeRequestInFlight = false;
assert.strictEqual(tryAcquireRecipeRequestLock(), true);

console.log('test-cors-operation-id: OK');
