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

/**
 * Zutaten, die der Nutzer in der Anfrage ausdruecklich verlangt hat.
 * Beispiel: "Spaghetti mit Tomatensoße und Hähnchen" -> chicken.
 * Diese Zutaten sind kein KI-Stuffing, sondern Kundenwunsch. Der
 * core_protein_dominance-Check darf sie nicht als Verstoss zaehlen.
 */
function extractUserRequestedIds(query) {
  const q = String(query || '').toLowerCase();
  if (!q) return [];
  const rules = [
    { rx: /haehnchen|hähnchen|chicken|huhn|poulet/, id: 'chicken' },
    { rx: /rind|steak|beef|rumpsteak/, id: 'beef' },
    { rx: /schwein|pork|kotelett|schnitzel/, id: 'pork' },
    { rx: /lamm|lamb/, id: 'lamb' },
    { rx: /lachs|salmon/, id: 'salmon' },
    { rx: /thunfisch|tuna/, id: 'tuna' },
    { rx: /garnele|shrimp|scampi/, id: 'shrimp' },
    { rx: /tofu/, id: 'tofu' },
    { rx: /tempeh/, id: 'tempeh' },
    { rx: /seitan/, id: 'seitan' },
    { rx: /ei(?:er)?\b/, id: 'egg' },
    { rx: /speck|bacon|guanciale|pancetta/, id: 'bacon' },
    { rx: /sardelle|anchov/, id: 'anchovy' },
    { rx: /kaese|käse|parmesan|pecorino|mozzarella/, id: 'cheese' },
  ];
  const hits = [];
  for (const r of rules) {
    if (r.rx.test(q)) hits.push(r.id);
  }
  return hits;
}

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
  archetypeOpts.userRequestedIds = extractUserRequestedIds(query);
  if (resolved.compositeId) {
    archetypeOpts.extraAllowedIds = validator.getCompositeAllowedIds(resolved.compositeId);
    archetypeOpts.skipCoreShare = true;
    archetypeOpts.skipAmountRanges = true;  // Composite uebernimmt
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

module.exports = { checkQuery, extractUserRequestedIds };
