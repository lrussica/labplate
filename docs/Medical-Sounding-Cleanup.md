# Medical-Sounding Cleanup (P0/P1)

Umsetzung des Audits „Medical-Sounding + Laktose-Ehrlichkeit“ – Fokus: LabPlate als **Koch-/Journaling-App**, nicht als medizinische App.

## Erledigt (P0)

| Finding | Änderung |
|---------|----------|
| A1/A2 index.html Engine | `applyLabValues()` speichert nur Labs; keine Zielableitung; Portionswarnungen nicht mehr lab-gesteuert |
| A4 Lab-Orientierung | Texte ohne Gramm-Vorschläge; `patch`/`orientKeys` = null (kein Auto-Übernehmen von Zielen) |
| A3/A5 tote warn* / Copy | Neutralisiert / weichere Opt-in-Texte |
| A6 Backend | `lab_guideline_constraints`: medizinische Notes verworfen; Prompt sagt „Lifestyle-Fokus“, nicht „Leitlinien“ |
| C1–C3 Wissen/Lexikon | `knowledgeHTML` DE umgeschrieben; Lexikon-Dateien entmedizinisiert |
| F1/F2 Mangelreport | „Gesprächsnotizen“, „unter Zielwert“, weniger Beschwerde-/Mangel-Framing |

## Erledigt (P1)

| Finding | Änderung |
|---------|----------|
| B1–B5, D1 UI | fiberGoal, microGroupIntro, GI/Omega-3, Beobachtungen, BalanceScore |
| G1 Keynote | Laborwerte = optionaler Kontext; Arztgespräch → Gesprächsnotizen |
| M1 Disclaimers | Coach-Welcome + Lab-Disclaimer früher/klarer non-medical |

## P2 erledigt (alle Sprachen de/en/es/it/pt/fr/tr)

| Finding | Änderung |
|---------|----------|
| E1 Laktose-Wortlaut | „Weil du Laktose meidest…“ / Entsprechungen; Backend-Fallback + `MESSAGES` in 7 Sprachen |
| E2 Allergen-Warnung | „soll nicht enthalten“ / „should NOT contain“ / … in index + Cursor, inkl. Laktose-Honesty |
| Reste | `microGroupIntro`, `fiberGoal`, Protein-/Salz-/Faser-Hinweise, `aiRulePriorityTrigOverLdl` entschärft; korrupte FR/TR-Warnstrings in index repariert |
| Konsistenz | Gleiche drei Laktose-`LBL_*` + Outcomes in index und Cursor; Tests in `test-p2-wording-i18n.js` |

## Bewusst nicht geändert

- Interne Feldnamen `healthScore` (nur sichtbares Label → BalanceScore)
- CSS-IDs `#lp-ov-mangelreport` / Funktionsnamen `buildCoachHealthScoreBadgeHtml`

## Offene Restpunkte (optional)

- Weitere `knowledgeHTML`-Sprachen (ES/IT/…) können noch ältere Claims enthalten (DE ist bereinigt)
- TikTok-Deck nicht im Repo gefunden
- i18n-batch JSON-Kataloge können Restclaims enthalten (shipped: `lexikon-data.js` / `lexikon-terms.js`)
