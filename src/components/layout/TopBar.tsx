import { motion } from "framer-motion";
import { Bell, ChevronDown, CircleHelp, LifeBuoy, Newspaper, Settings2, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Logo } from "@/components/brand/Logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setLanguage } from "@/i18n";
import { useAuth } from "@/providers/AuthProvider";

function TopItem({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex cursor-pointer items-center gap-1.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-topbar-foreground/80 transition-colors hover:text-topbar-foreground">
      {children}
    </span>
  );
}

export function TopBar() {
  const { t } = useTranslation();
  const { user, roles, signOut } = useAuth();

  return (
    <header className="flex h-11 shrink-0 items-center bg-topbar text-topbar-foreground">
      <Link to="/monitoring/matches" className="flex h-full w-[190px] items-center pl-4">
        <Logo className="h-5" />
      </Link>

      <div className="flex h-7 w-40 items-center justify-between rounded-sm border border-white/20 px-2 text-[11px] font-semibold uppercase">
        CTRL
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </div>

      <div className="ml-auto flex items-center">
        <span className="flex items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-wide">
          <motion.span
            className="h-2 w-2 rounded-full bg-success"
            animate={{ opacity: [1, 0.35, 1] }}
            transition={{ duration: 2.4, repeat: Infinity }}
          />
          {t("nav.operational")}
        </span>
        <TopItem>
          <LifeBuoy className="h-3.5 w-3.5" /> {t("nav.supportPortal")}
        </TopItem>
        <TopItem>
          <Newspaper className="h-3.5 w-3.5" /> {t("nav.news")} <ChevronDown className="h-3 w-3" />
        </TopItem>
        <TopItem>
          <CircleHelp className="h-3.5 w-3.5" /> {t("nav.help")} <ChevronDown className="h-3 w-3" />
        </TopItem>
        <Link to="/configuration">
          <TopItem>
            <Settings2 className="h-3.5 w-3.5" /> {t("nav.configuration")}
            <ChevronDown className="h-3 w-3" />
          </TopItem>
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-11 items-center gap-1.5 px-4 text-[11px] font-semibold uppercase tracking-wide text-topbar-foreground/90 hover:bg-white/5">
              <User className="h-3.5 w-3.5" />
              {user?.email?.split("@")[0] ?? "operator"}
              <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
              {user?.email?.split("@")[0]}
              <div className="mt-1 uppercase tracking-wide">{roles.join(", ") || "viewer"}</div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/settings">{t("nav.userSettings")}</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLanguage("en")}>English</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLanguage("de")}>Deutsch</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void signOut()}>{t("nav.signOut")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="flex items-center px-3">
          <Bell className="h-4 w-4 opacity-80" />
        </span>
      </div>
    </header>
  );
}
