# Kunden-API vervollständigen

## Audit – Ist-Stand

Schon vorhanden:
- Server-Schlüssel (`fpk_live_…`) und Widget-Schlüssel (`fpw_live_…`), mit SHA-256 gehasht gespeichert. Der Klartext wird nur einmal angezeigt. Schlüssel lassen sich sperren und löschen.
- Endpunkte `/sports`, `/matches`, `/matches/{id}/odds`, `/outrights`, `/results` in JSON und XML. Pro Kunde gelten Sportart-/Liga-Filter und Markup.
- Das Widget prüft die Domain-Whitelist. Es gibt ein Rate-Limit pro Minute, eine Statistik abgewiesener Abrufe und einen 15-Sekunden-Cache.

Lücken:
1. **Schlüssel in der Adresszeile:** Der Server-Schlüssel wird auch als `?api_key=` angenommen. So landet er in Protokollen und im Browser-Verlauf.
2. **Kein Ablaufdatum, keine Rotation und keine IP-Sperre** für Server-Schlüssel.
3. **Keine Rate-Limit-Angaben für den Kunden:** Die Header `X-RateLimit-Limit/Remaining/Reset` und `Retry-After` fehlen. Der Kunde kann seine Abrufe deshalb nicht selbst drosseln.
4. **Kein ETag/304:** Unveränderte Daten werden jedes Mal komplett übertragen.
5. **Keine Seitenaufteilung und kein Zeitfilter:** `limit`, `offset`, `since` und `status` fehlen bei `/matches`.
6. **Gesperrte Inhalte werden mitgeliefert:** Gesperrte Outrights und Märkte gehen an Kunden raus, und die Quotenrundung aus den Feed-Optionen wird nicht angewendet.
7. **Fehlerantworten** haben nur `error` und keinen maschinenlesbaren Fehlercode.
8. **Dokumentation** gibt es nur als Seite im Panel. Sie lässt sich nicht exportieren und nicht kundenspezifisch erstellen.

## Umsetzung

**Schritt 1 – Datenbank (Migration 0010)**
- In `api_keys` neue Felder: `expires_at`, `allowed_ips text[]`, `label`, `rotated_from`.
- `api_track` gibt zusätzlich die verbleibenden Abrufe zurück, für die Rate-Limit-Header.
- Neue Ablehnungsgründe: `key_expired`, `ip_denied`.

**Schritt 2 – Gemeinsamer Feed-Code**
- `resolveKey` prüft Ablaufdatum und IP-Whitelist (Einzel-IPs und CIDR-Bereiche, per `x-forwarded-for`).
- Gesperrte Märkte und Outrights werden herausgefiltert. Die Live-Rundung aus den Feed-Optionen wird nach dem Markup angewendet.
- Einheitliches Fehlerformat: `{ error: { code, message } }`, in XML als `<error code="">`.

**Schritt 3 – `feed-api`**
- Schlüssel nur noch per Header `X-API-Key`. Wer ihn in der Adresszeile schickt, erhält 400 mit Hinweis.
- Header `X-RateLimit-*` und `Retry-After`, dazu `ETag` mit 304 bei `If-None-Match`.
- `/matches` bekommt `limit` (max. 500), `offset`, `since`, `status` und `tournament`; die Antwort enthält `meta.total`.
- Neuer Endpunkt `/me`: zeigt Kunde, Freigaben, Formate und aktuelles Limit (nützlich für Kunden-Tests).
- Neuer Endpunkt `/openapi.json`: öffentliche Spezifikation ohne Schlüssel.

**Schritt 4 – `feed-widget`**
- Dieselben Prüfungen für Ablaufdatum und Rate-Limit samt Headern. Die Domain-Prüfung bleibt Pflicht.

**Schritt 5 – `api-clients-admin` und API-Kundenverwaltung**
- Beim Anlegen eines Schlüssels: Bezeichnung, Ablaufdatum (optional) und IP-Whitelist (nur Server-Schlüssel).
- Aktion „Rotieren“: Ein neuer Schlüssel wird erzeugt, der alte bleibt noch 24 Stunden gültig (Übergangsfrist) und läuft dann ab.
- Anzeige von Ablauf, IPs und letzter Nutzung pro Schlüssel.

**Schritt 6 – Exportierbare Dokumentation**
- Die Doku-Seite wird überarbeitet: Authentifizierung, alle Endpunkte mit Parametern, JSON- und XML-Beispielen, Fehlercodes, Rate-Limit-Verhalten, ETag und Widget-Einbindung.
- Export-Buttons: **OpenAPI 3.1 (JSON)**, **Markdown** und **HTML (Einzeldatei)** zum Weitergeben.
- Kundenspezifischer Export: Wählt man einen Kunden, enthält das Dokument dessen Sportarten, Formate, Limit und Widget-Domains, aber keine Schlüssel.
- Die OpenAPI-Spezifikation kommt aus einer einzigen gemeinsamen Quelldatei, die Frontend und `/openapi.json` gleichermaßen nutzen.

**Schritt 7 – Prüfung**
- Vitest: IP/CIDR-Prüfung, Ablaufprüfung, Rundung plus Markup, Aufbau der OpenAPI-Spezifikation.
- Test der Endpunkte gegen die Live-Funktionen: 401, abgelaufen, IP gesperrt, 429 mit `Retry-After`, 304 per ETag, XML-Fehler, Seitenaufteilung. Testkunde und Testschlüssel werden danach gelöscht.
- Browser-Test: Schlüssel anlegen und rotieren, Dokumentation exportieren.

## Technische Details
- Die IP-Prüfung nutzt die erste Adresse aus `x-forwarded-for`. IPv4-CIDR wird unterstützt, IPv6 nur als exakter Treffer.
- Der ETag ist ein SHA-1-Wert der Antwort und wird zusammen mit dem vorhandenen 15-Sekunden-Cache gespeichert.
- Die Rotation setzt beim alten Schlüssel `expires_at = now()+24h`; der neue Schlüssel bekommt `rotated_from`.
- Es werden keine weiteren Geheimnisse benötigt.
