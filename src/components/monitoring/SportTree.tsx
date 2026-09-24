import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useSportTree } from "@/lib/feed/queries";
import { cn } from "@/lib/utils";

export type TreeSelection = {
  sportIds: string[];
  categoryIds: string[];
  tournamentIds: string[];
};

const EMPTY: TreeSelection = { sportIds: [], categoryIds: [], tournamentIds: [] };

function Counter({ value, tone }: { value: number; tone: "alert" | "hot" }) {
  if (!value) return null;
  return (
    <span
      className={cn(
        "flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white",
        tone === "alert" ? "bg-danger" : "bg-warning",
      )}
    >
      {value}
    </span>
  );
}

export function SportTree({
  selection,
  onSelectionChange,
}: {
  selection: TreeSelection;
  onSelectionChange: (next: TreeSelection) => void;
}) {
  const { t } = useTranslation();
  const { data = [], isLoading } = useSportTree();
  const [mode, setMode] = useState<"active" | "full">("active");
  const [term, setTerm] = useState("");
  const [openSports, setOpenSports] = useState<string[]>([]);
  const [openCats, setOpenCats] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  const sports = useMemo(() => {
    const base = mode === "active" ? data.filter((s) => s.matchCount > 0) : data;
    if (!term.trim()) return base;
    const q = term.toLowerCase();
    return base
      .map((s) => ({
        ...s,
        categories: s.categories
          .map((c) => ({
            ...c,
            tournaments: c.tournaments.filter((tr) => tr.name.toLowerCase().includes(q)),
          }))
          .filter(
            (c) => c.name.toLowerCase().includes(q) || c.tournaments.length > 0,
          ),
      }))
      .filter((s) => s.name.toLowerCase().includes(q) || s.categories.length > 0);
  }, [data, mode, term]);

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  if (collapsed) {
    return (
      <div className="flex w-8 shrink-0 flex-col items-center border-r border-border bg-rail py-2">
        <button onClick={() => setCollapsed(false)} className="text-muted-foreground hover:text-foreground">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <aside className="flex w-[270px] shrink-0 flex-col border-r border-border bg-rail">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <div className="flex overflow-hidden rounded-sm border border-border">
          <button
            onClick={() => setMode("active")}
            className={cn(
              "px-2 py-1 text-[10px] font-bold uppercase tracking-wide",
              mode === "active" ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {t("tree.activeTree")}
          </button>
          <button
            onClick={() => setMode("full")}
            className={cn(
              "px-2 py-1 text-[10px] font-bold uppercase tracking-wide",
              mode === "full" ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {t("tree.fullTree")}
          </button>
        </div>
        <button
          onClick={() => onSelectionChange(EMPTY)}
          className="px-1 text-[10px] font-bold uppercase text-muted-foreground hover:text-foreground"
        >
          {t("tree.clear")}
        </button>
        <button
          onClick={() => setCollapsed(true)}
          className="ml-auto text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="relative border-b border-border px-2 py-1.5">
        <Search className="absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={t("tree.search")}
          className="h-7 w-full rounded-sm border border-input bg-background pl-7 pr-2 text-[11px] outline-none focus:border-ring"
        />
      </div>

      <div className="panel-scroll min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <p className="p-3 text-[11px] text-muted-foreground">{t("common.loading")}</p>
        ) : null}
        {sports.map((sport) => {
          const open = openSports.includes(sport.id);
          const selected = selection.sportIds.includes(sport.id);
          return (
            <div key={sport.id} className="border-b border-border/70">
              <div
                className={cn(
                  "flex h-[30px] items-center gap-1 px-2 text-[11px] font-semibold uppercase",
                  selected ? "bg-row-hover text-primary" : "hover:bg-row-hover",
                )}
              >
                <button
                  onClick={() => setOpenSports(toggle(openSports, sport.id))}
                  aria-label={`${sport.name} expandieren`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown
                    className={cn("h-3.5 w-3.5 shrink-0 transition-transform", !open && "-rotate-90")}
                  />
                </button>
                <button
                  onClick={() =>
                    onSelectionChange({ ...selection, sportIds: toggle(selection.sportIds, sport.id) })
                  }
                  className="flex flex-1 cursor-pointer items-center text-left"
                >
                  <span className="truncate">
                    {sport.name} ({sport.matchCount})
                  </span>
                </button>
                <Counter value={sport.alerts} tone="alert" />
                <Counter value={sport.hot} tone="hot" />
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() =>
                    onSelectionChange({ ...selection, sportIds: toggle(selection.sportIds, sport.id) })
                  }
                  className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
                />
              </div>

              <AnimatePresence initial={false}>
                {open ? (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.16 }}
                    className="overflow-hidden"
                  >
                    {sport.categories.map((cat) => {
                      const catOpen = openCats.includes(cat.id);
                      return (
                        <div key={cat.id}>
                          <div
                            className={cn(
                              "flex h-[28px] items-center gap-1 pl-4 pr-2 text-[11px]",
                              selection.categoryIds.includes(cat.id)
                                ? "bg-row-hover text-primary"
                                : "hover:bg-row-hover",
                            )}
                          >
                            <button
                              onClick={() => setOpenCats(toggle(openCats, cat.id))}
                              aria-label={`${cat.name} expandieren`}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <ChevronDown
                                className={cn("h-3 w-3 shrink-0 transition-transform", !catOpen && "-rotate-90")}
                              />
                            </button>
                            <button
                              onClick={() =>
                                onSelectionChange({
                                  ...selection,
                                  categoryIds: toggle(selection.categoryIds, cat.id),
                                })
                              }
                              className="flex flex-1 cursor-pointer items-center text-left uppercase"
                            >
                              <span className="truncate">
                                {cat.name} ({cat.matchCount})
                              </span>
                            </button>
                            <Counter value={cat.alerts} tone="alert" />
                            <input
                              type="checkbox"
                              checked={selection.categoryIds.includes(cat.id)}
                              onChange={() =>
                                onSelectionChange({
                                  ...selection,
                                  categoryIds: toggle(selection.categoryIds, cat.id),
                                })
                              }
                              className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
                            />
                          </div>
                          {catOpen
                            ? cat.tournaments.map((tour) => (
                                <div
                                  key={tour.id}
                                  className={cn(
                                    "flex h-[26px] items-center gap-1 pl-9 pr-2 text-[11px]",
                                    selection.tournamentIds.includes(tour.id)
                                      ? "bg-row-hover text-primary"
                                      : "hover:bg-row-hover",
                                  )}
                                >
                                  <button
                                    onClick={() =>
                                      onSelectionChange({
                                        ...selection,
                                        tournamentIds: toggle(selection.tournamentIds, tour.id),
                                      })
                                    }
                                    className="flex flex-1 cursor-pointer items-center text-left"
                                  >
                                    <span className="truncate">
                                      {tour.name} ({tour.matchCount})
                                    </span>
                                  </button>
                                  <Counter value={tour.alerts} tone="alert" />
                                  <input
                                    type="checkbox"
                                    checked={selection.tournamentIds.includes(tour.id)}
                                    onChange={() =>
                                      onSelectionChange({
                                        ...selection,
                                        tournamentIds: toggle(selection.tournamentIds, tour.id),
                                      })
                                    }
                                    className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
                                  />
                                </div>
                              ))
                            : null}
                        </div>
                      );
                    })}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
