# LabPlate – Kulinarische Grundregeln

Diese Datei ist die Quelle fuer alle kulinarischen Pruefungen im Backend.
Jede aktive Regel hat einen Implementierungspunkt und einen Test.
Neue Regeln werden hier zuerst dokumentiert, dann implementiert.

Quelle: Eigene Notizen (Kochlehre), internationale Kuechen-Standards,
BLS/DSGVO-Konformitaet, ChatGPT-Empfehlungen.

Stand: 2026-10-08

---

## 1. Aktive Regeln (im Code implementiert)

Alle Regeln in `labplate-backend/plausibility-checks.js`.
Status: **Warnung** (nicht blockierend), sichtbar im Client als Quality-Notice.

| ID | Regel | Status |
|---|---|---|
| R1 | Fett-Ueberladung: >= 3 Fette gleichzeitig | aktiv |
| R2 | Ballaststoff-Overload: >= 3 starke Ballaststoff-Traeger | aktiv |
| R3 | Psyllium/Flohsamen in Protein-Gericht (Haehnchen/Fleisch/Fisch) | aktiv |
| R4 | Essig in Tofu-/Tempeh-Curry | aktiv |
| R5 | Maillard vor Schmoren: Bei Brasieren/Schmoren muss Fleisch vor Fluessigkeitszusatz scharf angebraten werden (vormals P1) | aktiv |
| R6 | Saeure-Korrektur: Gerichte mit >= 2 Fetten brauchen eine Saeurequelle (Zitrone, Essig, Wein, Joghurt, Tomate). Desserts ausgenommen (vormals P5) | aktiv |
| R7 | Riposo della Carne: Nach scharfem Anbraten/Grillen von ganzem Fleisch (Steak, Kotelett, Filet, Haehnchenbrust) Ruheschritt vor dem Schneiden. Hackfleisch/Gulasch ausgenommen (vormals P2) | aktiv |
| R8 | Deglassatura: Nach scharfem Anbraten mit Saucen-Kontext (Koecheln/Schmoren) muss der Fond mit Fluessigkeit geloest werden (abloeschen). Reine Bratgerichte ohne Sauce ausgenommen (vormals P4) | aktiv |

Tests: `labplate-backend/test-nutrition.js` (Abschnitt PLAUSIBILITAET).

---

## 2. Regeln in Vorbereitung

Aus den italienischen Kochlehre-Notizen abgeleitet. Werden nach und nach
implementiert, jede mit Test. Status: **nicht implementiert**.

### Basistechniken

| ID | Regel | Pruefbar? | Anmerkung |
|---|---|---|---|
| ~~P1~~ | ~~Maillard vor dem Schmoren~~ | – | **implementiert als R5 (2026-10-08)** |
| ~~P2~~ | ~~Riposo della Carne~~ | – | **implementiert als R7 (2026-10-08)** |
| P3 | Riduzione korrekt: Bei "Reduktion" muss Fluessigkeit vorher drin sein | ja | Sequenz-Pruefung |
| ~~P4~~ | ~~Deglassatura~~ | – | **implementiert als R8 (2026-10-08)** |

### Bilanciamento dei Sapori

| ID | Regel | Pruefbar? | Anmerkung |
|---|---|---|---|
| ~~P5~~ | ~~Saure-Korrektur~~ | – | **implementiert als R6 (2026-10-08)** |
| P6 | Umami-Anker: Herzhaftes Gericht ohne Umami-Traeger (Parmesan, Tomate, Sojasauce, Pilze, Fleischfond) = Warnung | ja | Nur bei "main" |
| P7 | Salatura a Strati: Salz muss in >= 2 verschiedenen Steps referenziert werden, nicht nur einmal | ja | Ausser bei Desserts und Suppen |
| P8 | 5-Geschmacks-Balance: Salzig + Sauer + Umami sollten mindestens vorhanden sein | ja (grob) | Nur Warnung |

### Emulsione / Konsistenz

| ID | Regel | Pruefbar? | Anmerkung |
|---|---|---|---|
| P9 | Emulsion ohne Bindemittel: Oel + Wasser in Sauce ohne Ei/Senf/Tomatenmark = Warnung | ja | Zutaten-Kombinations-Pruefung |
| P10 | Nicht drei Cremes gleichzeitig (Kokosmilch + Sahne + Frischkaese) = Textur-Kollaps | ja | Aehneln R1 |

