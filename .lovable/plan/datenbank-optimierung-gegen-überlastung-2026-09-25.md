# Datenbank-Optimierung gegen Überlastung

## Audit (Stand jetzt)

- Datenbank 668 MB, davon **match_odds 594 MB** (1,09 Mio. Zeilen) und settlements 61 MB (376.000 Zeilen). Alles andere ist vernachlässigbar.
- **Doppelter Index auf match_odds:** `match_odds_feed_key` und `match_odds_match_id_source_market_specifier_key` indizieren dieselben Spalten. Dazu kommt `match_odds_match_id_idx`, den der zusammengesetzte Index schon abdeckt. Zusammen etwa 200 MB überflüssig. Jeder Quotenschreibvorgang muss alle drei pflegen.
- **Alte Daten:** 204.000 Quotenzeilen gehören zu 1.658 Spielen, die vor mehr als 2 Tagen stattfanden. Nichts räumt sie auf.
- settlements wächst ohne Grenze (376.000 Zeilen, fast nie gelesen).
- uof_markets: 38.000 vollständige Tabellenlesungen (Katalog ohne Cache in einzelnen Pfaden).
- Speicher 77 %, Festplatte 62 %.

## Schritte

1. **Überflüssige Indizes entfernen** (`match_odds_match_id_source_market_specifier_key`, `match_odds_match_id_idx`). `match_odds_feed_key` (NULLS NOT DISTINCT) bleibt, darauf basiert das Upsert. Spart etwa 200 MB und schreibt schneller.
2. **Automatische Aufräumaktion** (stündlicher Zeitplan in der Datenbank):
   - Quoten von Spielen löschen, die mehr als 48 h vorbei sind
   - odds_history älter als 7 Tage, settlements älter als 30 Tage
   - api_usage/api_denials älter als 90 Tage, uof_messages_log/uof_sync_runs älter als 14 Tage
   - beendete Spiele älter als 14 Tage (nur wenn nichts mehr darauf verweist)
   - audit_log wird **nie** gelöscht (fälschungssicher)
3. **Nur echte Änderungen schreiben:** Das Upsert in `uof-ingest` bekommt eine Bedingung. Eine Zeile wird nur aktualisiert, wenn sich Quoten, Sperre oder Status tatsächlich geändert haben. Weniger Schreiblast, weniger tote Zeilen.
4. **Einstellungen für automatisches Aufräumen** auf match_odds/matches schärfer setzen (Autovacuum bei 2 % statt 20 %), danach einmal `VACUUM ANALYZE`.
5. **Katalog-Cache:** Sicherstellen, dass alle Pfade den 10-Minuten-Cache der Marktliste nutzen.
6. Nachher messen (Größe, Speicher, Schreibdauer), Version 1.0.4.

## Technische Details

- Migration: `DROP INDEX` für 2 Indizes, Funktion `public.db_cleanup()` (SECURITY DEFINER, Löschen in Batches von 20.000 Zeilen), pg_cron-Job `0 * * * *`, `ALTER TABLE ... SET (autovacuum_vacuum_scale_factor=0.02)`.
- `supabase/functions/_shared/uof.ts`: Upsert per RPC `upsert_match_odds(jsonb)` mit `ON CONFLICT ... DO UPDATE ... WHERE match_odds.outcomes IS DISTINCT FROM EXCLUDED.outcomes OR suspended IS DISTINCT FROM ...`.
- Das Löschen der Indizes muss von dir bestätigt werden (Sicherheitsabfrage). Es gehen keine Daten verloren.
- Kein Server-Deploy nötig, nur Datenbank und Edge Functions.
