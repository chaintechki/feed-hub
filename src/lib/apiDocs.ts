import { buildOpenApi, ERROR_CODES, type DocClient } from "../../supabase/functions/_shared/api-core.ts";

export type { DocClient };
export { buildOpenApi };

export const JSON_SAMPLE = `{
  "generated_at": "2026-09-24T01:28:52.218Z",
  "meta": { "total": 124, "limit": 100, "offset": 0 },
  "data": [{
    "id": "sr:match:41001", "sport_id": "sr:sport:1", "category_id": "sr:category:1",
    "tournament_id": "sr:tournament:17", "home_team": "Arsenal", "away_team": "Liverpool",
    "scheduled": "2026-09-24T19:00:00Z", "status": "not_started", "match_minute": null,
    "updated_at": "2026-09-24T01:28:40Z",
    "markets": [{ "market": "1x2", "specifier": null, "active": true, "updated_at": "2026-09-24T01:28:40Z",
      "outcomes": [{ "id": "1", "odds": 2.35 }, { "id": "X", "odds": 3.4 }, { "id": "2", "odds": 2.95 }] }]
  }]
}`;

export const XML_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<odds_change_list generated_at="1790213333732" total="124" limit="100" offset="0">
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

export const ERROR_SAMPLE = `{ "error": { "code": "rate_limited", "message": "Rate limit exceeded. Retry after the time given in Retry-After." } }
<?xml version="1.0" encoding="UTF-8"?>
<error code="rate_limited">Rate limit exceeded. Retry after the time given in Retry-After.</error>`;

export const errorTable = () =>
  Object.entries(ERROR_CODES).map(([code, [status, msg]]) => ({ code, status, msg }));

type Param = { name: string; in: string; required?: boolean; schema?: { type?: string; default?: unknown; enum?: string[] }; description?: string; example?: string };
type Op = { summary: string; parameters: Param[] };

export function endpointList(spec: ReturnType<typeof buildOpenApi>) {
  return Object.entries(spec.paths).map(([path, v]) => {
    const op = (v as { get: Op }).get;
    return { path, summary: op.summary, params: op.parameters ?? [] };
  });
}

const widgetSnippet = (panelOrigin: string, base: string) => `<script src="${panelOrigin}/widget.js"
  data-key="fpw_live_…"
  data-api="${base}/feed-widget"
  data-sport="sr:sport:1"
  data-lang="de"></script>`;

