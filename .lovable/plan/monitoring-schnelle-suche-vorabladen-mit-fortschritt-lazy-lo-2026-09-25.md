# Monitoring: schnelle Suche, Vorabladen mit Fortschritt, Lazy Loading, KI-Einstieg

## Audit (Ursachen)
1. **Suche ruckelt:** Jeder Tastendruck filtert sofort die komplette Spielmenge (bis ~11.000 Spiele) neu und baut danach bis zu 500 Spielzeilen mit je 3 Märkten neu auf (~1.500 Quotenzellen, jede mit Tooltip/Vergleichslogik). Keine Verzögerung, keine Virtualisierung.
2. **Langsames Laden:** Spiele werden seitenweise geladen, danach Quoten in Blöcken zu 75 IDs / 8 parallel. Bis alles da ist, sieht man nur „Laden…“ ohne Fortschritt. Jeder Baumklick startet einen komplett neuen Ladevorgang.
3. **Suchfeld im Sportbaum** filtert ebenfalls bei jedem Tastendruck den ganzen Baum.
4. **KI-Analyse nicht gefunden:** Der Reiter „KI-Analyse“ sitzt in der Leiste über der Spieleliste (neben „Spiele“/„Outrights“). Auf feed.feedarea.net läuft aber noch die alte Version ohne diesen Reiter — erst nach `sudo ./deploy.sh` sichtbar. Zusätzlich ist der Reiter unauffällig.

## Umsetzung
1. **Vorabladen mit Fortschrittsbalken**
   - Ladevorgang meldet Fortschritt (Spiele geladen → Quoten x/y Blöcke) an die Oberfläche.
   - Schmaler Balken über der Liste mit Text „Lade Spiele 3.200 / 10.900 · Quoten 45 %“.
   - Spiele werden sofort angezeigt, sobald die Grunddaten da sind; Quoten füllen sich nach.
   - Vollständige Spielmenge einmal laden und Baumauswahl lokal filtern (kein Neuladen je Klick); Hintergrund-Aktualisierung wie bisher.
2. **Lazy Loading / Virtualisierung der Liste**
   - Liste mit der bereits vorhandenen Virtualisierungsbibliothek: nur sichtbare Zeilen (+Puffer) werden gezeichnet, Ligen-Überschriften bleiben erhalten.
   - Limit von 500 entfällt — alle Treffer scrollbar, Anzeige „x Treffer“.
   - Spielzeilen als gespeicherte Bausteine, damit nur geänderte Zeilen neu gezeichnet werden.
3. **Flüssige Suche**
   - Eingabe reagiert sofort, gefiltert wird verzögert (ca. 200 ms) und nachrangig.
   - Vorberechneter Suchtext je Spiel (Teams, Liga, Land, ID, deutsch/englisch).
   - Gleiches Verfahren für die Suche im Sportbaum.
4. **KI-Analyse besser auffindbar**
   - Reiter mit Symbol und hervorgehobener Beschriftung „KI-Analyse“.
   - Zusätzlicher Eintrag im Hauptmenü unter Monitoring.
5. Version 1.0.11, Tests (Filter-/Such-Unit-Tests, Playwright mit 3.000 Spielen inkl. Scroll- und Suchtest).

## Technische Details
- `useMatches`: Scope aus Query-Key entfernen, `onProgress` über Query-Meta/Store (Zustand: phase, loaded, total), Matches zuerst zurückgeben, Odds per zweitem Query (`["match-odds", ids-hash]`) nachladen.
- Baum-Filter in `matchesMonitorFilters` erweitern (reine Funktion in `src/lib/feed/filters.ts`, testbar).
- `MatchGrid`: `@tanstack/react-virtual` mit flacher Liste `{type:"header"|"row"}`, `React.memo` für Zeile, feste geschätzte Höhen.
- Suche: `useDeferredValue` + Debounce, `searchKey` per `useMemo` je Match.
- Keine Datenbank- oder Edge-Function-Änderungen nötig.

## Hinweis
Damit alles auf feed.feedarea.net erscheint, danach auf dem Server `sudo ./deploy.sh` ausführen.
