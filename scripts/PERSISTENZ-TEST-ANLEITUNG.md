# Persistenz-Test-Anleitung für LabPlate

## Ziel
Prüfen, ob gespeicherte Daten (Tagesziele, Laborwerte, Mahlzeiten, Verlauf, Fokus) nach einem App-Update über Xcode korrekt übernommen werden.

## Vorbereitung

1. Aktuelle Daten notieren:
   - Tagesziele: KH __ g, Fett __ g, Protein __ g
   - Laborwerte: TG __, LDL __, HDL __, Gesamtcholesterin __, Glukose __, HbA1c __ %, Blutdruck __/__ mmHg, eGFR __
   - Fokus: [ ] Ballaststoffe, [ ] KH-Qualität, [ ] Fettqualität, [ ] Salz
   - Teller heute: KH __ g, Fett __ g, Protein __ g
   - Verlauf: __ Tage mit Einträgen

2. Screenshot machen von:
   - Tagesübersicht / Ringe
   - Tagebuch
   - Verlauf
   - Meine Werte
   - Mein persönlicher Kontext

## Test-Schritte

### Vor Update

1. Öffne LabPlate auf dem iPhone oder Simulator.
2. Setze Tagesziele (z. B. KH 60 / Fett 28 / Protein 90) und speichere.
3. Trage Laborwerte ein (alle erweiterten Werte) und speichere.
4. Aktiviere Fokus-Checkboxen (z. B. Ballaststoffe).
5. Füge 1–2 Lebensmittel auf den Teller heute hinzu.
6. Prüfe Verlauf: Mindestens 1–2 Tage mit Einträgen.
7. Notiere alle Werte (siehe oben).
8. Mache Screenshots (siehe oben).

### Update durchführen

9. Öffne Xcode.
10. Baue die neueste Version (Product → Build).
11. Installiere die App über Xcode auf dem iPhone oder Simulator (**nicht** "Delete App", sondern Upgrade).
12. Wichtig: Gleicher WebView-Ursprung (Port/Base-URL stabil halten, z. B. localhost:8080).

### Nach Update

13. Öffne LabPlate.
14. Prüfe Tagesziele: Stimmen die Werte (KH 60 / Fett 28 / Protein 90)?
15. Prüfe Laborwerte: Sind alle Werte noch gespeichert?
16. Prüfe Fokus: Sind die Checkboxen noch aktiv?
17. Prüfe Teller heute: Sind die Lebensmittel noch da?
18. Prüfe Verlauf: Sind alle Tage noch da?
19. Vergleiche mit den Screenshots von vor dem Update.

### App-Neustart

20. Schließe die App komplett (App killen).
21. Öffne die App neu.
22. Prüfe erneut alle Werte (wie oben).

## Erwartung

- Alle Tagesziele, Laborwerte, Fokus-Einstellungen, Mahlzeiten und Verlaufseinträge müssen nach dem Update und nach dem Neustart noch vorhanden sein.
- Keine leeren Felder, keine NaN-Werte, keine Fehlermeldungen.

## Falls Daten fehlen

1. Notiere genau, welche Daten fehlen:
   - Tagesziele: Ja/Nein
   - Laborwerte: Ja/Nein (welche?)
   - Fokus: Ja/Nein (welche?)
   - Mahlzeiten: Ja/Nein (welche?)
   - Verlauf: Ja/Nein (welche Tage?)

2. Prüfe in der iOS-App (ViewController):
   - Wird eine feste Base-URL verwendet (z. B. localhost:8080)?
   - Ändert sich der Port bei jedem Build?

3. Melde die fehlenden Daten mit:
   - Screenshots von vor und nach dem Update
   - Notierten Werten
   - Genauem Test-Schritten (welches iPhone/iOS, welches Xcode, welcher Port)

## localStorage-Keys (zur Info)

- tellercheck_targets_v1: Tagesziele
- tellercheck_labs_v1: Laborwerte
- tellercheck_day_v1: Mahlzeiten / Teller heute
- tellercheck_history_v1: Verlauf
- tellercheck_protocol_v1: Tagebuch
- labplate_nutrition_focus_v1: Fokus-Einstellungen
- labplate_team_context_v1: Team-Kontext
- labplate_onboarding_done_v1: Onboarding-Status
