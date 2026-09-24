# Abruf-Kontrolle: Statistik pro Kunde (erlaubte & abgewiesene Abrufe)

## Ziel
Volle Kontrolle über alle Kunden-Abrufe: erlaubte UND abgewiesene Anfragen werden gezählt und im Panel pro Kunde angezeigt (heute / 7 Tage / 30 Tage, letzte Aktivität, Gründe für Ablehnungen).

## Ist-Zustand (Prüfung)
- `api_usage` zählt pro Minute nur **erlaubte** Abrufe (`api_track`), getrennt nach Endpunkt (inkl. Widget).
- **Nicht sichtbar** bisher: abgewiesene Abrufe — ungültiger Schlüssel (401), nicht freigegebenes Format (403), falsche Widget-Domain (403), unbekannter Endpunkt (404), überschrittenes Limit (429).
- `api_keys.last_used_at` wird bereits bei jedem gültigen Schlüssel aktualisiert — als „zuletzt aktiv" nutzbar.
- `api_usage` darf Admin bereits lesen (RLS-Policy vorhanden) — die Frontend-Anzeige kann die Tabelle direkt abfragen.

## Schritt 1: Migration `0004_api_usage_denials.sql`
- Neue Tabelle `public.api_denials`:
  `id, client_id (nullable, ON DELETE SET NULL), key_hint (erste Zeichen des verwendeten Schlüssels), minute, endpoint, reason (invalid_key|format_denied|domain_denied|unknown_endpoint|rate_limited|not_found), count`
- Unique-Index über `(coalesce(client_id::text,'unknown:'||key_hint), minute, endpoint, reason)` — auch ohne bekannten Kunden nur 1 Zeile pro Minute/Grund.
- `GRANT SELECT ON api_denials TO authenticated; GRANT ALL TO service_role;` RLS an + Policy „nur Admin liest".
- Neue SECURITY DEFINER Funktion `api_track_denial(_client uuid, _key_hint text, _endpoint text, _reason text)`; Ausführung nur `service_role`.

## Schritt 2: Edge Functions
- `_shared/feed.ts`: Helper `trackDenial()` (fire-and-forget, blockiert die Antwort nicht).
- `feed-api`: Ablehnungen protokollieren bei 401 (invalid_key), 403 (format_denied), 404 (unknown_endpoint / match not_found), 429 (rate_limited).
- `feed-widget`: Ablehnungen bei 401 (invalid_key), 403 (domain_denied), 429 (rate_limited).
- Deploy aller Funktionen; `verify_jwt = false` bleibt unverändert.

## Schritt 3: Frontend — „Abruf-Statistik" unter Konfiguration → API-Kunden
- Kopfbereich: Gesamtabrufe heute, letzte 7 Tage, abgewiesene Abrufe heute.
- Tabelle je Kunde: erlaubte Abrufe (heute/7T/30T), abgewiesen heute, letzte Aktivität, Verteilung nach Endpunkt.
- Aggregation im Frontend aus Minute-Buckets (sum, group by) — 15-s-Cache wie im Rest des Panels.
- Neues i18n-Paket `usage.*` (de/en).

## Schritt 4: Verifikation
- Migration anwenden, Functions deployen.
- Test: gültiger Abruf, falscher Schlüssel, gesperrtes Format, Limit überschritten — Statistik zählt beides korrekt.
- Typprüfung, Vitest, Browser-Test mit chaintech; Testkunden danach löschen.
