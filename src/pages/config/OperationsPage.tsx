import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cacheSeries, fmtBytes, summarizeCache, type CacheRow } from "@/lib/ops";
import { useAuth } from "@/providers/AuthProvider";

const RANGES = { "24h": 1, "7d": 7, "30d": 30 } as const;
type Range = keyof typeof RANGES;
type Metric = { at: string; db_bytes: number; wal_bytes: number | null; cache_hit_pct: number | null; connections: number | null; dead_rows: number | null; tables: { name: string; bytes: number }[] };
type Run = { id: number; started_at: string; duration_ms: number; ok: boolean; result: Record<string, number> | null; error: string | null };

const COLORS = ["hsl(var(--primary))", "hsl(var(--success))", "hsl(var(--warning))", "hsl(var(--danger))", "hsl(var(--muted-foreground))", "hsl(var(--accent-foreground))"];
const MB = 1024 * 1024;

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "danger" | "success" }) {
  return (
    <div className="rounded border border-border bg-card p-3">
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={"mt-1 font-mono text-lg font-semibold" + (tone === "danger" ? " text-danger" : tone === "success" ? " text-success" : "")}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

export default function OperationsPage() {
  const { t } = useTranslation();
  const { user, roles } = useAuth();
  const allowed = roles.includes("super_admin") || roles.includes("admin");
  const [range, setRange] = useState<Range>("24h");
  const since = useMemo(() => new Date(Date.now() - RANGES[range] * 864e5).toISOString(), [range]);

  const q = useQuery({
    queryKey: ["ops", user?.id, range],
    enabled: !!user && allowed,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [m, r, c] = await Promise.all([
        supabase.from("ops_metrics").select("at,db_bytes,wal_bytes,cache_hit_pct,connections,dead_rows,tables").gte("at", since).order("at").limit(1000),
        supabase.from("cleanup_runs").select("id,started_at,duration_ms,ok,result,error").order("started_at", { ascending: false }).limit(48),
        supabase.from("cache_stats").select("source,minute,hits,misses,db_reads,load_ms,loads,entries,refreshed_at").gte("minute", since).order("minute").limit(20000),
      ]);
      if (m.error) throw m.error;
      if (r.error) throw r.error;
      if (c.error) throw c.error;
      return { metrics: (m.data ?? []) as unknown as Metric[], runs: (r.data ?? []) as unknown as Run[], cache: (c.data ?? []) as CacheRow[] };
    },
  });

  if (!allowed) return <div className="p-4 text-sm text-muted-foreground">{t("ops.forbidden")}</div>;

  const metrics = q.data?.metrics ?? [];
  const runs = q.data?.runs ?? [];
  const last = metrics.at(-1);
  const dayAgo = Date.now() - 864e5;
  const ref = metrics.find((x) => new Date(x.at).getTime() >= dayAgo);
  const delta = last && ref ? last.db_bytes - ref.db_bytes : null;
  const lastRun = runs[0];
  const deleted = (r?: Run) => (r?.result ? Object.values(r.result).reduce((a, b) => a + (Number(b) || 0), 0) : 0);
  const tick = (v: string) => (range === "24h" ? new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : new Date(v).toLocaleDateString([], { day: "2-digit", month: "2-digit" }));

  const tableNames = [...new Set(metrics.flatMap((x) => (x.tables ?? []).map((tb) => tb.name)))].slice(0, 6);
  const sizeData = metrics.map((x) => ({
    at: x.at,
    db: +(x.db_bytes / MB).toFixed(1),
    wal: x.wal_bytes != null ? +(x.wal_bytes / MB).toFixed(1) : null,
    ...Object.fromEntries((x.tables ?? []).map((tb) => [tb.name, +(tb.bytes / MB).toFixed(1)])),
  }));
  const cacheSum = summarizeCache(q.data?.cache ?? []);
  const series = cacheSeries(q.data?.cache ?? []).map((b) => ({ ...b, at: `${b.t}:00:00Z` }));

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4" data-testid="ops-dashboard">
      <div className="flex items-center gap-2">
        <h1 className="text-sm font-bold">{t("ops.title")}</h1>
        <div className="ml-auto flex gap-1">
          {(Object.keys(RANGES) as Range[]).map((k) => (
            <Button key={k} size="sm" variant={range === k ? "default" : "outline"} className="h-6 px-2 text-[11px]" onClick={() => setRange(k)}>
              {k}
            </Button>
          ))}
        </div>
      </div>
      {q.isError && <p className="text-[12px] text-danger">{t("ops.loadError")}</p>}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Tile label={t("ops.dbSize")} value={fmtBytes(last?.db_bytes)} sub={last ? new Date(last.at).toLocaleString() : t("ops.noData")} />
        <Tile label={t("ops.delta24h")} value={delta == null ? "—" : `${delta >= 0 ? "+" : "−"}${fmtBytes(Math.abs(delta))}`} />
        <Tile label={t("ops.bufferHit")} value={last?.cache_hit_pct != null ? `${last.cache_hit_pct} %` : "—"} sub={t("ops.bufferHitHint")} />
        <Tile label={t("ops.connections")} value={last?.connections != null ? String(last.connections) : "—"} sub={`WAL ${fmtBytes(last?.wal_bytes)}`} />
        <Tile
          label={t("ops.lastCleanup")}
          value={lastRun ? (lastRun.ok ? t("ops.ok") : t("ops.failed")) : "—"}
          tone={lastRun ? (lastRun.ok ? "success" : "danger") : undefined}
          sub={lastRun ? `${new Date(lastRun.started_at).toLocaleString()} · ${(lastRun.duration_ms / 1000).toFixed(1)} s · ${deleted(lastRun).toLocaleString()} ${t("ops.rows")}` : t("ops.noData")}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">{t("ops.ramHint")}</p>

      <Section title={t("ops.sizeHistory")}>
        <div className="h-64 rounded border border-border bg-card p-2">
          {sizeData.length < 2 ? (
            <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">{t("ops.waiting")}</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sizeData}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis dataKey="at" tickFormatter={tick} fontSize={10} stroke="hsl(var(--muted-foreground))" />
                <YAxis fontSize={10} stroke="hsl(var(--muted-foreground))" unit=" MB" width={70} />
                <Tooltip labelFormatter={(v) => new Date(String(v)).toLocaleString()} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line dataKey="db" name={t("ops.dbSize")} stroke={COLORS[0]} dot={false} strokeWidth={2} />
                <Line dataKey="wal" name="WAL" stroke={COLORS[4]} dot={false} strokeDasharray="4 2" />
                {tableNames.slice(0, 4).map((n, i) => (
                  <Line key={n} dataKey={n} name={n} stroke={COLORS[(i + 1) % COLORS.length]} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Section>

      <Section title={t("ops.cleanupRuns")}>
        <div className="overflow-auto rounded border border-border">
          <table className="w-full text-[12px]">
            <thead className="bg-subbar text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 text-left">{t("ops.when")}</th>
                <th className="px-3 py-1.5 text-left">{t("ops.status")}</th>
                <th className="px-3 py-1.5 text-right">{t("ops.duration")}</th>
                <th className="px-3 py-1.5 text-right">{t("ops.odds")}</th>
                <th className="px-3 py-1.5 text-right">{t("ops.history")}</th>
                <th className="px-3 py-1.5 text-right">{t("ops.settlements")}</th>
                <th className="px-3 py-1.5 text-right">{t("ops.matches")}</th>
                <th className="px-3 py-1.5 text-left">{t("ops.error")}</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-3 text-center text-muted-foreground">{t("ops.noRuns")}</td>
                </tr>
              )}
              {runs.map((r) => (
                <tr key={r.id} className={"border-t border-border" + (r.ok ? "" : " text-danger")}>
                  <td className="px-3 py-1.5">{new Date(r.started_at).toLocaleString()}</td>
                  <td className="px-3 py-1.5 font-semibold">{r.ok ? t("ops.ok") : t("ops.failed")}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{(r.duration_ms / 1000).toFixed(1)} s</td>
                  <td className="px-3 py-1.5 text-right font-mono">{r.result?.odds ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{r.result?.history ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{r.result?.settlements ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{r.result?.matches ?? "—"}</td>
                  <td className="px-3 py-1.5">{r.error ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title={t("ops.marketCache")}>
        <p className="text-[11px] text-muted-foreground">{t("ops.marketCacheHint")}</p>
        <div className="overflow-auto rounded border border-border">
          <table className="w-full text-[12px]">
            <thead className="bg-subbar text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 text-left">{t("ops.source")}</th>
                <th className="px-3 py-1.5 text-right">{t("ops.hitRate")}</th>
                <th className="px-3 py-1.5 text-right">{t("ops.hits")}</th>
                <th className="px-3 py-1.5 text-right">{t("ops.misses")}</th>
                <th className="px-3 py-1.5 text-right">{t("ops.dbReads")}</th>
                <th className="px-3 py-1.5 text-right">{t("ops.avgLoad")}</th>
                <th className="px-3 py-1.5 text-right">{t("ops.entries")}</th>
                <th className="px-3 py-1.5 text-right">{t("ops.refreshed")}</th>
              </tr>
            </thead>
            <tbody>
              {cacheSum.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-3 text-center text-muted-foreground">{t("ops.noData")}</td>
                </tr>
              )}
              {cacheSum.map((s) => (
                <tr key={s.source} className="border-t border-border">
                  <td className="px-3 py-1.5 font-semibold">{s.source}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{s.hitPct != null ? `${s.hitPct} %` : "—"}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{s.hits.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{s.misses.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{s.dbReads.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{s.avgLoadMs != null ? `${s.avgLoadMs} ms` : "—"}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{s.entries.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">{s.refreshedAt ? new Date(s.refreshedAt).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="h-56 rounded border border-border bg-card p-2">
          {series.length < 2 ? (
            <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">{t("ops.waiting")}</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis dataKey="at" tickFormatter={tick} fontSize={10} stroke="hsl(var(--muted-foreground))" />
                <YAxis yAxisId="p" domain={[0, 100]} unit=" %" fontSize={10} stroke="hsl(var(--muted-foreground))" width={50} />
                <YAxis yAxisId="r" orientation="right" fontSize={10} stroke="hsl(var(--muted-foreground))" width={50} />
                <Tooltip labelFormatter={(v) => new Date(String(v)).toLocaleString()} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line yAxisId="p" dataKey="hitPct" name={t("ops.hitRate")} stroke={COLORS[1]} dot={false} strokeWidth={2} connectNulls />
                <Line yAxisId="r" dataKey="dbReads" name={t("ops.dbReads")} stroke={COLORS[0]} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Section>
    </div>
  );
}
