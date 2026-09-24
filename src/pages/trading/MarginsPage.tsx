import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { DataTable, type Column } from "@/components/common/DataTable";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { friendlyError } from "@/lib/errors";

type Template = {
  id: string;
  name: string;
  sport_id: string | null;
  market: string;
  margin: number;
  max_stake: number | null;
};

export function useMarginTemplates() {
  return useQuery({
    queryKey: ["margin_templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("margin_templates")
        .select("id,name,sport_id,market,margin,max_stake")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Template[];
    },
  });
}

export default function MarginsPage() {
  const { data = [], isLoading } = useMarginTemplates();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({ name: "", market: "1x2", margin: "105" });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["margin_templates"] });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("margin_templates").insert({
        name: draft.name,
        market: draft.market,
        margin: Number(draft.margin),
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft({ name: "", market: "1x2", margin: "105" });
      invalidate();
      toast.success("Margin profile created");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  const update = useMutation({
    mutationFn: async ({ id, margin }: { id: string; margin: number }) => {
      const { error } = await supabase.from("margin_templates").update({ margin }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("margin_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  const columns: Column<Template>[] = [
    { key: "name", header: "Profile", render: (r) => r.name },
    { key: "market", header: "Market", render: (r) => r.market.toUpperCase() },
    {
      key: "margin",
      header: "Margin %",
      render: (r) => (
        <Input
          defaultValue={String(r.margin)}
          className="h-6 w-20 text-[11px]"
          onBlur={(e) => {
            const value = Number(e.target.value);
            if (!Number.isNaN(value) && value !== Number(r.margin)) update.mutate({ id: r.id, margin: value });
          }}
        />
      ),
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => remove.mutate(r.id)}>
          Delete
        </Button>
      ),
    },
  ];

  return (
    <PageShell
      title="Margins"
      description="Margin profiles applied to own odds calculation"
      actions={
        <>
          <Input
            placeholder="Profile name"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="h-7 w-40 text-[11px]"
          />
          <Input
            placeholder="Market"
            value={draft.market}
            onChange={(e) => setDraft({ ...draft, market: e.target.value })}
            className="h-7 w-28 text-[11px]"
          />
          <Input
            placeholder="Margin"
            value={draft.margin}
            onChange={(e) => setDraft({ ...draft, margin: e.target.value })}
            className="h-7 w-20 text-[11px]"
          />
          <Button
            size="sm"
            className="h-7 text-[11px]"
            disabled={!draft.name.trim()}
            onClick={() => create.mutate()}
          >
            Add profile
          </Button>
        </>
      }
    >
      <DataTable columns={columns} rows={data} isLoading={isLoading} emptyText="No margin profiles yet." />
    </PageShell>
  );
}
