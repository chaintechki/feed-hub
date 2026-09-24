import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { roundOdds, type RoundingMode } from "@/lib/feed/rounding";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";
import { friendlyError } from "@/lib/errors";

type Opt = Record<string, string | boolean>;
type Field = { key: string; type: "select"; options: string[] } | { key: string; type: "bool" };

const VOID = ["no_void", "void_non_fielders", "void_non_fielders_bench", "void_non_fielders_bench_subs"];
const PREMATCH: Field[] = [
  { key: "fgs_void", type: "select", options: VOID },
  { key: "ags_void", type: "select", options: VOID.slice(0, 3) },
  { key: "lgs_void", type: "select", options: VOID },
  { key: "harmonisation", type: "select", options: ["none", "lowest", "average", "highest"] },
  { key: "send_probabilities", type: "bool" },
  { key: "abandoned", type: "select", options: ["void_all", "void_undecided"] },
  { key: "tennis_retirement", type: "select", options: ["void_undecided", "settle_progressing"] },
  { key: "goalscorer_extra", type: "bool" },
  { key: "outrights_others", type: "bool" },
  { key: "mlb_pitcher", type: "bool" },
  { key: "golf_3ball", type: "select", options: ["dead_heat", "void"] },
];
const LIVE: Field[] = [
  { key: "harmonisation", type: "select", options: ["none", "lowest", "average", "highest"] },
  { key: "rounding", type: "select", options: ["betradar", "low_key", "none"] },
  { key: "dynamic_key", type: "bool" },
];

export default function FeedOptionsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const [scope, setScope] = useState<"prematch" | "live">("prematch");
  const [draft, setDraft] = useState<Opt | null>(null);

  const q = useQuery({
    queryKey: ["feed_options"],
    queryFn: async () => {
      const { data, error } = await supabase.from("feed_options").select("scope,options");
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((r) => [r.scope, r.options as Opt])) as Record<string, Opt>;
    },
  });
  useEffect(() => setDraft(null), [scope]);
  const cur: Opt = draft ?? q.data?.[scope] ?? {};

  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("feed_options").upsert({ scope, options: cur as never, updated_by: u.user?.id ?? null, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft(null);
      toast.success(t("users.saved"));
      void qc.invalidateQueries({ queryKey: ["feed_options"] });
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  const fields = scope === "prematch" ? PREMATCH : LIVE;
  const set = (k: string, v: string | boolean) => setDraft({ ...cur, [k]: v });

  return (
    <PageShell
      title={t("cfg.tab.feedOptions")}
      description={isAdmin ? t("fo.hint") : t("fo.readonly")}
      actions={
        isAdmin && (
          <Button size="sm" className="h-7 text-[11px] uppercase" disabled={!draft || save.isPending} onClick={() => save.mutate()}>
            {t("common.save")}
          </Button>
        )
      }
    >
      <div className="mb-3 inline-flex overflow-hidden rounded-sm border border-border text-[11px] font-bold uppercase">
        {(["prematch", "live"] as const).map((s) => (
          <button key={s} onClick={() => setScope(s)} className={cn("h-7 px-3", scope === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
            {t(`fo.scope.${s}`)}
          </button>
        ))}
      </div>
      <div className="max-w-3xl rounded-sm border border-border bg-panel">
        {fields.map((f) => (
          <div key={f.key} className="flex items-center gap-4 border-b border-border px-3 py-2 text-[11px] last:border-0">
            <div className="flex-1">
              <div className="font-semibold">{t(`fo.f.${f.key}`)}</div>
              <div className="text-[10px] text-muted-foreground">{t(`fo.d.${scope}_${f.key}`, t(`fo.d.${f.key}`, ""))}</div>
            </div>
            {f.type === "bool" ? (
              <Switch disabled={!isAdmin} checked={!!cur[f.key]} onCheckedChange={(v) => set(f.key, v)} />
            ) : (
              <select
                disabled={!isAdmin}
                value={String(cur[f.key] ?? f.options[0])}
                onChange={(e) => set(f.key, e.target.value)}
                className="h-7 w-64 rounded-sm border border-border bg-background px-2"
              >
                {f.options.map((o) => (
                  <option key={o} value={o}>{t(`fo.o.${o}`)}</option>
                ))}
              </select>
            )}
          </div>
        ))}
      </div>
      {scope === "live" && (
        <div className="mt-3 max-w-3xl rounded-sm border border-border bg-panel p-3 text-[11px]">
          <div className="mb-2 font-bold uppercase text-muted-foreground">{t("fo.preview")}</div>
          <div className="flex flex-wrap gap-2 font-mono">
            {[1.057, 1.123, 1.237, 2.27, 3.33, 7.1, 12.3, 23.4].map((o) => (
              <span key={o} className="rounded-sm bg-odds-neutral px-2 py-0.5">
                {o} → <b>{roundOdds(o, (cur["rounding"] as RoundingMode) ?? "betradar")}</b>
              </span>
            ))}
          </div>
          <p className="mt-2 text-muted-foreground">{t("fo.feedApplied")}</p>
        </div>
      )}
    </PageShell>
  );
}
