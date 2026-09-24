import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { DataTable, type Column } from "@/components/common/DataTable";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSettlements } from "@/lib/feed/queries";
import { useAuth } from "@/providers/AuthProvider";
import { cn } from "@/lib/utils";

type SettlementRow = {
  id: string;
  match_id: string | null;
  market: string;
  specifier: string | null;
  outcome: string | null;
  state: string;
  settled_at: string | null;
  created_at: string;
};

export default function SettlementsPage() {
  const { data = [], isLoading } = useSettlements();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"pending" | "settled">("pending");

  const mutate = useMutation({
    mutationFn: async ({ id, state }: { id: string; state: string }) => {
      const { error } = await supabase
        .from("settlements")
        .update({
          state,
          settled_at: state === "settled" ? new Date().toISOString() : null,
          settled_by: state === "settled" ? (user?.id ?? null) : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settlements"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (data as SettlementRow[]).filter((r) =>
    tab === "pending" ? r.state !== "settled" : r.state === "settled",
  );

  const columns: Column<SettlementRow>[] = [
    { key: "match", header: "Match", render: (r) => r.match_id ?? "—" },
    { key: "market", header: "Market", render: (r) => `${r.market}${r.specifier ? ` ${r.specifier}` : ""}` },
    { key: "outcome", header: "Outcome", render: (r) => r.outcome ?? "—" },
    {
      key: "state",
      header: "State",
      render: (r) => (
        <span
          className={cn(
            "rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase text-white",
            r.state === "settled" ? "bg-success" : r.state === "rollback" ? "bg-warning" : "bg-primary",
          )}
        >
          {r.state}
        </span>
      ),
    },
    { key: "created", header: "Created", render: (r) => new Date(r.created_at).toLocaleString() },
    {
      key: "actions",
      header: "",
      render: (r) =>
        r.state === "settled" ? (
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[10px]"
            onClick={() => mutate.mutate({ id: r.id, state: "rollback" })}
          >
            Roll back
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-6 text-[10px]"
            onClick={() => mutate.mutate({ id: r.id, state: "settled" })}
          >
            Settle
          </Button>
        ),
    },
  ];

  return (
    <PageShell
      title="Settlements"
      description="Manual settlement and rollback of market outcomes"
      actions={
        <div className="flex overflow-hidden rounded-sm border border-border">
          {(["pending", "settled"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn(
                "px-3 py-1 text-[10px] font-bold uppercase",
                tab === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {k}
            </button>
          ))}
        </div>
      }
    >
      <DataTable columns={columns} rows={rows} isLoading={isLoading} emptyText="Nothing to settle." />
    </PageShell>
  );
}
