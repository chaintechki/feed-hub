# Markt-Katalog vervollständigen und für Kunden nutzbar machen

## Audit (Ist-Zustand)
- Die Märkte werden fest im Code übersetzt. Aktuell sind nur 9 Markt-IDs abgebildet (1X2, Über/Unter, Handicap, Doppelte Chance, Beide treffen, HZ-1X2, HZ-Über/Unter, Sieger 186/219).
- Alle anderen gelieferten Märkte landen als `m123` in der Gruppe „other“. Ihre Auswahlen haben nur rohe IDs (z. B. „1714“) statt Namen.
- Der offizielle Markt-Katalog des Anbieters (`uof_markets`, Namen, Auswahlen, Specifier) wird schon geladen, aber bei der Zuordnung nicht verwendet.
- Die Kunden-API (JSON/XML/Widget) gibt `m123` und rohe Auswahl-IDs weiter. Für Kunden ist das so nicht verständlich.
- Grenze: Ob ein Spiel überhaupt Quoten bekommt (Auto-Booking, Produzenten, Sportarten), legt nur oddz.club fest. Das Panel kann das nicht freischalten.

## Umsetzung
1. **Katalog-basierte Zuordnung (Backend, `_shared/uof.ts`)**
   - Beim Einlesen wird der Katalog `uof_markets` im Speicher zwischengespeichert (Cache ca. 10 Min.).
   - Jeder Markt bekommt einen lesbaren Namen und aufgelöste Specifier, z. B. „Total 2.5“, „{$competitor1}“ → Teamname.
   - Auswahl-IDs werden ebenfalls auf lesbare Namen abgebildet.
   - Die bekannten Hauptmärkte behalten ihre Schlüssel (`1x2`, `total` …), damit Raster und bestehende Kunden weiter funktionieren.
   - Gruppen werden über Schlüsselwörter automatisch zugeordnet: main, goals, half, corners, cards, players, periods, other.
   - Die Zuordnung wird für mehr Sportarten erweitert: Sieger- und 2-Wege-Märkte für Tennis, Basketball, Eishockey, Handball, Volleyball, eSports.
2. **Katalog vollständig laden (`uof-sync`)**: Alle Märkte inklusive Varianten (`variant`) werden auf Deutsch und Englisch geladen. Danach aktualisiert sich der Katalog automatisch einmal täglich.
3. **Kunden-API (`_shared/feed.ts`, OpenAPI-Dokumentation, Widget)**
   - Pro Markt werden zusätzlich `name`, `group` und `uof_id` ausgegeben, pro Auswahl `id` und `name`, jeweils in JSON und XML.
   - Neuer Filter `?groups=main,goals` sowie ein neuer Endpunkt `/markets` mit dem Katalog.
   - Der Aufschlag gilt weiterhin für alle Märkte. Gesperrte Märkte werden weiter als inaktiv markiert.
   - Die bestehenden Felder bleiben unverändert (abwärtskompatibel).
4. **Kunden-Einstellungen**: Im Kunden-Dialog kann man optional festlegen, welche Marktgruppen ein Kunde bekommt. Standard ist „alle“. Dafür kommt eine neue Spalte `market_groups text[]` in `api_clients` (Migration, Rechte und RLS bleiben unverändert).
5. **Panel**: Die Detailansicht eines Spiels zeigt alle Märkte gruppiert mit Namen statt `m123`.
6. **Bestehende Daten**: Die vorhandenen `match_odds`-Einträge werden einmalig mit dem neuen Katalog neu zugeordnet (Namen und Gruppen, die Quoten selbst bleiben unverändert).
7. **Prüfung**: Typprüfung, Tests, Deno-Checks, Deployment der Funktionen `uof-ingest`, `uof-sync`, `feed-api`, `feed-widget`. Echter Abruf in JSON und XML mit einem Testschlüssel. Browser-Prüfung der Spieldetails.

## Nicht enthalten
- Keine Änderung am Feed-Dienst auf dem Server. Deshalb ist kein erneutes Deploy nötig.
- Freischaltung von Quoten für alle Spiele: nur über oddz.club (Auto-Booking).
