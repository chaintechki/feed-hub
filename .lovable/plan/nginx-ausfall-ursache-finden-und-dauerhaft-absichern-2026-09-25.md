# nginx-Ausfall: Ursache finden und dauerhaft absichern

## Audit (deploy.sh, ohne Serverzugriff)

1. **Kein automatischer Neustart:** nginx läuft mit der Ubuntu-Standardeinstellung – stürzt es ab, bleibt es aus. Nur der feed-worker hat `Restart=always`.
2. **Wahrscheinlichste Ursache „ließ sich nicht starten“:** Die Weiterleitungen zum Backend (`proxy_pass` auf einen festen Hostnamen) werden von nginx nur beim Start/Reload aufgelöst. Ist DNS in diesem Moment kurz nicht erreichbar (Neustart des Servers, nächtlicher Zertifikats-Reload, Netzwerk-Hänger), bricht nginx mit „host not found in upstream“ ab und startet gar nicht mehr.
3. **Nächtlicher Zertifikats-Hook** macht nur `systemctl reload nginx` ohne Prüfung und ohne Rückfall.
4. **Keine Überwachung:** Niemand prüft, ob die Seite antwortet; Ausfälle fallen erst manuell auf.
5. **Mögliche Nebenursachen:** Speicher voll (Logs ohne Grenzen), Arbeitsspeicher knapp (OOM), zu wenige Verbindungen (`worker_connections` Standard 768).

Die genaue Ursache von gestern steht im Server-Protokoll – bitte ausführen und Ausgabe schicken:
`journalctl -u nginx --since yesterday --no-pager | tail -50; tail -50 /var/log/nginx/error.log; df -h /; dmesg -T | grep -i -E "oom|killed" | tail`

## Änderungen (nur deploy.sh + README)

- **Automatischer Neustart:** systemd-Override für nginx: `Restart=always`, `RestartSec=3`, keine Startsperre nach mehreren Fehlversuchen; Start erst nach `network-online.target`.
- **DNS-unabhängiger Start:** `resolver 1.1.1.1 8.8.8.8 valid=300s` und Backend-Adresse über Variable – nginx startet auch ohne DNS und löst später auf.
- **Wächter:** systemd-Timer jede Minute: prüft `nginx`, `feed-worker` und `https://DOMAIN/version.json`; bei Fehler `nginx -t` + Neustart, Eintrag ins Protokoll.
- **Sicherer Zertifikats-Hook:** `nginx -t && reload || restart`.
- **Belastbarkeit:** `worker_connections 4096`, `worker_rlimit_nofile 16384`, Dateilimit im systemd-Override.
- **Speicher:** logrotate für nginx täglich/14 Tage komprimiert, journald auf 500 MB begrenzt.
- **Abschlussbericht:** zeigt Wächter-Status und Neustart-Einstellung.

## Danach auf dem Server
`cd ~/feed-hub && git pull && sudo ./deploy.sh` – anschließend Test: `sudo kill -9 $(pgrep -o nginx)`, nach 3 s muss die Seite wieder laufen.
