# BETRADAR FEED PANEL — Aufbauplan

Nachbau des Sportradar-CTRL-Feedmanagement-Panels als eigenständige Anwendung, die auf einem eigenen Linux-Server aus einem `dist`-Ordner läuft.

## Ausgangslage

Das Projekt steht aktuell auf einem Server-Framework, das beim Veröffentlichen einen Cloudflare-Dienst benötigt. Das passt nicht zu Ihrer Vorgabe. Erster Schritt ist deshalb der Umbau auf eine reine Vite-Single-Page-App, deren Build einen statischen `dist`-Ordner erzeugt.

## Etappe 1 — Fundament

- Umbau auf reine Vite-SPA mit React Router; Entfernung der Server-/Cloudflare-Teile.
- Design-System: Tailwind v4 mit HSL-Tokens, exakt nach Betradar-Vorlage (dunkelblaue Kopfleiste, grüner Statuspunkt, kompakte Datentabellen, rote/blaue Quotenfelder, Zeilenhöhe ~32 px, Schriftgrößen 11–13 px).
- Grundgerüst: Kopfleiste (Produktwahl, Status, Support, News, Help, Configuration, Benutzer), Hauptnavigation (Monitoring, Alerts, Archive, Trading Tools, Settlements), Unterleisten, Odds-Format-Wahl.
- Mehrsprachigkeit (i18next), Light/Dark, Eigene Logos: PWA-Icons, Favicon, OG-Bild. Keine Hinweise auf die Entstehungsplattform irgendwo im Code oder in den Dateien.

## Etappe 2 — Backend & Login

- Lovable Cloud aktivieren: PostgreSQL, Auth, Edge Functions.
- Login mit E-Mail/Passwort, Rollen (Admin, Trader, Viewer) in eigener Rollentabelle, Zugriffsschutz auf allen Daten.
- Tabellen: Sportarten, Kategorien, Ligen, Matches, Märkte, Quoten (eigene & Durchschnitt), Alerts, Kommentare, Settlements, Benutzereinstellungen, Filter-Presets, Audit-Log.

## Etappe 3 — Sportradar-Anbindung

- Edge Functions holen Daten von Sportradar (Sports/Match-Liste, Quoten, Alerts, Settlements) und schreiben sie in die Datenbank; das Frontend spricht nie direkt mit Sportradar.
- Zeitgesteuerte Aktualisierung plus Live-Updates in die Oberfläche.
- Benötigt: Ihr Sportradar-Zugangsschlüssel und die freigeschalteten Endpunkte. Den frage ich vor diesem Schritt gesondert ab. Bis dahin läuft die Oberfläche gegen die gleiche Datenstruktur mit Beispieldaten.

## Etappe 4 — Monitoring (Kernstück)

- Linker Sportbaum: Aktiv-/Voll-Baum, aufklappbare Sportarten → Länder → Ligen, Trefferzähler, Alert-Badges, Auswahlkästchen, Suche, Einklappen.
- Filterleiste: Alerted, Semi Auto, Manual, Hotlisted, Commented, With Odds, With Own Odds, Controllable, 24 Hours, Betradar Only, Available For Early Odds, With Early Odds — kombinierbar, mit aktivem Zustand.
- Liga-Tabs oben rechts (hinzufügen/schließen), Freitextsuche.
- Match-Tabelle: Doppelzeile je Spiel (Own / Average), Datum, Anstoß, Teams, Live-Status, Minutenzähler, Kommentarzähler, Suspend-Schalter, Buttons BR/SA/M, Kontextmenü, Favoritenstern.
- Quotenspalten 1X2, Total, Handicap mit Auf-/Ab-Markierung, Margen-Anzeige, Farbcodierung wie im Original.
- Monitor Outrights als zweite Ansicht.

## Etappe 5 — Restliche Bereiche

- Alerts: Liste, Filter, Bestätigen/Zuweisen, Verlauf.
- Archive: abgeschlossene Spiele, Zeitraumfilter, Export.
- Trading Tools: Untermenüs (Margen, Limits, Bulk-Aktionen, Templates).
- Settlements: offene/erledigte Abrechnungen, manuelles Settlen, Rücknahme.
- Configuration & User Settings: Odds-Format, Sportauswahl, Benachrichtigungen, Benutzerverwaltung.

## Etappe 6 — Auslieferung

- PWA: Manifest, Service Worker (nur im veröffentlichten Betrieb aktiv).
- `deploy.sh`: `npm ci`, `npm run build`, Sicherung des alten Stands, Kopie nach `/var/www/html/`, Rechte setzen, plus Beispiel-Konfiguration für den Webserver (alle Pfade auf `index.html`).
- Tests: Vitest für Logik/Komponenten, Playwright für Login, Monitoring-Filter und Quotenanzeige.
- README mit Server-Installation und Umgebungsvariablen.

## Technische Hinweise

- Kein Service-Role-Key: alle privilegierten Zugriffe laufen über Edge Functions mit Row-Level-Security und Rollenprüfung; das Frontend nutzt ausschließlich den öffentlichen Schlüssel.
- Build erzeugt rein statische Dateien; Backend läuft getrennt in Lovable Cloud und wird über die öffentliche URL angesprochen.
- Kein Cloudflare-Worker, kein Server-Rendering.
- Framer Motion nur für dezente Übergänge (Baum, Tabs, Panels), damit die Tabellenleistung erhalten bleibt.
- Datenmenge: Virtualisierte Tabelle und Baum, damit tausende Spiele flüssig bleiben.

## Offene Punkte

- Sportradar-Zugangsschlüssel und Lizenzumfang (welche Endpunkte freigeschaltet sind).
- Gewünschter Produktname/Wortmarke in der Kopfleiste für das Logo.
