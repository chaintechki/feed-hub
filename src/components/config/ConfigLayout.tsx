import { useTranslation } from "react-i18next";
import { NavLink, Outlet } from "react-router-dom";

import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";

const TABS = [
  { to: "/configuration", key: "general", end: true },
  { to: "/configuration/tournaments", key: "tournaments" },
  { to: "/configuration/templates", key: "templates" },
  { to: "/configuration/ladders", key: "ladders" },
  { to: "/configuration/bookmakers", key: "bookmakers" },
  { to: "/configuration/feed-options", key: "feedOptions" },
  { to: "/configuration/outrights", key: "outrights" },
  { to: "/configuration/operations", key: "operations", admin: true },
  { to: "/configuration/payments", key: "payments", superOnly: true },
] as const;

export function ConfigLayout() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const isSuper = roles.includes("super_admin");
  const isAdmin = isSuper || roles.includes("admin");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-stretch border-b border-border bg-subbar">
        {TABS.filter((tab) => ("superOnly" in tab ? isSuper : !("admin" in tab) || isAdmin)).map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={"end" in tab}
            className={({ isActive }) =>
              cn(
                "flex h-9 items-center px-3 text-[12px] font-semibold transition-colors",
                isActive ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground",
              )
            }
          >
            {t(`cfg.tab.${tab.key}`)}
          </NavLink>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}
