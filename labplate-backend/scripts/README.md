# LabPlate Scripts

Werkzeuge zur Pflege und Verifikation des Naehrwert-Katalogs.

## verify-catalog.js - USDA-Verifizierer

Prueft JEDEN Eintrag in `nutri-catalog.js` live gegen USDA FoodData Central.

    cd labplate-backend
    node scripts/verify-catalog.js

Erwartete Ausgabe: pro Eintrag OK / ABWEICHUNG / KEIN-ID, dann Zusammenfassung.
Detailliertes Ergebnis landet in `/tmp/verify-catalog-result.json`.

Erwartete Abweichungen (dokumentiert, kein Handlungsbedarf):
- `tempeh`: fiber 1.4 (USDA-Datenloch, BLS-Schaetzung)
- `almond_flour`: kcal aus Makros berechnet (Foundation ohne kcal-Wert)
- `tomato_paste`: kcal aus Makros berechnet (Foundation ohne kcal-Wert)
- `coconut_milk_light`: kein USDA-Standardeintrag (Herstellerangabe)
- `curry_paste_red`: kein USDA-Standardeintrag (Herstellerangabe)
- `water`, `salt`: definierte Nullwerte

Voraussetzung: `USDA_API_KEY` in `.env` (bereits gesetzt).

---

## Neue Zutat hinzufuegen - 6 Schritte

### 1. USDA-Treffer suchen

Kleines Einmal-Script in `labplate-backend/` ablegen und ausfuehren:

    'use strict';
    const fs = require('fs');
    const path = require('path');
    (function loadEnv() {
      try { require('dotenv').config({ path: path.join(process.cwd(), '.env') }); } catch (_) {}
      if (process.env.USDA_API_KEY) return;
      const envPath = path.join(process.cwd(), '.env');
      if (!fs.existsSync(envPath)) return;
      fs.readFileSync(envPath, 'utf8').split('\n').forEach(function (line) {
        const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      });
    })();
    const usda = require('./api/usda');
    (async () => {
      const res = await usda.searchFood('DEINE SUCHE HIER', { pageSize: 5 });
      (res.data.results || []).forEach(h => {
        const m = h.macrosPer100g || {};
        console.log('FDC ' + h.fdcId + ' [' + h.dataType + '] P=' + m.protein +
          ' F=' + m.fat + ' KH=' + m.netCarbs + ' Fib=' + m.fiber + ' kcal=' + h.calories);
        console.log('  ' + h.name);
      });
    })();

Wichtig: Foundation und SR Legacy bevorzugen. Branded meiden (oft unvollstaendig).

### 2. Eintrag in `nutri-catalog.js` schreiben

Format (siehe bestehende Eintraege):

    dein_key: {
      displayName: 'Anzeigename',
      aliases: ['alias1', 'alias2', 'alias3'],
      per100g: { protein: 0.0, fat: 0.0, netCarbs: 0.0, fiber: 0.0, kcal: 0 },
      source: 'USDA FDC ZAHL (Beschreibung)',
    },

- aliases: alle Schreibweisen, die die KI produzieren koennte. Umlaute und
  oe/ae/ue-Varianten werden AUTOMATISCH abgedeckt, muessen NICHT doppelt
  gepflegt werden.
- source: USDA-FDC-Nummer ODER ehrliche Herstellerangabe.

### 3. Syntax pruefen

    node --check nutri-catalog.js

### 4. Live gegen USDA verifizieren

    node scripts/verify-catalog.js | grep dein_key

Wenn ABWEICHUNG: entweder Wert korrigieren oder als dokumentierte Ausnahme
in dieser README ergaenzen.

### 5. Golden-Set erweitern

In `test-nutrition.js` unter `=== KATALOG-LOOKUP ===` einen Testfall
hinzufuegen:

    ['L30', 'Anzeigename', 'dein_key'],

Bei jedem neuen Eintrag MINDESTENS ein Testfall, damit die Zutat nicht
unbemerkt aus dem Katalog verschwindet.

    node test-nutrition.js

Erwartet: alle Tests gruen.

### 6. Commit + Push

    cd "/Users/unitoflove/Documents/LabPlate Ordner/LabPlate"
    git add labplate-backend/nutri-catalog.js labplate-backend/test-nutrition.js
    git commit -m "Katalog: Zutat X hinzugefuegt (USDA FDC ...)"
    git push origin main

Render deployt automatisch (~50 s). Live pruefen mit einer Test-Anfrage.

---

## Grundsaetze

1. Keine Zahl aus dem Gedaechtnis. Jede Zahl in `nutri-catalog.js` hat
   entweder eine USDA-FDC-Nummer oder ist als Herstellerangabe dokumentiert.
2. Kein stiller Fallback. Wenn eine Zutat nicht im Katalog steht, bleibt
   der KI-Wert erhalten - aber `_catalogKey` fehlt, also ist es sichtbar.
3. Test-First bei neuen Regeln. Neue Logik (Filter, Berechnungen, Labels)
   bekommt zuerst einen Testfall im Golden-Set.
4. Backup vor jedem Patch. Nach `~/Documents/LabPlate_Extern/_backups_server/`.
5. Live verifizieren. Lokal gruen ist nicht genug - Render-Log oder
   Live-Response pruefen.
