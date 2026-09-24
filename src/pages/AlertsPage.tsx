import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DataTable, type Column } from "@/components/common/DataTable";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAlerts } from "@/lib/feed/queries";
import { useAuth } from "@/providers/AuthProvider";
import { cn } from "@/lib/utils";

type AlertRow = {
  id: string;
  match_id: string | null;
  severity: string;
  type: string;
  message: string;
  acknowledged_at: string | null;
  created_at: string;
};

export default function AlertsPage() {
  const { data = [], isLoading } = useAlerts();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showAcked, setShowAcked] = useState(false);

  const ack = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("alerts")
        .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: user?.id ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(
    () => (showAcked ? data : data.filter((a) => !a.acknowledged_at)) as AlertRow[],
    [data, showAcked],
  );

  const columns: Column<AlertRow>[] = [
    {
      key: "severity",
      header: "Severity",
      render: (r) => (
        <span
          className={cn(
            "rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase text-white",
            r.severity === "critical" ? "bg-danger" : r.severity === "warning" ? "bg-warning" : "bg-primary",
          )}
        >
          {r.severity}
        </span>
      ),
    },
    { key: "type", header: "Type", render: (r) => r.type },
    { key: "message", header: "Message", render: (r) => r.message },
    { key: "match", header: "Match", render: (r) => r.match_id ?? "—" },
    {
      key: "created",
      header: "Raised",
      render: (r) => new Date(r.created_at).toLocaleString(),
    },
    {
      key: "actions",
      header: "",
      render: (r) =>
        r.acknowledged_at ? (
          <span className="text-muted-foreground">acknowledged</span>
        ) : (
          <Button size="sm" variant="secondary" className="h-6 text-[10px]" onClick={() => ack.mutate(r.id)}>
            Acknowledge
          </Button>
        ),
    },
  ];

  return (
    <PageShell
      title="Alerts"
      description="Feed and trading alerts across all monitored events"
      actions={
        <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setShowAcked(!showAcked)}>
          {showAcked ? "Hide acknowledged" : "Show acknowledged"}
        </Button>
      }
    >
      <DataTable columns={columns} rows={rows} isLoading={isLoading} emptyText="No open alerts." />
    </PageShell>
  );
}
