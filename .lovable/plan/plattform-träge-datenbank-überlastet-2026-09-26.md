# Plattform träge: Datenbank überlastet

## Audit (Stand 26.09., 14:00)

- **Die Datenbank antwortet gerade gar nicht mehr** (Statusprüfung, Login-Prüfung und einfache Abfragen laufen alle in Zeitüberschreitung). Login, jeder Klick und die Spieleliste warten deshalb auf die Datenbank. Der Server von feed.feedarea.net selbst ist nicht die Ursache.
- **Ursache ist die Schreiblast des Feeds**, nicht die Nutzer. Größte Verbraucher laut Datenbankstatistik:
  1. Quoten-Schreibvorgänge: 12.300 Aufrufe, im Schnitt 186 ms, Spitzen 4,7 s (zusammen 38 Minuten Rechenzeit).
  2. Quoten-Lesen fürs Monitoring (alle ~10.000 Spiele in Blöcken): 1.288 Aufrufe à 636 ms, Spitzen 6,5 s.
  3. Anbieter-Status (uof_producers): 28.700 Schreibvorgänge, obwohl nur wenige Zeilen.
  4. Abrechnungen (settlements): 1.450 Einfügungen à 366 ms, ohne Duplikatschutz.
  5. Sperr-Umschaltungen: 1,9 Mio. Einzel-Updates.
  6. Marktkatalog: 38.000 Komplett-Lesungen (Cache greift nicht überall).
- **Jede Quote wird doppelt gespeichert** (Quelle „own" und „average" mit identischen Werten) – verdoppelt Schreiblast und Tabellengröße.
- Spielstände werden **einzeln pro Spiel** aktualisiert (eine Anfrage je Spiel pro Nachrichtenpaket).
- Der Worker schickt alle ~5 Sekunden ein Paket; bei vielen Live-Spielen stauen sich die Schreibvorgänge und blockieren Lese-/Login-Anfragen.

## Schritte

1. **Sofort-Entlastung:** Datenbank neu starten, damit Login wieder geht. Danach Zustand messen (Verbindungen, tote Zeilen, Sperren). Falls sie trotz der Maßnahmen dauerhaft am Limit läuft: größere Instanz empfehlen (kostet mehr, nur nach deiner Zustimmung).
2. **Doppelte Quoten abschaffen:** Nur noch „own" speichern; „average" wird beim Lesen aus „own" abgeleitet. Bestehende „average"-Zeilen löschen (halbiert die Quotentabelle).
3. **Schreibvorgänge bündeln:** Spielstände, Sperren und Anbieterstatus je Paket in **einem** Datenbankaufruf statt vieler Einzelaufrufe; Anbieterstatus höchstens alle 30 s schreiben.
4. **Abrechnungen:** Duplikate verhindern (eindeutiger Schlüssel, „ignorieren bei Konflikt").
5. **Marktkatalog:** Alle Pfade über den 10-Minuten-Cache.
6. **Monitoring-Lesen entlasten:** Quoten nur für sichtbare/zukünftige Spiele mit offenen Märkten laden statt für alle 10.000; Hintergrund-Aktualisierung seltener (60 s statt häufiger) und nur bei geöffnetem Tab.
7. **Worker drosseln:** Pakete alle 10 s statt 5 s zusammenfassen, bei langsamer Antwort automatisch länger warten (kein Stau mehr).
8. Messen vorher/nachher, Version 1.0.13, danach `sudo ./deploy.sh` (nur für Schritt 6/7 nötig).

## Technische Details

- Migration 0025: `DELETE FROM match_odds WHERE source='average'` in Batches; RPC `ingest_batch(jsonb)` (Security Definer, nur service_role) für matches-Status, Sperren, Producer; `settlements` Unique `(match_id,market,specifier,outcome,state)` + Dedupe; `VACUUM ANALYZE`.
- `uof-ingest`: nur `source='own'`; `_shared/feed.ts` + Kunden-API liefern `average` als Kopie (API-Format unverändert).
- `src/lib/feed/queries.ts`: Odds-Abfrage gefiltert (`scheduled > now()-3h`, nicht beendet), `refetchInterval` 60 s, `refetchIntervalInBackground=false`.
- `feed-worker/index.mjs`: Flush-Intervall 10 s, adaptiver Backoff bei Antwortzeit > 3 s.
- Neustart der Datenbank: kurze Unterbrechung (~1–2 Min), keine Datenverluste.
