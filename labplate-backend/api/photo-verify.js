/**
 * Vision-Check: fertiges serviertes Gericht vs. Rohzutaten / falsches Motiv.
 * POST /api/photo/verify  Body: { imageUrl, dishTitle }
 * → { isValidDishPhoto: boolean, reason: string }
 *
 * Technische Fehler (kein Key, Timeout, Provider, ungültiges Modell-JSON):
 * HTTP 200 + Fail-open { isValidDishPhoto: true, reason: "vision-check-failed-open[…]" }
 */
'use strict';

function stripHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, '').trim();
}

function failOpen(detail) {
  const d = detail ? String(detail).replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  return {
    isValidDishPhoto: true,
    reason: d ? ('vision-check-failed-open:' + d) : 'vision-check-failed-open',
  };
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
  const visionModel = (opts && opts.visionModel) || 'qwen/qwen3.6-27b';
  const timeoutMs = (opts && opts.timeoutMs) || 25000;
  const logEvent = typeof (opts && opts.logEvent) === 'function' ? opts.logEvent : function () {};

  function handlePhotoVerifyGet(req, res) {
    return res.status(405).json({
      error: 'Method not allowed',
      hint: 'Use POST with JSON { imageUrl, dishTitle }',
    });
  }

  async function callGroqVision(imageUrl, dishTitle, useJsonFormat) {
    const prompt =
      'Zeigt dieses Bild ein fertig zubereitetes, serviertes Gericht namens "' + dishTitle +
      '" – oder zeigt es stattdessen rohe/unverarbeitete Zutaten, Verpackung, ein Logo, eine Landkarte, ' +
      'Personen ohne Essen im Fokus, oder ein inhaltlich falsches Motiv? ' +
      'Antworte NUR mit einem JSON-Objekt ohne Markdown und ohne Thinking, exakt so: ' +
      '{"isValidDishPhoto":true|false,"reason":"kurzer Grund"}.';

    const body = {
      model: visionModel,
      temperature: 0,
      max_completion_tokens: 200,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
    };
    if (useJsonFormat) body.response_format = { type: 'json_object' };

    const controller = new AbortController();
    const timer = setTimeout(function () { try { controller.abort(); } catch (e) {} }, timeoutMs);
    try {
      const upstream = await fetch(groqApiUrl, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + groqApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await upstream.text();
      return { ok: upstream.ok, status: upstream.status, text };
    } finally {
      clearTimeout(timer);
    }
  }

  function parseVerdict(content) {
    if (typeof content !== 'string' || !content.trim()) return null;
    // Qwen Thinking-Modus / Markdown um JSON herum entfernen
    var cleaned = content
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/```(?:json)?/gi, '')
      .replace(/```/g, '')
      .trim();
    let verdict = null;
    try { verdict = JSON.parse(cleaned); } catch (eJ) {
      const m = cleaned.match(/\{[\s\S]*?"isValidDishPhoto"[\s\S]*?\}/);
      if (m) {
        try { verdict = JSON.parse(m[0]); } catch (e2) { verdict = null; }
      }
    }
    if (!verdict || typeof verdict.isValidDishPhoto !== 'boolean') {
      // Fallback: booleans im Freitext
      const trueHit = /\b"isValidDishPhoto"\s*:\s*true\b/i.test(cleaned);
      const falseHit = /\b"isValidDishPhoto"\s*:\s*false\b/i.test(cleaned);
      if (trueHit && !falseHit) return { isValidDishPhoto: true, reason: 'ok' };
      if (falseHit && !trueHit) {
        const rm = cleaned.match(/"reason"\s*:\s*"([^"]{1,200})"/i);
        return { isValidDishPhoto: false, reason: rm ? rm[1] : 'rejected' };
      }
      return null;
    }
    const reason = typeof verdict.reason === 'string'
      ? stripHtml(verdict.reason).slice(0, 240)
      : '';
    return {
      isValidDishPhoto: verdict.isValidDishPhoto,
      reason: reason || (verdict.isValidDishPhoto ? 'ok' : 'rejected'),
    };
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
      return res.status(200).json(failOpen('no_key'));
    }

    try {
      let result = await callGroqVision(imageUrl, dishTitle, true);
      if (!result.ok) {
        // Retry ohne response_format (manche Vision-Modelle meckern)
        result = await callGroqVision(imageUrl, dishTitle, false);
      }
      if (!result.ok) {
        const snippet = String(result.text || '').replace(/\s+/g, ' ').slice(0, 120);
        logEvent('photo_verify_fail_open', {
          reason: 'provider_http',
          status: result.status,
          body: snippet,
          model: visionModel,
          ms: Date.now() - startedAt,
        });
        return res.status(200).json(failOpen('http' + result.status));
      }

      let parsedOuter = null;
      try { parsedOuter = JSON.parse(result.text); } catch (eParse) {
        logEvent('photo_verify_fail_open', { reason: 'provider_json', ms: Date.now() - startedAt });
        return res.status(200).json(failOpen('bad_provider_json'));
      }

      const content = parsedOuter && parsedOuter.choices && parsedOuter.choices[0] &&
        parsedOuter.choices[0].message
        ? parsedOuter.choices[0].message.content
        : null;

      const verdict = parseVerdict(content);
      if (!verdict) {
        const snip = String(content || '').replace(/\s+/g, ' ').slice(0, 100);
        logEvent('photo_verify_fail_open', { reason: 'invalid_model_json', snip, ms: Date.now() - startedAt });
        return res.status(200).json(failOpen('bad_model_json'));
      }

      console.log(
        '[photo/verify] OK dish="' + dishTitle.slice(0, 40) +
        '" valid=' + verdict.isValidDishPhoto +
        ' model=' + visionModel +
        ' ms=' + (Date.now() - startedAt)
      );

      return res.status(200).json(verdict);
    } catch (err) {
      const name = err && err.name ? err.name : 'unknown';
      logEvent('photo_verify_fail_open', { reason: name, ms: Date.now() - startedAt });
      return res.status(200).json(failOpen(name === 'AbortError' ? 'timeout' : name));
    }
  }

  return {
    handlePhotoVerify,
    handlePhotoVerifyGet,
    failOpen,
  };
}

module.exports = {
  createPhotoVerifyHandlers,
  failOpen,
};
