# Versionierung + Update-Dialog mit funktionierendem Reload

## Audit (Ist-Zustand)
- `package.json` hat `version: 1.0.0`, wird nirgends angezeigt und nie erhöht.
- Kein Footer im Layout (`AppLayout.tsx`).
- Service Worker (vite-plugin-pwa, `generateSW`): kein `skipWaiting`, kein `clientsClaim`, keine `version.json`. Ein neuer Worker bleibt im Status „waiting“, der alte liefert weiter die gecachte `index.html` + Assets (CacheFirst) → Reload lädt die alte App, Dialog würde sofort wieder erscheinen. Genau die beschriebene Ursache.
- `index.html` wird zusätzlich im Precache gehalten → auch ohne SW-Wechsel alte Version.

## Lösung

### 1. Versionsnummer
- Format: `MAJOR.MINOR.PATCH` aus `package.json` + Build-Kennung (Datum/Uhrzeit UTC, z. B. `1.0.7 · 2026-09-24 05:10`).
- Automatisch hochsetzen: `deploy.sh` führt vor jedem Build `npm version patch --no-git-tag-version` aus (1.0.6 → 1.0.7). Zusätzlich wird bei jedem Build eine eindeutige Build-ID erzeugt, damit auch ein Build ohne Deploy-Skript als neue Version erkannt wird.
- Vite injiziert `__APP_VERSION__`, `__BUILD_ID__`, `__BUILD_TIME__` und schreibt beim Build `dist/version.json` (`{version, buildId, buildTime}`).

### 2. Footer
- Neue schmale Fußzeile in `AppLayout` (Betradar-Stil, HSL-Tokens): „Feed Panel v1.0.7 · Build 2026-09-24 05:10“.

### 3. Erkennung älterer Version
- Hook `useVersionCheck`: lädt `/version.json?t=…` mit `cache: "no-store"` beim Start, alle 60 s, bei Tab-Fokus und wenn der SW ein Update meldet.
- Abweichende `buildId` → Dialog.

### 4. Dialog „Neue Version verfügbar“
- Radix-AlertDialog, nicht wegklickbar (nur „Später“ als kleine Option, erscheint nach 10 Min. erneut – optional), Hauptbutton „Jetzt neu laden“.
- Zeigt: installierte Version + Build-Zeit, neue Version + Build-Zeit.
- i18n de/en.

### 5. Service-Worker-Fix (Kern)
- Workbox: `skipWaiting: true`, `clientsClaim: true`, `cleanupOutdatedCaches: true`.
- `index.html` und `version.json` aus dem Precache nehmen bzw. `version.json` per `NetworkOnly`; Navigation `NetworkFirst` bleibt.
- Registrierung mit `updateViaCache: "none"` und `registration.update()` bei jeder Prüfung.
- Reload-Button-Ablauf:
  1. `registration.update()`, wartenden Worker per `postMessage({type:"SKIP_WAITING"})` aktivieren.
  2. Auf `controllerchange` warten (max. 3 s).
  3. Alte Caches (`caches.keys()` → delete) leeren.
  4. `location.reload()`.
- Schutz gegen Endlosschleife: nach Reload wird die Ziel-`buildId` in `sessionStorage` gemerkt; stimmt die geladene Version danach immer noch nicht, wird einmalig ein harter Reload mit `?v=<buildId>` gemacht statt den Dialog sofort wieder zu zeigen.
- Server-Hinweis in `deploy.sh`: `sw.js`, `index.html`, `version.json` mit `Cache-Control: no-cache` ausliefern (Nginx/Apache-Snippet als Kommentar/Doku).

## Technische Details
- Dateien: `vite.config.ts` (define + Plugin für version.json + Workbox-Optionen), `src/lib/pwa.ts` (Registrierung, `applyUpdate()`), neu `src/lib/version.ts`, `src/hooks/useVersionCheck.ts`, `src/components/layout/AppFooter.tsx`, `src/components/layout/UpdateDialog.tsx`, `AppLayout.tsx`, `src/vite-env.d.ts`, i18n de/en, `deploy.sh`.
- Tests: Vitest für Versionsvergleich/Loop-Schutz; Playwright gegen Produktions-Preview: Build A laden → Build B deployen → Dialog erscheint → Reload → neue Version im Footer, Dialog weg.
- In der Vorschau-Umgebung bleibt der Service Worker bewusst deaktiviert; die Versionsprüfung + Dialog funktionieren dort trotzdem (ohne SW-Schritt).
- Keine Datenbankänderungen.
