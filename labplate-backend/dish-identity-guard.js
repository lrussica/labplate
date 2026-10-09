'use strict';
/**
 * dish-identity-guard.js
 * =======================
 * Wrapper um Resolver + Validator. Eine Funktion, ein Ergebnis.
 *
 * Typischer Aufruf aus der Pipeline:
 *   const guard = require('./dish-identity-guard');
 *   const check = guard.checkQuery(req.query, recipe);
 *   if (!check.ok) return res.status(422).json(check);
 *
 * Wenn mode='free': Validator wird nicht ausgefuehrt (freie Rezepte
 * haben keinen Archetyp).
 */
const resolver = require('./dish-resolver');
const validator = require('./dish-identity-validator');

function checkQuery(query, recipe, options) {
  const resolved = resolver.resolve(query);
  if (resolved.mode === 'free' || !resolved.archetypeId) {
    return {
      ok: true,
      mode: 'free',
      resolved,
      violations: [],
    };
  }
  const v = validator.validate(resolved.archetypeId, recipe, options);
  return {
    ok: v.ok,
    mode: 'classic',
    resolved,
    violations: v.violations,
  };
}

module.exports = { checkQuery };
