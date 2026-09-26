import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cacheSeries, fmtBytes, summarizeCache, type CacheRow } from "@/lib/ops";
import { useAuth } from "@/providers/AuthProvider";

const RANGES = { "24h": 1, "7d": 7, "30d": 30 } as const;
type Range = keyof typeof RANGES;
type Metric = { at: string; kind: string; db_bytes: number; wal_bytes: number | null; cache_hit_pct: number | null; connections: number | null; dead_rows: number | null; tables: { name: string; bytes: number }[]; server_mem_rss: number | null; server_mem_heap: number | null; server_mem_total: number | null; server_mem_free: number | null };
type Run = { id: number; started_at: string; duration_ms: number; ok: boolean; result: { odds?: number; history?: number; settlements?: number; matches?: number } | null; error: string | null };
type StatusRun = { id: number; at: string; ok: boolean; checked: number; updated: number; forced: number; errors: number; duration_ms: number; details: { changes?: Record<string, number>; error?: string | null } | null };
type EvalRun = { id?: number; at?: string; total: number; correct: number; accuracy: number; resolver_accuracy: number | null; details: { q: string; ok: boolean; resolverOk: boolean; args?: Record<string, unknown>; error?: string }[] };

const COLORS = ["hsl(var(--primary))", "hsl(var(--success))", "hsl(var(--warning))", "hsl(var(--danger))", "hsl(var(--muted-foreground))", "hsl(var(--accent-foreground))"];
const MB = 1024 * 1024;
const DB_WARN = 1.5 * 1024 * MB; // warn well before the data disk fills up
type FeedHealth = { last_odds_at: string | null; odds_5m: number; db_bytes: number; query_ms: number; producers: { name: string; last_alive_at: string | null; down: boolean }[] | null };

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string | undefined; tone?: "danger" | "success" | undefined }) {
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
  const qc = useQueryClient();
  const allowed = roles.includes("super_admin") || roles.includes("admin");
  const [range, setRange] = useState<Range>("24h");
  const since = useMemo(() => new Date(Date.now() - RANGES[range] * 864e5).toISOString(), [range]);

  const q = useQuery({
    queryKey: ["ops", user?.id, range],
    enabled: !!user && allowed,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [m, r, c, s, e] = await Promise.all([
        supabase.from("ops_metrics").select("at,kind,db_bytes,wal_bytes,cache_hit_pct,connections,dead_rows,tables,server_mem_rss,server_mem_heap,server_mem_total,server_mem_free").gte("at", since).order("at").limit(2000),
        supabase.from("cleanup_runs").select("id,started_at,duration_ms,ok,result,error").order("started_at", { ascending: false }).limit(48),
        supabase.from("cache_stats").select("source,minute,hits,misses,db_reads,load_ms,loads,entries,refreshed_at").gte("minute", since).order("minute").limit(20000),
        supabase.from("status_sync_runs").select("id,at,ok,checked,updated,forced,errors,duration_ms,details").order("at", { ascending: false }).limit(20),
        supabase.from("ai_eval_runs").select("id,at,total,correct,accuracy,resolver_accuracy,details").order("at", { ascending: false }).limit(20),
      ]);
      for (const x of [m, r, c, s, e]) if (x.error) throw x.error;
      return {
        metrics: (m.data ?? []) as unknown as Metric[],
        runs: (r.data ?? []) as unknown as Run[],
        cache: (c.data ?? []) as CacheRow[],
        status: (s.data ?? []) as unknown as StatusRun[],
        evals: (e.data ?? []) as unknown as EvalRun[],
      };
    },
  });
  const h = useQuery({
    queryKey: ["feed-health", user?.id],
    enabled: !!user && allowed,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("feed_health");
      if (error) throw error;
      return data as unknown as FeedHealth;
    },
  });
  const oddsAge = h.data?.last_odds_at ? Math.max(0, Math.round((Date.now() - new Date(h.data.last_odds_at).getTime()) / 1000)) : null;
  const evalRun = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("feed-assistant", { body: { eval: true } });
      if (error) throw error;
      return data as EvalRun;
    },
    onSuccess: (d) => { toast.success(t("ops.evalDone", { pct: d.accuracy })); qc.invalidateQueries({ queryKey: ["ops"] }); },
    onError: () => toast.error(t("ops.evalFailed")),
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
  const lastStatus = q.data?.status?.[0];
  const evals = q.data?.evals ?? [];
  const lastEval = evals[0];
  const memRows = metrics.filter((x) => x.kind === "status");
  const lastMem = memRows.at(-1);
  const memPct = (x: Metric) => Math.round((100 * ((x.server_mem_total ?? 0) - (x.server_mem_free ?? 0))) / (x.server_mem_total || 1));
  const memData = memRows.map((x) => ({
    at: x.at,
    db: +(x.db_bytes / MB).toFixed(1),
    used: x.server_mem_total ? +((x.server_mem_total - (x.server_mem_free ?? 0)) / MB).toFixed(0) : null,
    rss: x.server_mem_rss ? +(x.server_mem_rss / MB).toFixed(0) : null,
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

      <Section title={t("ops.feedHealth")}>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4" data-testid="feed-health">
          <Tile
            label={t("ops.lastOdds")}
            value={oddsAge == null ? "—" : `${oddsAge} s`}
            tone={oddsAge == null ? undefined : oddsAge > 120 ? "danger" : "success"}
            sub={oddsAge != null && oddsAge > 120 ? t("ops.feedStale") : t("ops.odds5m", { n: (h.data?.odds_5m ?? 0).toLocaleString() })}
          />
          <Tile label={t("ops.dbLatency")} value={h.data ? `${h.data.query_ms} ms` : "—"} tone={h.data ? (h.data.query_ms > 2000 ? "danger" : "success") : undefined} />
          <Tile label={t("ops.dbSize")} value={fmtBytes(h.data?.db_bytes)} tone={h.data && h.data.db_bytes > DB_WARN ? "danger" : undefined} sub={h.data && h.data.db_bytes > DB_WARN ? t("ops.dbWarn") : undefined} />
          <Tile
            label={t("ops.producers")}
            value={(h.data?.producers ?? []).map((p) => `${p.name} ${p.down ? "✕" : "✓"}`).join(" · ") || "—"}
            tone={h.data?.producers?.some((p) => p.down) ? "danger" : h.data ? "success" : undefined}
          />
        </div>
      </Section>

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

      <Section title={t("ops.statusSync")}>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Tile
            label={t("ops.lastStatusSync")}
            value={lastStatus ? (lastStatus.ok ? t("ops.ok") : t("ops.failed")) : "—"}
            tone={lastStatus ? (lastStatus.ok ? "success" : "danger") : undefined}
            sub={lastStatus ? `${new Date(lastStatus.at).toLocaleString()} · ${(lastStatus.duration_ms / 1000).toFixed(1)} s` : t("ops.noData")}
          />
          <Tile label={t("ops.statusChecked")} value={lastStatus ? String(lastStatus.checked) : "—"} sub={lastStatus ? `${lastStatus.errors} ${t("ops.statusErrors")}` : undefined} />
          <Tile label={t("ops.statusUpdated")} value={lastStatus ? String(lastStatus.updated) : "—"} sub={lastStatus ? `${lastStatus.forced} ${t("ops.statusForced")}` : undefined} />
          <Tile label={t("ops.serverRam")} value={lastMem?.server_mem_total ? `${memPct(lastMem)} %` : "—"} sub={lastMem?.server_mem_total ? `${fmtBytes(lastMem.server_mem_total - (lastMem.server_mem_free ?? 0))} / ${fmtBytes(lastMem.server_mem_total)}` : t("ops.memWaiting")} />
          <Tile label={t("ops.workerRam")} value={fmtBytes(lastMem?.server_mem_rss ?? undefined)} sub={lastMem ? `${t("ops.dbSize")} ${fmtBytes(lastMem.db_bytes)}` : undefined} />
        </div>
        <div className="h-56 rounded border border-border bg-card p-2">
          {memData.length < 2 ? (
            <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">{t("ops.waiting")}</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={memData}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis dataKey="at" tickFormatter={tick} fontSize={10} stroke="hsl(var(--muted-foreground))" />
                <YAxis fontSize={10} stroke="hsl(var(--muted-foreground))" unit=" MB" width={70} />
                <Tooltip labelFormatter={(v) => new Date(String(v)).toLocaleString()} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line dataKey="db" name={t("ops.dbSize")} stroke={COLORS[0]} dot={false} strokeWidth={2} />
                <Line dataKey="used" name={t("ops.serverRam")} stroke={COLORS[2]} dot={false} connectNulls />
                <Line dataKey="rss" name={t("ops.workerRam")} stroke={COLORS[1]} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Section>

      <Section title={t("ops.aiAccuracy")}>
        <div className="flex items-center gap-2">
          <p className="text-[11px] text-muted-foreground">{t("ops.aiAccuracyHint")}</p>
          <Button size="sm" className="ml-auto h-7 text-[11px]" disabled={evalRun.isPending} onClick={() => evalRun.mutate()}>
            {evalRun.isPending ? t("ops.evalRunning") : t("ops.evalRun")}
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Tile label={t("ops.modelAccuracy")} value={lastEval ? `${lastEval.accuracy} %` : "—"} tone={lastEval ? (lastEval.accuracy >= 80 ? "success" : "danger") : undefined} sub={lastEval ? `${lastEval.correct} / ${lastEval.total} · ${new Date(lastEval.at ?? "").toLocaleString()}` : t("ops.noData")} />
          <Tile label={t("ops.resolverAccuracy")} value={lastEval?.resolver_accuracy != null ? `${lastEval.resolver_accuracy} %` : "—"} sub={t("ops.resolverHint")} />
        </div>
        {lastEval && (
          <div className="overflow-auto rounded border border-border">
            <table className="w-full text-[12px]">
              <thead className="bg-subbar text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 text-left">{t("ops.evalQuestion")}</th>
                  <th className="px-3 py-1.5 text-left">{t("ops.evalFilters")}</th>
                  <th className="px-3 py-1.5 text-left">{t("ops.status")}</th>
                </tr>
              </thead>
              <tbody>
                {lastEval.details.map((d) => (
                  <tr key={d.q} className={"border-t border-border" + (d.ok ? "" : " text-danger")}>
                    <td className="px-3 py-1.5">{d.q}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px]">{d.error ?? Object.entries(d.args ?? {}).filter(([, v]) => v != null && v !== false).map(([k, v]) => `${k}=${String(v)}`).join(", ")}</td>
                    <td className="px-3 py-1.5 font-semibold">{d.ok ? t("ops.ok") : t("ops.failed")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

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
