# Benutzerverwaltung für Admins (Konfiguration)

## Technischer Befund
- Registrierung ist deaktiviert; Konten existieren nur über interne Adresse `<username>@feedpanel.local`.
- Rollen liegen in `user_roles` (admin/trader/viewer), geprüft per `has_role`. Admins dürfen Rollen bereits per RLS verwalten.
- Anlegen, Passwort-Reset, Sperren und Löschen anderer Konten erfordern Admin-Rechte im Auth-System → nur serverseitig möglich.

## Schritte
1. **Server-Funktion `admin-users`** (Edge Function, Deno):
   - Prüft das Login-Token des Aufrufers und per `has_role` die Rolle `admin`; sonst 403.
   - Aktionen: `list`, `create` (username, password, role), `set_role`, `reset_password`, `ban` / `unban`, `delete`.
   - Validierung: Benutzername `[a-z0-9._-]{3,32}`, Passwort min. 8 Zeichen, Rolle aus Enum.
   - Schutz: Admin kann sich nicht selbst löschen, sperren oder die eigene Admin-Rolle entziehen.
   - Jede Aktion wird in `audit_log` geschrieben.
   - Hauptschlüssel wird nur innerhalb der Funktion aus der Server-Umgebung gelesen, nie im Browser.
2. **Konfigurationsseite**: neuer Bereich "Benutzer" (nur für Admins sichtbar):
   - Tabelle: Benutzername, Rolle (Dropdown zum Ändern), Status (aktiv/gesperrt), erstellt, letzte Anmeldung, Aktionen.
   - Dialog "Benutzer anlegen" (Benutzername, Passwort, Rolle).
   - Dialog "Passwort zurücksetzen".
   - Sperren/Entsperren-Schalter, Löschen mit Bestätigung.
   - Toasts für Erfolg/Fehler, Liste lädt nach jeder Aktion neu.
3. **i18n** de/en für alle neuen Texte.
4. **Prüfung**: Funktion per Aufruf testen (anlegen → Rolle ändern → Passwort → sperren → löschen eines Testbenutzers), Oberfläche im Browser als chaintech prüfen.

## Technische Details
- Aufruf aus dem Frontend über `supabase.functions.invoke("admin-users", { body: { action, ... } })`.
- Sperren über Auth-Ban (`ban_duration`), Löschen entfernt auch Profil, Rollen, Einstellungen.
- Keine Datenbankänderung am Schema nötig.
