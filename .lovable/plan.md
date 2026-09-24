# Feed-Status zeigt "FEED INTERRUPTED" trotz laufender Quoten

## Audit (18:22 UTC)
- Live-Produzent: Quoten kommen laufend an (letzte Nachricht 18:21). Das letzte Lebenszeichen ist aber von 18:05.
- Pre-Match-Produzent: seit 18:05 weder Lebenszeichen noch Nachrichten. Deshalb wird der Status rot.
- Das Backend bekommt nur wenige Sendungen pro Minute. Eigentlich müssten Lebenszeichen alle ~10 Sekunden ankommen.
- Fehler im Feed-Dienst: Er erkennt Lebenszeichen nur, wenn die Nachricht direkt mit `<alive` beginnt. Die Nachrichten des Anbieters beginnen aber mit einem XML-Kopf (`<?xml ...?>`). Deshalb erkennt der Dienst keine Lebenszeichen, fordert keine Nachlieferung an und leitet sie nicht sofort weiter.
- Die Statusanzeige verlangt, dass BEIDE Produzenten innerhalb von 5 Min. ein Lebenszeichen oder eine Nachricht gesendet haben.

## Plan
1. Feed-Dienst: Lebenszeichen auch mit XML-Kopf erkennen. Dann werden sie sofort weitergeleitet und Nachlieferungen korrekt ausgelöst.
2. Feed-Dienst: Protokollzeile pro Minute mit der Anzahl empfangener Lebenszeichen je Produzent. So ist im Server-Log sofort sichtbar, ob der Anbieter sendet.
3. Statusanzeige: grün, solange der Anbieter keinen Ausfall meldet und das letzte Lebenszeichen/die letzte Nachricht höchstens 3 Min. alt ist. Im Aufklapp-Menü stehen beide Produzenten einzeln mit Uhrzeit des letzten Lebenszeichens.
4. Nach `git pull && sudo ./deploy.sh` auf dem Server prüfen: Lebenszeichen landen alle ~10 s in der Datenbank, der Status ist grün.

## Technisch
- feed-worker/index.mjs: Regex `/<alive\b([^>]*)\/?>/` (ohne `^`), Zähler pro Produkt + `setInterval` Log.
- src/components/layout/FeedStatus.tsx: Zeitfenster 3 Min., Popover zeigt `last_alive_at`.
- Keine DB-Änderung.
