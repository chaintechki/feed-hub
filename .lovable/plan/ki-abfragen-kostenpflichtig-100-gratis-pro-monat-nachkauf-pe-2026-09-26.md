# KI-Abfragen kostenpflichtig: 100 gratis pro Monat, Nachkauf per USDT

## Ziel
- Jeder Panel-Benutzer hat **100 kostenlose KI-Abfragen pro Kalendermonat**.
- Danach kann er **Pakete zu 100 Abfragen für 10 USDT** kaufen.
- Bezahlung mit USDT auf **BNB Smart Chain (BEP20), Ethereum (ERC20), Polygon, Tron (TRC20)**.
- Der Super Admin hinterlegt die Einzahladressen im Backend und ist selbst unbegrenzt.
- Gekaufte Abfragen verfallen nicht; nur die kostenlosen 100 werden monatlich neu gesetzt.

## Ablauf für den Benutzer
```text
KI-Analyse -> Guthabenanzeige "73 frei · 200 gekauft"
   | leer
   v
"Abfragen kaufen" -> Netzwerk wählen -> Anzahl Pakete
   v
Bestellung (60 Min gültig): Adresse + Betrag + QR-Code (Wallet-Link)
   v
Zahlung in der Wallet -> Transaktions-ID einfügen -> "Prüfen"
   v
Blockchain-Prüfung (automatisch, mit Wiederholung bis Bestätigungen erreicht)
   v
Gutschrift sofort sichtbar + Eintrag in "Meine Käufe"
```

## Was gebaut wird
1. **Guthaben-Anzeige** in der KI-Analyse (frei diesen Monat / gekauft) und klare Meldung, wenn aufgebraucht, mit Kauf-Knopf.
2. **Kaufdialog**: Netzwerk-Auswahl (nur Netzwerke mit hinterlegter Adresse), Paketanzahl 1–10, QR-Code, Adresse mit Kopier-Knopf, Countdown, Feld für Transaktions-ID, Statusanzeige (wartet auf Bestätigungen / gutgeschrieben / abgelehnt mit Grund).
3. **Kaufverlauf** für den Benutzer.
4. **Super-Admin-Bereich „Konfiguration → Zahlungen“**: Adressen je Netzwerk ein-/ausschalten, Paketpreis und -größe, Gratis-Kontingent, benötigte Bestätigungen; Übersicht aller Zahlungen und Guthaben je Benutzer; manuelle Gutschrift/Korrektur (mit Begründung, im Audit-Log).
5. **Zählung serverseitig**: Die KI-Funktion bucht vor jeder Frage eine Abfrage ab; ohne Guthaben antwortet sie mit Hinweis statt das Modell aufzurufen. Genauigkeitsmessung (Admin) zählt nicht.

## Sicherheit der Zahlungsprüfung
Da alle an dieselbe Adresse zahlen und die Zuordnung per Transaktions-ID erfolgt, prüft der Server:
- Transaktion ist ein **USDT-Transfer** (offizieller Token-Vertrag des Netzwerks) **an die hinterlegte Adresse**.
- Betrag **≥ Bestellbetrag**, Transaktion **erfolgreich** und mit genug Bestätigungen (z. B. BSC 15, ETH 12, Polygon 64, Tron 20).
- Zeitpunkt **nach Erstellung der Bestellung** und innerhalb der Gültigkeit.
- Jede Transaktions-ID kann **nur ein einziges Mal** verwendet werden (eindeutiger Datenbankschlüssel).
- Restrisiko: Wer eine fremde, noch ungenutzte Transaktions-ID kennt, könnte sie zuerst einreichen. Zur Absicherung erhält jede Bestellung zusätzlich einen **eindeutigen Centbetrag** (z. B. 10,0347 USDT), der exakt übereinstimmen muss.
- Rate-Limit auf Prüfanfragen, alle Gutschriften und Adressänderungen im revisionssicheren Audit-Log.

## Benötigte Zugänge
- **Tron**: öffentliche TronGrid-Schnittstelle, optional eigener kostenloser Schlüssel.
- **BSC / Ethereum / Polygon**: ein kostenloser **Etherscan-API-Schlüssel** (deckt alle drei Netzwerke ab). Ich frage ihn nach der Genehmigung über das sichere Formular ab.

## Technische Details
- **Migration 0023**:
  - `payment_settings` (Singleton: free_monthly=100, pack_size=100, pack_price_usdt=10, order_ttl_min=60, confirmations jsonb) — lesbar für angemeldete, schreibbar nur Super Admin.
  - `payment_addresses` (network enum `bsc|eth|polygon|tron`, address, active) — Schreibrecht nur Super Admin; Validierung per Trigger (0x-Adresse / T-Adresse).
  - `ai_credits` (user_id PK, purchased int, free_used int, period date) — nur lesbar für den Benutzer selbst/Super Admin; Schreiben ausschließlich über Security-Definer-Funktionen.
  - `payment_orders` (id, user_id, network, packs, amount_exact numeric, address, status `pending|confirming|paid|expired|rejected`, tx_hash UNIQUE, reject_reason, created_at, expires_at, paid_at, raw jsonb).
  - Funktionen: `ai_consume(_user)` (Monatswechsel -> free_used=0, erst Gratis, dann gekauft, super_admin immer true), `ai_credit_order(_order, _tx, _raw)` (atomar, idempotent), `ai_admin_adjust(_user, _delta, _reason)`.
  - GRANTs + RLS für jede neue Tabelle; Audit-Trigger auf `payment_addresses`, `ai_credits`-Anpassungen, bezahlte Bestellungen.
- **Edge Function `ai-billing`**: `create_order`, `submit_tx`, `status`, `history`, Admin-Aktionen; Prüf-Logik rein in `_shared/chain-verify.ts` (TronGrid `/v1/transactions/{id}/events` bzw. Etherscan V2 `eth_getTransactionReceipt` + Transfer-Log-Dekodierung, USDT-Verträge je Netzwerk, Dezimalstellen 18 bei BSC, sonst 6) — testbar mit Fixtures.
- **Automatik**: Bestellungen im Status `confirming` prüft ein Cron-Job jede Minute nach, bis bestätigt oder abgelaufen (auch wenn der Benutzer das Fenster schließt).
- **`feed-assistant`**: vor dem Modellaufruf `ai_consume`; bei fehlendem Guthaben Status 402 mit Code `quota_exhausted`, UI zeigt Kaufdialog.
- **Frontend**: `AiCreditsBadge`, `BuyCreditsDialog` (QR über `qrcode.react`, Wallet-URI `tron:`/`ethereum:` bzw. reine Adresse), `PaymentsSettingsPage` (Super Admin), i18n DE/EN (`billing.*`).
- **Tests**: Vitest für `chain-verify` (gültig, falscher Empfänger, falscher Token, zu wenig, doppelt, zu früh) und `ai_consume`-Logik; Playwright für Kaufdialog mit simulierter Prüfung.
- Version 1.0.12, AGENTS.md-Regel ergänzen.
