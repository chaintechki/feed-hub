# Audit: Übersetzungen, Anbieter-Spuren, Links, Sicherheit – und Härtungsplan

Dieser Plan enthält zuerst den Prüfbericht (nur Information). Die Änderungen darunter werden erst nach Ihrer Freigabe umgesetzt.

## A. Prüfbericht

### Übersetzungen
- Sprachen: Deutsch und Englisch, je 316 Texte. Es fehlt kein Text, auch nicht aus den letzten Änderungen (Captcha, Passwortregeln, Update-Dialog, Versionsanzeige).
- 24 Texte sind in beiden Sprachen gleich. Das sind Fachbegriffe wie Monitoring, Total, Handicap, Status, Export und Templates, also korrekt.

### Was es im Projekt nicht gibt
- Keine Registrierung, kein „Passwort vergessen“, keine Willkommens- oder White-Label-E-Mail.
- Kein E-Mail-Versand, keine E-Mail-Vorlagen, keine Telegram-Anbindung, keine PDF-Erzeugung.
- Deshalb gibt es auch keine E-Mail-Links mit `window.location.origin`. Die zwei Stellen mit `window.location.origin` betreffen nur die Widget-Adresse in der API-Doku und im Schlüssel-Dialog. Sie zeigen auf dem Server automatisch `https://feed.feedarea.net`.
- Die „neuste Telegram-E-Mail“ stammt nicht aus diesem Projekt; dazu kann ich nichts prüfen.

### Anbieter-Spuren (Lovable/Supabase) – Fundstellen
| Stelle | Für Besucher sichtbar? | Bewertung |
|---|---|---|
| Kunden-API-Adresse `https://<id>.supabase.co/functions/v1/...` in API-Doku, Exporten (OpenAPI/Markdown/HTML), curl-Beispiel, Widget-Code | **Ja, für Ihre Kunden** | wichtigster Punkt |
| Adresse des Anmelde-/Datendienstes im ausgelieferten Seiten-Code | Nur für Personen, die den Seitencode untersuchen | über Umleitung lösbar |
| Service-Worker-Code nennt Vorschau-Domains (`lovableproject.com` …) | nur im Seitencode | entfernbar |
| `src/lib/lovable-error-reporting.ts` (ungenutzt) | nein | löschbar |
| `AGENTS.md`, `bunfig.toml`, `drizzle.config.ts` (Variablenname), Ordner `.lovable/`, Paket `@lovable.dev/vite-tanstack-config` in `package.json` | nur im GitHub-Repository | teilweise entfernbar (siehe B1) |
| `README.md` nennt `VITE_SUPABASE_URL` | nur Repository | umbenennbar im Text |
| `.env` wird ins Repository übernommen (enthält Backend-Adresse, nur öffentlichen Schlüssel) | Repository | in `.gitignore` aufnehmen |
| Dateinamen | – | nur `lovable-error-reporting.ts` und `.lovable/` |
| Seitentitel, OG-Tags, Favicon, Manifest, Texte, Fehlermeldungen, Server-Antworten | – | sauber |

Grenzen: Die Programm-Bibliothek des Anmeldedienstes enthält intern das Wort „supabase“. Das sieht nur, wer den Seitencode untersucht; entfernen lässt es sich nicht.

### Sicherheit – Ergebnis
In Ordnung:
- Rollen liegen in eigener Tabelle. Nur Admins dürfen Rollen vergeben (serverseitig geprüft); ein Nutzer kann sich keine Adminrechte geben.
- Keine selbst zusammengesetzten Datenbankabfragen, also keine SQL-Injection-Stelle. Alle Server-Funktionen prüfen Eingaben.
- Nicht angemeldete Besucher haben auf keine Tabelle Zugriff.
- API-Schlüssel sind nur als Hash gespeichert; das Widget und die XML-Ausgabe maskieren Sonderzeichen.
- Login mit Captcha, Einmal-Token und Sperre nach 5 Fehlversuchen.

Gefundene Schwachstellen:
1. **Kunden sehen die Backend-Adresse** (siehe oben).
2. **Profil:** Jeder Nutzer kann seinen eigenen angezeigten Benutzernamen ändern (Namens-Täuschung möglich).
3. **Protokoll:** Jeder angemeldete Nutzer kann selbst Einträge ins Änderungsprotokoll schreiben (Einträge fälschbar).
4. **Kein Spam-Schutz** bei Kommentaren, Alert-Einträgen, Outrights, Buchmacherlisten sowie den Admin-Funktionen (Benutzer/API-Kunden).
5. **Login-Sperre missbrauchbar:** Wer 5× falsch rät, sperrt das Admin-Konto 15 Min.; die IP-Erkennung vertraut einem fälschbaren Header.
6. Zwei interne Datenbankfunktionen sind ohne Anmeldung aufrufbar (geringes Risiko).
7. Der Schutz vor bekannten, geleakten Passwörtern ist aus. Wegen der neuen geschützten Passwortspeicherung muss er in der Benutzerverwaltung selbst geprüft werden.
8. Kein Content-Security-Policy-Header; die Anmeldesitzung liegt im Browser-Speicher, daher ist Schutz vor eingeschleustem Script wichtig.
9. Der Sicherheitsscan meldet: alle angemeldeten Nutzer lesen alle Feed-Daten (Spiele, Quoten, Settlements …). Das ist für ein internes Operator-Panel so gewollt und wird als beabsichtigt markiert.

