# Cursor-Prompt: Rezept-Pipeline auf JSON-Schema v9.2 umstellen

Kontext: Wir haben ein Backend, das Rezepte über ein LLM generieren lässt und dem Nutzer anzeigt. Bisher lieferte das LLM freien Markdown-Text inkl. eines `[SELF-CHECK]`-Blocks, der wiederholt halluzinierte Zahlen enthielt (Nährwerte und Mengen, die nicht zur Zutatenliste passten). Wir stellen jetzt auf ein striktes JSON-Ausgabeschema um, bei dem Zutatenmengen im Zubereitungstext nur noch als `{ingredient_id}`-Platzhalter vorkommen dürfen — das macht Zahlen-Drift strukturell unmöglich statt sie nur nachträglich zu prüfen.

Zwei Referenzdateien liegen im Repo (füge sie unter `docs/` bzw. `backend/validation/` ein, falls noch nicht vorhanden):
- `Chef-KI-System-Prompt-v9.2.md` — der neue System-Prompt fürs LLM, inkl. dem exakten JSON-Schema.
- `recipe_validator.py` — enthält bereits `validate_recipe_v2(recipe: dict) -> ValidationResult` und `resolve_placeholders(text, ingredients_by_id) -> str`.

## Aufgabe

Implementiere in unserem Backend (Sprache/Framework: **[BITTE HIER EURE STACK-DETAILS EINTRAGEN, z. B. Python/FastAPI, Node/Express etc.]**) eine Pipeline-Funktion `generate_validated_recipe(user_request: str) -> RecipeResult`, die:

1. **LLM-Aufruf mit v9.2-Prompt:** Ruft das LLM mit dem System-Prompt aus `Chef-KI-System-Prompt-v9.2.md` und der Nutzeranfrage auf. Erzwinge, falls die API es unterstützt, striktes JSON-Output-Format (z. B. `response_format: json_object` / JSON-Mode), damit kein Text außerhalb des JSON zurückkommt.

2. **Parsing:** Parse die Antwort robust als JSON. Fange Parse-Fehler ab (z. B. wenn das Modell doch Markdown-Codefences ```json ... ``` drumherum setzt — diese vor dem Parsen strippen).

3. **Validierung:** Rufe `validate_recipe_v2()` aus `recipe_validator.py` auf. Nutze `ValidationResult.ok`, `.errors`, `.warnings`.

4. **Retry-Logik bei Validierungsfehlern:**
   - Wenn `result.ok == False`: rufe das LLM erneut auf, füge dem Prompt eine kurze, konkrete Fehlerliste aus `result.errors` als zusätzliche User-Message an ("Deine letzte Ausgabe hatte folgende Fehler, korrigiere sie: [...]"), und lasse es neu generieren.
   - Maximal 3 Versuche. Danach: Fehler an den aufrufenden Service zurückgeben (kein halbfertiges Rezept an den Nutzer ausliefern), inklusive der letzten `result.errors` fürs Logging/Monitoring.
   - Logge jeden fehlgeschlagenen Versuch (Prompt-Version, Fehlerliste, Retry-Nummer) für spätere Auswertung, wie oft welche Regel verletzt wird.

5. **Rendering für die Nutzeransicht:** Baue eine Funktion `render_recipe_for_display(recipe: dict) -> RenderedRecipe`, die:
   - jeden `content`-Text in `steps` sowie `garnish` durch `resolve_placeholders()` in lesbaren Text umwandelt (Platzhalter → "amount unit name"),
   - `nutrition`, `title`, `prep_time_min`, `ingredients` (als finale Einkaufsliste mit Mengen) unverändert durchreicht,
   - `chef_analysis` unverändert durchreicht (enthält ja bereits nur Platzhalter + qualitativen Text, ebenfalls durch `resolve_placeholders()` laufen lassen).

6. **Tests:** Schreibe Unit-Tests für:
   - Ein valides Beispiel-JSON (aus `recipe_validator.py`'s `TEST 2` übernehmen) → muss `ok == True` liefern und korrekt gerendert werden.
   - Ein absichtlich kaputtes Beispiel (aus `TEST 3` übernehmen: freie Zahl im `content`, freie Zahl in `chef_analysis`) → muss `ok == False` mit den erwarteten Fehlermeldungen liefern.
   - Die Retry-Logik: mocke einen LLM-Call, der beim ersten Versuch fehlerhaftes JSON und beim zweiten Versuch valides JSON liefert → Pipeline muss beim zweiten Versuch erfolgreich zurückgeben.
   - Den Fall "3 Versuche erschöpft" → Pipeline muss sauber einen Fehler werfen/zurückgeben, kein halbes Rezept ausliefern.

7. **Monitoring-Hook (optional, falls wir bereits ein Metrics-System haben):** Zähle pro Regel (Kalorien-Formel, Proteinquellen, freie Zahlen in Prosa, Keto-Label, Salz-Einheit) wie oft sie in Validierungsfehlern auftaucht, damit wir sehen, welche Regel das LLM am häufigsten verletzt und ggf. den Prompt gezielt nachschärfen können.

## Wichtige Nebenbedingungen

- Der bisherige `[SELF-CHECK]`-Textblock im Output wird komplett entfernt — nicht mehr parsen, nicht mehr anzeigen.
- Keine Nährwert- oder Mengenzahl darf jemals direkt aus LLM-Freitext an den Nutzer weitergereicht werden, ohne vorher durch `validate_recipe_v2()` gelaufen zu sein.
- Falls unsere aktuelle API-Route/UI noch das alte Markdown-Format erwartet: baue `render_recipe_for_display()` so, dass die Ausgabestruktur (Felder/Namen) kompatibel zum bisherigen Frontend bleibt, auch wenn die interne Datenquelle jetzt JSON ist.
- Bitte KEINE eigene Nährwert-Berechnungslogik neu erfinden — die Formel-Prüfung liegt bereits fertig in `validate_kcal_formula()` innerhalb von `recipe_validator.py`.

## Akzeptanzkriterien

- [ ] Ein manueller Testlauf mit dem bekannten Fehlerfall ("Keto-Hähnchen-Eiersalat" / "High-Protein Pfannen-Hähnchen") erzeugt entweder ein korrektes, validiertes Rezept oder einen sauberen Fehler nach 3 Versuchen — niemals ein Rezept mit widersprüchlichen Zahlen beim Nutzer.
- [ ] Alle neuen Tests laufen grün.
- [ ] Bestehende Frontend-Anzeige funktioniert unverändert (oder wurde bewusst angepasst und dokumentiert).
