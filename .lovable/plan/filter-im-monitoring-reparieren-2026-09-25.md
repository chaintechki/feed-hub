# Filter im Monitoring reparieren

## Technischer Audit

- Die Filterleiste schaltet ihren Zustand korrekt um und übergibt die gefilterte Liste an die Tabelle.
- Die Datenabfrage lädt jedoch immer nur höchstens 500 Spiele und wendet sämtliche Filter erst danach im Browser an. Dadurch suchen die Schalter nicht im vollständigen Bestand von aktuell rund 6.700 relevanten Spielen.
- Die neue Sortierung „Spiele mit Quoten zuerst“ wird erst nach dieser 500er-Begrenzung ausgeführt. Spiele mit Quoten außerhalb dieses Ausschnitts können deshalb durch „Mit Quoten“ nicht gefunden werden.
- „Mit Quoten“ prüft derzeit nur, ob irgendein Markt-Datensatz existiert. Gesperrte Märkte oder ausschließlich leere/null Quoten zählen dadurch fälschlich als Treffer.
- „24 Stunden“ prüft nur, ob der Start weniger als 24 Stunden entfernt ist. Vergangene Spiele erfüllen diese Rechnung ebenfalls; eine untere Zeitgrenze fehlt.
- „Frühquoten verfügbar“ und „Mit Frühquoten“ verwenden aktuell exakt dasselbe Feld und sind funktional identisch.
- Die Daten zeigen außerdem, dass Alarmiert, Hotlist, Kommentiert, Halbautomatisch, Manuell, Nur Provider und Frühquoten derzeit jeweils null Treffer haben. Diese Schalter müssen korrekt eine leere Liste anzeigen; das ist kein Darstellungsfehler.

## Umsetzung

1. Die Filterprädikate in eine eigenständige, testbare Hilfsfunktion auslagern.
2. „Mit Quoten“ nur bei mindestens einer echten numerischen Quote erfüllen; „Mit eigenen Quoten“ zusätzlich auf die Quelle `own` begrenzen.
3. „24 Stunden“ auf den Zeitraum von jetzt bis einschließlich 24 Stunden begrenzen.
4. Die Abfrage so umbauen, dass Filter nicht mehr nur auf einem willkürlichen 500er-Ausschnitt arbeiten. Relevante Spiele werden vollständig in sicheren Seiten geladen; zugehörige Quotendaten weiterhin in kleinen Paketen.
5. Die bestehende Priorisierung beibehalten: nutzbare Quoten, laufende Spiele, danach Startzeit.
6. Automatisierte Tests für jeden Filter sowie Kombinationen ergänzen, einschließlich leerer/gesperrter Quoten und Zeitgrenzen.
7. Version erhöhen, vorhandene Tests ausführen und den aktuellen Stand im Vorschaufenster kontrollieren.

## Abgrenzung

- Keine Datenbankänderung.
- Keine Änderung an Freigaben oder Anbieterzugang.
- „Frühquoten verfügbar“ und „Mit Frühquoten“ bleiben vorerst beide an das vorhandene Frühquoten-Kennzeichen gebunden, da aktuell kein separates Datenfeld existiert.
