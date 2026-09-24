import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { DataTable, type Column } from "@/components/common/DataTable";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";

type Preset = { id: string; name: string; filters: Record<string, boolean>; created_at: string };

export default function TemplatesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["filter_presets", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("filter_presets")
        .select("id,name,filters,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Preset[];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["filter_presets"] });

  const create = useMutation({
    mutationFn: async () => {
      const raw = localStorage.getItem("fp.monitorFilters");
      const { error } = await supabase.from("filter_presets").insert({
        user_id: user!.id,
        name,
        filters: raw ? JSON.parse(raw) : {},
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setName("");
      invalidate();
      toast.success("Preset saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("filter_presets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const columns: Column<Preset>[] = [
    { key: "name", header: "Preset", render: (r) => r.name },
    {
      key: "filters",
      header: "Filters",
      render: (r) =>
        Object.entries(r.filters ?? {})
          .filter(([, v]) => v)
          .map(([k]) => k)
          .join(", ") || "—",
    },
    { key: "created", header: "Created", render: (r) => new Date(r.created_at).toLocaleString() },
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
      title="Templates"
      description="Saved monitoring filter presets"
      actions={
        <>
          <Input
            placeholder="Preset name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-7 w-44 text-[11px]"
          />
          <Button size="sm" className="h-7 text-[11px]" disabled={!name.trim()} onClick={() => create.mutate()}>
            Save current filters
          </Button>
        </>
      }
    >
      <DataTable columns={columns} rows={data} isLoading={isLoading} emptyText="No presets saved yet." />
    </PageShell>
  );
}
