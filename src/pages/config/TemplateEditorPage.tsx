import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import {
  LINE_TYPES,
  MARKETS,
  defaultMarket,
  sortTimeline,
  useAssignments,
  useLadders,
  useTemplates,
  type MarketConf,
  type Template,
} from "@/lib/feed/config";
import { useSportTree } from "@/lib/feed/queries";
import { cn } from "@/lib/utils";

export default function TemplateEditorPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const tpls = useTemplates();
  const ladders = useLadders();
  const tree = useSportTree();
  const asg = useAssignments();
  const [tpl, setTpl] = useState<Template | null>(null);
  const [open, setOpen] = useState<string | null>("1x2");
  const [assign, setAssign] = useState<{ cats: string[]; tours: string[] } | null>(null);

  useEffect(() => {
    const src = tpls.data?.find((x) => x.id === id);
    if (src && !tpl) {
      const markets = { ...Object.fromEntries(MARKETS.map((m) => [m.id, defaultMarket(m.id)])), ...(src.config?.markets ?? {}) };
      setTpl({ ...src, config: { markets } });
    }
  }, [tpls.data, id, tpl]);
  useEffect(() => {
    if (asg.data && !assign)
      setAssign({
        cats: asg.data.filter((a) => a.template_id === id && a.category_id).map((a) => a.category_id!),
        tours: asg.data.filter((a) => a.template_id === id && a.tournament_id).map((a) => a.tournament_id!),
      });
  }, [asg.data, id, assign]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("templates")
        .update({ name: tpl!.name, ladder_id: tpl!.ladder_id, config: tpl!.config as never, updated_at: new Date().toISOString() })
        .eq("id", id!);
      if (error) throw error;
      await supabase.from("template_assignments").delete().eq("template_id", id!);
      const rows = [
        ...assign!.cats.map((c) => ({ template_id: id!, category_id: c })),
        ...assign!.tours.map((x) => ({ template_id: id!, tournament_id: x })),
      ];
      if (rows.length) {
        // move assignments from other templates to this one
        if (assign!.cats.length) await supabase.from("template_assignments").delete().in("category_id", assign!.cats);
        if (assign!.tours.length) await supabase.from("template_assignments").delete().in("tournament_id", assign!.tours);
        const { error: e2 } = await supabase.from("template_assignments").insert(rows);
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      toast.success(t("users.saved"));
      void qc.invalidateQueries({ queryKey: ["templates"] });
      void qc.invalidateQueries({ queryKey: ["template_assignments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!tpl) return <p className="p-4 text-[11px] text-muted-foreground">{t("common.loading")}</p>;
  const mk = tpl.config.markets;
  const setMk = (mid: string, c: Partial<MarketConf>) => setTpl({ ...tpl, config: { markets: { ...mk, [mid]: { ...mk[mid]!, ...c } } } });
  const allOn = MARKETS.every((m) => mk[m.id]?.enabled);
  const toggleAll = () => setTpl({ ...tpl, config: { markets: Object.fromEntries(Object.entries(mk).map(([k, v]) => [k, { ...v, enabled: !allOn }])) } });
  const sport = tree.data?.find((s) => s.id === tpl.sport_id);
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <PageShell
      title={tpl.name}
      description={`${sport?.name ?? t("cfg.allSports")} · ${ladders.data?.find((l) => l.id === tpl.ladder_id)?.name ?? "—"}`}
      actions={
        <>
          <Button asChild size="sm" variant="ghost" className="h-7 text-[11px]">
            <Link to="/configuration/templates"><ArrowLeft className="mr-1 h-3.5 w-3.5" /> {t("cfg.tab.templates")}</Link>
          </Button>
          <Button size="sm" className="h-7 text-[11px] uppercase" disabled={save.isPending || !tpl.name.trim()} onClick={() => save.mutate()}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-[1fr_320px] gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-[11px]">
            <Input value={tpl.name} maxLength={100} onChange={(e) => setTpl({ ...tpl, name: e.target.value })} className="h-7 w-64 text-[11px]" />
            <select value={tpl.ladder_id ?? ""} onChange={(e) => setTpl({ ...tpl, ladder_id: e.target.value || null })} className="h-7 rounded-sm border border-border bg-background px-2">
              {(ladders.data ?? []).filter((l) => l.kind === "single").map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <label className="ml-auto flex items-center gap-2 font-semibold uppercase">
              <Switch checked={allOn} onCheckedChange={toggleAll} /> {t("cfg.allMarkets")}
            </label>
          </div>

          <div className="rounded-sm border border-border bg-panel">
            {MARKETS.map((m) => {
              const c = mk[m.id]!;
              const isOpen = open === m.id;
              const tl = sortTimeline(c.timeline);
              return (
                <div key={m.id} className="border-b border-border last:border-0">
                  <div className={cn("flex items-center gap-3 px-3 py-1.5 text-[11px]", !c.enabled && "opacity-60")}>
                    <button onClick={() => setOpen(isOpen ? null : m.id)} className="text-muted-foreground">
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                    <Switch checked={c.enabled} onCheckedChange={(v) => setMk(m.id, { enabled: v })} />
                    <span className="w-40 font-semibold">{t(`mk.${m.id}`, m.id)}</span>
                    <div className="flex flex-1 items-center gap-1">
                      {tl.map((p, i) => (
                        <span key={i} className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                          {p.at === "inst" ? "Inst" : `${p.at}h`} · {p.key}
                        </span>
                      ))}
                    </div>
                    {c.ladder_id && <span className="text-[10px] text-primary">{ladders.data?.find((l) => l.id === c.ladder_id)?.name}</span>}
                  </div>
                  {isOpen && (
                    <div className="grid grid-cols-3 gap-4 border-t border-border bg-row-alt px-8 py-3 text-[11px]">
                      <div className="space-y-1">
                        <div className="font-bold uppercase text-muted-foreground">{t("cfg.timeline")}</div>
                        {tl.map((p, i) => (
                          <div key={i} className="flex items-center gap-1">
                            <select
                              value={String(p.at)}
                              onChange={(e) => {
                                const nt = [...tl];
                                nt[i] = { ...p, at: e.target.value === "inst" ? "inst" : Number(e.target.value) };
                                setMk(m.id, { timeline: nt });
                              }}
                              className="h-6 w-20 rounded-sm border border-border bg-background px-1"
                            >
                              <option value="inst">Inst</option>
                              {[168, 72, 48, 24, 12, 6, 3, 1].map((h) => <option key={h} value={h}>{h}h</option>)}
                            </select>
                            <Input
                              type="number"
                              min={100}
                              max={150}
                              step={0.5}
                              value={p.key}
                              onChange={(e) => {
                                const nt = [...tl];
                                nt[i] = { ...p, key: Number(e.target.value) };
                                setMk(m.id, { timeline: nt });
                              }}
                              className="h-6 w-20 text-[11px]"
                            />
                            <button onClick={() => setMk(m.id, { timeline: tl.filter((_, j) => j !== i) })} className="text-muted-foreground hover:text-danger">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                        <button onClick={() => setMk(m.id, { timeline: [...tl, { at: 24, key: 106 }] })} className="flex items-center gap-1 text-primary">
                          <Plus className="h-3.5 w-3.5" /> {t("cfg.addPoint")}
                        </button>
                        <p className="text-[10px] text-muted-foreground">{t("cfg.timelineHint")}</p>
                      </div>

                      <div className="space-y-2">
                        <div className="font-bold uppercase text-muted-foreground">{t("cfg.distribution")}</div>
                        {m.outcomes.length === 0 && <p className="text-muted-foreground">{t("cfg.noDistribution")}</p>}
                        {m.outcomes.map((o, i) => (
                          <div key={o} className="flex items-center gap-2">
                            <span className="w-10 font-semibold">{o}</span>
                            <Slider
                              min={-50}
                              max={50}
                              step={5}
                              value={[c.distribution[i] ?? 0]}
                              onValueChange={([v]) => {
                                const d = [...c.distribution];
                                d[i] = v ?? 0;
                                setMk(m.id, { distribution: d });
                              }}
                              className="flex-1"
                            />
                            <span className="w-10 text-right font-mono">{(c.distribution[i] ?? 0) > 0 ? "+" : ""}{c.distribution[i] ?? 0}%</span>
                          </div>
                        ))}
                        {m.outcomes.length > 0 && <p className="text-[10px] text-muted-foreground">{t("cfg.distributionHint")}</p>}
                      </div>

                      <div className="space-y-2">
                        {c.lines && (
                          <>
                            <div className="font-bold uppercase text-muted-foreground">{t("cfg.lines")}</div>
                            <div className="flex gap-3">
                              {LINE_TYPES.map((lt) => (
                                <label key={lt} className="flex items-center gap-1">
                                  <Checkbox checked={c.lines!.types.includes(lt)} onCheckedChange={() => setMk(m.id, { lines: { ...c.lines!, types: toggle(c.lines!.types, lt) } })} />
                                  {lt}
                                </label>
                              ))}
                            </div>
                            <label className="flex items-center gap-2">
                              {t("cfg.maxLines")}
                              <select value={c.lines.max} onChange={(e) => setMk(m.id, { lines: { ...c.lines!, max: Number(e.target.value) } })} className="h-6 rounded-sm border border-border bg-background px-1">
                                {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                              </select>
                            </label>
                          </>
                        )}
                        <div className="font-bold uppercase text-muted-foreground">{t("cfg.marketLadder")}</div>
                        <select value={c.ladder_id ?? ""} onChange={(e) => setMk(m.id, { ladder_id: e.target.value || null })} className="h-6 w-full rounded-sm border border-border bg-background px-1">
                          <option value="">{t("cfg.templateLadder")}</option>
                          {(ladders.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.name} ({l.kind})</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-sm border border-border bg-panel">
          <div className="border-b border-border bg-panel-header px-3 py-2 text-[11px] font-bold uppercase text-muted-foreground">{t("cfg.assignments")}</div>
          <p className="px-3 pt-2 text-[10px] text-muted-foreground">{t("cfg.assignHint")}</p>
          <div className="panel-scroll max-h-[520px] overflow-auto p-2 text-[11px]">
            {(tree.data ?? []).filter((s) => !tpl.sport_id || s.id === tpl.sport_id).map((s) =>
              s.categories.map((c) => (
                <div key={c.id} className="mb-1">
                  <label className="flex items-center gap-1.5 font-semibold">
                    <Checkbox checked={assign?.cats.includes(c.id)} onCheckedChange={() => setAssign({ ...assign!, cats: toggle(assign!.cats, c.id) })} />
                    {s.name} · {c.name}
                  </label>
                  {c.tournaments.map((tn) => (
                    <label key={tn.id} className="ml-5 flex items-center gap-1.5">
                      <Checkbox checked={assign?.tours.includes(tn.id)} onCheckedChange={() => setAssign({ ...assign!, tours: toggle(assign!.tours, tn.id) })} />
                      {tn.name}
                    </label>
                  ))}
                </div>
              )),
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
