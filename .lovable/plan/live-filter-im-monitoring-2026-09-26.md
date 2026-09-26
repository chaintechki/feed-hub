# Live-Filter im Monitoring

## Ziel
Ein neuer Filter-Schalter „Live" in der Filterleiste, der nur Spiele mit Status `live` anzeigt – kombinierbar mit allen bestehenden Filtern und der Suche.

## Audit (Ist-Zustand)
- Filter-Schalter werden zentral in `MONITOR_FILTER_KEYS` (`src/lib/feed/types.ts`) definiert; die Filterleiste (`FilterBar.tsx`) rendert sie automatisch – kein UI-Umbau nötig.
- Die Filterlogik liegt rein in `src/lib/feed/filters.ts` (`matchesMonitorFilters`) und ist mit Vitest getestet (`filters.test.ts`).
- `MatchRow.status` ist bereits geladen; Live-Spiele haben Status `live` (laufend), `suspended`/`interrupted` sind unterbrochene Live-Spiele.
- Filter werden in localStorage (`fp.monitorFilters`) gespeichert und bleiben nach Neuladen aktiv.

## Umsetzung
1. `src/lib/feed/types.ts`: neuen Schlüssel `live` in `MONITOR_FILTER_KEYS` (an erster Stelle, damit er prominent links steht).
2. `src/lib/feed/filters.ts`: Regel `if (filters.live && !["live","suspended","interrupted"].includes(match.status)) return false;` – unterbrochene Live-Spiele (Ballkontakt pause, Unterbrechung) zählen als live, wie in `queries.ts` (LIVE-Set) üblich.
3. Übersetzungen: `filters.live` = „Live" (DE) / „Live" (EN) in beiden Sprachdateien.
4. `src/lib/feed/filters.test.ts`: Tests ergänzen – Live-Filter lässt nur live/suspended/interrupted durch, kombiniert mit Suche und anderen Flags.
5. Keine Datenbankänderung, keine Edge-Function-Änderung – rein clientseitig.

## Prüfung
- Vitest (Filter-Tests), Typprüfung, Build.
- Kurzer Browser-Check: Filter aktiviert → nur Live-Spiele sichtbar, Chip „Live" erscheint und ist entfernbar.

## Risiko
Minimal: neuer optionaler Filter, bestehende gespeicherte Filter bleiben unverändert gültig.
