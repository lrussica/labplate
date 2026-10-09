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

  // Composite-Check laeuft zusaetzlich, wenn ein Composite erkannt wurde
  let compositeResult = null;
  if (resolved.compositeId && recipe) {
    try {
      compositeResult = validator.validateComposite(resolved.compositeId, recipe);
    } catch (e) {
      compositeResult = { ok: true, violations: [{
        code: 'composite_check_failed',
        severity: 'warn',
        detail: 'Composite-Check Fehler: ' + (e && e.message),
      }] };
    }
  }

  // Wenn weder Archetyp noch Composite -> free
  if (resolved.mode === 'free' || !resolved.archetypeId) {
    if (compositeResult && !compositeResult.ok) {
      return {
        ok: false,
        mode: 'classic',
        resolved,
        violations: compositeResult.violations,
      };
    }
    return {
      ok: true,
      mode: resolved.compositeId ? 'composite' : 'free',
      resolved,
      violations: compositeResult ? compositeResult.violations : [],
    };
  }

  // Archetyp-Check mit Composite-Bridge
  // Wenn ein Composite erkannt wurde, akzeptiert der Archetyp-Check
  // die Composite-allowed-IDs und uebernimmt die Protein-Bewertung
  // nicht (das Composite ist die spezifischere Schicht).
  const archetypeOpts = Object.assign({}, options || {});
  if (resolved.compositeId) {
    archetypeOpts.extraAllowedIds = validator.getCompositeAllowedIds(resolved.compositeId);
    archetypeOpts.skipCoreShare = true;
  }
  const v = validator.validate(resolved.archetypeId, recipe, archetypeOpts);

  // Violations zusammenfuehren
  let allViolations = v.violations.slice();
  if (compositeResult) {
    allViolations = allViolations.concat(compositeResult.violations);
  }

  const hasBlock = allViolations.some(x => x.severity === 'block');
  return {
    ok: !hasBlock,
    mode: resolved.compositeId ? 'composite' : 'classic',
    resolved,
    violations: allViolations,
  };
}

module.exports = { checkQuery };
