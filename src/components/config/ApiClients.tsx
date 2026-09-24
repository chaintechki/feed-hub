import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Pencil, Plus, Power, RefreshCw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useSportTree } from "@/lib/feed/queries";
import { isExpired, isValidIpRule } from "../../../supabase/functions/_shared/api-core.ts";
import { friendlyError } from "@/lib/errors";
import { FEED_BASE, WIDGET_SCRIPT } from "@/lib/publicBase";

type ApiKey = {
  id: string;
  kind: "server" | "widget";
  prefix: string;
  active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  allowed_ips: string[];
  label: string;
  rotated_from: string | null;
};
type KeyForm = { client_id: string; kind: "server" | "widget"; label: string; expires: string; ips: string };
type ClientFields = {
  name: string;
  active: boolean;
  sport_ids: string[];
  tournament_ids: string[];
  markup_pct: number;
  rate_limit_per_min: number;
  allowed_domains: string[];
  formats: ("json" | "xml")[];
};
type ApiClient = ClientFields & { id: string; keys: ApiKey[]; calls_24h: number; owner_id: string | null; owner_name: string | null };

const EMPTY: ClientFields = {
  name: "",
  active: true,
  sport_ids: [],
  tournament_ids: [],
  markup_pct: 0,
  rate_limit_per_min: 60,
  allowed_domains: [],
  formats: ["json", "xml"],
};

