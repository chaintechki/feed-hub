# Feed-Authentifizierung reparieren und Deployment absichern

## Technischer Audit
- Der Screenshot zeigt wiederholt `uof-ingest 401 {"error":"Unauthorized"}`. Der Feed-Dienst erreicht damit die richtige Datenannahme; Netzwerk, HTTPS, nginx und der öffentliche Backend-Schlüssel funktionieren grundsätzlich.
- `feed-worker/index.mjs` signiert exakt den gesendeten JSON-Text mit HMAC-SHA256 über `<Zeitstempel>.<JSON>` und sendet `x-uof-ts` sowie `x-uof-sig`.
- Die Datenannahme prüft denselben Aufbau und akzeptiert höchstens zwei Minuten Zeitabweichung. Die Screenshot-Zeit ist aktuell; ein Uhrzeitfehler ist daher nicht erkennbar.
- Das benötigte Backend-Geheimnis `UOF_ACCESS_TOKEN` ist vorhanden. Da Header und Verfahren auf beiden Seiten übereinstimmen, ist die wahrscheinliche Ursache eine Abweichung zwischen `UOF_ACCESS_TOKEN` in `/etc/feed-panel/uof.env` und dem gleichnamigen Backend-Geheimnis, etwa durch eine fehlerhafte Eingabe beim ersten Deployment.
- `deploy.sh` übernimmt eine bereits vorhandene Datei derzeit unverändert. Es testet nach dem Neustart nur, ob der Dienst läuft, nicht ob eine signierte Anfrage akzeptiert wird. Deshalb kann das Deployment trotz dauerhafter 401-Fehler erfolgreich enden.
- Die zuvor korrigierte Paketgröße ist hiervon unabhängig: Zu große Pakete ergeben 413, die aktuelle Meldung ist eindeutig 401.

## Umsetzung
1. Den Feed-Zugangstoken ohne Anzeige im Chat auf beiden Seiten auf denselben Originalwert setzen: im Backend über die sichere Eingabe und auf dem Server in `/etc/feed-panel/uof.env`.
2. Feed-Dienst neu starten und prüfen, dass `uof-sync` sowie `uof-ingest` keinen 401 mehr liefern.
3. `deploy.sh` um einen verpflichtenden Authentifizierungs-Selbsttest ergänzen. Nach dem Worker-Neustart wartet das Skript kurz auf das Journal und bricht mit einer klaren Anleitung ab, falls 401/Unauthorized erscheint.
4. Die Eingabe im Deployment gegen führende oder nachgestellte Leerzeichen absichern und leere Pflichtwerte ablehnen.
5. Abschließend kontrollieren: neue Feed-Nachrichten, aktualisierte Quotenzeit, grüner Feed-Status und keine neuen 401-Antworten.

## Umfang
- Keine Datenbankänderung.
- Kleine Änderung nur an Deployment/Feed-Dienst-Diagnose.
- Der vorhandene Feed-Zugang bleibt bestehen; es werden keine Zugangsdaten in Code, Protokolle oder Chat geschrieben.
