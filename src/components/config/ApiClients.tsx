import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { useState } from "react";
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

type ApiKey = { id: string; kind: "server" | "widget"; prefix: string; active: boolean; last_used_at: string | null };
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
type ApiClient = ClientFields & { id: string; keys: ApiKey[]; calls_24h: number };

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

export const FEED_BASE = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1`;

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

export function ApiClients() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const tree = useSportTree();
  const [edit, setEdit] = useState<{ id?: string; f: ClientFields } | null>(null);
  const [domains, setDomains] = useState("");
  const [newKey, setNewKey] = useState<{ key: string; kind: string } | null>(null);

  const list = useQuery({
    queryKey: ["api_clients"],
    queryFn: () => call<{ clients: ApiClient[] }>({ action: "list" }).then((r) => r.clients),
  });

  const run = useMutation({
    mutationFn: (body: Record<string, unknown>) => call<{ key?: string }>(body),
    onSuccess: (r, body) => {
      if (r?.key) setNewKey({ key: r.key, kind: String(body.kind) });
      else toast.success(t("users.saved"));
      void qc.invalidateQueries({ queryKey: ["api_clients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function open(c?: ApiClient) {
    const f = c ? { ...EMPTY, ...c } : EMPTY;
    setDomains(f.allowed_domains.join(", "));
    setEdit({ id: c?.id, f: { ...f } });
  }
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

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
      allowed_domains: domains.split(/[\s,]+/).filter(Boolean),
      formats: f.formats,
    };
    run.mutate({ action: "save", id, client }, { onSuccess: () => setEdit(null) });
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("api.title")}</h2>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline" className="h-7 text-[11px] uppercase">
            <Link to="/api-docs">{t("api.docs")}</Link>
          </Button>
          <Button size="sm" className="h-7 text-[11px] uppercase" onClick={() => open()}>
            <Plus className="mr-1 h-3.5 w-3.5" /> {t("api.create")}
          </Button>
        </div>
      </div>

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
                {t("api.markup")}: {c.markup_pct}% · {t("api.limit")}: {c.rate_limit_per_min}/min · {t("api.calls24")}:{" "}
                {c.calls_24h} · {c.formats.join("/").toUpperCase()} ·{" "}
                {c.sport_ids.length || c.tournament_ids.length
                  ? `${c.sport_ids.length} ${t("api.sports")}, ${c.tournament_ids.length} ${t("api.leagues")}`
                  : t("api.allData")}
              </span>
              <div className="ml-auto flex gap-1">
                <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => run.mutate({ action: "create_key", client_id: c.id, kind: "server" })}>
                  <KeyRound className="mr-1 h-3.5 w-3.5" /> API
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => run.mutate({ action: "create_key", client_id: c.id, kind: "widget" })}>
                  <KeyRound className="mr-1 h-3.5 w-3.5" /> Widget
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => open(c)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-danger"
                  onClick={() => confirm(t("api.deleteConfirm")) && run.mutate({ action: "delete", id: c.id })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {c.keys.length > 0 && (
              <table className="w-full text-[11px]">
                <tbody>
                  {c.keys.map((k) => (
                    <tr key={k.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-1.5 font-mono">{k.prefix}…</td>
                      <td className="px-3 py-1.5 uppercase">{k.kind}</td>
                      <td className={k.active ? "px-3 py-1.5 text-success" : "px-3 py-1.5 text-danger"}>
                        {k.active ? t("users.active") : t("users.banned")}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {t("api.lastUsed")}: {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right">
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
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase">{t("api.markup")} %</Label>
                    <Input type="number" min={0} max={50} step={0.5} value={edit.f.markup_pct} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, markup_pct: Number(e.target.value) } })} className="h-8" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase">{t("api.limit")} / min</Label>
                    <Input type="number" min={1} max={10000} value={edit.f.rate_limit_per_min} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, rate_limit_per_min: Number(e.target.value) } })} className="h-8" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase">{t("api.domains")}</Label>
                  <Input placeholder="example.com, shop.example.org" value={domains} onChange={(e) => setDomains(e.target.value)} className="h-8" />
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

      <Dialog open={!!newKey} onOpenChange={(o) => !o && setNewKey(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-sm">{t("api.newKey")}</DialogTitle>
          </DialogHeader>
          {newKey && (
            <div className="space-y-3 text-[11px]">
              <p className="font-semibold text-warning">{t("api.onceHint")}</p>
              <div className="flex gap-2">
                <Input readOnly value={newKey.key} className="h-8 font-mono text-[11px]" />
                <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => copy(newKey.key)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Label className="text-[11px] uppercase">{t("api.example")}</Label>
              <pre className="panel-scroll overflow-auto rounded-sm bg-muted p-2 font-mono text-[10px]">
                {newKey.kind === "widget"
                  ? `<script src="${window.location.origin}/widget.js"\n  data-key="${newKey.key}"\n  data-api="${FEED_BASE}/feed-widget"\n  data-sport="sr:sport:1"></script>`
                  : `curl -H "x-api-key: ${newKey.key}" \\\n  "${FEED_BASE}/feed-api/matches?format=xml"`}
              </pre>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
