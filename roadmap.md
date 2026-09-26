# Roadmap

## Plattform träge (1.0.13)
- [x] Datenbank neu gestartet
- [x] Feed schreibt nur noch eine Quotenquelle (live)
- [x] Monitoring lädt nur eine Quelle, Aktualisierung 60 s
- [x] Worker: Takt 10 s + automatisches Bremsen (wirksam nach deploy.sh)
- [ ] Alte „average"-Quoten löschen, Abrechnungs-Duplikate verhindern, Schreibvorgänge bündeln — wartet, bis die Datenbank wieder antwortet
- [ ] Vorher/Nachher messen
