# Laktose-Ehrlichkeit & QualityGate

LabPlate behandelt den Profilwunsch „Laktose meiden“ kulinarisch ehrlich: nur etablierte Ersatzprodukte, klare Frontend-Nachrichten, keine False Positives im QualityGate.

## Outcomes (genau eine Nachricht)

| Status | Wann | Frontend |
|--------|------|----------|
| `adapted` | Originalgericht **mit nachweisbaren** etablierten laktosefreien Ersatzzutaten in `finalIngredients` | Banner: „Weil du Laktose meidest… direkt mit passenden laktosefreien Alternativen…“ |
| `alternative_available` | Kein klassisches Rezept ohne Laktose, aber passende Alternative | Chat-Frage + CTA „Ja, Alternative zeigen“ |
| `impossible` | Kein würdiger laktosefreier Ersatz (inkl. leere Zutaten ohne Sentinel) | Chat-Fehlertext mit Qualitätsstandards |
| `none` | Laktose nicht aktiv **oder** kein Ersatz nachweisbar (z. B. Ragù ohne Milch/Ersatz) | Kein Banner |

**Wichtig:** Dish-Namen allein (Ragù, Carbonara) lösen **kein** `adapted` aus. Es braucht mindestens eine etablierte Ersatzzutat (z. B. Hafercreme, laktosefreie Sahne).

LLM-Sentinels (bei aktivem Laktose-Allergen; Matching in Titel **und** Analyse/Zutaten/Steps):

- `__LACTOSE_HONESTY_ALTERNATIVE__` → `alternative_available` (`chef_analysis` / `: Name` = Vorschlag)
- `__LACTOSE_HONESTY_IMPOSSIBLE__` → `impossible`
- Leere `ingredients` ohne Sentinel → `impossible` (kein generisches Retry)

## Fresearch vs. Sentinel

„Kein anderes Gericht“ gilt nur für Outcome 1 (authentischer Ersatz am gleichen Gericht).
Bei Outcome 2/3 ist der Sentinel-Titel verbindlich – es darf kein erfundenes Ersatzgericht als normales Rezept ausgegeben werden.

## Eigenrezept-Policy (STRUCTURED)

| Situation | Verhalten |
|-----------|-----------|
| Eigenrezept + beliebige Allergene | Passthrough: Zutaten 1:1, Allergene nur merken (strict-prompt + Client-Note) |
| Eigenrezept + Laktose + tierische Milch | **Kein** KI-Replace; QualityGate und Frontend-Allergen-Check **blocken** |
| Generativ/Freisuche + Laktose | Honesty/Replace-Instruktion + Sentinels erlaubt |

## Erlaubte Ersatzprodukte

laktosefreie Butter/Sahne/Milch/Joghurt/Frischkäse, Pflanzensahne, Hafer-/Soja-/Mandeldrink, Hafer-/Soja-/Kokoscreme, Kokosmilch bei Currys.

**Verboten / unsicher:** unklare „Milchersatz“-Zutaten ohne laktosefrei/pflanzlich; Erdnusscreme als Milchersatz; Tofu in klassischer Sahnesauce; Hähnchen statt Joghurt-Konzept.

## Klassifikator-Kanten

- **Milchersatz** ohne „laktosefrei/pflanzlich/vegan“ → als tierisch/unsicher (`isAnimalDairyName`).
- **Erdnusscreme / Nussmus** → kein Dairy-Substitute.
- **Haferdrink** erfüllt den Sahne-Slot nur bei Sahne-/Creme-Kontext in Titel/Steps (oder wenn der Name selbst Sahne/Creme ist).

## i18n (alle App-Sprachen: de, en, es, it, pt, fr, tr)

- Backend-Messages in `lactose-honesty.js` für **alle sieben** Sprachen (gleicher Wortlaut wie Frontend-`LBL_*`).
- Frontend: `LBL_RECIPE_*` bevorzugen, wenn `lh.lang` / `adaptationNoteLang` nicht zur UI-Sprache passt (kein DE-Override in EN-UI).
- `NUTRI_ALLERGEN_EXTRA_PHRASES.lactose` enthält echte Milch-/Sahne-Begriffe (index + Cursor).
- Allergen-Warnung (`aiRuleAllergenWarning`): in allen Sprachen „soll nicht enthalten“ / „should NOT contain“ / … plus Laktose-Honesty-Hinweis.

## P2 Wortlaut (E1/E2)

| Thema | Formulierung |
|-------|----------------|
| E1 adapted/impossible | „Weil du Laktose meidest…“ / „Because you avoid lactose…“ (kein „Laktoseunverträglichkeit“) |
| E2 Allergen-Prompt | „Das Rezept soll … NICHT enthalten“ (kein „verträgt NICHT“) |

## Code

- `labplate-backend/lactose-honesty.js` – Klassifikation, Nachrichten, Prompts, Sentinels
- `recipe-portions.js` / `recipe-quality-gate.js` – Sahne-Konsistenz & Allergene
- `recipe-display-fixes.js` – Adaptation-Banner (`adapted` nur mit Ersatz); Fallback weich
- `recipe-pipeline-v92.js` / `server.js` – Sentinel/leere Zutaten → API `{ lactoseHonesty }`
- `strict-prompt.js` – Eigenrezept: Allergene nur merken / Passthrough-Note
- Frontend: `LabPlate_34_Cursor.html` und `index.html` – `LBL_RECIPE_DAIRY_FREE_ADAPTATION`, `LBL_RECIPE_LACTOSE_ALTERNATIVE`, `LBL_RECIPE_LACTOSE_IMPOSSIBLE`

## Tests

```bash
node labplate-backend/test-lactose-honesty.js
node labplate-backend/test-p2-wording-i18n.js
node labplate-backend/test-recipe-live-ragu-fixes.js
node labplate-backend/test-recipe-quality-gate.js
```
