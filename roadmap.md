# Roadmap

## Plattform träge (1.0.13)
- [x] Datenbank neu gestartet
- [x] Feed schreibt nur noch eine Quotenquelle (live)
- [x] Monitoring lädt nur eine Quelle, Aktualisierung 60 s
- [x] Worker: Takt 10 s + automatisches Bremsen (wirksam nach deploy.sh)
- [x] Alte „average"-Quoten gelöscht (599.000 Zeilen), Abrechnungen bereinigt (925.000 Duplikate) + Duplikatschutz, Schreibvorgänge gebündelt (Migration 0025, ingest_batch)
- [x] Größere Datenbank-Instanz (Mini) gebucht, Speicher 74 % → 45–59 %
- [x] Vorher/Nachher messen
