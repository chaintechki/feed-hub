# Deploy-Skript: Vollautomatische Einrichtung auf leerem Ubuntu 24.04

## Audit (Ist-Zustand deploy.sh)

Bereits vorhanden:
- Root- und apt-Prüfung
- Prüfung/Installation: git, nginx, certbot, rsync, curl, ca-certificates
- Node.js >= 20 über NodeSource (nur wenn fehlend/zu alt)
- git pull, Versionserhöhung, npm ci, Build, Backup, Veröffentlichung nach /var/www/html
- nginx-Site, Let's Encrypt (mail@cetoria.de), Auto-Renewal
- feed-worker unter /opt/feed-worker als systemd-Dienst

Lücken für einen komplett leeren Server:
1. Henne-Ei-Problem: Skript liegt im Repository, das Repository muss aber erst geklont werden (git fehlt). Skript bricht ab, wenn kein Git-Repo vorliegt.
2. npm wird nicht separat geprüft (nur node).
3. Kein `gnupg`, `lsb-release`, `dnsutils` für NodeSource-Schlüssel und DNS-Prüfung.
4. Keine Firewall (ufw), kein Brute-Force-Schutz für SSH (fail2ban).
5. Keine automatischen Sicherheitsupdates (unattended-upgrades).
6. Kein Swap – Build kann bei 2–4 GB RAM abbrechen.
7. Keine Zeitsynchronisation-Prüfung (wichtig für Zertifikate und signierte Feed-Aufrufe, Toleranz 120 s).
8. Keine DNS-Vorprüfung vor Let's Encrypt (sonst Rate-Limit-Gefahr bei Fehlversuchen).
9. Kein Abschlussbericht, was installiert/übersprungen wurde.

## Umsetzung

Alle Schritte nach dem Muster „prüfen → nur wenn fehlend installieren → einrichten“, wiederholbar ohne Nebenwirkungen.

1. **Bootstrap-Modus**: Wird das Skript außerhalb eines Repos gestartet (z. B. per `curl … | sudo bash` oder als Einzeldatei), installiert es git, klont `REPO_URL` nach `APP_DIR` (Standard `/opt/feed-panel`) und startet sich dort neu. Ist das Repo schon da: normaler Ablauf mit git pull. Bei privatem Repo wird nach der URL gefragt (Token in der URL oder Deploy-Key).
2. **Basis-Pakete** (einzeln geprüft per dpkg): git, curl, ca-certificates, gnupg, lsb-release, rsync, nginx, certbot, ufw, fail2ban, unattended-upgrades, dnsutils, build-essential (für native npm-Module). Ein einziges `apt-get update` nur wenn nötig.
3. **Node.js/npm**: Prüfung Version node >= 20 UND `npm` vorhanden; sonst NodeSource-Installation; Ausgabe der Versionen.
4. **Swap**: Wenn kein Swap und RAM < 8 GB → 2 GB `/swapfile` anlegen und in fstab eintragen.
5. **Zeit**: `systemd-timesyncd` aktivieren, wenn nicht synchron.
6. **Firewall**: ufw nur einrichten, wenn inaktiv: SSH (22), 80, 443 erlauben, dann aktivieren (SSH wird immer zuerst erlaubt, damit man sich nicht aussperrt). Abschaltbar mit `SKIP_FIREWALL=1`.
7. **fail2ban**: sshd-Jail aktivieren, falls nicht vorhanden.
8. **Sicherheitsupdates**: unattended-upgrades aktivieren.
9. **DNS-Vorprüfung**: vor certbot prüfen, ob `DOMAIN` auf die öffentliche IP des Servers zeigt; falls nicht, verständliche Meldung und HTTPS-Schritt überspringen statt Fehlversuch (HTTP-Site läuft trotzdem).
10. **Dienste**: nginx, feed-worker, certbot.timer jeweils `enable --now` und Statusprüfung.
11. **Abschlussbericht**: Tabelle mit Node/npm/nginx/certbot-Version, Firewall-Status, Zertifikat-Ablauf, feed-worker-Status, veröffentlichte Version.
12. Kopfkommentar und README-Abschnitt „Erstinstallation auf leerem Server“ aktualisieren (ein Befehl).

## Technische Details
- Nur `deploy.sh` und README werden geändert; keine Datenbank- oder App-Änderungen.
- Neue Variablen: `REPO_URL`, `APP_DIR`, `SKIP_FIREWALL`, `SWAP_SIZE`.
- Prüfung abschließend mit `bash -n` und shellcheck.
- Echter Serverlauf erfolgt durch Sie; Zugangsdaten des Feeds werden wie bisher beim ersten Lauf abgefragt.
