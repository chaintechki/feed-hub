# Kunden-Feed: API, Widget, Betradar-kompatibles Format

## Wichtiger Hinweis (Lizenz)
Die Daten, die über die Sportradar-Anbindung ins Panel kommen, dürfen nur weitergegeben werden, wenn Ihr Vertrag mit Sportradar die Weitergabe erlaubt. Funktionen, die die Weitergabe vor dem Anbieter verbergen oder verschleiern sollen, baue ich nicht ein. Ohne passende Lizenz sollten Sie nur eigene Daten weitergeben, also Ihre eigenen Quoten, Margen und Einstellungen. Das System funktioniert technisch unabhängig davon: Kunden greifen ausschließlich auf Ihren Server zu, nie direkt auf Sportradar.

## Technischer Befund
- Daten liegen bereits in Tabellen: Sportbaum, `matches`, `match_odds` (eigene und Durchschnittsquoten), `outrights`, `settlements`.
- Serverseitige Logik läuft über Server-Funktionen, das Muster dafür gibt es schon (`admin-users`).
- Das Frontend nutzt nur den öffentlichen Schlüssel. Kunden-Zugangsschlüssel prüft ausschließlich der Server.

## Schritte
1. **Datenbank-Migration**
   - `api_clients`: Name, aktiv, Sportarten- und Liga-Freigaben, Quoten-Aufschlag (%), Abruflimit pro Minute, erlaubte Domains fürs Widget, Formate (json, betradar-xml).
   - `api_keys`: gehörender Kunde, Präfix, SHA-256-Hash (der Klartext wird nur einmal angezeigt), Status, zuletzt genutzt.
   - `api_usage`: Aufrufe pro Kunde, Minute und Endpunkt (für Limit und Statistik).
   - Zugriff nur für Admins; die Server-Funktion greift serverseitig zu.
2. **Server-Funktion `feed-api`** (öffentlich, Schlüssel im Header `X-API-Key`)
   - Endpunkte: `/sports`, `/matches`, `/matches/{id}/odds`, `/outrights`, `/results`.
   - Filtert jeden Abruf nach den Freigaben des Kunden und rechnet seinen Aufschlag in die Quoten ein.
   - Format `?format=json` (Standard) oder `?format=xml` im Betradar-ähnlichen Aufbau (Elemente wie `sport_event`, `market`, `outcome` mit denselben IDs, z. B. `sr:match:…`).
   - Abruflimit mit Antwort 429, Protokoll in `api_usage`, Antworten 15 Sekunden zwischengespeichert.
3. **Server-Funktion `api-clients-admin`** (nur Admins): Kunden anlegen und bearbeiten, Schlüssel erzeugen, sperren und löschen, Nutzung abrufen.
4. **Widget**
   - Server-Funktion `feed-widget` gibt für die öffentlichen Widget-Schlüssel eines Kunden nur die freigegebenen Spiele und Quoten zurück, geprüft gegen die erlaubten Domains.
   - Datei `public/widget.js`: der Kunde bindet sie mit `<script src=".../widget.js" data-key="…" data-sport="…"></script>` ein und erhält eine Quotentabelle im Panel-Design mit Aktualisierung alle 15 Sekunden.
5. **Panel: Konfiguration → API-Kunden** (nur Admins)
   - Kundenliste, Dialog für Freigaben, Aufschlag, Limit, Domains und Formate.
   - Schlüssel erzeugen (Klartext wird einmal angezeigt), sperren, löschen.
   - Nutzungsstatistik der letzten 24 Stunden und fertige Code-Beispiele (curl und Widget-Schnipsel) zum Weitergeben.
6. **Dokumentation**: Seite `/api-docs` im Panel mit Endpunkten, Parametern und Beispielantworten (JSON und XML) als Unterlage für Kunden.
7. **Prüfung**: Testkunde mit Schlüssel anlegen und alle Endpunkte in beiden Formaten abrufen. Außerdem prüfen: Filter, Aufschlag, Limit, gesperrter Schlüssel (401), Widget auf einer fremden Domain (abgelehnt). Danach den Testkunden löschen.

## Technische Details
- Schlüsselformat `fpk_live_<32 Zeichen>`; gespeichert wird nur der Hash, der Vergleich erfolgt zeitkonstant.
- CORS ist für `feed-api` offen, weil Serverabrufe mit Schlüssel erfolgen. Für `feed-widget` gilt eine Freigabeliste der Domains.
- Echtzeit-Push (Webhooks) ist nicht Teil dieser Stufe.