export { FEED_BASE } from "@/lib/publicBase";

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("api-clients-admin", { body });
  if (error) {
    let msg = error.message;
    try {
      const j = await (error as { context?: Response }).context?.json();
      if (j?.error) msg = typeof j.error === "string" ? j.error : JSON.stringify(j.error);
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return data as T;
}

const copy = (s: string) => navigator.clipboard.writeText(s).then(() => toast.success("Copied"));

export function ApiClients({ hideWhenEmpty = false }: { hideWhenEmpty?: boolean } = {}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const tree = useSportTree();
  const [edit, setEdit] = useState<{ id?: string | undefined; f: ClientFields; owner: string | null } | null>(null);
  const [domains, setDomains] = useState<string[]>([]);
  const [domainInput, setDomainInput] = useState("");
  const [newKey, setNewKey] = useState<{ key: string; kind: string; oldExpires?: string } | null>(null);
  const [keyForm, setKeyForm] = useState<KeyForm | null>(null);

  const list = useQuery({
    queryKey: ["api_clients"],
    queryFn: () => call<{ clients: ApiClient[]; is_admin: boolean }>({ action: "list" }).then((r) => {
      setIsAdmin(r.is_admin);
      return r.clients;
    }),
  });
  const [isAdmin, setIsAdmin] = useState(false);
  const users = useQuery({
    queryKey: ["api_client_users"],
    enabled: isAdmin,
    queryFn: () => call<{ users: { id: string; username: string | null }[] }>({ action: "users" }).then((r) => r.users),
  });

  const run = useMutation({
    mutationFn: (body: Record<string, unknown>) => call<{ key?: string; old_expires_at?: string }>(body),
    onSuccess: (r, body) => {
      if (r?.key) {
        setKeyForm(null);
        setNewKey({ key: r.key, kind: String(body['kind']), ...(r.old_expires_at ? { oldExpires: r.old_expires_at } : {}) });
      }
      else toast.success(t("users.saved"));
      void qc.invalidateQueries({ queryKey: ["api_clients"] });
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  function open(c?: ApiClient) {
    const f = c ? { ...EMPTY, ...c } : EMPTY;
    setDomains(f.allowed_domains);
    setDomainInput("");
    setEdit({ id: c?.id, f: { ...f }, owner: c?.owner_id ?? null });
  }
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const stats = useQuery({
    queryKey: ["api_usage_stats"],
    queryFn: async () => {
      const monthStart = new Date(Date.now() - 30 * 864e5).toISOString();
      const dayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
      const [u, d] = await Promise.all([
        supabase.from("api_usage").select("client_id,minute,endpoint,count").gte("minute", monthStart).limit(20000),
        supabase.from("api_denials").select("client_id,key_hint,minute,count").gte("minute", monthStart).limit(20000),
      ]);
      if (u.error) throw u.error;
      if (d.error) throw d.error;
      return {
        usage: (u.data ?? []) as { client_id: string; minute: string; endpoint: string; count: number }[],
        denials: (d.data ?? []) as { client_id: string | null; key_hint: string; minute: string; count: number }[],
        dayStart,
      };
    },
    refetchInterval: 30_000,
  });

  const usage = useMemo(() => {
    const u = stats.data?.usage ?? [];
    const d = stats.data?.denials ?? [];
    const dayStart = stats.data?.dayStart ?? "";
    const weekStart = new Date(Date.now() - 7 * 864e5).toISOString();
    const per = new Map<string, { today: number; d7: number; d30: number; denied: number; breakdown: Record<string, number> }>();
    for (const c of list.data ?? []) per.set(c.id, { today: 0, d7: 0, d30: 0, denied: 0, breakdown: {} });
    for (const r of u) {
      const e = per.get(r.client_id);
      if (!e) continue;
      if (r.minute >= dayStart) e.today += r.count;
      if (r.minute >= weekStart) {
        e.d7 += r.count;
        e.breakdown[r.endpoint] = (e.breakdown[r.endpoint] ?? 0) + r.count;
      }
      e.d30 += r.count;
    }
    const unknown = new Map<string, number>();
    for (const r of d) {
      if (r.minute < dayStart) continue;
      if (r.client_id) {
        const e = per.get(r.client_id);
        if (e) e.denied += r.count;
      } else {
        unknown.set(r.key_hint, (unknown.get(r.key_hint) ?? 0) + r.count);
      }
    }
    const vals = [...per.values()];
    return {
      per,
      unknown: [...unknown.entries()],
      totalToday: vals.reduce((a, e) => a + e.today, 0),
      total7d: vals.reduce((a, e) => a + e.d7, 0),
      deniedToday: vals.reduce((a, e) => a + e.denied, 0) + [...unknown.values()].reduce((a, b) => a + b, 0),
    };
  }, [stats.data, list.data]);

  function save() {
    if (!edit) return;
    const { id, f } = edit;
    const client: ClientFields = {
      name: f.name,
      active: f.active,
      sport_ids: f.sport_ids,
      tournament_ids: f.tournament_ids,
      markup_pct: Number(f.markup_pct),
      rate_limit_per_min: Number(f.rate_limit_per_min),
      allowed_domains: domains,
      formats: f.formats,
    };
    const prevOwner = list.data?.find((c) => c.id === id)?.owner_id ?? null;
    const owner = edit.owner;
    run.mutate(
      { action: "save", id, client },
      {
        onSuccess: (r) => {
          const cid = id ?? (r as { id?: string }).id;
          if (isAdmin && cid && owner !== prevOwner) run.mutate({ action: "assign", id: cid, owner_id: owner });
          setEdit(null);
        },
      },
    );
  }

  if (hideWhenEmpty && !isAdmin && (list.isLoading || !list.data?.length)) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("api.title")}</h2>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline" className="h-7 text-[11px] uppercase">
            <Link to="/api-docs">{t("api.docs")}</Link>
          </Button>
          {isAdmin && (
            <Button size="sm" className="h-7 text-[11px] uppercase" onClick={() => open()}>
              <Plus className="mr-1 h-3.5 w-3.5" /> {t("api.create")}
            </Button>
          )}
        </div>
      </div>

      {stats.data && (
        <div className="rounded-sm border border-border bg-panel">
          <div className="border-b border-border bg-panel-header px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {t("usage.title")}
          </div>
          <div className="grid grid-cols-3 gap-px bg-border text-center text-[11px]">
            <div className="bg-panel px-3 py-2">
              <div className="text-lg font-bold text-success">{usage.totalToday}</div>
              <div className="text-muted-foreground">{t("usage.allowedToday")}</div>
            </div>
            <div className="bg-panel px-3 py-2">
              <div className="text-lg font-bold">{usage.total7d}</div>
              <div className="text-muted-foreground">{t("usage.allowed7d")}</div>
            </div>
            <div className="bg-panel px-3 py-2">
              <div className="text-lg font-bold text-danger">{usage.deniedToday}</div>
              <div className="text-muted-foreground">{t("usage.deniedToday")}</div>
            </div>
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="px-3 py-1.5 text-left font-semibold uppercase">{t("api.title")}</th>
                <th className="px-3 py-1.5 text-right font-semibold uppercase">{t("usage.today")}</th>
                <th className="px-3 py-1.5 text-right font-semibold uppercase">{t("usage.d7")}</th>
                <th className="px-3 py-1.5 text-right font-semibold uppercase">{t("usage.d30")}</th>
                <th className="px-3 py-1.5 text-right font-semibold uppercase">{t("usage.denied")}</th>
                <th className="px-3 py-1.5 text-left font-semibold uppercase">{t("usage.endpoints")}</th>
                <th className="px-3 py-1.5 text-right font-semibold uppercase">{t("usage.lastActive")}</th>
              </tr>
            </thead>
            <tbody>
              {(list.data ?? []).map((c) => {
                const e = usage.per.get(c.id);
                const last = c.keys.map((k) => k.last_used_at).filter(Boolean).sort().at(-1);
                const bd = Object.entries(e?.breakdown ?? {}).map(([k, v]) => `${k} ${v}`).join(" · ") || "—";
                return (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-1.5 font-semibold">{c.name}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{e?.today ?? 0}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{e?.d7 ?? 0}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{e?.d30 ?? 0}</td>
                    <td className={"px-3 py-1.5 text-right font-mono" + (e?.denied ? " text-danger" : "")}>{e?.denied ?? 0}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{bd}</td>
                    <td className="px-3 py-1.5 text-right text-muted-foreground">{last ? new Date(last).toLocaleString() : "—"}</td>
                  </tr>
                );
              })}
              {usage.unknown.map(([hint, n]) => (
                <tr key={hint || "none"} className="border-b border-border last:border-0">
                  <td className="px-3 py-1.5 font-semibold text-danger">
                    {t("usage.reason.invalid_key")}
                    {hint ? ` (${hint}…)` : ""}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-danger">—</td>
                  <td className="px-3 py-1.5 text-right font-mono text-danger">—</td>
                  <td className="px-3 py-1.5 text-right font-mono text-danger">—</td>
                  <td className="px-3 py-1.5 text-right font-mono text-danger">{n}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">—</td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">—</td>
                </tr>
              ))}
              {(list.data ?? []).length === 0 && usage.unknown.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-2 text-muted-foreground">{t("usage.noActivity")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-2">
        {list.isLoading && <p className="text-[11px] text-muted-foreground">{t("common.loading")}</p>}
        {list.data?.length === 0 && <p className="text-[11px] text-muted-foreground">{t("api.none")}</p>}
        {list.data?.map((c) => (
          <div key={c.id} className="rounded-sm border border-border bg-panel">
            <div className="flex items-center gap-3 border-b border-border bg-panel-header px-3 py-2 text-[11px]">
              <span className="font-bold">{c.name}</span>
              <span className={c.active ? "font-semibold text-success" : "font-semibold text-danger"}>
                {c.active ? t("users.active") : t("users.banned")}
              </span>
              <span className="text-muted-foreground">
                {t("api.owner")}: {c.owner_name ?? t("api.noOwner")} · {t("api.markup")}: {c.markup_pct}% · {t("api.limit")}: {c.rate_limit_per_min}/min · {t("api.calls24")}:{" "}
                {c.calls_24h} · {c.formats.join("/").toUpperCase()} ·{" "}
                {c.sport_ids.length || c.tournament_ids.length
                  ? `${c.sport_ids.length} ${t("api.sports")}, ${c.tournament_ids.length} ${t("api.leagues")}`
                  : t("api.allData")}
              </span>
              <div className="ml-auto flex gap-1">
                <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setKeyForm({ client_id: c.id, kind: "server", label: "", expires: "", ips: "" })}>
                  <KeyRound className="mr-1 h-3.5 w-3.5" /> API
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setKeyForm({ client_id: c.id, kind: "widget", label: "", expires: "", ips: "" })}>
                  <KeyRound className="mr-1 h-3.5 w-3.5" /> Widget
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => open(c)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {isAdmin && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-danger"
                    onClick={() => confirm(t("api.deleteConfirm")) && run.mutate({ action: "delete", id: c.id })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
            {c.keys.length > 0 && (
              <table className="w-full text-[11px]">
                <tbody>
                  {c.keys.map((k) => (
                    <tr key={k.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-1.5 font-mono">
                        {k.prefix}…{k.label && <span className="ml-2 font-sans text-muted-foreground">{k.label}</span>}
                      </td>
                      <td className="px-3 py-1.5 uppercase">{k.kind}</td>
                      <td className={k.active && !isExpired(k.expires_at) ? "px-3 py-1.5 text-success" : "px-3 py-1.5 text-danger"}>
                        {!k.active ? t("users.banned") : isExpired(k.expires_at) ? t("api.expired") : t("users.active")}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {t("api.expires")}: {k.expires_at ? new Date(k.expires_at).toLocaleString() : t("api.never")}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {k.kind === "server" ? `IP: ${k.allowed_ips.length ? k.allowed_ips.join(", ") : t("api.anyIp")}` : ""}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {t("api.lastUsed")}: {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          title={t("api.rotate")}
                          onClick={() => confirm(t("api.rotateConfirm")) && run.mutate({ action: "rotate_key", key_id: k.id, kind: k.kind, grace_hours: 24 })}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => run.mutate({ action: "toggle_key", key_id: k.id, active: !k.active })}>
                          <Power className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-danger"
                          onClick={() => confirm(t("api.deleteKey")) && run.mutate({ action: "delete_key", key_id: k.id })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm">{edit?.id ? t("api.edit") : t("api.create")}</DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="grid grid-cols-2 gap-4 text-[11px]">
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase">Name</Label>
                  <Input value={edit.f.name} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, name: e.target.value } })} className="h-8" />
                </div>
                {isAdmin && (
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase">{t("api.owner")}</Label>
                    <select
                      value={edit.owner ?? ""}
                      onChange={(e) => setEdit({ ...edit, owner: e.target.value || null })}
                      className="h-8 w-full rounded-sm border border-input bg-background px-2 text-[11px]"
                    >
                      <option value="">{t("api.noOwner")}</option>
                      {(users.data ?? []).map((u) => (
                        <option key={u.id} value={u.id}>{u.username ?? u.id}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase">{t("api.markup")} %</Label>
                    <Input type="number" min={-50} max={50} step={0.5} value={edit.f.markup_pct} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, markup_pct: Number(e.target.value) } })} className="h-8" />
                    <div className="flex flex-wrap gap-1 pt-1">
                      {[-20, -10, -5, 5, 10, 20].map((v) => (
                        <Button
                          key={v}
                          type="button"
                          size="sm"
                          variant={edit.f.markup_pct === v ? "default" : "outline"}
                          className="h-6 px-2 text-[10px]"
                          onClick={() => setEdit({ ...edit, f: { ...edit.f, markup_pct: v } })}
                        >
                          {v > 0 ? `+${v}` : v}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase">{t("api.limit")} / min</Label>
                    <Input type="number" min={1} max={10000} value={edit.f.rate_limit_per_min} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, rate_limit_per_min: Number(e.target.value) } })} className="h-8" />
                    <div className="flex flex-wrap gap-1 pt-1">
                      {[30, 60, 120, 180, 240].map((v) => (
                        <Button
                          key={v}
                          type="button"
                          size="sm"
                          variant={edit.f.rate_limit_per_min === v ? "default" : "outline"}
                          className="h-6 px-2 text-[10px]"
                          onClick={() => setEdit({ ...edit, f: { ...edit.f, rate_limit_per_min: v } })}
                        >
                          {v}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase">{t("api.domains")}</Label>
                  <div className="flex gap-1">
                    <Input
                      placeholder="example.com"
                      value={domainInput}
                      onChange={(e) => setDomainInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const d = domainInput.trim().toLowerCase();
                          if (d && !domains.includes(d)) setDomains([...domains, d]);
                          setDomainInput("");
                        }
                      }}
                      className="h-8"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0"
                      disabled={!domainInput.trim()}
                      onClick={() => {
                        const d = domainInput.trim().toLowerCase();
                        if (d && !domains.includes(d)) setDomains([...domains, d]);
                        setDomainInput("");
                      }}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" /> {t("api.addDomain")}
                    </Button>
                  </div>
                  {domains.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {domains.map((d) => (
                        <span key={d} className="inline-flex items-center gap-1 rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                          {d}
                          <button type="button" className="text-muted-foreground hover:text-danger" onClick={() => setDomains(domains.filter((x) => x !== d))}>
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  {(["json", "xml"] as const).map((fm) => (
                    <label key={fm} className="flex items-center gap-1.5 uppercase">
                      <Checkbox checked={edit.f.formats.includes(fm)} onCheckedChange={() => setEdit({ ...edit, f: { ...edit.f, formats: toggle(edit.f.formats, fm) as ClientFields["formats"] } })} />
                      {fm}
                    </label>
                  ))}
                  <label className="ml-auto flex items-center gap-1.5">
                    <Switch checked={edit.f.active} onCheckedChange={(v) => setEdit({ ...edit, f: { ...edit.f, active: v } })} />
                    {t("users.active")}
                  </label>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] uppercase">{t("api.scope")}</Label>
                <p className="text-muted-foreground">{t("api.scopeHint")}</p>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px]"
                    onClick={() =>
                      setEdit({
                        ...edit,
                        f: {
                          ...edit.f,
                          sport_ids: (tree.data ?? []).map((s) => s.id),
                          tournament_ids: (tree.data ?? []).flatMap((s) => s.categories.flatMap((c) => c.tournaments.map((tn) => tn.id))),
                        },
                      })
                    }
                  >
                    {t("api.selectAll")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => setEdit({ ...edit, f: { ...edit.f, sport_ids: [], tournament_ids: [] } })}
                  >
                    {t("api.deselectAll")}
                  </Button>
                </div>
                <div className="panel-scroll max-h-72 overflow-auto rounded-sm border border-border p-2">
                  {(tree.data ?? []).map((s) => (
                    <div key={s.id} className="mb-1">
                      <label className="flex items-center gap-1.5 font-semibold">
                        <Checkbox checked={edit.f.sport_ids.includes(s.id)} onCheckedChange={() => setEdit({ ...edit, f: { ...edit.f, sport_ids: toggle(edit.f.sport_ids, s.id) } })} />
                        {s.name}
                      </label>
                      {s.categories.flatMap((c) =>
                        c.tournaments.map((tn) => (
                          <label key={tn.id} className="ml-5 flex items-center gap-1.5">
                            <Checkbox checked={edit.f.tournament_ids.includes(tn.id)} onCheckedChange={() => setEdit({ ...edit, f: { ...edit.f, tournament_ids: toggle(edit.f.tournament_ids, tn.id) } })} />
                            {c.name} · {tn.name}
                          </label>
                        )),
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEdit(null)}>{t("common.cancel")}</Button>
            <Button onClick={save} disabled={run.isPending || !edit?.f.name.trim() || !edit?.f.formats.length}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!keyForm} onOpenChange={(o) => !o && setKeyForm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">{keyForm?.kind === "widget" ? t("api.newWidgetKey") : t("api.newServerKey")}</DialogTitle>
          </DialogHeader>
          {keyForm && (() => {
            const ips = keyForm.ips.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
            const badIp = ips.find((x) => !isValidIpRule(x));
            const badDate = !!keyForm.expires && new Date(keyForm.expires).getTime() <= Date.now();
            return (
              <div className="space-y-3 text-[11px]">
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase">{t("api.keyLabel")}</Label>
                  <Input value={keyForm.label} maxLength={60} placeholder="Production" onChange={(e) => setKeyForm({ ...keyForm, label: e.target.value })} className="h-8" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase">{t("api.expires")}</Label>
                  <Input type="datetime-local" value={keyForm.expires} onChange={(e) => setKeyForm({ ...keyForm, expires: e.target.value })} className="h-8" />
                  <p className="text-muted-foreground">{badDate ? <span className="text-danger">{t("api.expiresFuture")}</span> : t("api.expiresHint")}</p>
                </div>
                {keyForm.kind === "server" && (
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase">{t("api.ipWhitelist")}</Label>
                    <Input value={keyForm.ips} placeholder="203.0.113.10, 198.51.100.0/24" onChange={(e) => setKeyForm({ ...keyForm, ips: e.target.value })} className="h-8 font-mono" />
                    <p className="text-muted-foreground">{badIp ? <span className="text-danger">{t("api.ipInvalid")}: {badIp}</span> : t("api.ipHint")}</p>
                  </div>
                )}
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setKeyForm(null)}>{t("common.cancel")}</Button>
                  <Button
                    disabled={!!badIp || badDate || run.isPending}
                    onClick={() =>
                      run.mutate({
                        action: "create_key",
                        client_id: keyForm.client_id,
                        kind: keyForm.kind,
                        label: keyForm.label,
                        expires_at: keyForm.expires ? new Date(keyForm.expires).toISOString() : null,
                        allowed_ips: keyForm.kind === "server" ? ips : [],
                      })
                    }
                  >
                    {t("api.generate")}
                  </Button>
                </DialogFooter>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={!!newKey} onOpenChange={(o) => !o && setNewKey(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-sm">{t("api.newKey")}</DialogTitle>
          </DialogHeader>
          {newKey && (
            <div className="space-y-3 text-[11px]">
              <p className="font-semibold text-warning">{t("api.onceHint")}</p>
              {newKey.oldExpires && (
                <p className="text-muted-foreground">
                  {t("api.rotatedHint")} {new Date(newKey.oldExpires).toLocaleString()}
                </p>
              )}
              <div className="flex gap-2">
                <Input readOnly value={newKey.key} className="h-8 font-mono text-[11px]" />
                <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => copy(newKey.key)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Label className="text-[11px] uppercase">{t("api.example")}</Label>
              <pre className="panel-scroll overflow-auto rounded-sm bg-muted p-2 font-mono text-[10px]">
                {newKey.kind === "widget"
                  ? `<script src="${WIDGET_SCRIPT}"\n  data-key="${newKey.key}"\n  data-api="${FEED_BASE}/feed-widget"\n  data-sport="sr:sport:1"></script>`
                  : `curl -H "X-API-Key: ${newKey.key}" \\\n  "${FEED_BASE}/feed-api/matches?format=xml"`}
              </pre>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
