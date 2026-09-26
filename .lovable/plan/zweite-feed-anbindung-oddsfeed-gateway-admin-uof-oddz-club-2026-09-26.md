# Zweite Feed-Anbindung: OddsFeed Gateway (admin-uof.oddz.club)

## Audit der Dokumentation

- Die Dokumentation beschreibt **keine Quoten-Schnittstelle**, sondern eine **Verwaltungs-Schnittstelle** (`https://admin-uof.oddz.club/v1`).
- Zwei Bereiche mit Anmeldung per Token (JWT, HMAC-SHA256, 30 s Toleranz):
  - **Admin** (`/v1/admin`): Admin-Benutzer, Benutzer von Feed-Kunden. Für uns nicht nötig.
  - **Client** (`/v1/client`, Login mit `feedClientId` + Benutzername + Passwort): relevant.
- Wichtige Client-Funktionen:
  - `feed-clients` anlegen (`name`, `nodeId`, `outputFormat`, `skipCalculation`), `activate` / `deactivate`
  - `skip-calculation` (Quoten ohne Gateway-Berechnung durchreichen)
  - `rabbitmq/status`, `rabbitmq/password`, `rabbitmq/test-message`
  - Quoten-Leitern (`ladders`) anlegen, ändern, aktivieren
  - `/health` ohne Anmeldung
- Die Quoten selbst kommen weiterhin über eine **RabbitMQ-Warteschlange**, deren Zugang über diese Schnittstelle erzeugt und verwaltet wird.
- Lücke in der Doku: Die Felder von `CreateFeedClientResult`, `RabbitMqQueueStatusResult` und die Werte von `outputFormat` sind laut Doku **nicht beschrieben**. Host, vhost und Nachrichtenformat der neuen Warteschlange stehen also nicht fest. Das muss beim ersten echten Aufruf ermittelt oder beim Anbieter erfragt werden.

## Empfehlung: nicht ersetzen, sondern umschaltbar machen

- Die alte Anbindung (UOF, Konto 4002) läuft stabil und liefert Echtdaten. Ein Ersatz ohne Rückweg wäre riskant, besonders weil das Nachrichtenformat des Gateways noch unbekannt ist.
- Deshalb: **Beide Anbindungen bleiben im System. Immer genau eine ist aktiv.** Umschalten darf nur der Super Admin; jede Umschaltung landet im manipulationssicheren Protokoll.
- Ist das Gateway-Format identisch mit dem UOF-XML (wahrscheinlich, da „Unified Feed"-Gateway), nutzt es die bestehende Verarbeitung komplett weiter. Andernfalls braucht es einen Übersetzer (siehe Schritt 4).

## Umsetzung

1. **Zugangsdaten (Server-Geheimnisse):** `GW_API_HOST` (admin-uof.oddz.club), `GW_FEED_CLIENT_ID`, `GW_USERNAME`, `GW_PASSWORD`. Frage ich nach Freigabe gesondert über das sichere Formular ab.
2. **Datenbank:** neue Tabelle `feed_connections` (Anbindung `uof` / `gateway`, aktiv ja/nein, Status, letzte Prüfung, Warteschlangen-Daten ohne Passwort). Regel: höchstens eine aktiv. Umschalten nur über eine geschützte Funktion, die den Super Admin prüft. Protokoll-Trigger für jede Änderung.
3. **Server-Funktion `gateway-admin`** (nur Super Admin): Login mit Token-Zwischenspeicher bis Ablauf, `health`, Feed-Client-Übersicht, anlegen, aktivieren/deaktivieren, `skip-calculation`, RabbitMQ-Status, Testnachricht, Warteschlangen-Passwort erneuern. Leitern optional mit unseren Leitern abgleichen.
4. **Feed-Dienst auf dem Server:** holt beim Start und jede Minute die aktive Anbindung. Bei `uof` wie bisher; bei `gateway` verbindet er sich mit der Gateway-Warteschlange. Beim Umschalten wird die alte Verbindung sauber geschlossen, die neue geöffnet und eine Vollabfrage (Recovery) ausgelöst. Nachrichten laufen weiter über `uof-ingest`; ist das Format anders, kommt dort ein Übersetzer davor.
5. **Oberfläche:** neuer Bereich „Konfiguration → Feed-Anbindungen" (nur Super Admin): beide Anbindungen als Karten mit Status (erreichbar, Warteschlange, letzte Nachricht), Schalter „Aktivieren" mit Bestätigungsdialog, Testnachricht-Knopf, Warteschlangen-Passwort erneuern. Andere Rollen sehen den Bereich nicht. Die Statusanzeige oben zeigt, welche Anbindung aktiv ist. Texte in DE/EN.
6. **Tests:** Vitest für Rechteprüfung und die Regel „nur eine aktiv"; Test „Nicht-Super-Admin wird abgewiesen"; Live-Test von Login, Health und RabbitMQ-Status gegen das Gateway; Umschalttest in beide Richtungen mit Prüfung, dass danach Quoten ankommen.
7. **Auslieferung:** Version 1.0.15, danach `sudo ./deploy.sh` auf dem Server (Feed-Dienst startet neu, ca. 10–20 s keine Quoten).

## Risiken

- Nachrichtenformat und Warteschlangen-Daten des Gateways sind unbekannt. Der Schalter bleibt gesperrt, bis ein Probelauf mit Testnachricht erfolgreich war.
- Beim Umschalten kurze Lücke (Sekunden), danach holt die Recovery alles nach.
- Wird die neue Anbindung aktiviert und liefert nichts, kann der Super Admin jederzeit zurückschalten. Die alte Anbindung wird nicht gelöscht.

## Offene Punkte (vom Anbieter / von Ihnen)

- Zugangsdaten für den Client-Login: `feedClientId`, Benutzername, Passwort.
- Existiert schon ein Feed-Client beim Gateway, oder sollen wir ihn anlegen (mit welcher `nodeId`)?
- Welches `outputFormat` gibt es, und kommen die Daten im gleichen XML-Format wie bisher?
