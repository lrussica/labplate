# Archetypen-Schema (Block E)

Verbindliche Referenz fuer Solver, Validator und LLM-Bindung.
Ergaenzt die YAML-Profile, ersetzt sie nicht.

Stand: 9. Oktober 2026
Profile in V1: A1, A3, A4, A7, A10

---

## 1. Slot-Struktur

Jedes Archetyp-Profil ist eine YAML-Datei mit diesen Top-Level-Feldern.

| Feld         | Pflicht | Typ                        | Zweck                                                    |
|--------------|---------|----------------------------|----------------------------------------------------------|
| archetype    | ja      | string                     | Eindeutiger Name, snake_case.                            |
| version      | ja      | int                        | Schema-Version. Aktuell 1.                               |
| core         | ja      | map<slot, SlotDef>         | Pflicht-Zutaten. Fehlt eine, ist es ein anderes Gericht. |
| tolerated    | nein    | map<slot, SlotDef>         | Erlaubt mit Mengengrenze.                                |
| variants     | nein    | map<name, VariantDef>      | Benannte Varianten mit Label-Wechsel.                    |
| forbidden    | nein    | list<string>               | Niemals in klassischer Variante.                         |
| ratios       | nein    | map<name, [min, max]>      | Mengenverhaeltnisse mit Toleranzband.                    |
| technique    | ja      | list<StepDef>              | Schrittfolge. LLM fuellt Text, nicht Struktur.           |
| side_policy  | ja      | enum                       | only-if-requested / allowed / required.                  |

### SlotDef

| Feld        | Pflicht | Typ                                | Zweck                                       |
|-------------|---------|------------------------------------|---------------------------------------------|
| roles       | ja      | list<enum>                         | base, sauce, protein, fat, aromatic, etc.   |
| allowed     | ja      | list<id> ODER map<id, ItemDef>     | Zutaten. Zwei Formen, siehe Abschnitt 2.    |
| amount_g    | ja*     | [min, max]                         | Nur bei flacher allowed-Liste.              |
| cardinality | nein    | one / one_or_more                  | Default: one. Siehe Abschnitt 2.            |
| condition   | nein    | string                             | Deklarativer Hinweis fuer Fallback-Pfad.    |
| notes       | nein    | string                             | Kommentar fuer Reviewer.                    |

### StepDef

| Feld           | Pflicht | Typ                       | Zweck                                          |
|----------------|---------|---------------------------|------------------------------------------------|
| step           | ja      | id                        | Schritt-Name, snake_case.                      |
| params         | nein    | map                       | Parameter. Werte koennen Ranges sein.          |
| parallel_group | nein    | id                        | Default: linear. Siehe Abschnitt 2.            |
| notes          | nein    | string                    | Kommentar.                                     |

---

## 2. Schema-Erweiterungen gegenueber Handover

Vier Eigenschaften, die im urspruenglichen Handover-Schema nicht
explizit standen und aus der Profil-Arbeit entstanden sind.

### 2.1 Zwei Formen von `allowed`

  Form A — flache Liste:
    allowed: [olive_oil, butter, lard]
    amount_g: [10, 40]
    -> Dieselben Grenzen fuer jedes gewaehlte Item.
       amount_g bezieht sich auf JEDES Item, nicht auf die Summe.

  Form B — Map mit Item-Definition:
    allowed:
      potato:
        amount_g: [200, 400]
        notes: "Rohgewicht."
      rice:
        amount_g: [150, 300]
        notes: "Gekochtes Gewicht."
    -> Pro Item eigene Grenzen. Pflicht, wenn Items unterschiedliche
       Dichten oder Portionsgroessen haben.

Regel: A3 und A4 nutzen Form B fuer `main` und `liquid`. A1 und A10
nutzen Form A, wo Items vergleichbar sind.

### 2.2 `cardinality: one_or_more`

Default ist `one`. `one_or_more` erlaubt mehrere Items aus `allowed`
gleichzeitig. Genutzt in A3.main, A4.main, A4.liquid, A7.base,
A7.topping_*. A1.pasta, A1.sauce und A10.protein bleiben bei `one`.

### 2.3 `parallel_group` in Technik-Schritten

Mehrere Schritte koennen mit demselben `parallel_group: <id>` markiert
werden, um anzuzeigen, dass sie zeitlich parallel laufen koennen
(typisch: A10 Protein und Beilage). Der Linearisierer entscheidet
anhand von Kochzeiten, welche Reihenfolge berichtet wird.

### 2.4 `separate_side` in Varianten-Additions

Eine Addition in `variants.<name>.additions` kann
`separate_side: true` tragen. Bedeutung: Die Zutat wird als
SEPARATE Beilage ausgewiesen, nicht in das Gericht eingearbeitet.
Naehrwerte fuer Basis und Beilage muessen getrennt dargestellt werden.

Zulaessige Formen einer Addition:
  - id: <string>           # einfache Form, separate_side default false
  - id: <string>
    separate_side: true    # explizit als separate Beilage
    notes: "..."           # optional

---

## 3. Drei-Schichten-Modell

Die Regeln des Projekts wirken in drei Schichten.

### Schicht 1 — Identitaets-Schicht (Block E)

Struktur, pro Profil. Wirkt ueber core / tolerated / variants /
forbidden / ratios / side_policy / cardinality.

Durchsetzung: Profil-Validator im Backend, VOR und NACH dem LLM.

### Schicht 2 — Plausibilitaets-Schicht (R1-R17)

