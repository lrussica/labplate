/**
 * SPIEGEL / Re-Export – keine eigenen Prompt-Regeln hier pflegen.
 * ==================================================================
 * Render und produktive Logik: labplate-backend/nutri-recipe-core.js
 * Root-server.js erwartet dieselben Exports (validateIncoming, buildGroqRequest, …).
 * Fruehere Root-Kopie (Express-Router + abweichende Prompts) war veraltet und
 * widersprach dem Backend – deshalb nur noch Re-Export.
 */
'use strict';
module.exports = require('./labplate-backend/nutri-recipe-core');
