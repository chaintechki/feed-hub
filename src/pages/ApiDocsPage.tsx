import { PageShell } from "@/components/layout/PageShell";
import { FEED_BASE } from "@/components/config/ApiClients";

const endpoints = [
  ["GET", "/sports", "Sport tree: sports → categories → tournaments"],
  ["GET", "/matches", "Matches with odds. Params: sport=sr:sport:1, odds=false (schedule only)"],
  ["GET", "/matches/{id}/odds", "Single match with all markets, e.g. /matches/sr:match:41001/odds"],
  ["GET", "/outrights", "Outright markets with competitor odds"],
  ["GET", "/results", "Settled markets (latest 500)"],
];

const jsonSample = `{
  "generated_at": "2026-09-24T01:28:52.218Z",
  "data": [{
    "id": "sr:match:41001", "sport_id": "sr:sport:1",
    "tournament_id": "sr:tournament:17", "home_team": "Arsenal",
    "away_team": "Liverpool", "scheduled": "2026-09-24T19:00:00Z",
    "status": "not_started", "match_minute": null,
    "markets": [{ "market": "1x2", "specifier": null, "active": true,
      "outcomes": [{ "id": "1", "odds": 2.35 }, { "id": "X", "odds": 3.4 }, { "id": "2", "odds": 2.95 }] }]
  }]
}`;

const xmlSample = `<?xml version="1.0" encoding="UTF-8"?>
<odds_change_list generated_at="1790213333732">
  <sport_event id="sr:match:41001" scheduled="2026-09-24T19:00:00Z" status="not_started"
               sport_id="sr:sport:1" category_id="sr:category:1" tournament_id="sr:tournament:17">
    <competitors>
      <competitor qualifier="home" name="Arsenal"/>
      <competitor qualifier="away" name="Liverpool"/>
    </competitors>
    <odds>
      <market id="1x2" status="1">
        <outcome id="1" odds="2.35" active="1"/>
        <outcome id="X" odds="3.4" active="1"/>
        <outcome id="2" odds="2.95" active="1"/>
      </market>
    </odds>
  </sport_event>
</odds_change_list>`;

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}
const Code = ({ children }: { children: string }) => (
  <pre className="panel-scroll overflow-auto rounded-sm border border-border bg-panel p-3 font-mono text-[11px]">{children}</pre>
);

export default function ApiDocsPage() {
  return (
    <PageShell title="Feed API" description="Reference for customer integrations">
      <div className="max-w-4xl space-y-6 text-[12px]">
        <Block title="Authentication">
          <p>Send your API key in the <code>x-api-key</code> header. Keys are issued by your account manager.</p>
          <Code>{`curl -H "x-api-key: fpk_live_…" "${FEED_BASE}/feed-api/matches?format=json"`}</Code>
        </Block>
        <Block title="Base URL">
          <Code>{`${FEED_BASE}/feed-api`}</Code>
        </Block>
        <Block title="Endpoints">
          <div className="overflow-hidden rounded-sm border border-border bg-panel">
            <table className="w-full text-[11px]">
              <tbody>
                {endpoints.map(([m, p, d]) => (
                  <tr key={p} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-bold text-success">{m}</td>
                    <td className="px-3 py-2 font-mono">{p}</td>
                    <td className="px-3 py-2 text-muted-foreground">{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            All endpoints accept <code>format=json</code> (default) or <code>format=xml</code>. The XML output uses the
            common <code>sport_event / market / outcome</code> structure with <code>sr:</code> identifiers.
          </p>
        </Block>
        <Block title="Response – JSON">
          <Code>{jsonSample}</Code>
        </Block>
        <Block title="Response – XML">
          <Code>{xmlSample}</Code>
        </Block>
        <Block title="Status codes">
          <Code>{`200 OK            Data returned (cached for 15 seconds)
400 Bad Request   Invalid parameter
401 Unauthorized  Missing, invalid or disabled key
403 Forbidden     Format not enabled for your account
404 Not Found     Unknown endpoint or match
429 Too Many      Rate limit per minute exceeded`}</Code>
        </Block>
        <Block title="Embeddable widget">
          <p>Use a widget key; the page domain must be registered for your account.</p>
          <Code>{`<script src="${typeof window !== "undefined" ? window.location.origin : ""}/widget.js"
  data-key="fpw_live_…"
  data-api="${FEED_BASE}/feed-widget"
  data-sport="sr:sport:1"
  data-lang="de"></script>`}</Code>
        </Block>
      </div>
    </PageShell>
  );
}
