# Plan: Spielstand-Abgleich, Betriebswerte, KI-Prüfung, Outrights, KI-Genauigkeit (Version 1.0.10)

## Audit (Ist-Zustand)
- Feed-Worker ruft alle 10 Min. `uof-sync` auf (Spielplan, nachts Marktliste). `uof-sync` setzt **keinen** Spielstatus; alte Spiele bleiben auf „live"/„nicht begonnen" (z. B. 21 „live", davon Teile vom 24.09.).
- Tabelle `outrights` und Seite „Outrights" existieren, aber `uof-ingest` verarbeitet keine Outright-Nachrichten (`sr:simple_tournament`/`sr:season`-Events) – die Seite bleibt daher leer bzw. manuell.
- Betriebs-Dashboard zeigt DB-Größe/Cleanup/Cache stündlich; Arbeitsspeicher wird nirgends gemessen (Cloud-RAM ist per Abfrage nicht lesbar).
- KI-Analyse sucht per einfachem Textvergleich (Team/Sport/Liga in Englisch) – deutsche Begriffe wie „Fußball", „Bundesliga", „Über/Unter", „Beide treffen" werden oft nicht gefunden. Es gibt keine Genauigkeitsmessung.

## 1. Spielstand-Abgleich
- Neuer Schritt in `uof-sync` nach jedem Spielplan-/Marktlisten-Nachladen:
  - Für Spiele mit Status live/nicht begonnen und Anstoß älter als 3 h: Anbieter-Zusammenfassung (`/sports/en/sport_events/{id}/summary.xml`) in Blöcken abfragen und Status übernehmen (ended/closed/cancelled/postponed, Spielstand).
  - Spiele älter als 12 h ohne Antwort des Anbieters → „beendet" (Sicherheitsnetz).
  - Ergebnis (geprüft/geändert/Fehler, Dauer) in neue Tabelle `status_sync_runs`.
- Worker ruft den Abgleich auch direkt nach dem Nachladen auf.

## 2. Arbeitsspeicher und DB-Größe nach dem Abgleich
- Nach jedem Abgleich Messung schreiben: DB-Größe, größte Tabellen, WAL, Verbindungen, DB-Cache-Trefferquote sowie Arbeitsspeicher des Feed-Servers (Worker meldet RSS/Heap und freien/gesamten RAM des Linux-Servers mit).
- Betriebs-Dashboard: neue Karte „Letzter Spielstand-Abgleich" (Zeit, geänderte Spiele) und Verlauf RAM/DB-Größe je Abgleich.
- Hinweis: RAM der Cloud-Datenbank selbst bleibt nicht messbar; angezeigt wird der RAM des eigenen Feed-Servers.

## 3. Outrights aus dem Anbieter-Feed
- `uof-ingest`: odds_change/bet_stop für Outright-Events (`sr:season`, `sr:simple_tournament`, `sr:stage`) erkennen und in `outrights`/`outright_odds` schreiben (Teilnehmernamen über Anbieter-API nachladen, gecacht).
- `uof-sync`: offene Outrights einmal täglich nachladen.
- Monitoring: Outrights-Block neben/unter Live-Spielen (einklappbar) mit Wettbewerb, Markt, Top-Teilnehmern und Quoten; Seite „Outrights" nutzt dieselben Daten. Kunden-API unverändert (später optional).

## 4. KI-Analyse für deutsche Begriffe + Genauigkeit
- Deutsches Wörterbuch in der Funktion: Sportarten (Fußball→Soccer, Eishockey→Ice Hockey …), Ligen (Bundesliga, 2. Bundesliga, DFB-Pokal, DEL, BBL …), Märkte (1X2, Über/Unter, Beide treffen, Handicap, Doppelte Chance) und Ländernamen; Suchfunktion nutzt es plus unscharfe Namensübereinstimmung (Umlaute, „FC/1." etc.).
- Anweisungen an das Modell auf deutsche Sportsprache geschärft; Modell bleibt `openai/gpt-6-astra` (kein Training möglich, Präzision über bessere Werkzeuge).
- Genauigkeit: fester Testsatz (~25 deutsche Fragen mit erwarteten Sportarten/Ligen/Märkten). Auswertung per Knopf „Genauigkeit messen" (nur Admins) prüft, ob die Werkzeugaufrufe die richtigen Treffer liefern; Ergebnisse in Tabelle `ai_eval_runs`, Dashboard zeigt Trefferquote und Verlauf. Jede Messung verbraucht KI-Guthaben.

## 5. Prüfung auf feed.feedarea.net
- Nach Server-Deploy: Anmeldung per Browser-Test auf feed.feedarea.net, Frage „Welche Fußballspiele in den nächsten 6 Stunden haben Quoten?" stellen, Antwort/Links prüfen, im Monitoring Filter setzen und Chips entfernen; Screenshots als Nachweis.
- Voraussetzung: Du führst vorher `sudo ./deploy.sh` aus (ich kann den Server nicht selbst aktualisieren). Bis dahin teste ich in der Vorschau.

## Technische Details
- Migration 0022: `status_sync_runs`, `ai_eval_runs`, Spalten `server_mem_*` in `ops_metrics`, ggf. `outright_odds`; jeweils GRANTs + RLS (lesen nur Admin/Super-Admin, schreiben service_role).
- Geänderte Funktionen: `uof-sync`, `uof-ingest`, `feed-assistant` (+ `_shared/de-sports.ts`), `feed-worker/index.mjs` (Speicherwerte, Abgleich-Trigger).
- UI: `OpsDashboard`, `MonitorMatches` (Outrights-Block), i18n DE/EN.
- Tests: Unit-Tests für Wörterbuch/Statuslogik, Deno-Checks, Deploy, Version 1.0.10; Server-Deploy nötig für Worker und UI.
