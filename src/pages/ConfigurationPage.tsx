import { useQuery } from "@tanstack/react-query";

import { DataTable, type Column } from "@/components/common/DataTable";
import { PageShell } from "@/components/layout/PageShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";

type Profile = { id: string; username: string | null; display_name: string | null; created_at: string };
type Audit = { id: string; action: string; entity: string | null; entity_id: string | null; created_at: string };

export default function ConfigurationPage() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");

  const profiles = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,username,display_name,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const audit = useQuery({
    queryKey: ["audit_log"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id,action,entity,entity_id,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Audit[];
    },
  });

  const profileColumns: Column<Profile>[] = [
    { key: "name", header: "Operator", render: (r) => r.display_name ?? "—" },
    { key: "username", header: "Username", render: (r) => r.username ?? "—" },
    { key: "created", header: "Created", render: (r) => new Date(r.created_at).toLocaleDateString() },
  ];

  const auditColumns: Column<Audit>[] = [
    { key: "action", header: "Action", render: (r) => r.action },
    { key: "entity", header: "Entity", render: (r) => `${r.entity ?? "—"} ${r.entity_id ?? ""}` },
    { key: "created", header: "When", render: (r) => new Date(r.created_at).toLocaleString() },
  ];

  return (
    <PageShell title="Configuration" description="Operators, roles and system activity">
      <div className="space-y-6">
        <section className="space-y-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Operators</h2>
          <DataTable columns={profileColumns} rows={profiles.data ?? []} isLoading={profiles.isLoading} />
        </section>

        <section className="space-y-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Audit log</h2>
          {isAdmin ? (
            <DataTable columns={auditColumns} rows={audit.data ?? []} isLoading={audit.isLoading} />
          ) : (
            <p className="text-[11px] text-muted-foreground">
              The audit log is only visible to administrators.
            </p>
          )}
        </section>
      </div>
    </PageShell>
  );
}
