# Admin-Sichtbarkeit testen + revisionssicheres Audit-Log

## Audit (Ist-Zustand)
- Rollenänderungen (`admin-users`) und Ausschlüsse (`api-clients-admin`) schreiben bereits in `audit_log` (Benutzer, Zeit, Aktion).
- Schwächen: Das Protokoll ist nur gegen Änderungen aus dem Browser geschützt. Mit Server-Rechten könnten Einträge unbemerkt geändert oder gelöscht werden. Es fehlen der alte Wert (vorher/nachher) und eine Manipulationserkennung. Direkte Änderungen in der Datenbank (an der Edge Function vorbei) werden gar nicht erfasst.
- Tests: Es gibt nur einen E2E-Test für den Login. Die Sichtbarkeitsregeln für Admins werden nicht automatisch geprüft.

## Umsetzung
1. **Datenbank (Migration)**
   - `audit_log` wird um `seq` (fortlaufende Nummer), `prev_hash` und `hash` (SHA-256 über den vorherigen Hash und den Eintrag) sowie `actor_role` ergänzt. So ergibt sich eine Hash-Kette, und jede Änderung oder Lücke ist erkennbar.
   - Trigger verbietet UPDATE, DELETE und TRUNCATE für alle, auch für Server-Rechte (append-only).
   - Datenbank-Trigger auf `user_roles` und `api_client_exclusions` protokollieren jede Änderung automatisch mit vorher/nachher, Auslöser und Zeitpunkt. Das gilt auch für Änderungen direkt in der Datenbank.
   - Funktion `audit_verify()` (nur für den Super-Admin) prüft die gesamte Kette und meldet den ersten fehlerhaften Eintrag.
   - Leserechte: Das Protokoll darf nur der Super-Admin lesen. Normale Admins sehen Einträge zu Super-Admins und zu für sie gesperrten Kunden nicht.
2. **Edge Functions**: `set_role` und `exclusions` schreiben zusätzlich den alten Wert in `details`. IP und User-Agent werden mitgeschrieben.
3. **Oberfläche (Konfiguration → Audit-Log)**: Spalten Benutzer, Rolle, Aktion, Ziel, vorher → nachher, Zeitpunkt. Filter nach Rolle und Sichtbarkeit. Button „Integrität prüfen“ nur für den Super-Admin. Texte in Deutsch und Englisch.
4. **Automatisierte Tests**
   - Vitest: reine Filterfunktion (Super-Admin- und Ausschlussfilter) aus `admin-users`/`api-clients-admin` in `_shared` auslagern und testen. Außerdem die Hash-Ketten-Berechnung.
   - Vitest (React): Beim Benutzerwechsel wird der Query-Cache geleert, bevor die Daten des neuen Benutzers angezeigt werden. Keine alten Kunden während des Ladens.
   - Playwright E2E (`e2e/admin-visibility.spec.ts`): Legt Test-Admin und Testkunden an, schließt den Kunden aus. Prüft dann: Die Benutzerliste enthält keinen Super-Admin. Die Kundenliste enthält den gesperrten Kunden nie, auch nicht in Zwischenzuständen (DOM-Beobachtung ab dem ersten Rendern nach Wechsel chaintech → Admin). Ein direkter Zugriff wird abgelehnt. Der Audit-Eintrag ist vorhanden, und UPDATE/DELETE schlagen fehl. Testdaten werden danach entfernt; Protokolleinträge bleiben bewusst erhalten.
5. Version 1.0.3, Typprüfung, Tests, Build, Deploy der Funktionen, E2E-Lauf.

## Technische Details
- Hash: `sha256(prev_hash || seq || user_id || action || entity || entity_id || details::text || created_at)` wird im BEFORE-INSERT-Trigger berechnet (Erweiterung pgcrypto). Eine Advisory-Lock sorgt für die Reihenfolge.
- Bestehende Einträge werden einmalig in die Kette aufgenommen (Backfill nach `created_at`).
- E2E läuft mit Zugangsdaten aus Umgebungsvariablen (`E2E_SUPER_USER/PASS`), keine Passwörter im Code.
- Server-Deploy danach nur für die Oberfläche nötig.