### Stagionalitaet

| ID | Regel | Pruefbar? | Anmerkung |
|---|---|---|---|
| P11 | Saison-Check: Tomate/Paprika/Aubergine im Winter (Nov-Feb) = Warnung | ja (mit Datum) | Nur bei explizit frischer Ware |
| P12 | Saison-Check: Kuerbis/Suesskartoffel/Rosenkohl im Sommer (Jun-Aug) = Warnung | ja (mit Datum) | |

### Mise en Place

| ID | Regel | Pruefbar? | Anmerkung |
|---|---|---|---|
| P13 | Erster Step ist Vorbereitung: Schneiden/Wiegen vor Hitze | ja | Warnung wenn erster Step Hitze ist |
| P14 | Eier-Sicherheit: Rohe Eier in nicht-gekochten Steps = Warnung | ja | Nur bei Salat/Dessert |

### Cross-Contamination

| ID | Regel | Pruefbar? | Anmerkung |
|---|---|---|---|
| P15 | Rohes Fleisch + Salat im selben Step = Warnung | schwach | Nur bei expliziten Misch-Steps |

---

## 3. Nicht pruefbar (nur als Referenz)

Diese Konzepte sind wichtig, aber vom Rechner nicht sinnvoll pruefbar.
Sie gehoeren zum Handwerk und werden nicht automatisch geprueft.

- **Impiattamento (Plating):** Anrichten ist subjektiv und visuell.
- **Scraps Utilization:** Verwertung von Resten ist situationsabhaengig.
- **Coltello-Tecnica:** Messerhaltung und Grifftechnik sind manuelle Faehigkeiten.
- **Mise en Place als Haltung:** Die Disziplin selbst ist nicht messbar,
  nur das Ergebnis (Reihenfolge der Steps).
- **Fond-Qualitaet:** Die Guete eines selbstgemachten Fonds laesst sich
  nicht aus dem Rezept ableiten.

---

## 4. Prioritaet fuer naechste Implementierung

Reihenfolge nach Nutzen und Aufwand:

1. ~~**P1 Maillard vor Schmoren**~~ ✅ implementiert als **R5** (2026-10-08)
2. ~~**P5 Saure-Korrektur**~~ ✅ implementiert als **R6** (2026-10-08)
3. ~~**P2 Riposo della Carne**~~ ✅ implementiert als **R7** (2026-10-08)
4. ~~**P4 Deglassatura**~~ ✅ implementiert als **R8** (2026-10-08)
5. **P11/P12 Saisonalitaet** – sichtbarer Effekt, aber Datumslogik
6. **P9 Emulsion** – komplexer, selten
7. **P7 Salatura a Strati** – nuanciert, schwierig sauber zu pruefen

---

## 5. Wie eine neue Regel entsteht

1. Beobachtung / Notiz / Fehler in einem echten Rezept
2. Hier eintragen (Abschnitt 2)
3. Implementieren in `plausibility-checks.js` (Funktion `checkXyz`)
4. Test hinzufuegen in `test-nutrition.js` (Abschnitt PLAUSIBILITAET)
5. `npm test` gruen
6. Live-Verifikation mit einem Rezept, das die Regel triggert
7. Regel in Abschnitt 1 verschieben (aktiv)

---

## 6. Quellen und Grundsaetze

- **Eigene Kochlehre-Notizen** (italienisch, Basis-Ausbildung)
- **Internationale Kuechen-Standards** (franzoesische Techniken,
  italienische Saison-Kueche)
- **BLS 4.0 / USDA FDC** fuer Naehrwerte
- **EU-Lebensmittelinformationsverordnung** (informativ, App ist kein
  LMIV-pflichtiges Produkt)
- **ChatGPT** als zweite Meinung bei Struktur- und Architekturfragen

**Grundsatz:** Alle Regeln sind **Warnungen**, keine Hard-Blocks. Nur
Allergene blockieren hart. Der Nutzer entscheidet, ob er das Rezept
trotzdem kocht.
