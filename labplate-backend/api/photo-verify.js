/**
 * Vision-Check: fertiges serviertes Gericht vs. Rohzutaten / falsches Motiv.
 * POST /api/photo/verify  Body: { imageUrl, dishTitle }
 * → { isValidDishPhoto: boolean, reason: string }
 *
 * Technische Fehler (kein Key, Timeout, Provider, ungültiges Modell-JSON):
 * HTTP 200 + Fail-open { isValidDishPhoto: true, reason: "vision-check-failed-open" }
 */
'use strict';

const FAIL_OPEN = Object.freeze({
  isValidDishPhoto: true,
  reason: 'vision-check-failed-open',
});

function stripHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, '').trim();
}

/**
 * @param {object} opts
 * @param {string} opts.groqApiKey
 * @param {string} opts.groqApiUrl
 * @param {string} opts.visionModel
 * @param {number} opts.timeoutMs
 * @param {function} [opts.logEvent]
 */
function createPhotoVerifyHandlers(opts) {
  const groqApiKey = (opts && opts.groqApiKey) || '';
  const groqApiUrl = (opts && opts.groqApiUrl) || 'https://api.groq.com/openai/v1/chat/completions';
  const visionModel = (opts && opts.visionModel) || 'meta-llama/llama-4-scout-17b-16e-instruct';
  const timeoutMs = (opts && opts.timeoutMs) || 25000;
  const logEvent = typeof (opts && opts.logEvent) === 'function' ? opts.logEvent : function () {};

  function handlePhotoVerifyGet(req, res) {
    // Browser-Aufruf ohne Body: kein 404 (Route existiert), klarer Hinweis.
    return res.status(405).json({
      error: 'Method not allowed',
      hint: 'Use POST with JSON { imageUrl, dishTitle }',
    });
  }

  async function handlePhotoVerify(req, res) {
    const startedAt = Date.now();
    const imageUrl = req.body && typeof req.body.imageUrl === 'string' ? req.body.imageUrl.trim() : '';
    const dishTitle = req.body && typeof req.body.dishTitle === 'string'
      ? req.body.dishTitle.trim().slice(0, 120)
      : '';

    if (!imageUrl) {
      return res.status(400).json({ error: 'Missing imageUrl' });
    }
    if (!/^https?:\/\//i.test(imageUrl) || imageUrl.length > 2000) {
      return res.status(400).json({ error: 'Missing imageUrl' });
    }
    if (!dishTitle) {
      return res.status(400).json({ error: 'Missing dishTitle' });
    }

    if (!groqApiKey) {
      logEvent('photo_verify_fail_open', { reason: 'server_not_configured', ms: Date.now() - startedAt });
      return res.status(200).json(FAIL_OPEN);
    }

    const prompt =
      'Zeigt dieses Bild ein fertig zubereitetes, serviertes Gericht namens "' + dishTitle +
      '" – oder zeigt es stattdessen rohe/unverarbeitete Zutaten, Verpackung, ein Logo, eine Landkarte, ' +
      'Personen ohne Essen im Fokus, oder ein inhaltlich falsches Motiv? Antworte NUR mit einem JSON-Objekt: ' +
      '{ "isValidDishPhoto": true|false, "reason": "kurzer Grund" }.';

    const controller = new AbortController();
    const timer = setTimeout(function () { try { controller.abort(); } catch (e) {} }, timeoutMs);

    try {
      const upstream = await fetch(groqApiUrl, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + groqApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: visionModel,
          temperature: 0,
          max_tokens: 200,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: imageUrl } },
              ],
            },
          ],
        }),
        signal: controller.signal,
      });

      const text = await upstream.text();
      if (!upstream.ok) {
        logEvent('photo_verify_fail_open', { reason: 'provider_http', status: upstream.status, ms: Date.now() - startedAt });
        return res.status(200).json(FAIL_OPEN);
      }

      let parsedOuter = null;
      try { parsedOuter = JSON.parse(text); } catch (eParse) {
        logEvent('photo_verify_fail_open', { reason: 'provider_json', ms: Date.now() - startedAt });
        return res.status(200).json(FAIL_OPEN);
      }

      const content = parsedOuter && parsedOuter.choices && parsedOuter.choices[0] &&
        parsedOuter.choices[0].message
        ? parsedOuter.choices[0].message.content
        : null;

      if (typeof content !== 'string' || !content.trim()) {
        logEvent('photo_verify_fail_open', { reason: 'empty_response', ms: Date.now() - startedAt });
        return res.status(200).json(FAIL_OPEN);
      }

      let verdict = null;
      try { verdict = JSON.parse(content); } catch (eJ) {
        const m = content.match(/\{[\s\S]*\}/);
        if (m) {
          try { verdict = JSON.parse(m[0]); } catch (e2) { verdict = null; }
        }
      }

      if (!verdict || typeof verdict.isValidDishPhoto !== 'boolean') {
        logEvent('photo_verify_fail_open', { reason: 'invalid_model_json', ms: Date.now() - startedAt });
        return res.status(200).json(FAIL_OPEN);
      }

      const reason = typeof verdict.reason === 'string'
        ? stripHtml(verdict.reason).slice(0, 240)
        : '';

      console.log(
        '[photo/verify] OK dish="' + dishTitle.slice(0, 40) +
        '" valid=' + verdict.isValidDishPhoto +
        ' ms=' + (Date.now() - startedAt)
      );

      return res.status(200).json({
        isValidDishPhoto: verdict.isValidDishPhoto,
        reason: reason || (verdict.isValidDishPhoto ? 'ok' : 'rejected'),
      });
    } catch (err) {
      logEvent('photo_verify_fail_open', {
        reason: err && err.name ? err.name : 'unknown',
        ms: Date.now() - startedAt,
      });
      return res.status(200).json(FAIL_OPEN);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    handlePhotoVerify,
    handlePhotoVerifyGet,
    FAIL_OPEN,
  };
}

module.exports = {
  createPhotoVerifyHandlers,
  FAIL_OPEN,
};
