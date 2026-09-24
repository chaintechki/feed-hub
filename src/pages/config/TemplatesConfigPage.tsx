import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, MoreVertical, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { MARKETS, defaultMarket, useAssignments, useLadders, useTemplates, type Template } from "@/lib/feed/config";
import { useSportTree } from "@/lib/feed/queries";
import { friendlyError } from "@/lib/errors";

export default function TemplatesConfigPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const tpls = useTemplates();
  const ladders = useLadders();
  const tree = useSportTree();
  const asg = useAssignments();
  const [form, setForm] = useState<{ name: string; sport_id: string; ladder_id: string; from?: Template } | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const config = form!.from?.config ?? { markets: Object.fromEntries(MARKETS.map((m) => [m.id, defaultMarket(m.id)])) };
      const { data, error } = await supabase
        .from("templates")
        .insert({ name: form!.name.trim(), sport_id: form!.sport_id || null, ladder_id: form!.ladder_id || null, config: config as never, created_by: u.user?.id ?? null })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      setForm(null);
      void qc.invalidateQueries({ queryKey: ["templates"] });
      navigate(`/configuration/templates/${id}`);
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("cfg.deleted"));
      void qc.invalidateQueries({ queryKey: ["templates"] });
      void qc.invalidateQueries({ queryKey: ["template_assignments"] });
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  const sportName = (id: string | null) => tree.data?.find((s) => s.id === id)?.name ?? t("cfg.allSports");

  return (
    <PageShell
      title={t("cfg.tab.templates")}
      description={t("cfg.templatesHint")}
      actions={
        <Button size="sm" className="h-7 text-[11px] uppercase" onClick={() => setForm({ name: "", sport_id: "", ladder_id: ladders.data?.[0]?.id ?? "" })}>
          <Plus className="mr-1 h-3.5 w-3.5" /> {t("cfg.newTemplate")}
        </Button>
      }
    >
      <div className="rounded-sm border border-border bg-panel">
        <table className="w-full text-[11px]">
          <thead className="bg-panel-header text-[10px] uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 text-left">Name</th>
              <th className="px-3 py-1.5 text-left">{t("cfg.sport")}</th>
              <th className="px-3 py-1.5 text-left">{t("cfg.ladder")}</th>
              <th className="px-3 py-1.5 text-right">{t("cfg.activeMarkets")}</th>
              <th className="px-3 py-1.5 text-right">{t("cfg.assigned")}</th>
              <th className="px-3 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {(tpls.data ?? []).map((tp) => {
              const mk = Object.values(tp.config?.markets ?? {});
              return (
                <tr key={tp.id} className="border-t border-border hover:bg-row-hover">
                  <td className="px-3 py-1.5 font-semibold">
                    <Link to={`/configuration/templates/${tp.id}`} className="hover:text-primary hover:underline">{tp.name}</Link>
                  </td>
                  <td className="px-3 py-1.5">{sportName(tp.sport_id)}</td>
                  <td className="px-3 py-1.5">{ladders.data?.find((l) => l.id === tp.ladder_id)?.name ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{mk.filter((m) => m.enabled).length}/{mk.length}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{asg.data?.filter((a) => a.template_id === tp.id).length ?? 0}</td>
                  <td className="px-3 py-1.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger><MoreVertical className="h-3.5 w-3.5 text-muted-foreground" /></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setForm({ name: `${tp.name} (copy)`, sport_id: tp.sport_id ?? "", ladder_id: tp.ladder_id ?? "", from: tp })}>
                          <Copy className="mr-2 h-3.5 w-3.5" /> {t("cfg.duplicate")}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-danger" onClick={() => confirm(t("cfg.deleteTemplateConfirm")) && remove.mutate(tp.id)}>
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> {t("cfg.deleteTemplate")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
            {!tpls.data?.length && (
              <tr><td colSpan={6} className="px-3 py-3 text-muted-foreground">{t("cfg.noTemplates")}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-sm">{form?.from ? t("cfg.duplicate") : t("cfg.newTemplate")}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3 text-[11px]">
              <div className="space-y-1">
                <Label className="text-[11px] uppercase">Name</Label>
                <Input value={form.name} maxLength={100} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] uppercase">{t("cfg.sport")}</Label>
                <select value={form.sport_id} onChange={(e) => setForm({ ...form, sport_id: e.target.value })} className="h-8 w-full rounded-sm border border-border bg-background px-2">
                  <option value="">{t("cfg.allSports")}</option>
                  {(tree.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] uppercase">{t("cfg.ladder")}</Label>
                <select value={form.ladder_id} onChange={(e) => setForm({ ...form, ladder_id: e.target.value })} className="h-8 w-full rounded-sm border border-border bg-background px-2">
                  {(ladders.data ?? []).filter((l) => l.kind === "single").map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setForm(null)}>{t("common.cancel")}</Button>
            <Button disabled={!form?.name.trim() || create.isPending} onClick={() => create.mutate()}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
