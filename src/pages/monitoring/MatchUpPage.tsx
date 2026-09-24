import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";

import { logAction } from "@/components/monitoring/MatchDialogs";
import { OddsCell, StrengthBar } from "@/components/monitoring/MatchGrid";
import { useQuery } from "@tanstack/react-query";
import { compareMarket, fetchBookmakerOdds, useBookmakerLists, useBookmakers } from "@/lib/feed/bookmakers";
import { formatOdds, useOddsFormat } from "@/hooks/useOddsFormat";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { heatKey } from "@/lib/feed/heat";
import { useMatchUp } from "@/lib/feed/queries";
import type { OddsRow } from "@/lib/feed/types";
import { cn } from "@/lib/utils";
import { friendlyError } from "@/lib/errors";

const GROUPS = ["all", "main", "goals", "handicap", "halves", "score"] as const;
const MODES = ["auto", "semi_auto", "manual"] as const;
type QuickFilter = "alerted" | "semi_auto" | "manual";

export default function MatchUpPage() {
  const { id: raw } = useParams();
  const id = raw ? decodeURIComponent(raw) : undefined;
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading } = useMatchUp(id);
  const [group, setGroup] = useState<(typeof GROUPS)[number]>("all");
  const [quick, setQuick] = useState<QuickFilter[]>([]);
  const [term, setTerm] = useState("");
  const { format } = useOddsFormat();
  const lists = useBookmakerLists();
  const books = useBookmakers();
  const bmOdds = useQuery({ queryKey: ["bm-odds", [id]], enabled: !!id, queryFn: () => fetchBookmakerOdds([id!]) });

  const markets = useMemo(() => {
    const own = (data?.odds ?? []).filter((o) => o.source === "own");
    const q = term.trim().toLowerCase();
    return own.filter((o) => {
      if (group !== "all" && o.group !== group) return false;
      if (quick.includes("alerted") && !o.alerted) return false;
      if (quick.includes("semi_auto") && o.controlMode !== "semi_auto") return false;
      if (quick.includes("manual") && o.controlMode !== "manual") return false;
      if (q && !`${t(`mk.${o.market}`, o.market)} ${o.specifier ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, group, quick, term, t]);

  const patch = useMutation({
    mutationFn: async ({ row, change }: { row: OddsRow; change: { suspended?: boolean; control_mode?: string } }) => {
      let q = supabase.from("match_odds").update(change).eq("match_id", id!).eq("source", "own").eq("market", row.market);
      q = row.specifier == null ? q.is("specifier", null) : q.eq("specifier", row.specifier);
      const { error } = await q;
      if (error) throw error;
      await logAction(id!, "market_changed", { market: row.market, specifier: row.specifier, ...change });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["matchup", id] });
      void qc.invalidateQueries({ queryKey: ["matches"] });
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  const cmp = (own: OddsRow) => {
    const mm = data?.match as { sport_id: string; category_id: string; tournament_id: string } | null | undefined;
    if (!mm || !lists.data || !books.data || !bmOdds.data) return null;
    return compareMarket(own, id!, { sportId: mm.sport_id, categoryId: mm.category_id, tournamentId: mm.tournament_id }, lists.data, books.data, bmOdds.data);
  };

  if (isLoading) return <p className="p-4 text-[11px] text-muted-foreground">{t("common.loading")}</p>;
  const m = data?.match as
    | (Record<string, unknown> & { home_team: string; away_team: string; scheduled: string; status: string; tournaments?: { name: string }; categories?: { name: string }; sports?: { name: string } })
    | null;
  if (!m) return <p className="p-4 text-[11px] text-muted-foreground">{t("grid.noMatches")}</p>;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-panel">
      <div className="flex items-center gap-3 border-b border-border bg-panel-header px-3 py-2">
        <Link to="/monitoring/matches" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="text-[10px] uppercase text-muted-foreground">
          {m.sports?.name} / {m.categories?.name} / {m.tournaments?.name}
        </div>
        <div className="text-[13px] font-bold">
          {m.home_team} – {m.away_team}
        </div>
        <div className="text-[11px] text-muted-foreground">{new Date(m.scheduled).toLocaleString("en-GB")}</div>
        <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase">{m.status}</span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">{id}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
        {GROUPS.map((g) => (
          <button
            key={g}
            onClick={() => setGroup(g)}
            className={cn(
              "h-6 rounded-sm border px-2 text-[10px] font-bold uppercase",
              group === g ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`mu.group.${g}`)}
          </button>
        ))}
        <span className="mx-2 h-4 w-px bg-border" />
        {(["alerted", "semi_auto", "manual"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setQuick(quick.includes(f) ? quick.filter((x) => x !== f) : [...quick, f])}
            className={cn(
              "h-6 rounded-sm border px-2 text-[10px] font-bold uppercase",
              quick.includes(f) ? "border-success bg-success text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`mu.quick.${f}`)}
          </button>
        ))}
        <div className="relative ml-auto w-56">
          <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t("mu.searchMarket")} className="h-7 pl-7 text-[11px]" />
        </div>
      </div>

      <div className="panel-scroll min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[980px] text-[11px]">
          <thead className="sticky top-0 z-10 bg-panel-header text-[10px] uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 text-left">{t("mu.market")}</th>
              <th className="px-2 py-1.5 text-left">{t("grid.odds")}</th>
              <th className="px-2 py-1.5 text-left" colSpan={4}>{t("mu.outcomes")}</th>
              <th className="px-2 py-1.5 text-right">{t("mu.key")}</th>
              <th className="px-2 py-1.5 text-center">{t("mu.mode")}</th>
              <th className="px-2 py-1.5 text-center">{t("grid.suspend")}</th>
            </tr>
          </thead>
          <tbody>
            {markets.map((own) => {
              const avg = data!.odds.find((o) => o.source === "average" && o.market === own.market && o.specifier === own.specifier);
              const cells = (row: OddsRow | undefined, isOwn: boolean) =>
                Array.from({ length: 4 }, (_, i) => {
                  const oc = row?.outcomes[i];
                  return (
                    <td key={i} className="w-[110px] px-1 py-0.5">
                      {oc ? (
                        <div className="flex items-center gap-1">
                          <span className="w-8 truncate text-[10px] text-muted-foreground">{oc.label}</span>
                          <div className="flex-1">
                            <OddsCell
                              outcome={oc}
                              tone={oc.odds == null ? "neutral" : "a"}
                              heat={isOwn ? data!.heat[heatKey(id!, own.market, own.specifier, oc.label)] : undefined}
                              suspended={isOwn && own.suspended}
                            />
                          </div>
                        </div>
                      ) : null}
                    </td>
                  );
                });
              return [
                <tr key={own.market + own.specifier + "o"} className={cn("border-t border-border", own.alerted && "bg-row-alt")}>
                  <td rowSpan={2} className="border-r border-border px-3 py-1 font-semibold">
                    {t(`mk.${own.market}`, own.market)} {own.specifier}
                    {own.alerted && <span className="ml-2 rounded-sm bg-danger px-1 text-[9px] font-bold text-danger-foreground">ALERT</span>}
                  </td>
                  <td className="px-2 font-semibold">{t("grid.own")}</td>
                  {cells(own, true)}
                  <td className="px-2 text-right font-mono">{own.margin ?? "—"}</td>
                  <td rowSpan={2} className="px-2 text-center">
                    <div className="inline-flex overflow-hidden rounded-sm border border-border">
                      {MODES.map((md) => (
                        <button
                          key={md}
                          onClick={() => patch.mutate({ row: own, change: { control_mode: md } })}
                          className={cn(
                            "h-6 px-2 text-[9px] font-bold uppercase",
                            own.controlMode === md ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                          )}
                        >
                          {md === "auto" ? "A" : md === "semi_auto" ? "SA" : "M"}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td rowSpan={2} className="px-2 text-center">
                    <button
                      onClick={() => patch.mutate({ row: own, change: { suspended: !own.suspended } })}
                      className={cn(
                        "h-6 rounded-sm px-2 text-[9px] font-bold uppercase",
                        own.suspended ? "bg-danger text-danger-foreground" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {own.suspended ? t("mu.suspended") : t("mu.active")}
                    </button>
                  </td>
                </tr>,
                <tr key={own.market + own.specifier + "a"} className="border-b border-border">
                  <td className="px-2 text-muted-foreground">{t("grid.average")}</td>
                  {cells(avg, false)}
                  <td className="px-2 text-right font-mono text-muted-foreground">{avg?.margin ?? "—"}</td>
                </tr>,
                cmp(own) ? (
                  <tr key={own.market + own.specifier + "c"} className="border-b border-border bg-row-alt">
                    <td className="px-3 py-1 text-[10px] uppercase text-muted-foreground">{t("mu.comparison")}</td>
                    <td className="px-2 text-[10px] text-muted-foreground">{t("mu.normAvg")}</td>
                    {Array.from({ length: 4 }, (_, i) => {
                      const c = cmp(own)!;
                      return (
                        <td key={i} className="relative px-1 py-1 text-center font-mono text-[10px]">
                          {c.avg[i] != null && (
                            <>
                              <span className="text-muted-foreground">{formatOdds(c.min[i]!, format)}</span>{" "}
                              <b>{formatOdds(c.avg[i]!, format)}</b>{" "}
                              <span className="text-muted-foreground">{formatOdds(c.max[i]!, format)}</span>
                              <StrengthBar value={c.strength} />
                            </>
                          )}
                        </td>
                      );
                    })}
                    <td colSpan={3} className="px-2 py-1">
                      <div className="flex flex-wrap gap-1">
                        {cmp(own)!.books.map((b) => (
                          <span key={b.bookmakerId} title={`${t("cfg.weight")}: ${b.weight}`} className="rounded-sm border border-border bg-panel px-1.5 py-0.5 text-[10px]">
                            <b>{b.name}</b> <span className="text-muted-foreground">({b.key ?? "–"})</span> {b.odds.map((o) => formatOdds(o, format)).join(" / ")}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ) : null,
              ];
            })}
            {!markets.length && (
              <tr>
                <td colSpan={9} className="p-4 text-muted-foreground">{t("mu.noMarkets")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
