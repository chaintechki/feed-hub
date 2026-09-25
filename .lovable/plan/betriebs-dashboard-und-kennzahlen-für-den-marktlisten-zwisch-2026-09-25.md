# Betriebs-Dashboard und Kennzahlen für den Marktlisten-Zwischenspeicher

## Audit (Ist-Zustand)
- **Aufräumaktion:** Der Zeitplan in der Datenbank schreibt nur in das interne Zeitplan-Protokoll (Status, Dauer). Wie viele Zeilen gelöscht wurden, wird nirgends gespeichert. Aus dem Panel kann man das Protokoll nicht lesen.
- **Datenbankgröße:** Die aktuelle Größe lässt sich abfragen, es gibt aber keinen Verlauf.
- **Speicherverbrauch:** Die Datenbank kann ihre eigene RAM-Auslastung des Servers (heute 77 %) nicht selbst abfragen. Diese Zahl kommt nur aus der Cloud-Verwaltung. Innerhalb der Datenbank messbar sind die Trefferquote des Datenbank-Caches, der Platz pro Tabelle, der WAL-Umfang und die Zahl der Verbindungen. Diese Werte zeigt das Dashboard an. Die RAM-Prozentzahl selbst kann ich nicht einbauen.
- **Marktlisten-Zwischenspeicher:** Es gibt ihn an drei Stellen: in der Kunden-API (10 Min.), im Quotenempfang (Gruppen-Cache pro Instanz) und in der Oberfläche (60 Min. pro Browser). Kennzahlen gibt es keine. Die Server-Funktionen leben nur kurz, deshalb müssen Zähler in der Datenbank gesammelt werden.

## Umsetzung
1. **Datenbank (Migration)**
   - Tabelle `ops_metrics`: stündlicher Messpunkt mit Datenbankgröße, Größe der größten Tabellen, WAL-Größe, Cache-Trefferquote, Verbindungen und tote Zeilen.
   - Tabelle `cleanup_runs`: pro Lauf Start, Dauer, Erfolg/Fehler und gelöschte Zeilen je Bereich. `db_cleanup()` schreibt diese Einträge künftig selbst, auch im Fehlerfall.
   - Tabelle `cache_stats`: Zähler pro Minute und Quelle (`feed-api`, `feed-widget`, `uof-ingest`) für Treffer, Fehlschläge, Datenbankzugriffe, Ladedauer (ms), Einträge und Zeitpunkt der letzten Aktualisierung. Dazu die Funktion `cache_track(...)`, die aufaddiert.
   - Funktion `ops_snapshot()` wird stündlich über den bestehenden Zeitplan aufgerufen und speichert einen Messpunkt.
   - Lesen dürfen nur Super-Admin und Admin. Schreiben dürfen nur der Server und die Funktionen. Alte Einträge werden nach 90 Tagen (Messpunkte, Läufe) bzw. 30 Tagen (Cache-Zähler) automatisch entfernt.
2. **Server-Funktionen:** `catalog()` und der Gruppen-Cache im Quotenempfang zählen Treffer, Fehlschläge, Datenbankzugriffe und Ladedauer im Speicher. Die Werte werden höchstens einmal pro Minute gebündelt geschrieben, damit keine zusätzliche Last entsteht. Danach werden `feed-api`, `feed-widget` und `uof-ingest` neu bereitgestellt.
3. **Oberfläche: neuer Reiter „Betrieb“ unter Konfiguration** (nur für Admins und den Super-Admin)
   - Kacheln: aktuelle Größe, Veränderung in 24 h, Cache-Trefferquote der Datenbank, letzter Aufräumlauf (Status, Dauer, gelöschte Zeilen)
   - Verlaufsdiagramme für 24 h, 7 Tage und 30 Tage: Datenbankgröße, größte Tabellen, WAL
   - Tabelle der letzten Aufräumläufe, Fehler rot markiert
   - Bereich Marktlisten-Cache: Trefferquote, Datenbankzugriffe, mittlere Ladedauer, letzte Aktualisierung pro Quelle sowie ein Verlaufsdiagramm
   - Hinweis, dass die RAM-Auslastung nur in der Cloud-Verwaltung angezeigt wird
   - Aktualisiert sich alle 60 Sekunden. Texte auf Deutsch und Englisch.
4. Version 1.0.6, Typprüfung, Tests (Unit-Test für die Zählerlogik), Build, Deploy der Funktionen und ein Kontrolllauf von `ops_snapshot()`.

## Technische Details
- Diagramme mit dem vorhandenen `recharts` bzw. der shadcn-Chart-Komponente und den HSL-Tokens.
- Zähler-Modul `_shared/cache-stats.ts`: Zähler im Speicher, Flush per RPC `cache_track`, wenn seit dem letzten Flush 60 s vergangen sind. Fehler beim Flush werden ignoriert, damit der Feed nie blockiert.
- Zeitplan: bestehender Job `feed-db-cleanup` bleibt. Neuer Job `feed-ops-snapshot` läuft `0 * * * *`.
- Der Browser-Cache in der Oberfläche wird nicht gemessen, weil er pro Nutzer lokal ist und die Datenbank nicht belastet.
- Ein Server-Deploy ist nur für den neuen Reiter nötig.
