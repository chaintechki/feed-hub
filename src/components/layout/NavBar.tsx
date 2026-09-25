import { ChevronDown, SlidersHorizontal, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router-dom";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOddsFormat } from "@/hooks/useOddsFormat";
import { cn } from "@/lib/utils";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex h-11 items-center px-5 text-[12px] font-semibold uppercase tracking-wide transition-colors",
    isActive
      ? "bg-white/10 text-navbar-active shadow-[inset_0_-3px_0_0_hsl(var(--navbar-active))]"
      : "text-navbar-foreground hover:text-navbar-active",
  );

export function NavBar() {
  const { t } = useTranslation();
  const location = useLocation();
  const { format, setFormat, formats } = useOddsFormat();
  const tradingActive = location.pathname.startsWith("/trading-tools");

  return (
    <nav className="flex h-11 shrink-0 items-center bg-navbar">
      <NavLink to="/monitoring/matches" className={linkClass}>
        {t("nav.monitoring")}
      </NavLink>
      <NavLink to="/monitoring/assistant" className={(p) => cn(linkClass(p), "gap-1.5")}>
        <Sparkles className="h-3.5 w-3.5" />
        {t("nav.monitorAssistant")}
      </NavLink>
      <NavLink to="/alerts" className={linkClass}>
        {t("nav.alerts")}
      </NavLink>
      <NavLink to="/archive" className={linkClass}>
        {t("nav.archive")}
      </NavLink>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={linkClass({ isActive: tradingActive })}>
            {t("nav.tradingTools")}
            <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuItem asChild>
            <NavLink to="/trading-tools/margins">Margins</NavLink>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <NavLink to="/trading-tools/limits">Limits</NavLink>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <NavLink to="/trading-tools/bulk">Bulk actions</NavLink>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <NavLink to="/trading-tools/templates">Templates</NavLink>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <NavLink to="/settlements" className={linkClass}>
        {t("nav.settlements")}
      </NavLink>

      <div className="ml-auto flex items-center gap-3 pr-3">
        <NavLink
          to="/settings"
          className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-navbar-foreground hover:text-navbar-active"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {t("nav.userSettings")}
        </NavLink>
        <span className="text-[11px] text-navbar-foreground">{t("nav.oddsFormat")}:</span>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as typeof format)}
          className="h-7 w-24 rounded-sm border border-white/25 bg-transparent px-2 text-[11px] font-semibold uppercase text-navbar-active outline-none"
        >
          {formats.map((f) => (
            <option key={f} value={f} className="text-foreground">
              {f}
            </option>
          ))}
        </select>
      </div>
    </nav>
  );
}
