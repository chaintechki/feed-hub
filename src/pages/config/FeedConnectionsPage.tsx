import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/PageShell";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";

type Conn = { id: "uof" | "gateway"; active: boolean; verified: boolean; status: string | null; last_check: string | null; info: Record<string, string | number> };
type Overview = {
  connections: Conn[];
  gateway: { host: string; healthy: boolean; placeholder: boolean; login: boolean | null; queue: unknown; error: string | null; status: string };
};

async function gw<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("gateway-admin", { body });
  if (error) {
    let msg = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) msg = (await ctx.json()).error ?? msg;
    } catch {
      /* keep default */
    }
    throw new Error(msg);
  }
  return data as T;
}

const inp = "h-8 rounded-sm border border-border bg-background px-2 text-[12px]";

export default function FeedConnectionsPage() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const qc = useQueryClient();
  const isSuper = roles.includes("super_admin");
  const [confirm, setConfirm] = useState<Conn["id"] | null>(null);
  const [queue, setQueue] = useState({ mq_host: "", mq_port: "5671", mq_vhost: "", mq_user: "", mq_exchange: "unifiedfeed" });

  const ov = useQuery({ queryKey: ["gateway-overview"], enabled: isSuper, queryFn: () => gw<Overview>({ action: "overview" }), refetchInterval: 60_000 });
  const gwConn = ov.data?.connections.find((c) => c.id === "gateway");
  useEffect(() => {
    if (gwConn?.info) setQueue((q) => ({ ...q, ...Object.fromEntries(Object.entries(gwConn.info).map(([k, v]) => [k, String(v ?? "")])) }));
  }, [gwConn?.info]);

  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) => gw<{ ok?: boolean }>(body),
    onSuccess: () => {
      toast.success(t("fc.done"));
      qc.invalidateQueries({ queryKey: ["gateway-overview"] });
    },
    onError: (e: Error) => toast.error(t(`fc.err.${e.message}`, { defaultValue: e.message })),
  });

  if (!isSuper) return <Navigate to="/configuration" replace />;
  const g = ov.data?.gateway;

  return (
    <PageShell title={t("fc.title")} description={t("fc.desc")}>
      {ov.isLoading && <p className="text-[12px] text-muted-foreground">{t("common.loading")}</p>}
      {ov.error && <p className="text-[12px] text-destructive">{(ov.error as Error).message}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {(ov.data?.connections ?? []).map((c) => (
          <section key={c.id} className={cn("space-y-3 rounded-sm border bg-card p-4", c.active ? "border-primary" : "border-border")}>
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-bold">{t(`fc.name.${c.id}`)}</h2>
              <span className={cn("rounded-sm px-2 py-0.5 text-[11px] font-semibold", c.active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                {c.active ? t("fc.active") : t("fc.inactive")}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-1 text-[12px]">
              <dt className="text-muted-foreground">{t("common.status")}</dt>
              <dd>{t(`fc.status.${c.id === "gateway" ? g?.status ?? c.status : c.status}`, { defaultValue: c.status ?? "—" })}</dd>
              <dt className="text-muted-foreground">{t("fc.verified")}</dt>
              <dd>{c.verified ? t("fc.yes") : t("fc.no")}</dd>
              {c.id === "gateway" && g && (
                <>
                  <dt className="text-muted-foreground">Host</dt>
                  <dd>{g.host}</dd>
                  <dt className="text-muted-foreground">{t("fc.reachable")}</dt>
                  <dd>{g.healthy ? t("fc.yes") : t("fc.no")}</dd>
                </>
              )}
              {c.last_check && (
                <>
                  <dt className="text-muted-foreground">{t("fc.lastCheck")}</dt>
                  <dd>{new Date(c.last_check).toLocaleString()}</dd>
                </>
              )}
            </dl>
            {c.id === "gateway" && g?.placeholder && <p className="text-[11px] text-warning">{t("fc.placeholderHint")}</p>}
            {c.id === "gateway" && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={act.isPending || g?.placeholder} onClick={() => act.mutate({ action: "test_message" })}>
                    {t("fc.testMessage")}
                  </Button>
                  <Button size="sm" variant="outline" disabled={act.isPending || g?.placeholder} onClick={() => act.mutate({ action: "rotate_password" })}>
                    {t("fc.rotate")}
                  </Button>
                </div>
                <h3 className="pt-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("fc.queue")}</h3>
                <div className="grid grid-cols-2 gap-2">
                  {(["mq_host", "mq_port", "mq_vhost", "mq_user", "mq_exchange"] as const).map((k) => (
                    <label key={k} className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                      {t(`fc.f.${k}`)}
                      <input className={inp} value={queue[k]} onChange={(e) => setQueue({ ...queue, [k]: e.target.value })} />
                    </label>
                  ))}
                </div>
                <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ action: "save_queue", ...queue })}>
                  {t("common.save")}
                </Button>
              </div>
            )}
            {!c.active && (
              <Button size="sm" disabled={!c.verified || act.isPending} onClick={() => setConfirm(c.id)}>
                {t("fc.activate")}
              </Button>
            )}
            {!c.active && !c.verified && <p className="text-[11px] text-muted-foreground">{t("fc.lockedHint")}</p>}
          </section>
        ))}
      </div>
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("fc.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("fc.confirmText", { name: confirm ? t(`fc.name.${confirm}`) : "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm && act.mutate({ action: "activate", id: confirm })}>{t("fc.activate")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
