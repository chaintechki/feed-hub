# Plan: KI-Quotenassistent, aktive Filter-Chips, Playwright-Filtertests

## Audit (Ausgangslage)
- Monitoring-Filter laufen über die reine Funktion `src/lib/feed/filters.ts`; die gesamte Spielmenge wird paginiert geladen (`useMatches`). `FilterBar` schaltet nur um, eine Übersicht aktiver Filter gibt es nicht.
- Es gibt noch keine KI-Funktion, keine Gesprächstabelle und keine Edge Function für KI.
- Playwright ist installiert; die bestehenden E2E-Tests prüfen Filter nicht mit großen Datenmengen.

## 1. Aktive Filter als Chips (nur Frontend)
- Neue Komponente `ActiveFilterChips` oberhalb der Tabelle: ein Chip pro aktivem Filter (Flags, Sport/Liga aus dem Baum, Suchtext, Zeitraum) mit X-Button zum Entfernen und „Alle zurücksetzen“.
- Nutzt den bestehenden Filterzustand in `MonitorMatches` (bleibt gespeichert). Betradar-Stil, HSL-Tokens, Übersetzungen DE/EN.

## 2. Playwright-Tests für Filter mit großer Datenmenge
- Test-Fixture erzeugt ca. 3.000 synthetische Spiele (gemischt: mit/ohne nutzbare Quoten, gesperrt, live, alerted, hotlisted, verschiedene Sportarten/Zeiten).
- Datenabfragen werden im Browser per `page.route` abgefangen (keine echte DB nötig, deterministisch; paginiert wie im Original).
- Prüfungen: jeder Filter einzeln und kombiniert zeigt exakt die erwarteten Spiele/Anzahl; Treffer jenseits der ersten Seite werden gefunden; Entfernen über die neuen Chips stellt die Liste wieder her.
- Zusätzlich Vitest-Tests für die Chip-Ableitung.

## 3. KI-Assistent „Feed-Analyse“ (ein Gespräch, in der Datenbank gespeichert)
- **Datenbank (Migration):** Tabelle `ai_chat_messages` (id uuid, user_id, message_id text, role, parts jsonb, created_at) mit GRANTs, RLS: jeder Benutzer liest/schreibt/löscht nur seine eigenen Nachrichten. Zugriff für alle angemeldeten Rollen (viewer inklusive, nur lesend auf Feed-Daten).
- **Edge Function `feed-assistant`:** prüft Login + Rate-Limit (bestehende Guards), lädt den gespeicherten Verlauf, ruft das Modell `openai/gpt-6-astra` über AI Gateway (Responses, Streaming) auf. Das Modell bekommt Werkzeuge (nur lesend, respektieren die Sichtbarkeit/RLS des Benutzers):
  - `search_matches` (Teams, Sport, Liga, Status, Zeitraum, nur mit Quoten, live)
  - `get_match_odds` (Märkte/Quoten eines Spiels, gesperrt ja/nein)
  - `feed_summary` (Zählungen: Spiele, mit Quoten, live, gesperrt je Sportart)
  Antwort: verständliche deutsche/englische Zusammenfassung mit Treffern. Fertige Nachrichten werden serverseitig gespeichert, Fehler (429/402 usw.) werden im UI angezeigt.
- **UI:** neuer Menüpunkt „Monitoring → KI-Analyse“ mit einem fortlaufenden Gespräch, Button „Neues Gespräch“ (löscht Verlauf), Markdown-Antworten, eingeklappte Werkzeug-Karten, Treffer-Links öffnen das Spiel. Eigenes Symbol (kein generisches), Betradar-Stil, DE/EN.
- `LOVABLE_API_KEY` wird bei Bedarf eingerichtet; Nutzung verbraucht Workspace-Credits.

## 4. Abschluss
- Version 1.0.9, Typprüfung, Vitest, Playwright, Deno-Check, Deploy der Function, Live-Test einer Frage.
- AGENTS.md: Regel zur KI-Function (nur lesende Werkzeuge, Sichtbarkeit über Benutzer-JWT).
- Server-Deploy nötig für die neue Oberfläche.
