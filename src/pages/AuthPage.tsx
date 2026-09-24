import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation } from "react-router-dom";
import { toast } from "sonner";

import { MathCaptcha } from "@/components/auth/MathCaptcha";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { USERNAME_DOMAIN } from "../../supabase/functions/_shared/auth-core.ts";

export { USERNAME_DOMAIN };
export const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@${USERNAME_DOMAIN}`;

async function errorOf(error: unknown): Promise<{ error?: string; retry_after?: number }> {
  try {
    const ctx = (error as { context?: Response }).context;
    return ctx ? await ctx.json() : {};
  } catch {
    return {};
  }
}

export default function AuthPage() {
  const { t } = useTranslation();
  const { session, loading } = useAuth();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [answer, setAnswer] = useState("");
  const [captcha, setCaptcha] = useState<{ question: string; token: string } | null>(null);
  const [capLoading, setCapLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadCaptcha = useCallback(async () => {
    setCapLoading(true);
    setAnswer("");
    const { data, error } = await supabase.functions.invoke("auth-login/captcha", { method: "GET" });
    if (!error && data?.token) setCaptcha(data);
    else toast.error(t("auth.captchaLoadFailed"));
    setCapLoading(false);
  }, [t]);

  useEffect(() => {
    void loadCaptcha();
  }, [loadCaptcha]);

  if (!loading && session) {
    const from = (location.state as { from?: string } | null)?.from ?? "/monitoring/matches";
    return <Navigate to={from} replace />;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!captcha) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("auth-login/login", {
      body: { username: username.trim().toLowerCase(), password, token: captcha.token, answer },
    });
    if (error || !data?.access_token) {
      const j = await errorOf(error);
      if (j.error === "locked") toast.error(t("auth.locked", { min: Math.ceil((j.retry_after ?? 900) / 60) }));
      else if (j.error?.startsWith("captcha_")) toast.error(t("auth.captchaWrong"));
      else toast.error(t("auth.invalid"));
      setBusy(false);
      void loadCaptcha();
      return;
    }
    const { error: sErr } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });
    if (sErr) {
      toast.error(t("auth.invalid"));
      void loadCaptcha();
    }
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
            <PasswordInput
              id="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-9"
            />
          </div>
          <MathCaptcha
            question={captcha?.question ?? null}
            loading={capLoading}
            value={answer}
            onChange={setAnswer}
            onRefresh={() => void loadCaptcha()}
          />
        </div>

        <Button type="submit" disabled={busy || !captcha} className="mt-5 h-9 w-full text-xs uppercase">
          {t("auth.signIn")}
        </Button>
      </motion.form>
    </div>
  );
}
