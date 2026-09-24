# Kunden einem Benutzer zuordnen

## Ziel
Jeder Kunde bekommt genau einen verantwortlichen Benutzer. Dieser Benutzer sieht nur seine Kunden (inkl. Statistik) und darf sie bearbeiten: Aufschlag, Limit, Domains, Formate, Aktiv, Datenfreigabe, Schlüssel erneuern/erstellen. Anlegen, Löschen und Zuordnen bleiben dem Admin vorbehalten. Der Admin sieht weiterhin alle Kunden.

## Audit (Ist-Zustand)
- Kunden-Tabelle hat kein Feld für einen Betreuer.
- Die Kundenverwaltungs-Funktion im Backend lässt nur Admins zu (403 für alle anderen).
- Die Oberfläche zeigt die Kundenverwaltung nur Admins.
- Rollen: admin, trader, viewer.

## Umsetzung
1. **Datenbank (Migration 0013)**
   - Neue Spalte `owner_id uuid null` an `api_clients` (ohne Fremdschlüssel auf das Auth-Schema), Index darauf.
   - Beim Löschen eines Benutzers wird seine Zuordnung in der Benutzerverwaltungs-Funktion auf leer gesetzt.
2. **Backend-Funktion Kundenverwaltung**
   - Zugriff für Admin und für angemeldete Nutzer mit zugeordneten Kunden.
   - `list`: Admin alle, sonst nur `owner_id = ich` (Schlüssel/Statistik ebenso gefiltert).
   - `update`, Schlüssel erstellen/rotieren/sperren: Admin oder Besitzer; Besitzer darf `owner_id` nicht ändern.
   - `create`, `delete`, neue Aktion `assign`: nur Admin; `assign` prüft, dass der Zielbenutzer existiert.
   - Neue Aktion `users` (nur Admin): Liste Benutzername/ID für die Auswahl.
   - Audit-Log-Eintrag bei jeder Zuordnung.
3. **Oberfläche**
   - Kunde-anlegen/-bearbeiten-Dialog: Auswahlfeld „Zuständiger Benutzer“ (nur für Admin sichtbar, „Keiner“ möglich).
   - Kundenliste: neue Spalte „Benutzer“.
   - Menüpunkt Kunden-API auch für Nicht-Admins sichtbar, wenn ihnen Kunden zugeordnet sind; ohne Admin-Rechte kein „Neu“-/„Löschen“-Button.
   - Texte auf Deutsch und Englisch.
4. **Prüfung**
   - Deploy der Funktion, E2E: Trader sieht nur eigenen Kunden, kann ihn bearbeiten, bekommt 403 bei fremdem Kunden, Anlegen, Löschen und Umzuordnen. Testdaten danach entfernen.
   - Version wird beim nächsten Deploy automatisch erhöht.
