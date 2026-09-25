# Offene Punkte abarbeiten

## Audit (Stand jetzt)
- **Beispiel-Ligen im Sportbaum:** bereits erledigt – keine Beispiel-Sportarten, -Kategorien, -Ligen oder -Spiele mehr in der Datenbank.
- **Tabelle zeigt beendete Spiele vor Spielen mit Quoten:** bereits früher behoben (Sortierung nach „hat Quoten", dann Anstoßzeit).
- **Marktliste aus dem Zwischenspeicher:** geprüft, alle Stellen nutzen einen Cache (Backend 10 Min., Quotenempfang pro Instanz, Oberfläche 60 Min.). Nichts zu tun.
- **Stündliche Aufräumaktion:** Zeitplan ist aktiv (jeweils xx:07), ist aber noch nie gelaufen, weil er erst nach 21:07 angelegt wurde. Es liegen noch 97.618 alte Quotenzeilen. Datenbank: 562 MB.
- **Zeile „Ungültiger Schlüssel" in der Abruf-Statistik:** Abrufe ganz ohne Schlüssel und Abrufe mit falschem Schlüssel werden zusammen als „Ungültiger Schlüssel" angezeigt. Das ist irreführend.

## Umsetzung
1. **Abruf-Statistik:** Abrufe ohne Schlüssel werden getrennt als „Kein Schlüssel" angezeigt, Abrufe mit falschem Schlüssel weiterhin als „Ungültiger Schlüssel (fpk_…)". Deutsch und Englisch.
2. **Aufräumaktion prüfen:** Nach dem Lauf um 22:07 UTC prüfen, ob die alten Quoten entfernt wurden und keine Fehler auftraten. Außerdem Größe und Arbeitsspeicher messen. Falls der Lauf fehlschlägt, repariere ich die Funktion.
3. Version 1.0.5, Build und Tests prüfen.

## Nicht von mir lösbar (bleibt offen)
- Server-Deploy: `cd ~/feed-hub && git pull && sudo ./deploy.sh` (neue Audit-Log-Ansicht, Admin-Fix, Statistik-Änderung).
- Auto-Booking sowie fehlende Sportarten (Tischtennis, Eishockey, eBasketball) bei oddz.club für Konto 4002 anfragen.
- Nizars Schlüssel in der Oberfläche anlegen und ihm getrennt vom PDF schicken.
- Feed-Token und Passwort beim Anbieter erneuern lassen, da sie im Chatverlauf stehen.

## Technische Details
- `ApiClients.tsx`: `usage.unknown` nach `key_hint` aufteilen: leer ergibt `usage.reason.key_missing`, sonst `invalid_key`. Die Schlüssel existieren bereits in de/en.
- Prüfung über `cron.job_run_details` und `pg_database_size`. Es gibt keine Schemaänderung.