export function toMarkdown(base: string, panelOrigin: string, client?: DocClient | null) {
  const spec = buildOpenApi(base, client);
  const eps = endpointList(spec);
  const L: string[] = [];
  L.push(`# ${spec.info.title}${client ? ` – ${client.name}` : ""}`, "", `Version ${spec.info.version} · generated ${new Date().toISOString().slice(0, 10)}`, "");
  L.push(spec.info.description, "");
  L.push("## Base URL", "", "```", `${base}/feed-api`, "```", "");
  L.push("## Authentication", "", "Send your server key in the `X-API-Key` header. Keys in the URL are rejected (`400 key_in_query`). Keys may carry an expiry date and an IP whitelist.", "");
  L.push("```bash", `curl -H "X-API-Key: fpk_live_…" "${base}/feed-api/matches?format=json&limit=50"`, "```", "");
  L.push("## Endpoints", "");
  for (const e of eps) {
    L.push(`### GET ${e.path}`, "", e.summary, "");
    if (e.params.length) {
      L.push("| Parameter | In | Type | Default | Description |", "|---|---|---|---|---|");
      for (const p of e.params)
        L.push(`| \`${p.name}\`${p.required ? " *" : ""} | ${p.in} | ${p.schema?.enum ? p.schema.enum.join(" \\| ") : p.schema?.type ?? ""} | ${p.schema?.default ?? ""} | ${p.description ?? p.example ?? ""} |`);
      L.push("");
    }
  }
  L.push("## Response – JSON", "", "```json", JSON_SAMPLE, "```", "");
  L.push("## Response – XML", "", "```xml", XML_SAMPLE, "```", "");
  L.push("## Markets", "", "Every market carries `market` (stable key, e.g. `1x2`, `total`, `handicap` or `m{id}`), `uof_id`, a readable `name`, and a `group`. Each outcome has an `id` plus a readable `name`. Groups: `main`, `goals`, `half`, `periods`, `corners`, `cards`, `players`, `other`. Filter with `?groups=main,goals`. Use `?lang=de` for German names. The full catalog is available at `/markets`.", "");
  L.push("## Caching & ETag", "", "Responses are cached for 15 seconds. Each `200` carries an `ETag`; send it back as `If-None-Match` to receive `304 Not Modified` without body. Polling faster than every 15 s returns the same data.", "");
  L.push("## Rate limiting", "", `Limit: ${client ? `${client.rate_limit_per_min} requests per minute` : "per client, requests per minute"}. Headers on every response:`, "");
  L.push("- `X-RateLimit-Limit` – requests allowed per minute", "- `X-RateLimit-Remaining` – requests left in the current minute", "- `X-RateLimit-Reset` – Unix time when the window resets", "- `Retry-After` – seconds to wait (only on `429`)", "");
  L.push("## Errors", "", "```", ERROR_SAMPLE, "```", "", "| HTTP | Code | Meaning |", "|---|---|---|");
  for (const e of errorTable()) L.push(`| ${e.status} | \`${e.code}\` | ${e.msg} |`);
  L.push("", "## Embeddable widget", "", "Use a widget key (`fpw_live_…`). The page domain must be whitelisted for your account.", "", "```html", widgetSnippet(panelOrigin, base), "```", "");
  L.push("## OpenAPI", "", `Machine-readable specification: \`${base}/feed-api/openapi.json\``, "");
  return L.join("\n");
}

const escHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Minimal Markdown → standalone HTML (headings, tables, code blocks, lists, inline code/bold). */
export function toHtml(md: string, title: string) {
  const out: string[] = [];
  const lines = md.split("\n");
  const inline = (s: string) => escHtml(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.startsWith("```")) {
      const buf: string[] = [];
      while (++i < lines.length && !lines[i]!.startsWith("```")) buf.push(lines[i]!);
      out.push(`<pre>${escHtml(buf.join("\n"))}</pre>`);
    } else if (/^#{1,3} /.test(l)) {
      const n = l.match(/^#+/)![0].length;
      out.push(`<h${n}>${inline(l.slice(n + 1))}</h${n}>`);
    } else if (l.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.startsWith("|")) {
        if (!/^\|[-| ]+\|$/.test(lines[i]!)) rows.push(lines[i]!.slice(1, -1).split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|")));
        i++;
      }
      i--;
      const [h, ...b] = rows;
      out.push(`<table><thead><tr>${(h ?? []).map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${b.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
    } else if (l.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i]!.startsWith("- ")) items.push(`<li>${inline(lines[i++]!.slice(2))}</li>`);
      i--;
      out.push(`<ul>${items.join("")}</ul>`);
    } else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(title)}</title>
<style>body{font:14px/1.55 'Noto Sans',system-ui,sans-serif;color:#1c2b3a;max-width:900px;margin:32px auto;padding:0 20px}h1{color:#0b2d4f;border-bottom:3px solid #0b2d4f;padding-bottom:8px}h2{color:#0b2d4f;margin-top:32px;text-transform:uppercase;font-size:15px;letter-spacing:.04em}h3{font-family:monospace;background:#eef2f6;padding:6px 10px;border-left:3px solid #1f9d55}pre{background:#f4f6f9;border:1px solid #d5dde6;padding:12px;overflow:auto;font-size:12px}code{background:#eef2f6;padding:1px 4px;border-radius:3px;font-size:12px}table{border-collapse:collapse;width:100%;font-size:12px;margin:8px 0}th,td{border:1px solid #d5dde6;padding:5px 8px;text-align:left}th{background:#eef2f6}</style></head><body>${out.join("\n")}</body></html>`;
}

export function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
