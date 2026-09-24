# Echtdaten-Anbindung (Unified Odds Feed, Buchmacher 4002)

## Audit
- Schnittstelle `uof.oddz.club` mit Token erreichbar: `whoami` = OK, Buchmacher 4002; Sportliste liefert Daten.
- Nachrichtenserver `mq-uof.oddz.club:5671` (TLS) erreichbar.
- Wichtig: Die Live-Quoten kommen über eine dauerhafte Nachrichtenverbindung (AMQP). Server-Funktionen im Backend laufen nur Sekunden und können diese Verbindung nicht offen halten. Deshalb braucht es einen kleinen Dauerdienst auf Ihrem Linux-Server.
- Tabellen für Sportbaum, Matches, Quoten, Outrights, Settlements existieren bereits und werden weiterverwendet; Beispieldaten werden danach entfernt.
- Zugangsdaten kommen ausschließlich in geschützte Server-Geheimnisse bzw. `/etc/feed-panel/uof.env` (Rechte 600), nie in den Code oder das Repository.

## Architektur
```text
UOF-Nachrichtenserver ──AMQP──> feed-worker (Ihr Server, systemd)
                                     │ gebündelt, signiert
                                     v
                        Server-Funktion uof-ingest ──> Datenbank ──> Panel / Kunden-API
UOF-Schnittstelle (REST) <── uof-sync (zeitgesteuert): Sportbaum, Spielplan, Stammdaten, Markt-Beschreibungen
```

## Schritte
1. **Geheimnisse**: `UOF_ACCESS_TOKEN`, `UOF_API_HOST`, `UOF_INGEST_SECRET` im Backend speichern.
2. **Migration 0014**: Spalten für Anbieter-IDs (`sr:match:…`, Markt-/Outcome-IDs, Specifier), Tabellen `uof_markets` (Beschreibungen), `uof_producers` (Status/letzte Nachricht für Recovery), `uof_messages_log` (Fehler, 7 Tage). Beispieldaten löschen.
3. **Server-Funktion `uof-sync`** (alle 10 Min + manuell): Sportarten/Kategorien/Ligen, Spielplan der nächsten 3 Tage, Teamnamen de/en, Marktbeschreibungen.
4. **Server-Funktion `uof-ingest`**: nimmt vom Worker gebündelte Nachrichten an (HMAC-Signatur), verarbeitet `odds_change`, `bet_stop`, `bet_settlement`, `bet_cancel`, `fixture_change`, `alive`, `snapshot_complete`. Eigene Quoten = Feed-Quote mit Ihren Templates/Rundung.
5. **`feed-worker/`** (Node, im Repo): AMQP-Verbindung mit Routing `#`, Bündelung alle 1 s, Producer-Überwachung per `alive`, automatische Recovery über die REST-Schnittstelle nach Ausfall, Wiederverbindung.
6. **deploy.sh**: installiert Worker als systemd-Dienst `feed-worker`, legt `/etc/feed-panel/uof.env` an (fragt Werte beim ersten Lauf ab), Neustart bei Update.
7. **Panel**: Statusanzeige im Kopf (grün/rot je Producer, letzte Nachricht), Button „Jetzt synchronisieren“ unter Konfiguration.
8. **Prüfung**: Sync ausführen, Sportbaum und Spiele mit Echtdaten im Panel prüfen, Worker lokal gegen den Nachrichtenserver testen, Kunden-API liefert Echtquoten.

## Hinweis
Die Zugangsdaten stehen jetzt im Chatverlauf. Nach der Einrichtung empfehle ich, Passwort und Token beim Anbieter erneuern zu lassen.
