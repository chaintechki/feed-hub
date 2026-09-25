import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { DataTable, type Column } from "@/components/common/DataTable";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";

type Row = {
  id: string;
  seq: number | null;
  user_id: string | null;
  actor_role: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

const FILTERS = {
  all: null,
  roles: ["user.set_role", "user.create", "role.grant", "role.revoke"],
  visibility: ["api_client.exclusions", "visibility.hide", "visibility.show", "api_client.assign"],
} as const;

const fmt = (v: unknown) => (v == null ? "—" : Array.isArray(v) ? v.join(", ") || "∅" : String(v));

export function AuditLog() {
  const { t } = useTranslation();
  const { user, roles } = useAuth();
  const isSuper = roles.includes("super_admin");
  const [filter, setFilter] = useState<keyof typeof FILTERS>("all");

  const q = useQuery({
    queryKey: ["audit_log", user?.id, filter],
    enabled: !!user,
    queryFn: async () => {
      let s = supabase
        .from("audit_log")
        .select("id,seq,user_id,actor_role,action,entity,entity_id,details,created_at")
        .order("seq", { ascending: false })
        .limit(200);
      const f = FILTERS[filter];
      if (f) s = s.in("action", [...f]);
      const [{ data, error }, { data: prof }] = await Promise.all([s, supabase.from("profiles").select("id,username")]);
      if (error) throw error;
      const names = new Map((prof ?? []).map((p) => [p.id, p.username ?? ""]));
      return ((data ?? []) as Row[]).map((r) => ({ ...r, actor: r.user_id ? names.get(r.user_id) ?? r.user_id.slice(0, 8) : "system" }));
    },
  });

  const verify = async () => {
    const { data, error } = await supabase.rpc("audit_verify");
    if (error) {
      toast.error(error.message);
      return;
    }
    const r = data?.[0];
    if (r?.ok) toast.success(t("audit.ok", { n: r.checked }));
    else toast.error(t("audit.broken", { seq: r?.broken_seq }));
  };

  const cols: Column<Row & { actor: string }>[] = [
    { key: "seq", header: "#", render: (r) => r.seq ?? "—" },
    { key: "when", header: t("audit.when"), render: (r) => new Date(r.created_at).toLocaleString() },
    { key: "user", header: t("audit.user"), render: (r) => r.actor },
    { key: "role", header: t("audit.role"), render: (r) => r.actor_role ?? "—" },
    { key: "action", header: t("audit.action"), render: (r) => r.action },
    { key: "target", header: t("audit.target"), render: (r) => `${r.entity ?? "—"} ${r.entity_id?.slice(0, 12) ?? ""}` },
    {
      key: "change",
      header: t("audit.change"),
      render: (r) => {
        const d = r.details ?? {};
        if ("before" in d || "after" in d) return `${fmt(d["before"])} → ${fmt(d["after"])}`;
        return fmt(d["role"] ?? d["admin_id"] ?? d["owner_id"]);
      },
    },
  ];

  return (
    <section className="space-y-2" data-testid="audit-log">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("audit.title")}</h2>
        <div className="ml-auto flex gap-1">
          {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((k) => (
            <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} className="h-6 px-2 text-[11px]" onClick={() => setFilter(k)}>
              {t(`audit.${k}`)}
            </Button>
          ))}
          {isSuper && (
            <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={verify}>
              {t("audit.verify")}
            </Button>
          )}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">{t("audit.immutable")}</p>
      <DataTable columns={cols} rows={q.data ?? []} isLoading={q.isLoading} />
    </section>
  );
}
