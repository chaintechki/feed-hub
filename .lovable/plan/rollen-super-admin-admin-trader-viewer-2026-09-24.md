# Rollen: Super-Admin, Admin, Trader, Viewer

## Ziel
- **Super-Admin** (chaintech): sieht und darf alles, alle Benutzer und alle Kunden.
- **Admin**: dieselben Rechte wie der Super-Admin, sieht aber keine Kunden, die der Super-Admin für ihn ausgeschlossen hat. Standard: Ein Admin sieht jeden Kunden, bis dieser für ihn ausgeschlossen wird.
- **Trader / Viewer**: bleiben unverändert, auch die gestern eingebaute Kundenzuordnung.

## Audit (Ist-Zustand)
- Rollen in der Datenbank: admin, trader, viewer. chaintech ist admin.
- An rund 30 Stellen wird „admin“ geprüft (Datenbank-Regeln, zwei Backend-Funktionen, 4 Seiten).
- **Sicherheitslücke, die dabei entstehen würde:** Die Datenbank-Regel „admins manage roles“ erlaubt jedem Admin, direkt Rollen zu schreiben. Er könnte sich also selbst zum Super-Admin machen. Das muss geschlossen werden.
- Kunden-Statistiken werden in der Oberfläche direkt aus der Datenbank gelesen, für Admins ohne Kundenfilter.

## Umsetzung
1. **Datenbank (Migration 0014)**
   - Neuer Rollenwert `super_admin`. chaintech bekommt `super_admin` **zusätzlich** zu `admin`. So gelten alle bestehenden Admin-Regeln für ihn automatisch weiter.
   - Neue Tabelle für Ausschlüsse: welcher Kunde für welchen Admin gesperrt ist. Nur der Super-Admin darf lesen/schreiben, mit Rechten und Zugriffsregeln.
   - Hilfsfunktion „darf Kunde sehen“: Super-Admin immer; Admin, wenn nicht ausgeschlossen; Trader, wenn ihm zugeordnet.
   - Regeln für Kunden, Schlüssel, Abrufstatistik und Ablehnungen nutzen diese Funktion statt „ist Admin“.
   - Direktes Schreiben von Rollen aus der Oberfläche wird für alle entzogen. Rollen ändern geht nur noch über die geprüfte Benutzerverwaltung im Backend.
2. **Benutzerverwaltung (Backend)**
   - Nur der Super-Admin darf die Rolle Super-Admin vergeben oder entziehen.
   - Ein Admin darf den Super-Admin nicht bearbeiten, sperren, löschen und sein Passwort nicht zurücksetzen.
   - Der letzte Super-Admin kann nicht entfernt werden.
   - Rollen: super_admin, admin, trader, viewer. `super_admin` setzt intern auch `admin`.
3. **Kundenverwaltung (Backend)**
   - Liste, Bearbeiten, Schlüssel, Löschen, Zuordnen: Admin nur bei Kunden, die für ihn nicht ausgeschlossen sind.
   - Neue Aktionen nur für den Super-Admin: Ausschlüsse eines Kunden lesen und setzen.
   - Ein Admin kann keinen neuen Kunden anlegen und sich dann selbst ausschließen. Neue Kunden sind für alle Admins sichtbar.
4. **Oberfläche**
   - Benutzerverwaltung: Rolle „Super-Admin“ in Auswahl und Anzeige, nur für den Super-Admin wählbar. Beim Super-Admin sind die Aktionsbuttons für Admins ausgeblendet.
   - Kunde bearbeiten (nur Super-Admin): Bereich „Für Admins ausblenden“ mit einer Checkbox je Admin.
   - Kundenliste: Hinweis „für X Admins ausgeblendet“ (nur Super-Admin).
   - Rollenprüfungen in der Oberfläche erkennen Super-Admin als Admin.
   - Texte auf Deutsch und Englisch.
5. **Prüfung**
   - E2E: Admin sieht einen ausgeschlossenen Kunden weder in der Liste noch in der Statistik und bekommt beim direkten Zugriff eine Ablehnung. Admin kann sich nicht zum Super-Admin machen, auch nicht direkt in der Datenbank. Admin kann chaintech nicht sperren. Super-Admin sieht alles. Testdaten danach entfernen.
