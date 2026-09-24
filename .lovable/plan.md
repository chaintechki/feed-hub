# Fehlende Quoten in der Spieltabelle

## Audit
- Die Tabelle funktioniert: Quoten, die in der Datenbank liegen, werden korrekt angezeigt.
- Datenlage: 6.102 Spiele gespeichert, aber nur 86 davon haben Quoten. Die Tabelle zeigt die 500 zeitlich nächsten Spiele – diese gehören fast alle zu den 6.016 Spielen ohne Quoten, daher nur Striche.
- Ursache: Der Feed-Dienst fordert beim Start nur eine Nachlieferung "Änderungen seit Zeitpunkt X" an. Der Anbieter schickt dann ausschließlich Spiele, deren Quoten sich zuletzt geändert haben. Ein vollständiger Abzug aller aktuellen Quoten (Initial-Snapshot) wird nie angefordert.
- Zusätzlich: Kein Spiel ist gebucht (booked = 0). Live-Quoten liefert der Anbieter nur für gebuchte Spiele.

## Plan
1. Feed-Dienst: Beim ersten Start (und nach einem Ausfall über 70 Std.) einen vollständigen Snapshot ohne Zeitgrenze anfordern, getrennt für Pre-Match und Live. Danach wie bisher nur Änderungen.
2. Feed-Dienst: Vollständigen Snapshot zusätzlich alle 6 Std. anfordern, damit neu angebotene Spiele sicher Quoten erhalten.
3. Tabelle: Spiele mit Quoten zuerst anzeigen (innerhalb gleicher Anstoßzeit), der Filter "WITH ODDS" bleibt unverändert nutzbar.
4. Prüfung: Nach Neustart des Dienstes auf dem Server (`git pull && sudo ./deploy.sh`) Anzahl Spiele mit Quoten in der Datenbank kontrollieren und Tabelle per Screenshot prüfen.

## Hinweis
- Live-Quoten erfordern das Buchen der Spiele beim Anbieter – das kann ich als eigenen Schritt ("Book"-Funktion) nachziehen.

## Technisch
- feed-worker/index.mjs: `recover(id, full)` – bei `full` Parameter `after` weglassen; Startaufruf und 6-Std.-Intervall mit `full=true`.
- src/lib/feed/queries.ts: clientseitige Sortierung nach (hat Quoten, scheduled). Keine DB-Änderung.
