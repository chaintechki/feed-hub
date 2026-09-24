import { CalendarDays, Clock, MessageSquare, MoreVertical, Radio, Scale, Star } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { AlertScoreDialog, CommentsDialog, H2HDialog, regenerateAlerts } from "@/components/monitoring/MatchDialogs";
import { useComparisons } from "@/lib/feed/bookmakers";
import { heatKey, heatStyle, type Heat } from "@/lib/feed/heat";
import type { Comparison } from "@/lib/feed/normalize";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatOdds, useOddsFormat } from "@/hooks/useOddsFormat";
import type { MatchRow, OddsRow } from "@/lib/feed/types";
import { cn } from "@/lib/utils";
import { friendlyError } from "@/lib/errors";

export function OddsCell({
  outcome,
  tone,
  heat,
  suspended,
}: {
  outcome: { label: string; odds: number | null } | undefined;
  tone: "a" | "b" | "neutral";
  heat?: Heat | undefined;
  suspended?: boolean | undefined;
}) {
  const { format } = useOddsFormat();
  if (!outcome) return <div className="grid-cell bg-odds-neutral text-muted-foreground">—</div>;
  const style = tone === "neutral" ? undefined : heatStyle(heat, !!suspended);
  return (
    <div
      style={style}
      title={heat ? `${heat.dir === "heat" ? "▲" : "▼"} ${new Date(heat.at).toLocaleTimeString()}` : undefined}
      className={cn(
        "grid-cell relative",
        !style && tone !== "neutral" && "bg-odds-neutral",
        tone === "neutral" && "bg-odds-neutral text-muted-foreground font-medium italic",
        suspended && "text-muted-foreground",
      )}
    >
      {tone === "neutral" ? outcome.label : formatOdds(outcome.odds, format)}
    </div>
  );
}

function MarketCells({ row, market, heat, matchId }: { row: OddsRow | undefined; market: "1x2" | "total" | "handicap"; heat: Record<string, Heat>; matchId: string }) {
  const o = row?.outcomes ?? [];
  const h = (i: number) => (row && o[i] && row.source === "own" ? heat[heatKey(matchId, row.market, row.specifier, o[i]!.label)] : undefined);
  const sus = row?.suspended;
  const isTwoWay = o.length === 2;
  const cells = isTwoWay ? [o[0], undefined, o[1]] : [o[0], o[1], o[2]];
  const heatIndexes = isTwoWay ? [0, -1, 1] : [0, 1, 2];
  return (
    <>
      <OddsCell outcome={cells[0]} tone="a" heat={heatIndexes[0] >= 0 ? h(heatIndexes[0]) : undefined} suspended={sus} />
      <OddsCell outcome={cells[1]} tone="a" heat={heatIndexes[1] >= 0 ? h(heatIndexes[1]) : undefined} suspended={sus} />
      <OddsCell outcome={cells[2]} tone="b" heat={heatIndexes[2] >= 0 ? h(heatIndexes[2]) : undefined} suspended={sus} />
    </>
  );
}

/** Headline line = most balanced one (smallest gap between first and last outcome). */
function mainLine(rows: OddsRow[]) {
  const usable = rows.filter((row) => row.outcomes.some((outcome) => typeof outcome.odds === "number" && Number.isFinite(outcome.odds)));
  const gap = (r: OddsRow) => Math.abs((r.outcomes[0]?.odds ?? 99) - (r.outcomes[r.outcomes.length - 1]?.odds ?? 0));
  return [...usable].sort((a, b) => gap(a) - gap(b))[0];
}

export function StrengthBar({ value }: { value: number }) {
  return (
    <span className="absolute inset-x-2 bottom-[1px] h-[2px] rounded-full bg-muted" title={`Strength ${Math.round(value * 100)}%`}>
      <span
        className={cn("block h-full rounded-full", value >= 0.66 ? "bg-success" : value >= 0.33 ? "bg-warning" : "bg-danger")}
        style={{ width: `${Math.max(8, value * 100)}%` }}
      />
    </span>
  );
}

/** Average row: replace provider average with the normalised bookmaker-list average when available. */
function withNorm(row: OddsRow | undefined, cmp: Comparison | undefined): OddsRow | undefined {
  if (!row || !cmp) return row;
  let k = 0;
  return { ...row, outcomes: row.outcomes.map((o) => (o.odds == null ? o : { ...o, odds: cmp.avg[k++] ?? o.odds })) };
}

function Margin({ value }: { value: number | null }) {
  return (
    <div className="flex h-[22px] items-center justify-center text-[10px] text-muted-foreground">
      {value == null ? "" : value.toFixed(0)}
    </div>
  );
}

