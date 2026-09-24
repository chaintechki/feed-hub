import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { DataTable, type Column } from "@/components/common/DataTable";
import { PageShell } from "@/components/layout/PageShell";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useMarginTemplates } from "@/pages/trading/MarginsPage";
import { friendlyError } from "@/lib/errors";

type Row = { id: string; name: string; market: string; max_stake: number | null };

export default function LimitsPage() {
  const { data = [], isLoading } = useMarginTemplates();
  const queryClient = useQueryClient();

  const update = useMutation({
    mutationFn: async ({ id, maxStake }: { id: string; maxStake: number | null }) => {
      const { error } = await supabase.from("margin_templates").update({ max_stake: maxStake }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["margin_templates"] });
      toast.success("Limit saved");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  const columns: Column<Row>[] = [
    { key: "name", header: "Profile", render: (r) => r.name },
    { key: "market", header: "Market", render: (r) => r.market.toUpperCase() },
    {
      key: "limit",
      header: "Max stake",
      render: (r) => (
        <Input
          defaultValue={r.max_stake == null ? "" : String(r.max_stake)}
          placeholder="unlimited"
          className="h-6 w-28 text-[11px]"
          onBlur={(e) => {
            const raw = e.target.value.trim();
            const value = raw === "" ? null : Number(raw);
            if (value !== null && Number.isNaN(value)) return;
            update.mutate({ id: r.id, maxStake: value });
          }}
        />
      ),
    },
  ];

  return (
    <PageShell title="Limits" description="Maximum stake per margin profile and market">
      <DataTable
        columns={columns}
        rows={data as Row[]}
        isLoading={isLoading}
        emptyText="Create a margin profile first."
      />
    </PageShell>
  );
}
