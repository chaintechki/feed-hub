# Stabilität: Live-Daten prüfen und Überlastung dauerhaft verhindern

## Audit (Stand 13:15 UTC)
- Live-Daten kommen an: letzte Quote vor wenigen Sekunden, 8.154 Quoten-Updates in 5 Min, 112 Live-Spiele, davon 71 mit frischen Quoten. Beide Anbieter-Kanäle (Ctrl, LO) melden "alive", nicht down.
- 97 Fehler in der letzten Stunde – alle aus der Ausfallzeit (Datenbank nicht erreichbar, 520/521/525), keine neuen Fehler.
- Datenbank: Speicher 68 %, Datenplatte 67 %, Verbindungen 22/60, Größe 769 MB, WAL 384 MB.
- Größte Last:
  1. Abrechnungen schreiben: im Schnitt 1,1 s, bis 5,8 s pro Paket.
  2. Monitoring liest Quoten: 285 Aufrufe à ~90 ms.
  3. Sperr-Updates auf Quoten: 13.934 einzelne Aufrufe (klein, aber sehr viele), gelegentlich bis 2 s.
- Datenplatte bei 67 % – wächst weiter ohne harte Grenzen.

## Maßnahmen
1. **Abrechnungen bündeln + begrenzen:** nur neue Abrechnungen schreiben (Serverfunktion mit ON CONFLICT DO NOTHING in einem Aufruf), Abrechnungen älter als 7 Tage stündlich löschen.
2. **Sperr-Updates zusammenfassen:** alle Sperr-/Freigabeänderungen eines Pakets in einem einzigen Serveraufruf statt vieler Einzel-Updates.
3. **Schutzschalter im Feed-Dienst:** misst die Antwortzeit der Datenbank; bei > 2 s oder Fehlern werden Pakete gepuffert und zusammengelegt (nur letzter Stand je Quote), statt nachzuschieben. Kein Datenverlust bei Live-Quoten, nur Verzögerung.
4. **Harte Aufbewahrungsgrenzen:** Quoten von beendeten Spielen > 24 h, Quotenverlauf > 3 Tage, Logs > 7 Tage – im bestehenden stündlichen Aufräumlauf.
5. **Zeitlimits:** Anfragen des Feed-Dienstes max. 10 s, Monitoring-Leseanfragen max. 15 s – ein hängender Aufruf kann die Datenbank nicht mehr blockieren.
6. **Überwachung im Betriebs-Dashboard:** Ampel für "letzte Live-Quote vor x s", Datenbank-Antwortzeit und Plattenbelegung; Warnung ab 80 % Platte bzw. wenn 2 Min keine Quote kam.
7. Vorher/Nachher messen, Version 1.0.14.

## Technische Details
- Migration 0026: `ingest_settlements(jsonb)`, `set_odds_suspended(jsonb)` (Security Definer, nur service_role); `db_cleanup_core` um Aufbewahrungsregeln erweitern; `statement_timeout` für Rolle `authenticated` 15 s.
- `uof-ingest`: settlements/suspend über neue RPCs.
- `feed-worker/index.mjs`: Coalescing-Puffer (Map key match|market|specifier), Circuit Breaker mit Latenzschwelle.
- `OperationsPage.tsx`: Feed-Frische + Platten-Ampel.
- Nach Umsetzung: `sudo ./deploy.sh` auf dem Server (wegen Feed-Dienst).
