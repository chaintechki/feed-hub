# Spiele buchen + Feed-Status beim Seitenstart

## Audit
**Statusanzeige**
- Beim Öffnen der Seite ist die Statusabfrage noch nicht geladen. Die Anzeige wertet "noch keine Daten" als Ausfall und zeigt sofort rot "FEED INTERRUPTED".
- Der Feed-Dienst schreibt Status und Quoten gesammelt (gebündelt). Nach einem Neustart des Dienstes (z. B. deploy) dauert es, bis der erste Alive-Eintrag in der Datenbank landet – das erklärt die ca. 2 Minuten.
- Aktuell: letzter Eintrag beider Produzenten vor ca. 6 Min. (18:05 UTC) – der Dienst lieferte in dem Moment nicht (vermutlich wegen Neustart/Deploy).
- Ja: Wenn der Feed läuft, sollte der Status sofort grün sein.

**Buchen**
- Datenbank: 460 Spiele sind beim Anbieter bereits gebucht, 1.387 buchbar, 4.255 nicht verfügbar.
- Fehler: Die Schaltfläche "BR" liest ein Feld, das nie gesetzt wird. Deshalb erscheinen auch gebuchte Spiele als ungebucht.
- Eine Buchen-Funktion existiert noch nicht.

## Plan
1. Status: Während des Ladens neutral grau "…" statt rot anzeigen; rot nur, wenn Daten da sind und wirklich ein Ausfall vorliegt. Abfrage alle 10 s.
2. Feed-Dienst: Alive-Signale sofort (ohne Bündelung) weiterleiten, damit der Status nach einem Neustart innerhalb von Sekunden grün ist.
3. Buchen serverseitig: neue gesicherte Backend-Funktion "Spiel buchen" (nur Admin/Trader, Rate-Limit), ruft beim Anbieter die offizielle Buchung auf und setzt das Spiel danach auf gebucht.
4. Oberfläche: "BR" wird klickbar – grün = gebucht, klickbar bei "buchbar", ausgegraut bei "nicht verfügbar". Erfolg/Fehler als Meldung (DE/EN).
5. Anzeige "gebucht" aus dem Anbieterstatus ableiten; bestehende 460 Spiele korrekt markieren (einmalige Datenkorrektur, keine Strukturänderung).
6. Prüfen: Status beim Laden, Buchung eines buchbaren Spiels, Tests/Build.

## Technisch
- src/components/layout/FeedStatus.tsx: `q.isLoading` → neutraler Zustand; refetchInterval 10 s.
- feed-worker/index.mjs: `alive`-Nachrichten triggern sofortigen flush.
- supabase/functions/uof-book/index.ts: JWT prüfen, Rolle admin/super_admin/trader, Zod `{ matchId }`, POST `https://{UOF_API_HOST}/v1/liveodds/booking-calendar/events/{id}/book` mit `x-access-token`, danach `matches.liveodds='booked', booked=true` per Service-Role; audit_log-Eintrag.
- uof-ingest/uof.ts: `booked = liveodds === 'booked'` beim Upsert.
- Datenkorrektur: `update matches set booked = (liveodds='booked')`.
- MatchGrid.tsx: ActionChip BR mit onClick + Mutation, Query-Invalidierung.
