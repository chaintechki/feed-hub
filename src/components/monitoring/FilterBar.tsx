import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { MONITOR_FILTER_KEYS, type MonitorFilterKey, type MonitorFilters } from "@/lib/feed/types";
import { cn } from "@/lib/utils";

export function FilterBar({
  filters,
  onChange,
  term,
  onTermChange,
}: {
  filters: MonitorFilters;
  onChange: (next: MonitorFilters) => void;
  term: string;
  onTermChange: (next: string) => void;
}) {
  const { t } = useTranslation();

  const toggle = (key: MonitorFilterKey) => onChange({ ...filters, [key]: !filters[key] });

  return (
    <div className="flex items-start gap-2 border-b border-border bg-subbar px-2 py-1.5">
      <div className="flex flex-1 flex-wrap gap-1">
        {MONITOR_FILTER_KEYS.map((key) => (
          <button
            key={key}
            onClick={() => toggle(key)}
            className={cn(
              "h-6 rounded-sm border px-2 text-[10px] font-bold uppercase tracking-wide transition-colors",
              filters[key]
                ? "border-success bg-success text-success-foreground"
                : "border-border bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`filters.${key}`)}
          </button>
        ))}
      </div>
      <div className="relative w-64 shrink-0">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={term}
          onChange={(e) => onTermChange(e.target.value)}
          placeholder={t("filters.find")}
          className="h-7 w-full rounded-sm border border-input bg-background pl-7 pr-2 text-[11px] outline-none focus:border-ring"
        />
      </div>
    </div>
  );
}
