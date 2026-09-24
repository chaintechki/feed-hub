# Kostenübersicht für die Feed-Infrastruktur

## Ziel
Unter Konfiguration → neuer Reiter „Kosten“: Abrufvolumen, Cache-Trefferquote und selbst eingetragene Preise werden zu Tages- und Monatsprognosen verrechnet – gesamt und pro Kunde.

## Technischer Audit (Ist-Stand)
- `api_usage` zählt erlaubte Abrufe pro Kunde/Minute/Endpunkt, `api_denials` zählt abgewiesene Abrufe.
- Cache: Die Antworten tragen nur `Cache-Control: max-age=15`. Ob ein Browser oder CDN das nutzt, sieht der Server nicht. Einen Cache auf dem Server gibt es nicht, deshalb kann heute niemand Cache-Treffer messen.
- Die Antwortgröße (für die Bandbreite) wird nicht erfasst.
- Preise sind nirgends hinterlegt.

## Umsetzung

### 1. Datenbank (Migration `0005_cost_overview`)
- `api_usage` bekommt zwei neue Spalten: `cache_hits int default 0` und `bytes bigint default 0`.
- `api_track` wird um die Parameter `_cache_hit boolean` und `_bytes int` erweitert. Die alte Signatur bleibt als Wrapper erhalten, damit bestehende Aufrufe weiterlaufen.
- Neue Tabelle `cost_settings` mit genau einer Zeile. Felder:
  - `currency` (Standard EUR)
  - `price_per_million_invocations` (Preis pro 1 Mio. Funktionsaufrufe)
  - `price_per_million_db_reads` (Preis pro 1 Mio. Lesezugriffe auf die Datenbank)
  - `price_per_gb_egress` (Preis pro GB ausgehender Daten)
  - `included_invocations`, `included_egress_gb` (Freikontingente im Plan)
  - `fixed_monthly` (Plan-Grundgebühr)
  - `upstream_monthly` (Kosten Hauptanbieter)
  - `updated_at`, `updated_by`
- Rechte: GRANT an authenticated/service_role, RLS eingeschaltet, nur Admins dürfen lesen und schreiben (`has_role`).
- Die Startwerte sind nur Platzhalter. Sie tragen Ihre echten Preise selbst ein.

### 2. Server-Cache in `feed-api` und `feed-widget`
- Pro Instanz gibt es einen Cache im Arbeitsspeicher (Map, 15 s Gültigkeit). Schlüssel: Endpunkt + Parameter + Filter des Kunden + Format.
- Bei einem Treffer entfällt der Datenbankzugriff. Der Abruf wird mit `cache_hit=true` gezählt.
- Jeder erlaubte Abruf wird zusammen mit seiner Antwortgröße (`bytes`) gezählt.
- Rate-Limit, Schlüsselprüfung und Aufschlag bleiben unverändert vor dem Cache. Aufgeschlagene Quoten werden pro Kunde gecacht, nie zwischen Kunden geteilt.

### 3. Berechnung (`src/lib/costs.ts`, reine Funktionen und getestet)
- Abrufe = erlaubte + abgewiesene. Beide lösen einen Funktionsaufruf aus.
- DB-Lesezugriffe = erlaubte Abrufe − Cache-Treffer + abgewiesene Abrufe (Schlüsselprüfung).
- Bandbreite = Summe der `bytes`.
- Tagesprognose: Durchschnitt der letzten 7 Tage. Heute wird auf Basis der bisherigen Stunden hochgerechnet.
- Monatsprognose: Tagesprognose × Tage im Monat, abzüglich Freikontingente, zuzüglich Grundgebühr und Hauptanbieter-Kosten.
- Pro Kunde: anteilige Kosten und, zum Vergleich, der eingestellte Aufschlag als Hinweis.

### 4. Oberfläche (`src/components/config/CostOverview.tsx`)
- Kennzahlen-Kacheln: Abrufe heute, Cache-Trefferquote, Bandbreite, Prognose Tag, Prognose Monat.
- Formular für die Preise (nur für Admins), mit Speichern-Knopf.
- Tabelle pro Kunde: Abrufe (7 T), Trefferquote, GB, Kosten pro Tag, Kosten pro Monat.
- Verlauf der letzten 30 Tage als einfache Balkenreihe mit den vorhandenen Farben (keine neue Bibliothek).
- Texte auf Deutsch und Englisch unter `costs.*`. Das Design folgt dem Betradar-Stil mit den bestehenden Farbwerten.

### 5. Prüfung
- Vitest für `costs.ts` (Freikontingent, Hochrechnung, Division durch null).
- Beide Edge Functions deployen. Mit einem Testkunden zweimal kurz hintereinander abrufen: Der zweite Abruf muss als Cache-Treffer zählen.
- Browser-Test als chaintech, danach Testkunden löschen.

## Hinweis
Die Prognose ist so genau wie die eingetragenen Preise. Die tatsächliche Abrechnung Ihres Cloud-Plans kann ich nicht automatisch auslesen.
