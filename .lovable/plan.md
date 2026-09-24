# CTRL-Funktionslücken schließen: 4 Pakete nacheinander

Die Pakete werden der Reihe nach gebaut. Nach jedem Paket folgen Prüfung (Typen, Tests, Browser-Test als chaintech) und eine kurze Rückmeldung, danach geht es direkt mit dem nächsten weiter. Alle Daten sind Beispieldaten, bis die Sportradar-Anbindung steht.

## Audit (Ist-Zustand)
- Die Tabellen `matches`, `match_odds` (own/average, `outcomes` jsonb), `alerts`, `match_comments`, `settlements`, `outrights` und `margin_templates` sind vorhanden. Templates gibt es nur einfach, Filter-Templates liegen im localStorage.
- Es fehlen Tabellen für Quotenhistorie, Buchmacher, Ladders, Liga-Konfiguration, Feed-Optionen und Alert-Protokoll.
- `outrights` hat keine Schreibrechte; `alerts` hat weder Score noch Faktoren.
- Rechte: Admin und Trader dürfen schreiben, Viewer nur lesen. Für jede neue Tabelle gilt dasselbe Muster (GRANT, RLS, has_role).

## Paket 1: Monitoring-Ausbau
- **Match-Up-Ansicht** `/monitoring/match/:id`: alle Märkte des Spiels, Marktgruppen (Main, Goals, Handicap, Halves …), Marktsuche, Filter Alerted / Semi-Auto / Manual, Steuerung je Markt (Suspend, Modus).
- **Verblassende Farben:** Blau für fallende und Pink für steigende Quoten, Grau bei Sperre. Die Intensität richtet sich danach, wie lange die Änderung zurückliegt (0–10 min).
- **Alert-Score** als Zahl neben dem Spiel. Ein Klick öffnet ein Fenster mit den Faktoren und den kritischen Märkten (eigene Quote gegenüber Durchschnitt).
- **Kommentarfenster** mit zwei Zählern (Kommentare / Protokoll): Kommentar schreiben, Protokoll der Alert-Aktionen ansehen.
- **Menü hinter den drei Punkten:** Head-to-Head (Platzhalter mit Beispielstatistik), Settlements, Archiv, Match-ID kopieren, Alerts neu erzeugen.
- **Hinweis auf verschobene Marge** am Spiel.

## Paket 2: Tournaments, Templates, Ladders
- **Konfiguration → Tournaments Pre-Match:** Baum Sport → Kategorie → Liga mit Aktivierung (Aus / Mon / Ctrl), Alert-Faktor 0,0–2,0, zugewiesenem Template und Buchmacher-Liste.
- **Templates vollständig:** Name, Sportart, Ladder, Duplizieren, Löschen. Märkte einzeln oder alle an/aus. Margen-Zeitachse (Key je Zeitpunkt vor Anstoß, auch „Inst“). Margenverteilung je Ausgang per Schieberegler. Linien-Typen und Höchstzahl. Ladder je Markt. Kategorien und Ligen zuweisen.
- **Ladders:** Single Odds und Permissible Pairs mit Liste, Anlegen, Kopieren und Werte-Editor.
- Die bisherige Templates-Seite unter Trading Tools verweist auf die neue Verwaltung.

## Paket 3: Buchmacher-Listen und Vergleich
- Buchmacher-Stammdaten (Beispiel-Buchmacher).
- Buchmacher-Listen je Ebene (Sport / Kategorie / Liga) mit Gewichtung und Vererbung von oben nach unten, dazu vorgeschlagene Buchmacher.
- Normierter Durchschnitt: Durchschnittsquoten werden auf den eigenen Key umgerechnet.
- Stärke-Balken unter jeder Durchschnittsquote.
- In der Match-Up-Zeile: Durchschnitt mit Min/Max, danach die Buchmacher nach Gewicht mit ihrem Key; das Gewicht erscheint beim Überfahren.

## Paket 4: Feed-Optionen und Outrights
- **Feed-Optionen Pre-Match:** Void-Regeln für Torschützen, Angleichung gleicher Ergebnisse, Wahrscheinlichkeiten senden, Regeln für abgebrochene Spiele und Tennis-Aufgabe, zusätzliche Torschützen-Ausgänge, OTHERS bei Outrights, 3-Ball-Regel.
- **Feed-Optionen Live:** Angleichung (niedrigster Wert / Durchschnitt / höchster Wert), Rundung (Betradar / Low-Key) als getestete Funktion, dynamischer Key.
- **Outrights-Konfiguration:** Sperren und Veröffentlichen, Key je Outright, Anzeige rot/grün.
- **Custom Outrights:** eigene Outrights anlegen, bearbeiten und löschen.
- Optional: Die Rundungsregel wird auch auf die Kunden-Feed-API angewendet.

## Technische Details
Die Migrationen folgen alle dem Muster CREATE TABLE, dann GRANT (authenticated + service_role), dann RLS, dann Policy: Lesen für alle Angemeldeten, Schreiben für Trader und Admin, Feed-Optionen nur für Admin.

- **P1:** `odds_history` (match_id, market, specifier, outcome, odds, changed_at). `match_odds` erhält `control_mode` und `suspended` je Markt. `alerts` erhält `score numeric` und `factors jsonb`. Neu ist `alert_log` (match_id, user_id, action, created_at). `matches` erhält `margin_skewed boolean`. Die Beispieldaten werden um weitere Märkte ergänzt.
- **P2:** `ladders` (id, name, kind single|pairs, values jsonb, is_system). `templates` (id, name, sport_id, ladder_id, config jsonb für Märkte, Zeitachse, Verteilung und Linien). `template_assignments` (template_id, category_id oder tournament_id). `tournament_config` (tournament_id PK, activation off|mon|ctrl, alert_factor numeric 0–2 als CHECK, template_id). Die alte `margin_templates` bleibt bestehen.
- **P3:** `bookmakers` (id, name, suggested). `bookmaker_lists` (id, level sport|category|tournament, ref_id, unique). `bookmaker_list_items` (list_id, bookmaker_id, weight). `bookmaker_odds` (match_id, bookmaker_id, market, specifier, outcomes, key). Die Normierung ist eine reine Funktion in `src/lib/feed/normalize.ts` mit Vitest-Test.
- **P4:** `feed_options` (scope prematch|live, options jsonb, eine Zeile je scope, nur Admin). `outrights` erhält `suspended`, `odds_key` und `custom boolean` sowie eine Schreib-Policy für Trader und Admin. Rundung in `src/lib/feed/rounding.ts` mit Tests.
- Frontend: neue Routen unter `/configuration/*` mit Unterleiste im Betradar-Stil (Tournaments, Templates, Ladders, Bookmaker Lists, Feed Options, Outrights), i18n de/en, HSL-Tokens.
- Prüfung je Paket: Build-Log, tsgo, Vitest, Playwright-Durchlauf der neuen Ansichten.
