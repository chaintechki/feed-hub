import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";

import { FEED_BASE } from "@/components/config/ApiClients";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { buildOpenApi, download, endpointList, ERROR_SAMPLE, errorTable, JSON_SAMPLE, toHtml, toMarkdown, XML_SAMPLE, type DocClient } from "@/lib/apiDocs";
import { useAuth } from "@/providers/AuthProvider";

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
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const [clientId, setClientId] = useState("");
  const clients = useQuery({
    queryKey: ["api_clients"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("api-clients-admin", { body: { action: "list" } });
      if (error) throw error;
      return (data as { clients: (DocClient & { id: string })[] }).clients;
    },
  });
  const client = clients.data?.find((c) => c.id === clientId) ?? null;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const spec = useMemo(() => buildOpenApi(FEED_BASE, client), [client]);
  const eps = endpointList(spec);
  const slug = client ? client.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "feed";

  const exp = (kind: "openapi" | "md" | "html") => {
    if (kind === "openapi") return download(`${slug}-openapi.json`, JSON.stringify(spec, null, 2), "application/json");
    const md = toMarkdown(FEED_BASE, origin, client);
    if (kind === "md") return download(`${slug}-api.md`, md, "text/markdown");
    download(`${slug}-api.html`, toHtml(md, `${spec.info.title}${client ? ` – ${client.name}` : ""}`), "text/html");
  };

  return (
    <PageShell
      title="Feed API"
      description="Reference for customer integrations"
      actions={
        <div className="flex items-center gap-2">
          {isAdmin && (
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="h-7 rounded-sm border border-border bg-background px-2 text-[11px]" aria-label="Client">
              <option value="">Generic (all clients)</option>
              {(clients.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          {(["openapi", "md", "html"] as const).map((k) => (
            <Button key={k} size="sm" variant="outline" className="h-7 text-[11px] uppercase" onClick={() => exp(k)}>
              <Download className="mr-1 h-3.5 w-3.5" /> {k === "openapi" ? "OpenAPI" : k === "md" ? "Markdown" : "HTML"}
            </Button>
          ))}
        </div>
      }
    >
      <div className="max-w-4xl space-y-6 text-[12px]">
        {client && (
          <div className="rounded-sm border border-border bg-panel p-3 text-[11px]">
            <b>{client.name}</b> · {client.rate_limit_per_min}/min · {client.formats.join("/").toUpperCase()} ·{" "}
            {client.sport_ids.length ? `${client.sport_ids.length} sports` : "all sports"}
            {client.tournament_ids.length ? `, ${client.tournament_ids.length} tournaments` : ""} · widget domains:{" "}
            {client.allowed_domains.join(", ") || "—"}
            <div className="mt-1 text-muted-foreground">Exports contain these entitlements, never API keys.</div>
          </div>
        )}
        <Block title="Base URL">
          <Code>{`${FEED_BASE}/feed-api`}</Code>
        </Block>
        <Block title="Authentication">
          <p>
            Send the server key in the <code>X-API-Key</code> header. Keys in the URL are rejected with <code>400 key_in_query</code>. Keys can have an
            expiry date and an IP whitelist; <code>GET /me</code> shows your entitlements and remaining quota.
          </p>
          <Code>{`curl -H "X-API-Key: fpk_live_…" "${FEED_BASE}/feed-api/matches?format=json&limit=50"`}</Code>
        </Block>
        <Block title="Endpoints">
          <div className="overflow-hidden rounded-sm border border-border bg-panel">
            <table className="w-full text-[11px]">
              <tbody>
                {eps.map((e) => (
                  <tr key={e.path} className="border-b border-border align-top last:border-0">
                    <td className="px-3 py-2 font-bold text-success">GET</td>
                    <td className="px-3 py-2 font-mono">{e.path}</td>
                    <td className="px-3 py-2">
                      <div>{e.summary}</div>
                      {e.params.filter((p) => p.name !== "format").length > 0 && (
                        <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                          {e.params.filter((p) => p.name !== "format").map((p) => `${p.name}${p.schema?.default !== undefined ? `=${String(p.schema.default)}` : ""}`).join(" · ")}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="px-3 py-2 font-bold text-success">GET</td>
                  <td className="px-3 py-2 font-mono">/openapi.json</td>
                  <td className="px-3 py-2">Public OpenAPI 3.1 specification (no key required)</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            All data endpoints accept <code>format=json</code> (default) or <code>format=xml</code>. XML uses the <code>sport_event / market / outcome</code>{" "}
            structure with <code>sr:</code> identifiers.
          </p>
        </Block>
        <Block title="Response – JSON">
          <Code>{JSON_SAMPLE}</Code>
        </Block>
        <Block title="Response – XML">
          <Code>{XML_SAMPLE}</Code>
        </Block>
        <Block title="Caching, ETag & rate limiting">
          <p>
            Responses are cached for 15 s. Send the <code>ETag</code> back as <code>If-None-Match</code> to get <code>304 Not Modified</code>. Every response
            carries <code>X-RateLimit-Limit</code>, <code>X-RateLimit-Remaining</code> and <code>X-RateLimit-Reset</code>; on <code>429</code> wait{" "}
            <code>Retry-After</code> seconds.
          </p>
        </Block>
        <Block title="Errors">
          <Code>{ERROR_SAMPLE}</Code>
          <div className="overflow-hidden rounded-sm border border-border bg-panel">
            <table className="w-full text-[11px]">
              <tbody>
                {errorTable().map((e) => (
                  <tr key={e.code} className="border-b border-border last:border-0">
                    <td className="w-14 px-3 py-1.5 font-mono font-bold">{e.status}</td>
                    <td className="w-44 px-3 py-1.5 font-mono">{e.code}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{e.msg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Block>
        <Block title="Embeddable widget">
          <p>Use a widget key; the page domain must be registered for the account.</p>
          <Code>{`<script src="${origin}/widget.js"
  data-key="fpw_live_…"
  data-api="${FEED_BASE}/feed-widget"
  data-sport="sr:sport:1"
  data-lang="de"></script>`}</Code>
        </Block>
      </div>
    </PageShell>
  );
}
