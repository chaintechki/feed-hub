# Monitoring-Anzeige bei großen Echtdatenmengen stabilisieren

## Technischer Audit
- Der Feed selbst ist wieder aktiv: 11.806 Quotensätze, letzte Aktualisierung 17:50:56 UTC; beide Feed-Produzenten stehen in der Datenbank auf `down=false`.
- Die Match-Ansicht lädt zunächst bis zu 500 Spiele und hängt anschließend alle 500 IDs gleichzeitig an mehrere Folgeabfragen (Quoten, Verlauf, Alerts, Alert-Log). Dadurch entstehen extrem lange URLs; die im Screenshot sichtbare Tabelle bleibt bei „Loading…“.
- Fehler aus mehreren Folgeabfragen werden aktuell nicht geprüft. Damit kann die Ansicht auch bei einer abgelehnten Teilabfrage unvollständig bleiben, ohne eine verständliche Meldung zu zeigen.
- Der Statuspunkt verlangt ein Alive-Signal innerhalb von 60 Sekunden. Echte Feed-Nachrichten und `down=false` kommen weiterhin an, aber Alive-Signale können seltener eintreffen; dadurch erscheint fälschlich „FEED INTERRUPTED“.

## Umsetzung
1. Die 500 IDs für alle abhängigen Datenabfragen in sichere Pakete aufteilen und Ergebnisse anschließend zusammenführen.
2. Fehler jeder Teilabfrage erkennen, damit die Tabelle nicht endlos lädt; bei einem Fehler erscheint der bestehende verständliche Fehlerzustand.
3. Die Match-Liste weiterhin auf 500 begrenzen; keine fachlichen Filter oder Daten ändern.
4. Den Feed-Status primär aus `down=false` plus dem neuesten Alive- oder Nachrichtenzeitpunkt bestimmen und ein realistisches Zeitfenster verwenden.
5. Mit echten Daten prüfen: Tabelle rendert Spiele und Quoten, Suche/Filter bleiben funktionsfähig, Status wird grün, Vorschau ohne Laufzeit- und Netzwerkfehler.

## Umfang
- Nur Anzeige- und Abfragelogik im Frontend.
- Keine Datenbankänderung und keine Änderung am Feed-Protokoll.
