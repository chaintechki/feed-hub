import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { DataTable, type Column } from "@/components/common/DataTable";
import { ApiClients } from "@/components/config/ApiClients";
import { AuditLog } from "@/components/config/AuditLog";
import { UserManagement } from "@/components/config/UserManagement";
import { PageShell } from "@/components/layout/PageShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";

type Profile = { id: string; username: string | null; display_name: string | null; created_at: string };

export default function ConfigurationPage() {
  const { t } = useTranslation();
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

  const profileColumns: Column<Profile>[] = [
    { key: "name", header: "Operator", render: (r) => r.display_name ?? "—" },
    { key: "username", header: "Username", render: (r) => r.username ?? "—" },
    { key: "created", header: "Created", render: (r) => new Date(r.created_at).toLocaleDateString() },
  ];

  return (
    <PageShell title="Configuration" description="Operators, roles and system activity">
      <div className="space-y-6">
        {isAdmin ? (
          <>
            <UserManagement />
            <ApiClients />

          </>
        ) : (
          <section className="space-y-2">
            <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Operators</h2>
            <DataTable columns={profileColumns} rows={profiles.data ?? []} isLoading={profiles.isLoading} />
          </section>
        )}
        {!isAdmin && (
          <ApiClients hideWhenEmpty />
        )}

        {isAdmin ? (
          <AuditLog />
        ) : (
          <section className="space-y-2">
            <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("audit.title")}</h2>
            <p className="text-[11px] text-muted-foreground">{t("audit.adminOnly")}</p>
          </section>
        )}
      </div>
    </PageShell>
  );
}
