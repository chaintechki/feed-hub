import { CalendarDays, Clock, MessageSquare, MoreVertical, Radio, Star } from "lucide-react";
import { Fragment, useMemo } from "react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatOdds, useOddsFormat } from "@/hooks/useOddsFormat";
import type { MatchRow, OddsRow } from "@/lib/feed/types";
import { cn } from "@/lib/utils";

function OddsCell({
  outcome,
  tone,
}: {
  outcome: { label: string; odds: number | null; trend?: "up" | "down" | null } | undefined;
  tone: "a" | "b" | "neutral";
}) {
  const { format } = useOddsFormat();
  if (!outcome) return <div className="grid-cell bg-odds-neutral text-muted-foreground">—</div>;
  return (
    <div
      className={cn(
        "grid-cell relative",
        tone === "a" && "bg-odds-a",
        tone === "b" && "bg-odds-b",
        tone === "neutral" && "bg-odds-neutral text-muted-foreground font-medium italic",
      )}
    >
      {tone === "neutral" ? outcome.label : formatOdds(outcome.odds, format)}
      {outcome.trend ? (
        <span
          className={cn(
            "absolute inset-x-1 bottom-0 h-[2px] rounded-full",
            outcome.trend === "up" ? "bg-odds-up" : "bg-odds-down",
          )}
        />
      ) : null}
    </div>
  );
}

function MarketCells({ row, market }: { row: OddsRow | undefined; market: "1x2" | "total" | "handicap" }) {
  const o = row?.outcomes ?? [];
  if (market === "1x2") {
    return (
      <>
        <OddsCell outcome={o[0]} tone="a" />
        <OddsCell outcome={o[1]} tone="a" />
        <OddsCell outcome={o[2]} tone="b" />
      </>
    );
  }
  return (
    <>
      <OddsCell outcome={o[0]} tone="a" />
      <OddsCell outcome={o[1]} tone="neutral" />
      <OddsCell outcome={o[2]} tone="b" />
    </>
  );
}

function Margin({ value }: { value: number | null }) {
  return (
    <div className="flex h-[22px] items-center justify-center text-[10px] text-muted-foreground">
      {value == null ? "" : value.toFixed(0)}
    </div>
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
  onToggleSuspend,
  onToggleHotlist,
}: {
  matches: MatchRow[];
  isLoading?: boolean;
  onToggleSuspend?: (match: MatchRow) => void;
  onToggleHotlist?: (match: MatchRow) => void;
}) {
  const { t } = useTranslation();

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
        {!isLoading && !matches.length ? (
          <p className="p-4 text-[11px] text-muted-foreground">{t("grid.noMatches")}</p>
        ) : null}

        {groups.map((group) => (
          <Fragment key={group.label}>
            <div className="border-y border-border bg-panel-header px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-foreground">
              {group.label}
            </div>

            {group.rows.map((m) => {
              const own = (market: OddsRow["market"]) =>
                m.odds.find((o) => o.source === "own" && o.market === market);
              const avg = (market: OddsRow["market"]) =>
                m.odds.find((o) => o.source === "average" && o.market === market);
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
                      <span className="w-[120px] truncate text-[11px] font-semibold">{m.homeTeam}</span>
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
                      <span className="w-[120px] truncate text-right text-[11px] font-semibold">
                        {m.awayTeam}
                      </span>
                    </div>

                    <div className="mt-1 flex items-center gap-2">
                      <span className="flex h-[17px] min-w-[22px] items-center justify-center rounded-sm bg-muted px-1 text-[10px] font-bold">
                        {m.matchMinute ?? "—"}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <MessageSquare className="h-3 w-3" />
                        {m.commentCount}/0
                      </span>
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
                      <ActionChip label="BR" active={m.booked} />
                      <ActionChip label="SA" active={m.controlMode === "semi_auto"} />
                      <ActionChip label="M" active={m.controlMode === "manual"} />
                      <DropdownMenu>
                        <DropdownMenuTrigger>
                          <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>Open match details</DropdownMenuItem>
                          <DropdownMenuItem>Add comment</DropdownMenuItem>
                          <DropdownMenuItem>Copy match id</DropdownMenuItem>
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
                        <MarketCells row={own(market)} market={market} />
                        <Margin value={own(market)?.margin ?? null} />
                      </div>
                      <div className="grid grid-cols-[1fr_1fr_1fr_36px] items-center gap-1 px-2">
                        <MarketCells row={avg(market)} market={market} />
                        <Margin value={avg(market)?.margin ?? null} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