function BookChip({ match }: { match: MatchRow }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const booked = match.booked || match.liveodds === "booked";
  const bookable = !booked && match.liveodds === "bookable";
  const book = async () => {
    if (!bookable || busy) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("uof-book", { body: { matchId: match.id } });
    setBusy(false);
    if (error || !data?.ok) {
      toast.error(t("grid.bookFailed"));
      return;
    }
    toast.success(t("grid.booked"));
    void qc.invalidateQueries({ queryKey: ["matches"] });
  };
  return (
    <button
      type="button"
      onClick={() => void book()}
      disabled={!bookable || busy}
      title={booked ? t("grid.bookedHint") : bookable ? t("grid.bookHint") : t("grid.notBookable")}
      className={cn(
        "flex h-[18px] min-w-[22px] items-center justify-center rounded-sm border px-1 text-[9px] font-bold",
        booked
          ? "border-success bg-success text-success-foreground"
          : bookable
            ? "border-primary text-primary hover:bg-primary hover:text-primary-foreground"
            : "cursor-not-allowed border-border bg-muted text-muted-foreground opacity-50",
        busy && "animate-pulse",
      )}
    >
      BR
    </button>
  );
}

function ActionChip({ label, active }: { label: string; active?: boolean }) {
  return (
    <span
      className={cn(
        "flex h-[18px] min-w-[22px] items-center justify-center rounded-sm border px-1 text-[9px] font-bold",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

export function MatchGrid({
  matches,
  isLoading,
  isError,
  onToggleSuspend,
  onToggleHotlist,
}: {
  matches: MatchRow[];
  isLoading?: boolean;
  isError?: boolean;
  onToggleSuspend?: (match: MatchRow) => void;
  onToggleHotlist?: (match: MatchRow) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [alertFor, setAlertFor] = useState<MatchRow | null>(null);
  const [commentsFor, setCommentsFor] = useState<MatchRow | null>(null);
  const [h2hFor, setH2hFor] = useState<MatchRow | null>(null);
  const cmps = useComparisons(matches);
  const open = (m: MatchRow) => navigate(`/monitoring/match/${encodeURIComponent(m.id)}`);

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; rows: MatchRow[] }>();
    for (const m of matches) {
      const key = m.tournamentId;
      const label = `${m.sportName} / ${m.categoryName} / ${m.tournamentName}`.toUpperCase();
      if (!map.has(key)) map.set(key, { label, rows: [] });
      map.get(key)!.rows.push(m);
    }
    return [...map.values()];
  }, [matches]);

  return (
    <div className="panel-scroll min-h-0 flex-1 overflow-auto bg-panel">
      <div className="min-w-[1180px]">
        {/* column header */}
        <div className="sticky top-0 z-10 grid grid-cols-[420px_180px_1fr_1fr_1fr] border-b border-border bg-panel-header text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          <div className="border-r border-border px-2 py-1.5">Match</div>
          <div className="border-r border-border px-2 py-1.5 text-center">{t("grid.odds")}</div>
          <div className="border-r border-border px-2 py-1.5 text-center">{t("grid.market1x2")}</div>
          <div className="border-r border-border px-2 py-1.5 text-center">{t("grid.total")}</div>
          <div className="px-2 py-1.5 text-center">{t("grid.handicap")}</div>
        </div>

        {isLoading ? (
          <p className="p-4 text-[11px] text-muted-foreground">{t("common.loading")}</p>
        ) : null}
        {!isLoading && isError ? (
          <p className="p-4 text-[11px] text-danger">{t("common.loadError")}</p>
        ) : null}
        {!isLoading && !isError && !matches.length ? (
          <p className="p-4 text-[11px] text-muted-foreground">{t("grid.noMatches")}</p>
        ) : null}

        {groups.map((group) => (
          <Fragment key={group.label}>
            <div className="border-y border-border bg-panel-header px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-foreground">
              {group.label}
            </div>

            {group.rows.map((m) => {
              const own = (market: OddsRow["market"]) => mainLine(m.odds.filter((o) => o.source === "own" && o.market === market));
              const avg = (market: OddsRow["market"]) => {
                const o = own(market);
                return m.odds.find((x) => x.source === "average" && x.market === market && x.specifier === (o?.specifier ?? x.specifier));
              };
              const date = new Date(m.scheduled);

              return (
                <div
                  key={m.id}
                  className="grid grid-cols-[420px_180px_1fr_1fr_1fr] border-b border-border hover:bg-row-hover"
                >
                  {/* match cell spanning both odds rows */}
                  <div className="relative flex flex-col justify-between border-r border-border bg-row px-2 py-1">
                    <div className="flex items-center gap-2">
                      <button onClick={() => onToggleHotlist?.(m)}>
                        <Star
                          className={cn(
                            "h-3.5 w-3.5",
                            m.hotlisted ? "fill-warning text-warning" : "text-border",
                          )}
                        />
                      </button>
                      <button onClick={() => open(m)} className="w-[120px] truncate text-left text-[11px] font-semibold hover:text-primary hover:underline">{m.homeTeam}</button>
                      <span className="flex flex-col items-center text-[10px] leading-tight text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {date.toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "2-digit",
                          })}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-foreground">
                          <Clock className="h-3 w-3" />
                          {date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </span>
                      <Radio
                        className={cn(
                          "h-3.5 w-3.5",
                          m.liveodds === "booked" ? "text-live" : "text-border",
                        )}
                      />
                      <button onClick={() => open(m)} className="w-[120px] truncate text-right text-[11px] font-semibold hover:text-primary hover:underline">
                        {m.awayTeam}
                      </button>
                    </div>

                    <div className="mt-1 flex items-center gap-2">
                      <span className="flex h-[17px] min-w-[22px] items-center justify-center rounded-sm bg-muted px-1 text-[10px] font-bold">
                        {m.matchMinute ?? "—"}
                      </span>
                      <button
                        onClick={() => setAlertFor(m)}
                        title={t("mu.alertScore")}
                        className={cn(
                          "flex h-[17px] min-w-[26px] items-center justify-center rounded-sm px-1 text-[10px] font-bold",
                          m.alertScore >= 60 ? "bg-danger text-danger-foreground" : m.alertScore > 0 ? "bg-warning text-warning-foreground" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {m.alertScore}
                      </button>
                      <button onClick={() => setCommentsFor(m)} className="flex items-center gap-1 text-[10px] text-primary hover:underline">
                        <MessageSquare className="h-3 w-3" />
                        {m.commentCount}/{m.logCount}
                      </button>
                      {m.marginSkewed && (
                        <span title={t("mu.marginSkewed")} className="flex items-center text-warning">
                          <Scale className="h-3.5 w-3.5" />
                        </span>
                      )}
                      <button
                        onClick={() => onToggleSuspend?.(m)}
                        className={cn(
                          "ml-auto h-[18px] rounded-sm px-2 text-[9px] font-bold uppercase",
                          m.suspended
                            ? "bg-danger text-danger-foreground"
                            : "bg-muted text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {t("grid.suspend")}
                      </button>
                      <BookChip match={m} />
                      <ActionChip label="SA" active={m.controlMode === "semi_auto"} />
                      <ActionChip label="M" active={m.controlMode === "manual"} />
                      <DropdownMenu>
                        <DropdownMenuTrigger>
                          <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => open(m)}>{t("mu.open")}</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setH2hFor(m)}>{t("mu.h2h")}</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/settlements?match=${encodeURIComponent(m.id)}`)}>{t("nav.settlements")}</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/archive?match=${encodeURIComponent(m.id)}`)}>{t("nav.archive")}</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => void navigator.clipboard.writeText(m.id).then(() => toast.success(t("mu.copied")))}>{t("mu.copyId")}</DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              regenerateAlerts(m)
                                .then((score) => {
                                  toast.success(`${t("mu.regenerated")}: ${score}`);
                                  void qc.invalidateQueries({ queryKey: ["matches"] });
                                })
                                .catch((e: Error) => toast.error(friendlyError(e)))
                            }
                          >
                            {t("mu.regenerate")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* own / average labels */}
                  <div className="grid grid-rows-2 border-r border-border">
                    <div className="flex items-center border-b border-border px-2 text-[11px] font-semibold">
                      {t("grid.own")}
                    </div>
                    <div className="flex items-center px-2 text-[11px] font-semibold">
                      {t("grid.average")}
                    </div>
                  </div>

                  {(["1x2", "total", "handicap"] as const).map((market, index) => (
                    <div
                      key={market}
                      className={cn("grid grid-rows-2", index < 2 && "border-r border-border")}
                    >
                      <div className="grid grid-cols-[1fr_1fr_1fr_36px] items-center gap-1 border-b border-border px-2">
                        <MarketCells row={own(market)} market={market} heat={m.heat} matchId={m.id} />
                        <Margin value={own(market)?.margin ?? null} />
                      </div>
                      {(() => {
                        const o = own(market);
                        const c = o ? cmps.get(`${m.id}|${o.market}|${o.specifier ?? ""}`) : undefined;
                        return (
                          <div className="relative grid grid-cols-[1fr_1fr_1fr_36px] items-center gap-1 px-2">
                            <MarketCells row={withNorm(avg(market), c)} market={market} heat={m.heat} matchId={m.id} />
                            <Margin value={c ? o?.margin ?? null : avg(market)?.margin ?? null} />
                            {c && <StrengthBar value={c.strength} />}
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
      <AlertScoreDialog match={alertFor} onClose={() => setAlertFor(null)} />
      <CommentsDialog match={commentsFor} onClose={() => setCommentsFor(null)} />
      <H2HDialog match={h2hFor} onClose={() => setH2hFor(null)} />
    </div>
  );
}
