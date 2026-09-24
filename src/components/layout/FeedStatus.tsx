import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";

type Producer = { id: number; name: string; last_alive_at: string | null; last_message_at: string | null; down: boolean };

const isUp = (p: Producer) => !p.down && !!p.last_alive_at && Date.now() - Date.parse(p.last_alive_at) < 60_000;

export function FeedStatus() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const isAdmin = roles.includes("admin") || roles.includes("super_admin");

  const q = useQuery({
    queryKey: ["uof_producers"],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("uof_producers").select("id,name,last_alive_at,last_message_at,down").order("id");
      if (error) throw error;
      return (data ?? []) as Producer[];
    },
  });
  const list = (q.data ?? []).filter((p) => p.id === 1 || p.id === 3);
  const allUp = list.length > 0 && list.every(isUp);

  const sync = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("uof-sync", { body: { start: 0 } });
    setBusy(false);
    if (error || !data?.ok) {
      toast.error(t("feed.syncFailed"));
      return;
    }
    toast.success(t("feed.synced", { count: data.schedule?.matches ?? 0 }));
    void qc.invalidateQueries();
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-wide">
          <motion.span
            className={cn("h-2 w-2 rounded-full", allUp ? "bg-success" : "bg-danger")}
            animate={{ opacity: [1, 0.35, 1] }}
            transition={{ duration: 2.4, repeat: Infinity }}
          />
          {allUp ? t("nav.operational") : t("feed.degraded")}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3 text-[12px]">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("feed.title")}</div>
        {list.length === 0 && <p className="text-muted-foreground">{t("feed.noData")}</p>}
        <ul className="space-y-1.5">
          {list.map((p) => (
            <li key={p.id} className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", isUp(p) ? "bg-success" : "bg-danger")} />
                {p.id === 1 ? t("feed.live") : t("feed.prematch")}
              </span>
              <span className="text-muted-foreground">
                {p.last_message_at ? new Date(p.last_message_at).toLocaleTimeString() : "—"}
              </span>
            </li>
          ))}
        </ul>
        {isAdmin && (
          <button
            onClick={() => void sync()}
            disabled={busy}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-3 py-1.5 text-[11px] font-semibold uppercase text-primary-foreground disabled:opacity-60"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
            {t("feed.syncNow")}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
