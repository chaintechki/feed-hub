# Rechen-Captcha beim Login (serverseitig), Passwortregeln, komplettes Deploy-Skript

## Audit (Ist-Zustand)
- Es gibt nur das Login-Formular (Benutzername + Passwort). Keine Registrierung, kein „Passwort vergessen“ – so bleibt es.
- Der Browser meldet sich direkt beim Anmeldedienst an (`signInWithPassword`). Ein Captcha nur im Formular wäre wertlos: ein Angreifer könnte den Anmeldedienst direkt ansprechen.
- Benutzer werden nur vom Admin angelegt (Server-Funktion `admin-users`); dort gibt es keine Passwortregeln, keine Wiederholung, kein Augensymbol.
- `deploy.sh`: baut und kopiert nach `/var/www/html`, aber kein git pull, keine nginx- oder Let's-Encrypt-Einrichtung.

## 1. Serverseitiges Rechen-Captcha (nicht umgehbar)
- Neue Server-Funktion `auth-login`:
  - `GET /captcha`: erzeugt eine Aufgabe mit Zahlen (z. B. `7 + 12 = ?`, auch `−` und `×`, Ergebnis immer positiv) und liefert ein signiertes Token (HMAC mit Server-Geheimnis; enthält Lösungshash, Ablauf 2 Min., Einmal-ID). Die Lösung verlässt den Server nie.
  - `POST /login`: prüft Signatur, Ablauf, Einmalverwendung (Tabelle `captcha_used`), Ergebnis. Erst danach Anmeldung und Rückgabe der Sitzung an den Browser.
  - Sperre gegen Durchprobieren: nach 5 Fehlversuchen pro Benutzername/IP 15 Min. Pause (Tabelle `login_attempts`).
- **Warum man es nicht umgehen kann:** Das beim Anmeldedienst gespeicherte Passwort ist nicht mehr das eingegebene Passwort, sondern eine Ableitung davon mit einem Server-Geheimnis (HMAC-„Pepper“). Direkt am Anmeldedienst funktioniert das Klartext-Passwort daher nicht. Nur `auth-login`, also nach gelöstem Captcha, kann die Anmeldung durchführen.
- `admin-users` (Anlegen, Passwort zurücksetzen) speichert Passwörter ab sofort ebenfalls in dieser Form.
- Umstellung bestehender Konten: das Passwort von `chaintech` wird einmalig serverseitig in die neue Form gebracht (gleiches Passwort `StGlBrGn55!!`). Andere bestehende Nutzer (falls vorhanden) bekommen vom Admin ein neues Passwort.
- Login-Formular: Captcha-Feld mit Aufgabe als Zahlen, Neu-laden-Symbol für eine neue Aufgabe, bei Fehler automatisch neue Aufgabe. Zusätzlich Augensymbol im Passwortfeld.

## 2. Passwortregeln (dort, wo Passwörter vergeben werden: Admin „Benutzer anlegen“ und „Passwort zurücksetzen“)
- Live-Prüfung während der Eingabe mit Checkliste: mindestens 6 Zeichen, Groß- und Kleinbuchstabe, Zahl, Symbol.
- Feld „Passwort wiederholen“ mit Live-Abgleich.
- Augensymbol in beiden Feldern.
- Live-Prüfung, ob der Benutzername noch frei ist (statt E-Mail, da Konten Benutzernamen verwenden).
- Dieselben Regeln prüft auch der Server; ungültige Passwörter werden abgelehnt.

## 3. Deploy-Skript (komplett)
`deploy.sh` für `feed.feedarea.net`, einmal ausführen oder bei jedem Update:
1. Pakete prüfen/installieren (nginx, certbot, git, node ≥ 20, rsync) auf Debian/Ubuntu.
2. `git pull` (Branch per Variable, Standard `main`).
3. Version erhöhen, `npm ci`, `npm run build`, Sicherung, Kopie nach `/var/www/html`.
4. nginx-Site anlegen: SPA-Fallback, gzip, lange Zwischenspeicherung für Assets, **kein** Zwischenspeicher für `index.html`, `sw.js`, `version.json`, Sicherheits-Header, Weiterleitung HTTP → HTTPS, `www` optional.
5. Let's Encrypt über certbot (webroot), automatische Verlängerung per systemd-Timer mit nginx-Reload.
6. `nginx -t` vor jedem Neuladen; Abbruch mit Hinweis bei Fehler.
- Variablen: `DOMAIN=feed.feedarea.net`, `LE_EMAIL`, `BRANCH`. Die E-Mail für Let's Encrypt fehlt noch; das Skript fragt beim ersten Lauf danach, falls nicht gesetzt.
- Voraussetzung: DNS-A-Eintrag von `feed.feedarea.net` zeigt auf Ihren Server, Ports 80/443 offen, Repository bereits geklont.

## Technische Details
- Neue Geheimnisse: `CAPTCHA_SECRET`, `PASSWORD_PEPPER` (serverseitig generiert, nie im Browser).
- Migration: Tabellen `captcha_used(id, expires_at)` und `login_attempts(key, count, locked_until)`, nur für Server (RLS ohne Policies, GRANT nur service_role).
- Ableitung: `stored = base64url(HMAC-SHA256(PEPPER, username + ":" + password))`.
- Frontend: `AuthPage.tsx` ruft `auth-login` auf und übernimmt die Sitzung mit `setSession`; neue Komponenten `PasswordInput` (Auge), `PasswordRules`, `MathCaptcha`; `src/lib/passwordPolicy.ts` (gemeinsame Regeln + Vitest-Tests); Anpassungen in `UserManagement.tsx`; i18n de/en.
- Tests: Vitest (Regeln, Captcha-Token), E2E: falsches Captcha → abgelehnt, Token-Wiederverwendung → abgelehnt, direkter Login am Anmeldedienst mit Klartext-Passwort → abgelehnt, korrekter Login als chaintech → Monitoring.
