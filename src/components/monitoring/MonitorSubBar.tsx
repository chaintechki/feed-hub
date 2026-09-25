import { Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";

import type { LeagueTab } from "@/lib/feed/types";
import { cn } from "@/lib/utils";

export function MonitorSubBar({
  tabs,
  activeTab,
  onActivate,
  onClose,
  onAdd,
  hideTabs = false,
}: {
  tabs: LeagueTab[];
  activeTab: string | null;
  onActivate: (id: string | null) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
  hideTabs?: boolean;
}) {
  const { t } = useTranslation();

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex h-9 items-center px-3 text-[12px] font-semibold transition-colors",
      isActive
        ? "border-b-2 border-primary text-foreground"
        : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="flex h-9 shrink-0 items-stretch border-b border-border bg-subbar">
      <NavLink to="/monitoring/matches" className={linkClass}>
        {t("nav.monitorMatches")}
      </NavLink>
      <NavLink to="/monitoring/outrights" className={linkClass}>
        {t("nav.monitorOutrights")}
      </NavLink>
      <NavLink to="/monitoring/assistant" className={linkClass}>
        {t("nav.monitorAssistant")}
      </NavLink>

      {!hideTabs && <div className="ml-auto flex items-stretch">
        <button
          onClick={onAdd}
          className="flex w-8 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              "flex items-center gap-2 border-l border-border px-3 text-[11px]",
              activeTab === tab.id ? "bg-panel font-semibold text-foreground" : "text-muted-foreground",
            )}
          >
            <button onClick={() => onActivate(activeTab === tab.id ? null : tab.id)}>{tab.name}</button>
            <button onClick={() => onClose(tab.id)} className="hover:text-danger">
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>}
    </div>
  );
}
