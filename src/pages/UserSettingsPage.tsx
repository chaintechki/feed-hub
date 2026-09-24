import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useOddsFormat, type OddsFormat } from "@/hooks/useOddsFormat";
import { useAuth } from "@/providers/AuthProvider";
import { friendlyError } from "@/lib/errors";

type Settings = { odds_format: string; language: string; theme: string };

export default function UserSettingsPage() {
  const { user, roles } = useAuth();
  const { i18n } = useTranslation();
  const { format, setFormat } = useOddsFormat();
  const queryClient = useQueryClient();
  const [theme, setTheme] = useState<string>(
    () => localStorage.getItem("fp.theme") ?? "light",
  );

  const { data } = useQuery({
    queryKey: ["user_settings", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_settings")
        .select("odds_format,language,theme")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Settings | null;
    },
  });

  useEffect(() => {
    if (data?.theme) setTheme(data.theme);
  }, [data?.theme]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("fp.theme", theme);
  }, [theme]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("user_settings").upsert({
        user_id: user!.id,
        odds_format: format.toLowerCase(),
        language: i18n.language,
        theme,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user_settings"] });
      toast.success("Settings saved");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  return (
    <PageShell title="User settings" description={user?.email?.split("@")[0] ?? ""}>
      <div className="max-w-md space-y-5">
        <div className="space-y-1.5">
          <Label className="text-[11px] uppercase text-muted-foreground">Odds format</Label>
          <Select value={format} onValueChange={(v) => setFormat(v as OddsFormat)}>
            <SelectTrigger className="h-8 text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["EU", "UK", "US", "HK"].map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px] uppercase text-muted-foreground">Language</Label>
          <Select value={i18n.language} onValueChange={(v) => i18n.changeLanguage(v)}>
            <SelectTrigger className="h-8 text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="de">Deutsch</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px] uppercase text-muted-foreground">Theme</Label>
          <Select value={theme} onValueChange={setTheme}>
            <SelectTrigger className="h-8 text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px] uppercase text-muted-foreground">Roles</Label>
          <p className="text-[12px]">{roles.join(", ") || "—"}</p>
        </div>

        <Button size="sm" className="h-8 text-[12px]" onClick={() => save.mutate()}>
          Save settings
        </Button>
      </div>
    </PageShell>
  );
}
