import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatOdds, useOddsFormat } from "@/hooks/useOddsFormat";
import { supabase } from "@/integrations/supabase/client";
import { normalizeTo } from "@/lib/feed/normalize";
import { useSportTree } from "@/lib/feed/queries";
import { cn } from "@/lib/utils";

type Comp = { name: string; odds: number };
type Row = { id: string; tournament_id: string; name: string; scheduled: string | null; status: string; competitors: Comp[]; suspended: boolean; odds_key: number; custom: boolean };
type Form = { id?: string; tournament_id: string; name: string; scheduled: string; competitors: Comp[]; odds_key: number };

export default function OutrightsConfigPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { format } = useOddsFormat();
  const tree = useSportTree();
  const [form, setForm] = useState<Form | null>(null);
  const [keys, setKeys] = useState<Record<string, number>>({});

  const q = useQuery({
    queryKey: ["outrights-config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("outrights").select("id,tournament_id,name,scheduled,status,competitors,suspended,odds_key,custom").order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });
  const tourName = (id: string) => {
    for (const s of tree.data ?? []) for (const c of s.categories) for (const tn of c.tournaments) if (tn.id === id) return `${s.name} / ${c.name} / ${tn.name}`;
    return id;
  };
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["outrights-config"] });
    void qc.invalidateQueries({ queryKey: ["outrights"] });
  };

  const patch = useMutation({
    mutationFn: async ({ id, change }: { id: string; change: { suspended?: boolean; odds_key?: number } }) => {
      if (change.odds_key !== undefined && !(change.odds_key >= 100 && change.odds_key <= 200)) throw new Error(t("oc.keyRange"));
      const { error } = await supabase.from("outrights").update(change).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setKeys({});
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: async () => {
      const f = form!;
      const comps = f.competitors.filter((c) => c.name.trim());
      if (comps.length < 2 || comps.some((c) => !(c.odds > 1))) throw new Error(t("oc.compInvalid"));
      const { data: u } = await supabase.auth.getUser();
      const row = {
        tournament_id: f.tournament_id,
        name: f.name.trim(),
        scheduled: f.scheduled ? new Date(f.scheduled).toISOString() : null,
        competitors: comps as never,
        odds_key: f.odds_key,
      };
      const { error } = f.id
        ? await supabase.from("outrights").update(row).eq("id", f.id)
        : await supabase.from("outrights").insert({ ...row, id: `custom:${crypto.randomUUID()}`, custom: true, status: "open", created_by: u.user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => {
      setForm(null);
      toast.success(t("users.saved"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("outrights").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const firstTour = tree.data?.[0]?.categories[0]?.tournaments[0]?.id ?? "";

  return (
    <PageShell
      title={t("cfg.tab.outrights")}
      description={t("oc.hint")}
      actions={
        <Button size="sm" className="h-7 text-[11px] uppercase" onClick={() => setForm({ tournament_id: firstTour, name: "", scheduled: "", competitors: [{ name: "", odds: 2 }, { name: "", odds: 3 }], odds_key: 115 })}>
          <Plus className="mr-1 h-3.5 w-3.5" /> {t("oc.newCustom")}
        </Button>
      }
    >
      <div className="rounded-sm border border-border bg-panel">
        <table className="w-full text-[11px]">
          <thead className="bg-panel-header text-[10px] uppercase text-muted-foreground">
            <tr>
              <th className="w-6 px-2 py-1.5" />
              <th className="px-3 py-1.5 text-left">Outright</th>
              <th className="px-3 py-1.5 text-left">{t("cfg.tournament")}</th>
              <th className="px-3 py-1.5 text-left">{t("oc.top")}</th>
              <th className="px-3 py-1.5 text-center">{t("mu.key")}</th>
              <th className="px-3 py-1.5 text-center">Status</th>
              <th className="px-3 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {(q.data ?? []).map((r) => {
              const comps = r.competitors ?? [];
              const priced = comps.length > 1 ? normalizeTo(comps.map((c) => c.odds), Number(r.odds_key)) : comps.map((c) => c.odds);
              const top = comps.map((c, i) => ({ ...c, odds: priced[i]! })).sort((a, b) => a.odds - b.odds).slice(0, 3);
              const k = keys[r.id] ?? Number(r.odds_key);
              return (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-2 py-1.5">
                    <span title={r.suspended ? t("mu.suspended") : t("mu.active")} className={cn("block h-2.5 w-2.5 rounded-full", r.suspended ? "bg-danger" : "bg-success")} />
                  </td>
                  <td className="px-3 py-1.5 font-semibold">
                    {r.name}
                    {r.custom && <span className="ml-2 rounded-sm bg-primary px-1 text-[9px] font-bold uppercase text-primary-foreground">custom</span>}
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">{tourName(r.tournament_id)}</td>
                  <td className="px-3 py-1.5">{top.map((c) => `${c.name} ${formatOdds(c.odds, format)}`).join(" · ") || "—"}</td>
                  <td className="px-3 py-1.5 text-center">
                    <Input
                      type="number"
                      min={100}
                      max={200}
                      step={0.5}
                      value={k}
                      onChange={(e) => setKeys({ ...keys, [r.id]: Number(e.target.value) })}
                      onBlur={() => keys[r.id] !== undefined && keys[r.id] !== Number(r.odds_key) && patch.mutate({ id: r.id, change: { odds_key: keys[r.id]! } })}
                      className="mx-auto h-6 w-20 text-center text-[11px]"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <button
                      onClick={() => patch.mutate({ id: r.id, change: { suspended: !r.suspended } })}
                      className={cn("h-6 rounded-sm px-2 text-[9px] font-bold uppercase", r.suspended ? "bg-danger text-danger-foreground" : "bg-success text-primary-foreground")}
                    >
                      {r.suspended ? t("oc.suspended") : t("oc.published")}
                    </button>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {r.custom && (
                      <>
                        <button
                          className="mr-2"
                          onClick={() =>
                            setForm({ id: r.id, tournament_id: r.tournament_id, name: r.name, scheduled: r.scheduled ? r.scheduled.slice(0, 16) : "", competitors: comps, odds_key: Number(r.odds_key) })
                          }
                        >
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                        <button onClick={() => confirm(t("oc.deleteConfirm")) && remove.mutate(r.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-danger" />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="text-sm">{form?.id ? t("oc.edit") : t("oc.newCustom")}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3 text-[11px]">
              <div className="space-y-1">
                <Label className="text-[11px] uppercase">Name</Label>
                <Input value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-8" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1">
                  <Label className="text-[11px] uppercase">{t("cfg.tournament")}</Label>
                  <select value={form.tournament_id} onChange={(e) => setForm({ ...form, tournament_id: e.target.value })} className="h-8 w-full rounded-sm border border-border bg-background px-2">
                    {(tree.data ?? []).flatMap((s) => s.categories.flatMap((c) => c.tournaments.map((tn) => <option key={tn.id} value={tn.id}>{s.name} / {c.name} / {tn.name}</option>)))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase">{t("mu.key")}</Label>
                  <Input type="number" min={100} max={200} value={form.odds_key} onChange={(e) => setForm({ ...form, odds_key: Number(e.target.value) })} className="h-8" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] uppercase">{t("oc.scheduled")}</Label>
                <Input type="datetime-local" value={form.scheduled} onChange={(e) => setForm({ ...form, scheduled: e.target.value })} className="h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] uppercase">{t("oc.competitors")}</Label>
                {form.competitors.map((c, i) => (
                  <div key={i} className="flex gap-2">
                    <Input value={c.name} maxLength={80} placeholder="Name" onChange={(e) => setForm({ ...form, competitors: form.competitors.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} className="h-7 flex-1" />
                    <Input type="number" min={1.01} step={0.05} value={c.odds} onChange={(e) => setForm({ ...form, competitors: form.competitors.map((x, j) => (j === i ? { ...x, odds: Number(e.target.value) } : x)) })} className="h-7 w-24" />
                    <button onClick={() => setForm({ ...form, competitors: form.competitors.filter((_, j) => j !== i) })}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                  </div>
                ))}
                <button onClick={() => setForm({ ...form, competitors: [...form.competitors, { name: "", odds: 5 }] })} className="flex items-center gap-1 text-primary">
                  <Plus className="h-3.5 w-3.5" /> {t("oc.addCompetitor")}
                </button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setForm(null)}>{t("common.cancel")}</Button>
            <Button disabled={!form?.name.trim() || save.isPending} onClick={() => save.mutate()}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
