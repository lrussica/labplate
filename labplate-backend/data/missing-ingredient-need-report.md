# Zutatenbedarf für Master-Entwürfe

Erstellt aus `master_recipe_drafts_40.json`, ausschließlich aus den dort
gespeicherten `validation.missingIngredients`.

| Rang | Zutat | Referenzen |
|---:|---|---:|
| 1 | Ei | 10 |
| 2 | Zucker | 9 |
| 3 | Aubergine | 5 |
| 4 | Kartoffel | 3 |
| 5 | Reis | 2 |
| 6 | Rote Linsen | 2 |
| 7 | Champignons | 2 |
| 8 | Naturjoghurt | 2 |
| 9 | Maisgrieß | 1 |
| 10 | Kaffee | 1 |
| 11 | Kakao | 1 |
| 12 | Apfel | 1 |
| 13 | Zimt | 1 |
| 14 | Kirsche | 1 |
| 15 | Zucchini | 1 |
| 16 | Hähnchenbrust | 1 |
| 17 | Weißer Fisch | 1 |
| 18 | Zartbitterschokolade | 1 |
| 19 | Mandeln | 1 |
| 20 | Sesam | 1 |
| 21 | Gurke | 1 |
| 22 | Knoblauch | 1 |

**Summe:** 22 fehlende Zutaten, 49 Referenzen. Vor dem Import sind 31 von
40 Entwürfen blockiert; 9 sind bereits bestanden.

## Vorhandenes Schema

Die bestehenden 15 Zutaten in `master_recipes.json` speichern Nährwerte als
`protein`, `fat`, `netCarbs` und `fiber`, jeweils als Gramm je 100 g. Weitere
vorhandene Felder sind `id`, lokalisierte `names`, `amount`, `unit`,
`protein_source`, `allergenTags`, `lactoseSwap` und teilweise
`culinaryRole`. Ein separates, vollständiges Quellenfeld existiert dort
noch nicht.

Der vorhandene USDA-Provider (`api/usda.js`) liest FoodData-Central-Felder:
`calories`, `protein`, `fat`, Kohlenhydrate, Ballaststoffe und Natrium; er
berechnet Netto-Kohlenhydrate als Kohlenhydrate minus Ballaststoffe. Der neue
Import speichert zusätzlich `salt_g_per_100g`, sofern dieser Wert im
quellenexportierten Datensatz vorhanden ist. Dichte und Stückgewicht werden
nicht aus Nährwerten abgeleitet und bleiben leer, wenn die Quelle sie nicht
liefert.

## Quellenlage

Im Repository wurde kein USDA-, CIQUAL- oder BLS-Export gefunden und
`USDA_API_KEY` ist für diesen Lauf nicht vorausgesetzt/verfügbar. Deshalb
wurden keine Nährwerte ergänzt und keine Zutat als aufgelöst ausgegeben.
