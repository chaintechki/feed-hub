import { motion } from "framer-motion";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation } from "react-router-dom";
import { toast } from "sonner";

import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";

export const USERNAME_DOMAIN = "feedpanel.local";
export const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@${USERNAME_DOMAIN}`;

export default function AuthPage() {
  const { t } = useTranslation();
  const { session, loading } = useAuth();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loading && session) {
    const from = (location.state as { from?: string } | null)?.from ?? "/monitoring/matches";
    return <Navigate to={from} replace />;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    if (error) toast.error(t("auth.invalid"));
    setBusy(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-topbar px-4">
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-sm rounded-md bg-card p-6 shadow-xl"
      >
        <Logo className="mb-6 h-6 text-foreground" />
        <h1 className="text-sm font-semibold text-foreground">{t("auth.title")}</h1>
        <p className="mb-5 text-[11px] text-muted-foreground">{t("auth.subtitle")}</p>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="username" className="text-[11px] uppercase tracking-wide">
              {t("auth.username")}
            </Label>
            <Input
              id="username"
              required
              autoComplete="username"
              autoCapitalize="none"
              pattern="[A-Za-z0-9._\-]{3,32}"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password" className="text-[11px] uppercase tracking-wide">
              {t("auth.password")}
            </Label>
            <Input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-9"
            />
          </div>
        </div>

        <Button type="submit" disabled={busy} className="mt-5 h-9 w-full text-xs uppercase">
          {t("auth.signIn")}
        </Button>
      </motion.form>
    </div>
  );
}
