# Deploy-Skript: Let's Encrypt und nginx zuverlässig einrichten

## Befund (Audit)

1. **HTTPS wird still übersprungen:** Stimmt die DNS-Prüfung nicht (IP-Abfrage fehlgeschlagen, Domain zeigt auf IPv6/Proxy, DNS noch nicht verteilt), setzt das Skript nur eine gelbe Warnung und läuft weiter – am Ende steht „HTTPS pending DNS“. Wahrscheinlichste Ursache bei Ihnen.
2. **nginx-Fehler nach Zertifikat:** Die HTTPS-Konfiguration nutzt `http2 on;`. Ubuntu 24.04 liefert nginx 1.24, das diese Schreibweise nicht kennt → `nginx -t` schlägt fehl, sobald ein Zertifikat da ist.
3. **`ssl_stapling`** erzeugt bei Let's-Encrypt-Zertifikaten ohne OCSP Warnungen (LE hat OCSP 2025 abgeschaltet).
4. **Kein Neustart:** nginx wird nur `reload`ed; ist nginx gestoppt oder hängt, greift nichts. Kein Erreichbarkeitstest von Port 80 vor certbot.
5. **Keine Prüfung, ob Port 80/443 frei ist** (z. B. apache2 vorinstalliert).
6. **Bestehendes, abgelaufenes oder unvollständiges Zertifikat** wird nie erneut angefordert (nur wenn `fullchain.pem` fehlt).

## Änderungen (nur deploy.sh, README-Hinweis)

- DNS-Prüfung robuster: A- und AAAA-Einträge, mehrere Resolver (1.1.1.1, 8.8.8.8), mehrere IP-Dienste; zusätzlich **HTTP-Selbsttest**: Testdatei in `/.well-known/acme-challenge/` ablegen und über `http://DOMAIN/…` abrufen. Nur wenn das fehlschlägt, wird übersprungen – dann **rote, klare Meldung** mit Ursache und `FORCE_HTTPS=1`-Option zum Erzwingen.
- `http2 on;` → `listen 443 ssl http2;` (kompatibel mit nginx 1.24+), `ssl_stapling` entfernen.
- Zertifikat auch anfordern, wenn vorhanden aber ungültig/abgelaufen (`openssl x509 -checkend`), mit `--expand` bei geänderten Domains.
- Port-Konflikte prüfen: apache2/lighttpd stoppen und deaktivieren, falls sie Port 80/443 belegen.
- nginx-Steuerung: `nginx -t` → bei laufendem Dienst `reload`, sonst `restart`; am Ende einmal `systemctl restart nginx` und `systemctl is-active`-Prüfung; alte `feed-panel`-Reste und `default`-Site (Link und Datei) entfernen.
- Abschlusstest: `curl -I https://DOMAIN` und Ablaufdatum des Zertifikats im Abschlussbericht.
- Renewal-Hook und certbot.timer bleiben, Dry-Run bleibt.

## Danach auf dem Server

`cd ~/feed-hub && git pull && sudo ./deploy.sh` – Screenshot vom Abschlussbericht.
