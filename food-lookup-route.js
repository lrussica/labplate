/**
 * BEISPIEL-ROUTE für euren bestehenden Node/Express-Server auf Render
 * (labplate.onrender.com) — dort, wo bereits die funktionierende Route
 * "/api/nutri-recipe" definiert ist.
 *
 * DIAGNOSE (bestätigt durch die Browser-Konsole):
 *   AI-Lebensmittelsuche: HTTP-Fehler 404 {"error":"not_found"}
 * -> Der Client (LabPlate.html) ruft https://labplate.onrender.com/api/food-lookup
 *    korrekt auf, aber diese Route existiert auf dem Server schlicht noch nicht.
 *    Das ist der alleinige Grund für "Die KI-Analyse ist fehlgeschlagen" — am
 *    Client-Code (LabPlate.html) muss dafür nichts mehr geändert werden.
 *
 * Diese Datei zeigt, wie die fehlende Route aussehen könnte — nach EXAKT demselben
 * sicheren Muster wie eure bestehende "/api/nutri-recipe"-Route: der echte
 * Groq-API-Schlüssel bleibt ausschließlich in einer Server-Umgebungsvariable
 * (GROQ_API_KEY, in den Render-Dashboard-Settings unter "Environment" gesetzt),
 * der Client sieht ihn nie.
 *
 * Passt Pfade/Variablennamen an eure tatsächliche Serverdatei an — das hier ist
 * ein eigenständiges, kopierbares Beispiel, kein fertiges Deployment.
 */

// Falls noch nicht vorhanden: npm install node-fetch  (bei Node < 18)
// Bei Node 18+ ist fetch bereits global verfügbar, der Import ist dann überflüssig.
// const fetch = require('node-fetch');

const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Registriert die Route auf einer bestehenden Express-App.
 * Aufruf z. B. in eurer server.js:
 *   const { registerFoodLookupRoute } = require('./food-lookup-route-example');
 *   registerFoodLookupRoute(app);
 */
function registerFoodLookupRoute(app) {
  app.post('/api/food-lookup', async (req, res) => {
    try {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        console.error('/api/food-lookup: GROQ_API_KEY ist nicht gesetzt (Render -> Environment)');
        return res.status(500).json({ error: 'server_misconfigured' });
      }

      // Der Client (LabPlate.html) schickt bereits den vollständigen
      // Groq-Chat-Completion-Request ({model, response_format, messages, temperature}).
      // Diese Route reicht ihn 1:1 an Groq weiter und ergänzt nur den Authorization-Header.
      const { model, response_format, messages, temperature } = req.body || {};
      if (!model || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'invalid_request' });
      }

      const groqRes = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, response_format, messages, temperature }),
      });

      const groqBody = await groqRes.text();

      // Status UND Body von Groq unverändert an den Client durchreichen - LabPlate.html
      // wertet res.ok / choices[0].message.content bereits selbst robust aus
      // (siehe parseAiFoodCompletion() in LabPlate.html).
      res.status(groqRes.status);
      res.setHeader('Content-Type', 'application/json');
      res.send(groqBody);
    } catch (err) {
      console.error('/api/food-lookup: unerwarteter Fehler', err);
      res.status(502).json({ error: 'upstream_error' });
    }
  });
}

module.exports = { registerFoodLookupRoute };
