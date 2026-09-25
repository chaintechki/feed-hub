import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { ActiveChip } from "@/lib/feed/filters";

export function ActiveFilterChips({
  chips,
  onRemove,
  onClearAll,
}: {
  chips: ActiveChip[];
  onRemove: (chip: ActiveChip) => void;
  onClearAll: () => void;
}) {
  const { t } = useTranslation();
  if (!chips.length) return null;

  const label = (c: ActiveChip) => {
    if (c.kind === "flag") return t(`filters.${c.key}`);
    if (c.kind === "term") return `${t("activeFilters.search")}: „${c.value}“`;
    if (c.kind === "tab") return `${t("activeFilters.tab")}: ${c.name}`;
    return c.name;
  };

  return (
    <div data-testid="active-filters" className="flex flex-wrap items-center gap-1 border-b border-border bg-panel px-2 py-1">
      <span className="mr-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t("activeFilters.label")}</span>
      {chips.map((c) => {
        const text = label(c);
        return (
          <span
            key={`${c.kind}-${"key" in c ? c.key : "id" in c ? c.id : c.value}`}
            data-testid="active-filter-chip"
            className="inline-flex h-5 items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 pl-2 pr-1 text-[10px] font-semibold text-foreground"
          >
            {text}
            <button
              type="button"
              aria-label={`${t("activeFilters.remove")}: ${text}`}
              onClick={() => onRemove(c)}
              className="rounded-sm p-0.5 text-muted-foreground hover:bg-primary/20 hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        );
      })}
      <button type="button" onClick={onClearAll} className="ml-1 text-[10px] font-semibold uppercase text-primary hover:underline">
        {t("activeFilters.clearAll")}
      </button>
    </div>
  );
}
