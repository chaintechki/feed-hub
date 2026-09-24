import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  addVolume,
  dailyForecast,
  daysInMonth,
  emptyVolume,
  GB,
  hitRate,
  monthlyForecast,
  variableCost,
  type CostSettings,
  type Volume,
} from "@/lib/costs";

const DAY = 86_400_000;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

const FIELDS: (keyof CostSettings)[] = [
  "price_per_million_invocations",
  "price_per_million_db_reads",
  "price_per_gb_egress",
  "included_invocations",
  "included_egress_gb",
  "fixed_monthly",
  "upstream_monthly",
];

export function CostOverview() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();

  const settings = useQuery({
    queryKey: ["cost_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cost_settings").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data as unknown as CostSettings | null;
    },
  });

  const data = useQuery({
    queryKey: ["cost_volume"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * DAY).toISOString();
      const [u, d, c] = await Promise.all([
        supabase.from("api_usage").select("client_id,minute,count,cache_hits,bytes").gte("minute", since).limit(50_000),
        supabase.from("api_denials").select("client_id,minute,count").gte("minute", since).limit(50_000),
        supabase.from("api_clients").select("id,name,markup_pct"),
      ]);
      if (u.error) throw u.error;
      if (d.error) throw d.error;
      if (c.error) throw c.error;
      return { usage: u.data ?? [], denials: d.data ?? [], clients: c.data ?? [] };
    },
  });

  const [form, setForm] = useState<CostSettings | null>(null);
  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: async (v: CostSettings) => {
      const { data: u } = await supabase.auth.getUser();
      const payload = Object.fromEntries(FIELDS.map((f) => [f, Number(v[f]) || 0]));
      const { error } = await supabase
        .from("cost_settings")
        .update({ ...payload, currency: v.currency || "EUR", updated_at: new Date().toISOString(), updated_by: u.user?.id })
        .eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("costs.saved"));
      qc.invalidateQueries({ queryKey: ["cost_settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const calc = useMemo(() => {
    const s = settings.data;
    if (!data.data || !s) return null;
    const todayKey = dayKey(new Date());
    const byDay = new Map<string, Volume>();
    const byClientDay = new Map<string, Map<string, Volume>>();
    const bump = (client: string | null, minute: string, v: Partial<Volume>) => {
      const k = dayKey(new Date(minute));
      byDay.set(k, addVolume(byDay.get(k) ?? emptyVolume(), v));
      if (!client) return;
      const m = byClientDay.get(client) ?? new Map<string, Volume>();
      m.set(k, addVolume(m.get(k) ?? emptyVolume(), v));
      byClientDay.set(client, m);
    };
    for (const r of data.data.usage) bump(r.client_id, r.minute, { allowed: r.count, cacheHits: r.cache_hits, bytes: Number(r.bytes) });
    for (const r of data.data.denials) bump(r.client_id, r.minute, { denied: r.count });

    const now = new Date();
    const hours = (now.getTime() - new Date(todayKey + "T00:00:00Z").getTime()) / 3_600_000;
    const last7 = Array.from({ length: 7 }, (_, i) => dayKey(new Date(now.getTime() - (i + 1) * DAY)));
    const forecastFor = (m: Map<string, Volume>) =>
      dailyForecast(last7.map((k) => m.get(k) ?? emptyVolume()), m.get(todayKey) ?? emptyVolume(), hours);

    const today = byDay.get(todayKey) ?? emptyVolume();
    const daily = forecastFor(byDay);
    const dim = daysInMonth(now);
    const month = monthlyForecast(daily, s, dim);

    const history = Array.from({ length: 30 }, (_, i) => {
      const k = dayKey(new Date(now.getTime() - (29 - i) * DAY));
      const v = byDay.get(k) ?? emptyVolume();
      return { k, v, cost: variableCost(v, s) };
    });
    const maxCost = Math.max(...history.map((h) => h.v.allowed + h.v.denied), 1);

    const totalVar = variableCost(daily, s) || 1;
    const clients = data.data.clients
      .map((c) => {
        const m = byClientDay.get(c.id) ?? new Map<string, Volume>();
        const vol7 = last7.map((k) => m.get(k) ?? emptyVolume()).reduce(addVolume, emptyVolume());
        const d = forecastFor(m);
        const share = variableCost(d, s) / totalVar;
        return {
          ...c,
          vol7,
          perDay: variableCost(d, s),
          perMonth: month.usage * share,
        };
      })
      .sort((a, b) => b.perMonth - a.perMonth);

    return { today, daily, month, history, maxCost, clients, hours };
  }, [data.data, settings.data]);

  const cur = settings.data?.currency ?? "EUR";
  const money = (n: number) =>
    new Intl.NumberFormat(i18n.language, { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(n);
  const num = (n: number) => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 }).format(n);
  const pct = (n: number) => `${(n * 100).toFixed(1)} %`;
  const gb = (b: number) => `${(b / GB).toFixed(3)} GB`;

  const tiles = calc
    ? [
        { l: t("costs.callsToday"), v: num(calc.today.allowed + calc.today.denied) },
        { l: t("costs.hitRate"), v: pct(hitRate(calc.today)) },
        { l: t("costs.egressToday"), v: gb(calc.today.bytes) },
        { l: t("costs.forecastDay"), v: money(variableCost(calc.daily, settings.data!)) },
        { l: t("costs.forecastMonth"), v: money(calc.month.total), strong: true },
      ]
    : [];

  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("costs.title")}</h2>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {tiles.map((x) => (
          <div key={x.l} className="rounded-sm border border-border bg-card px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{x.l}</div>
            <div className={`font-mono text-[15px] font-semibold ${x.strong ? "text-primary" : "text-foreground"}`}>{x.v}</div>
          </div>
        ))}
        {!calc && <div className="col-span-full text-[11px] text-muted-foreground">{t("common.loading", "…")}</div>}
      </div>

      {calc && (
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-sm border border-border bg-card p-3 lg:col-span-2">
            <div className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">{t("costs.history")}</div>
            <div className="flex h-28 items-end gap-[2px]">
              {calc.history.map((h) => {
                const total = h.v.allowed + h.v.denied;
                const hits = Math.min(h.v.cacheHits, h.v.allowed);
                return (
                  <div
                    key={h.k}
                    className="flex flex-1 flex-col justify-end"
                    style={{ height: "100%" }}
                    title={`${h.k}: ${num(total)} · ${t("costs.cacheHits")} ${num(hits)} · ${money(h.cost)}`}
                  >
                    <div className="bg-danger/70" style={{ height: `${(h.v.denied / calc.maxCost) * 100}%` }} />
                    <div className="bg-navbar" style={{ height: `${((h.v.allowed - hits) / calc.maxCost) * 100}%` }} />
                    <div className="bg-success/70" style={{ height: `${(hits / calc.maxCost) * 100}%` }} />
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex gap-4 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 bg-success/70" />{t("costs.cacheHits")}</span>
              <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 bg-navbar" />{t("costs.dbCalls")}</span>
              <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 bg-danger/70" />{t("costs.denied")}</span>
            </div>
          </div>

          <div className="rounded-sm border border-border bg-card p-3 text-[11px]">
            <div className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">{t("costs.breakdown")}</div>
            {[
              [t("costs.invocations"), `${num(calc.month.invocations)} → ${money(calc.month.invCost)}`],
              [t("costs.dbReads"), `${num(calc.month.dbReads)} → ${money(calc.month.readCost)}`],
              [t("costs.egress"), `${calc.month.gb.toFixed(2)} GB → ${money(calc.month.egressCost)}`],
              [t("costs.fixed"), money(settings.data!.fixed_monthly)],
              [t("costs.upstream"), money(settings.data!.upstream_monthly)],
            ].map(([a, b]) => (
              <div key={a} className="flex justify-between border-b border-border py-1 last:border-0">
                <span className="text-muted-foreground">{a}</span>
                <span className="font-mono">{b}</span>
              </div>
            ))}
            <div className="flex justify-between pt-2 font-semibold">
              <span>{t("costs.forecastMonth")}</span>
              <span className="font-mono text-primary">{money(calc.month.total)}</span>
            </div>
          </div>
        </div>
      )}

      {calc && (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full text-[11px]">
            <thead className="bg-navbar text-navbar-foreground">
              <tr>
                {[t("costs.client"), t("costs.calls7d"), t("costs.hitRate"), "GB (7T)", t("costs.markup"), t("costs.perDay"), t("costs.perMonth")].map((h) => (
                  <th key={h} className="px-2 py-1.5 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calc.clients.map((c, i) => (
                <tr key={c.id} className={i % 2 ? "bg-row-alt" : "bg-card"}>
                  <td className="px-2 py-1 font-medium">{c.name}</td>
                  <td className="px-2 py-1 font-mono">{num(c.vol7.allowed + c.vol7.denied)}</td>
                  <td className="px-2 py-1 font-mono">{pct(hitRate(c.vol7))}</td>
                  <td className="px-2 py-1 font-mono">{(c.vol7.bytes / GB).toFixed(3)}</td>
                  <td className="px-2 py-1 font-mono">{Number(c.markup_pct)} %</td>
                  <td className="px-2 py-1 font-mono">{money(c.perDay)}</td>
                  <td className="px-2 py-1 font-mono font-semibold">{money(c.perMonth)}</td>
                </tr>
              ))}
              {!calc.clients.length && (
                <tr><td colSpan={7} className="px-2 py-3 text-center text-muted-foreground">{t("costs.noClients")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <form
          className="rounded-sm border border-border bg-card p-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(form);
          }}
        >
          <div className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">{t("costs.prices")}</div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <label className="space-y-1 text-[11px]">
              <span className="text-muted-foreground">{t("costs.f.currency")}</span>
              <input
                className="h-7 w-full rounded-sm border border-input bg-background px-2 font-mono"
                maxLength={3}
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
              />
            </label>
            {FIELDS.map((f) => (
              <label key={f} className="space-y-1 text-[11px]">
                <span className="text-muted-foreground">{t(`costs.f.${f}`)}</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  className="h-7 w-full rounded-sm border border-input bg-background px-2 font-mono"
                  value={String(form[f])}
                  onChange={(e) => setForm({ ...form, [f]: e.target.value as unknown as number })}
                />
              </label>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">{t("costs.hint")}</p>
            <button
              type="submit"
              disabled={save.isPending}
              className="h-7 rounded-sm bg-primary px-3 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              {t("costs.save")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
