import { ChevronRight, Trophy } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useOutrights, type OutrightRow } from "@/lib/feed/queries";

type Props = { tournamentIds: string[] };

/** Collapsible column with provider outright markets next to the match grid. */
export function OutrightsPanel({ tournamentIds }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(() => localStorage.getItem("fp.outrightsOpen") !== "0");
  const { data = [], isLoading } = useOutrights();
  const rows = (tournamentIds.length ? data.filter((o) => tournamentIds.includes(o.tournament_id)) : data).slice(0, 60);

  const toggle = () => {
    localStorage.setItem("fp.outrightsOpen", open ? "0" : "1");
    setOpen(!open);
  };

  if (!open)
    return (
      <button
        type="button"
        onClick={toggle}
        className="flex w-7 shrink-0 flex-col items-center gap-2 border-l border-border bg-subbar py-2 text-[10px] font-bold uppercase text-muted-foreground hover:text-foreground"
        aria-label={t("outrights.show")}
      >
        <Trophy className="h-3.5 w-3.5" />
        <span className="[writing-mode:vertical-rl]">{t("outrights.title")} ({data.length})</span>
      </button>
    );

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-border bg-panel" data-testid="outrights-panel">
      <div className="flex items-center gap-2 border-b border-border bg-subbar px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        <Trophy className="h-3.5 w-3.5" />
        {t("outrights.title")} ({rows.length})
        <button type="button" onClick={toggle} className="ml-auto hover:text-foreground" aria-label={t("outrights.hide")}>
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="panel-scroll min-h-0 flex-1 overflow-auto">
        {isLoading && <p className="p-3 text-[11px] text-muted-foreground">{t("outrights.loading")}</p>}
        {!isLoading && !rows.length && <p className="p-3 text-[11px] text-muted-foreground">{t("outrights.empty")}</p>}
        {rows.map((o) => (
          <OutrightCard key={o.id} o={o} />
        ))}
      </div>
    </aside>
  );
}

function OutrightCard({ o }: { o: OutrightRow }) {
  const comps = (Array.isArray(o.competitors) ? o.competitors : []).slice(0, 5);
  return (
    <div className="border-b border-border px-2 py-1.5 text-[11px]">
      <div className="flex items-center gap-1">
        <span className="truncate font-semibold" title={o.name}>{o.name}</span>
        {o.suspended && <span className="ml-auto shrink-0 rounded bg-danger/15 px-1 text-[9px] font-bold uppercase text-danger">Susp</span>}
      </div>
      <ul className="mt-1 space-y-0.5">
        {comps.map((c, i) => (
          <li key={c.id ?? i} className="flex justify-between gap-2">
            <span className="truncate text-muted-foreground">{c.name}</span>
            <span className="font-mono">{typeof c.odds === "number" ? c.odds.toFixed(2) : "—"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
