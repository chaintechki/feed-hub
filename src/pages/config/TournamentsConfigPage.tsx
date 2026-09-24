import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAssignments, useTemplates, useTournamentConfig } from "@/lib/feed/config";
import { useSportTree } from "@/lib/feed/queries";
import { cn } from "@/lib/utils";
import { BookmakerListCell } from "@/components/config/BookmakerListCell";

type Draft = { activation?: string; alert_factor?: number; template?: string };
const ACT = ["off", "mon", "ctrl"] as const;

export default function TournamentsConfigPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const tree = useSportTree();
  const cfg = useTournamentConfig();
  const tpls = useTemplates();
  const asg = useAssignments();
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const set = (id: string, d: Draft) => setDraft({ ...draft, [id]: { ...draft[id], ...d } });

  const tplFor = (catId: string, tourId: string) => {
    const own = asg.data?.find((a) => a.tournament_id === tourId);
    if (own) return { id: own.template_id, inherited: false };
    const cat = asg.data?.find((a) => a.category_id === catId);
    return cat ? { id: cat.template_id, inherited: true } : null;
  };

  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      for (const [id, d] of Object.entries(draft)) {
        if (d.activation !== undefined || d.alert_factor !== undefined) {
          const cur = cfg.data?.get(id);
          const af = d.alert_factor ?? cur?.alert_factor ?? 1;
          if (!(af >= 0 && af <= 2)) throw new Error(t("cfg.factorRange"));
          const { error } = await supabase.from("tournament_config").upsert({
            tournament_id: id,
            activation: d.activation ?? cur?.activation ?? "ctrl",
            alert_factor: af,
            updated_by: u.user?.id ?? null,
            updated_at: new Date().toISOString(),
          });
          if (error) throw error;
        }
        if (d.template !== undefined) {
          await supabase.from("template_assignments").delete().eq("tournament_id", id);
          if (d.template) {
            const { error } = await supabase.from("template_assignments").insert({ template_id: d.template, tournament_id: id });
            if (error) throw error;
          }
        }
      }
    },
    onSuccess: () => {
      setDraft({});
      toast.success(t("users.saved"));
      void qc.invalidateQueries({ queryKey: ["tournament_config"] });
      void qc.invalidateQueries({ queryKey: ["template_assignments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dirty = Object.keys(draft).length > 0;

  return (
    <PageShell
      title={t("cfg.tab.tournaments")}
      description={t("cfg.tournamentsHint")}
      actions={
        <Button size="sm" className="h-7 text-[11px] uppercase" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {t("common.save")}
        </Button>
      }
    >
      <div className="rounded-sm border border-border bg-panel">
        <table className="w-full text-[11px]">
          <thead className="bg-panel-header text-[10px] uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 text-left">{t("cfg.tournament")}</th>
              <th className="px-3 py-1.5 text-center">{t("cfg.activation")}</th>
              <th className="px-3 py-1.5 text-center">{t("cfg.alertFactor")}</th>
              <th className="px-3 py-1.5 text-left">{t("cfg.template")}</th>
              <th className="px-3 py-1.5 text-left">{t("cfg.bookmakerList")}</th>
            </tr>
          </thead>
          <tbody>
            {(tree.data ?? []).map((s) => [
              <tr key={s.id} className="border-t border-border bg-panel-header">
                <td colSpan={5} className="px-3 py-1 font-bold uppercase">{s.name}</td>
              </tr>,
              ...s.categories.flatMap((c) =>
                c.tournaments.map((tn) => {
                  const cur = cfg.data?.get(tn.id);
                  const d = draft[tn.id] ?? {};
                  const act = d.activation ?? cur?.activation ?? "ctrl";
                  const tp = tplFor(c.id, tn.id);
                  const tplVal = d.template ?? (tp && !tp.inherited ? tp.id : "");
                  return (
                    <tr key={tn.id} className={cn("border-t border-border", draft[tn.id] && "bg-row-alt")}>
                      <td className="px-3 py-1">
                        <span className="text-muted-foreground">{c.name} · </span>
                        <span className="font-semibold">{tn.name}</span>
                      </td>
                      <td className="px-3 py-1 text-center">
                        <div className="inline-flex overflow-hidden rounded-sm border border-border">
                          {ACT.map((a) => (
                            <button
                              key={a}
                              onClick={() => set(tn.id, { activation: a })}
                              className={cn(
                                "h-6 w-12 text-[10px] font-bold uppercase",
                                act === a
                                  ? a === "off" ? "bg-danger text-danger-foreground" : a === "mon" ? "bg-warning text-warning-foreground" : "bg-success text-primary-foreground"
                                  : "bg-muted text-muted-foreground",
                              )}
                            >
                              {a}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-1 text-center">
                        <Input
                          type="number"
                          min={0}
                          max={2}
                          step={0.1}
                          value={d.alert_factor ?? cur?.alert_factor ?? 1}
                          onChange={(e) => set(tn.id, { alert_factor: Number(e.target.value) })}
                          className="mx-auto h-6 w-20 text-center text-[11px]"
                        />
                      </td>
                      <td className="px-3 py-1">
                        <select
                          value={tplVal}
                          onChange={(e) => set(tn.id, { template: e.target.value })}
                          className="h-6 rounded-sm border border-border bg-background px-1 text-[11px]"
                        >
                          <option value="">{tp?.inherited ? `${t("cfg.inherited")}: ${tpls.data?.find((x) => x.id === tp.id)?.name ?? ""}` : "—"}</option>
                          {(tpls.data ?? []).filter((x) => !x.sport_id || x.sport_id === s.id).map((x) => (
                            <option key={x.id} value={x.id}>{x.name}</option>
                          ))}
                        </select>
                        {tplVal && (
                          <Link to={`/configuration/templates/${tplVal}`} className="ml-2 text-primary hover:underline">
                            {t("cfg.open")}
                          </Link>
                        )}
                      </td>
                      <td className="px-3 py-1">
                        <BookmakerListCell sportId={s.id} categoryId={c.id} tournamentId={tn.id} />
                      </td>
                    </tr>
                  );
                }),
              ),
            ])}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{t("cfg.activationHelp")}</p>
    </PageShell>
  );
}
