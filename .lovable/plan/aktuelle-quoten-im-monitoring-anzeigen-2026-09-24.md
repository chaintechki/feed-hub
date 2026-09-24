# Aktuelle Quoten im Monitoring anzeigen

## Technischer Audit

- Der Feed und die Verarbeitung funktionieren: `match_odds` wird aktuell weitergeschrieben; für zahlreiche kommende Spiele liegen numerische Quoten vor.
- Von den derzeit zuerst geladenen 500 Spielen haben nur 49 überhaupt numerische Quoten. Die Liste beginnt bei den ältesten Terminen, weil die Spieleabfrage ausschließlich aufsteigend nach `scheduled` sortiert und keinen aktuellen Zeitraum begrenzt.
- Danach priorisiert die Oberfläche jedes Spiel mit irgendeinem Quotensatz. Dabei zählen auch vollständig gesperrte Datensätze mit ausschließlich `null`-Quoten als „mit Quoten“. Genau diese alten Spiele stehen im Screenshot oben und zeigen deshalb nur Striche.
- Beispiel aus dem Screenshot: Baltimore Orioles – Toronto Blue Jays ist bereits beendet; alle gespeicherten Hauptmarktwerte sind gesperrt und `null`. Gleichzeitig liegen für kommende Spiele aktuelle numerische Quoten vor.
- Das Raster behandelt Zweiwegmärkte ebenfalls fehlerhaft: Bei Total-, Handicap- und Gewinner-Märkten wird der zweite Ausgang in die mittlere Neutral-Spalte gesetzt und dort als Bezeichnung statt als Quote dargestellt. Damit können vorhandene zweite Quoten unsichtbar bleiben.
- Die Abfragen selbst laufen ohne Laufzeit- oder Buildfehler. Es ist kein Problem der Feed-Verbindung, der Berechtigungen oder der Datenbankrechte.

## Umsetzung

1. **Aktuelle Spiele laden**
   - Die Monitoring-Abfrage auf einen sinnvollen aktuellen Zeitraum begrenzen: laufende Spiele sowie kommende Spiele, mit einem kleinen Rückblick für gerade gestartete Begegnungen.
   - Weiterhin maximal 500 Spiele laden und bestehende Sport-/Kategorie-/Liga-Filter unverändert anwenden.

2. **Nur tatsächlich nutzbare Quoten priorisieren**
   - Ein Spiel nur dann als „mit Quoten“ behandeln, wenn mindestens ein Ausgang eine numerische Quote enthält.
   - Innerhalb der Liste zuerst laufende/kommende Spiele mit nutzbaren Quoten anzeigen, danach aktuelle Spiele ohne Quoten.
   - Gesperrte Null-Datensätze dürfen aktuelle Spiele mit echten Werten nicht mehr verdrängen.

3. **Hauptlinie korrekt wählen**
   - Für 1X2, Total und Handicap nur Linien mit mindestens einer numerischen Quote berücksichtigen.
   - Bei mehreren Total-/Handicap-Linien weiterhin die ausgewogenste nutzbare Linie auswählen.
   - Falls ausschließlich gesperrte Null-Werte vorhanden sind, weiterhin Striche anzeigen statt erfundener Werte.

4. **Zweiwegmärkte korrekt darstellen**
   - Dreiwegmarkt: Heim – Unentschieden – Auswärts.
   - Zweiwegmarkt: erster Ausgang links, Mitte leer, zweiter Ausgang rechts.
   - Total und Handicap zeigen beide tatsächlichen Quoten; Spezifier/Bezeichnungen bleiben über Detailansicht verfügbar.

5. **Prüfung mit Echtdaten**
   - Kontrollieren, dass kommende Spiele mit vorhandenen numerischen Quoten oben erscheinen.
   - 1X2-, Total- und Handicap-Werte auf korrekte Positionen prüfen.
   - Filter „Mit Quoten“ und „Mit eigenen Quoten“, Sportbaum und Suche prüfen.
   - Tests und Vorschau ohne Laufzeit-, Netzwerk- oder Buildfehler bestätigen.

## Umfang

- Änderungen ausschließlich an der Anzeige- und Abfragelogik im Frontend.
- Keine Datenbankänderung, keine Änderung am Feed-Protokoll und kein erneuter Server-Deploy des Feed-Dienstes erforderlich.
