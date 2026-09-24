# Login nur mit Benutzername + Passwort, Admin "chaintech", Logo-Text

## Technischer Befund
- Anmeldung läuft aktuell über E-Mail + Passwort mit Bestätigungsmail; öffentliche Registrierung ist offen.
- Das Auth-System verlangt intern immer eine E-Mail. Benutzernamen werden deshalb auf eine interne, nie sichtbare Adresse abgebildet: `<username>@feedpanel.local` (keine Mail wird je versendet).
- Das Logo ist ein SVG, dessen Buchstaben als "Bne | Len" erscheinen (Pfade statt Text).
- Testkonto `feedpanel.ops.demo@gmail.com` existiert unbestätigt.

## Schritte
1. **Auth-Einstellungen**: E-Mail-Bestätigung abschalten (sonst keine Anmeldung ohne Postfach) und öffentliche Registrierung danach deaktivieren – nur der Admin legt Konten an.
2. **Datenbank-Migration**: Spalte `username` (unique, lowercase, 3–32 Zeichen `[a-z0-9._-]`) in `profiles`; Trigger `handle_new_user` übernimmt den Benutzernamen aus den Anmeldedaten.
3. **Admin anlegen**: Konto `chaintech` / `StGlBrGn55!!` einmalig registrieren, dann per SQL die Rolle `admin` zuweisen (Standardrolle `trader` entfernen). Passwort wird nirgends im Code gespeichert.
4. **Testkonto entfernen**: `feedpanel.ops.demo@gmail.com` inkl. Profil/Rollen löschen.
5. **Login-Formular** (`AuthPage`): Feld "Benutzername" statt "E-Mail", Registrieren-Umschalter entfernen, Umwandlung Benutzername → interne Adresse, klare Fehlermeldung "Benutzername oder Passwort falsch". i18n de/en anpassen.
6. **Anzeige**: Menü oben rechts zeigt den Benutzernamen statt E-Mail; Konfigurationsseite listet Benutzernamen.
7. **Logo**: SVG-Pfade durch sauberen Text-Wordmark "Feed Panel" ersetzen (gleiche Größe, grüner Trennbalken bleibt optional entfernt → nur "Feed Panel").
8. **Tests**: e2e-Test auf Feld "Benutzername" umstellen; Anmeldung als chaintech im Browser prüfen.

## Hinweis
Neue Benutzer können danach nur noch vom Admin angelegt werden (Verwaltung in Konfiguration folgt auf Wunsch als eigener Schritt über eine gesicherte Server-Funktion).