Kochfachliche Regeln, gerichtuebergreifend. Siehe R-Matrix in
Abschnitt 4. Durchsetzung: `plausibility-checks.js` auf dem
generierten Rezept.

### Schicht 3 — Sicherheits-Schicht

Verhindert gesundheitliche Risiken. Enthaelt R14 (Eier-Sicherheit)
und Allergenpruefung. R14 ist technisch Teil der Plausibilitaets-
Schicht, wird hier aber als Sicherheitsregel gefuehrt.

Eine Verletzung in einer Schicht fuehrt zu Ablehnung oder
Neu-Generierung, NIEMALS zu stillschweigender Uebernahme.

---

## 4. R-Matrix (R1-R17)

Quelle: `culinary-rules.md`, Stand 2026-10-08.
Implementierung: `labplate-backend/plausibility-checks.js`.
Tests: `labplate-backend/test-nutrition.js` (Abschnitt PLAUSIBILITAET).

| Regel | Titel                                                  | Schicht        | Status |
|-------|--------------------------------------------------------|----------------|--------|
| R1    | Fett-Ueberladung: >= 3 Fette gleichzeitig              | Plausibilitaet | live   |
| R2    | Ballaststoff-Overload: >= 3 Ballaststoff-Traeger       | Plausibilitaet | live   |
| R3    | Psyllium/Flohsamen in Protein-Gericht                  | Plausibilitaet | live   |
| R4    | Essig in Tofu-/Tempeh-Curry                            | Plausibilitaet | live   |
| R5    | Maillard vor Schmoren                                  | Plausibilitaet | live   |
| R6    | Saeure-Korrektur bei >= 2 Fetten                       | Plausibilitaet | live   |
| R7    | Riposo della Carne                                     | Plausibilitaet | live   |
| R8    | Deglassatura                                           | Plausibilitaet | live   |
| R9    | Emulsion ohne Bindemittel                              | Plausibilitaet | live   |
| R10   | Umami-Anker (vegetarische Hauptgerichte)               | Plausibilitaet | live   |
| R11   | Drei Cremes gleichzeitig                               | Plausibilitaet | live   |
| R12   | Riduzione (Hitze-Kontext ausgenommen)                  | Plausibilitaet | live   |
| R13   | Salatura a Strati (Salz in >= 2 Steps)                 | Plausibilitaet | live   |
| R14   | Eier-Sicherheit (rohes Ei ohne Hitzeschritt)           | Sicherheit     | live   |
| R15   | Saisonalitaet (Datumslogik)                            | Plausibilitaet | live   |
| R16   | Geschmacks-Balance (Meta-Regel)                        | Plausibilitaet | live   |
| R17   | Aromaten-Reihenfolge (Zwiebel+Knoblauch)               | Plausibilitaet | live   |

---

## 5. Archetypen V1

| ID  | Datei                      | Kern-Slots       | cardinality       | side_policy       |
|-----|----------------------------|------------------|-------------------|-------------------|
| A1  | A1_pasta.yaml              | pasta, sauce     | one               | only-if-requested |
| A3  | A3_pan_dish.yaml           | main             | one_or_more       | only-if-requested |
| A4  | A4_stew_curry.yaml         | main, liquid     | one_or_more       | allowed           |
| A7  | A7_bowl_salad.yaml         | base, dressing   | one_or_more / one | only-if-requested |
| A10 | A10_protein_with_side.yaml | protein          | one               | only-if-requested |

Geplant (nicht V1): A2 Reisgericht, A5 Ofengericht, A6 Suppe/Cremesuppe,
A8 Teig/Pfannkuchen, A9 Porridge/Fruehstueck, A11 Eier-Gericht,
A12 Sandwich/Wrap/Burger.

---

## 6. Durchsetzung — wo die Regeln leben

- Resolver          erkennt Anfrageart + Gericht (Katalog + Aliase).
- Profil-Loader     laedt YAML, validiert gegen dieses Schema.
- Solver            LP. Darf NUR:
                      1. Mengen innerhalb plausibler Grenzen aendern
                      2. freigegebene Ersatzprodukte einsetzen
                      3. vorab definierte Varianten pruefen
                    NICHT: neue Zutaten hinzufuegen.
- LLM               schreibt KEINE Mengen, nur Platzhalter {ing:...}
                    mit uses:[...].
- Validatoren       alle uses-IDs sind im Plan,
                    alle Plan-Zutaten kommen vor,
                    keine Zahl+Einheit im Text (ausser Zeit/Temp),
                    keine Fremdzutaten (Regex gegen Zutatenlexikon).
- Repair-Layer      unterliegt denselben Regeln. KEINE neuen Zutaten.
- Feasibility       Toleranzband +-8-10%.
                    Speichern: erreichtes Ziel, verfehltes Ziel, Konfidenz.

---

## 7. Pflege und Erweiterung

Profil-Pflege ohne Redaktions-Team:
  - Profile als YAML im Repo, CI-validiert gegen dieses Schema.
  - Entwuerfe schreibt ein LLM, Review dauert ~10 Min statt 90.
  - Woechentlich Top 10 der "unbekannt"- und infeasible-Anfragen aus
    Logs ziehen -> Backlog ohne Redaktionsplan.
  - UI-Button "Das ist kein [Gericht] mehr" liefert Feedback dort,
    wo Profile Luecken haben.

Auswahl-Score fuer neue Profile: Haeufigkeit x Absurditaetsrisiko.
Absurd wird es vor allem bei hohen Zielen fuer von Natur aus
proteinarme Gerichte (Pasta, Porridge, Pancakes, Salat, Suppe, Reis).