## B. Geplante Änderungen (nach Freigabe)

### B1. Anbieter-Spuren entfernen
- nginx in `deploy.sh` leitet `https://feed.feedarea.net/api/…` an die Server-Funktionen und `/auth/v1`, `/rest/v1` an den Datendienst weiter. Beim Build auf Ihrem Server wird die Backend-Adresse auf `https://feed.feedarea.net` gesetzt. Damit erscheint in Seite, API-Doku, Exporten, Widget-Code und curl-Beispielen nur noch Ihre Domain.
- Die Kunden-API-Adresse wird überall zentral aus der eigenen Domain gebildet: `https://feed.feedarea.net/api/feed-api`.
- Service Worker nur noch für `feed.feedarea.net` erlauben (Positivliste statt Vorschau-Domains).
- `lovable-error-reporting.ts` löschen, `AGENTS.md` löschen, README neutral formulieren, `.env` in `.gitignore`.
- Plattform-Dateien (`.lovable/`, `bunfig.toml`, Build-Paket, Migrations-Variable) werden von der Entwicklungsumgebung benötigt. Sie bleiben im Arbeitsstand, kommen aber nicht auf den Server und nicht in die Seite. Für ein sauberes GitHub-Repo kopiert das Deploy-Skript nur die ausgelieferten Dateien.

### B2. Sicherheitshärtung
- Profil: Benutzername nur noch durch Admin änderbar (Datenbank-Regel).
- Protokoll: Einträge nur noch vom Server; direkter Schreibzugriff für Nutzer entfällt.
- Spam-/Rate-Limits (Datenbank-Regel, gilt auch bei direkten Anfragen):
  - Kommentare: 10 pro Minute pro Nutzer.
  - Alert-Einträge, Outrights, Buchmacherlisten, Templates: 30 pro Minute.
  - Admin-Funktionen: 30 Aktionen pro Minute pro Admin.
  - Überschreitung ergibt eine verständliche Meldung im Panel.
- Login-Sperre: pro Kombination Benutzername+IP nach 5 Fehlversuchen 15 Min.; pro Benutzername insgesamt erst ab 20 Fehlversuchen. IP kommt von nginx (`X-Real-IP`).
- Interne Funktionen für anonyme Aufrufe sperren.
- Geleakte Passwörter: Prüfung beim Anlegen/Zurücksetzen gegen die öffentliche Leak-Datenbank. Dabei werden nur die ersten 5 Zeichen des Hashs übertragen, nie das Passwort.
- nginx: Content-Security-Policy (nur eigene Domain), bestehende Sicherheits-Header bleiben.
- Admin-Funktionen nehmen Anfragen nur noch von `https://feed.feedarea.net` und der Entwicklungsvorschau an.
- Sicherheitsbefunde (Punkt 9) als beabsichtigt markieren; Scan erneut ausführen.

### B3. Sonstiges
- `deploy.sh`: `LE_EMAIL` standardmäßig `mail@cetoria.de`.
- Version im Repository auf 1.0.1 erhöhen.
- Übersetzungen für alle neuen Meldungen (Rate-Limit, Leak-Passwort) in Deutsch und Englisch.

## Technische Details
- Migration: Trigger `enforce_rate_limit()` mit Tabelle `rate_events(user_id, bucket, at)` auf `match_comments`, `alert_log`, `outrights`, `bookmaker_lists`, `bookmaker_list_items`, `templates`. `profiles`-Trigger verhindert Änderung von `username` außer durch den Server. Policy „insert own audit“ entfernen. `REVOKE EXECUTE ... FROM anon, public` auf `handle_new_user`, `has_role` (authenticated behält `has_role`).
- Edge Functions: `audit_log`-Schreibzugriffe nur über `admin-users`/`api-clients-admin`. Die bisher im Browser geschriebenen Protokolleinträge werden über eine neue kleine Server-Aktion `audit` erfasst. Ratenbegrenzung in `admin-users`/`api-clients-admin`, HIBP-Range-Abfrage in `admin-users`, Origin-Prüfung, `auth-login` Sperrlogik angepasst.
- Frontend: zentrale `PUBLIC_BASE` (`VITE_PUBLIC_ORIGIN`, Standard `https://feed.feedarea.net`) für API-Doku, Widget, curl, Exporte.
- `deploy.sh`: nginx-Locations `/api/` → `<backend>/functions/v1/`, `/auth/v1/`, `/rest/v1/` mit `proxy_ssl_server_name on`; Build mit `VITE_SUPABASE_URL=https://$DOMAIN`; CSP-Header; `LE_EMAIL` Standard.
- Tests: Vitest für PUBLIC_BASE/Rate-Limit-Meldungen; E2E: Kommentar-Spam → gesperrt, Nicht-Admin → 403, Profilname ändern → abgelehnt, Protokoll direkt schreiben → abgelehnt; Suche nach Anbieter-Begriffen im Build-Ergebnis.
