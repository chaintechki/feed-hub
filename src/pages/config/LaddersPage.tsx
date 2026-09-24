import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useLadders, type Ladder } from "@/lib/feed/config";
import { formatOdds, useOddsFormat } from "@/hooks/useOddsFormat";
import { cn } from "@/lib/utils";
import { friendlyError } from "@/lib/errors";

/** Parse ladder text: single = "1.01, 1.02 …"; pairs = one "a;b" per line. */
export function parseLadder(kind: Ladder["kind"], text: string): number[] | number[][] {
  if (kind === "single") {
    const v = text.split(/[\s,;]+/).filter(Boolean).map(Number);
    if (!v.length || v.some((x) => !Number.isFinite(x) || x < 1.001 || x > 1001)) throw new Error("invalid");
    return [...new Set(v)].sort((a, b) => a - b);
  }
  const p = text.split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => l.split(/[\s,;]+/).map(Number));
  if (!p.length || p.some((r) => r.length !== 2 || r.some((x) => !Number.isFinite(x) || x < 1.001))) throw new Error("invalid");
  return p;
}
const toText = (l: Ladder) =>
  l.kind === "single" ? (l.values as number[]).join(", ") : (l.values as number[][]).map((p) => p.join("; ")).join("\n");

export default function LaddersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { format } = useOddsFormat();
  const ladders = useLadders();
  const [kind, setKind] = useState<Ladder["kind"]>("single");
  const [sel, setSel] = useState<string | null>(null);
  const [form, setForm] = useState<{ id?: string; name: string; kind: Ladder["kind"]; text: string } | null>(null);

  const list = (ladders.data ?? []).filter((l) => l.kind === kind);
  const cur = list.find((l) => l.id === sel) ?? list[0];

  const save = useMutation({
    mutationFn: async () => {
      let values;
      try {
        values = parseLadder(form!.kind, form!.text);
      } catch {
        throw new Error(t("cfg.ladderInvalid"));
      }
      const { data: u } = await supabase.auth.getUser();
      const row = { name: form!.name.trim(), kind: form!.kind, values: values as never };
      const { error } = form!.id
        ? await supabase.from("ladders").update(row).eq("id", form!.id)
        : await supabase.from("ladders").insert({ ...row, created_by: u.user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => {
      setForm(null);
      toast.success(t("users.saved"));
      void qc.invalidateQueries({ queryKey: ["ladders"] });
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ladders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ladders"] }),
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  return (
    <PageShell
      title={t("cfg.tab.ladders")}
      description={kind === "single" ? t("cfg.singleHint") : t("cfg.pairsHint")}
      actions={
        <Button size="sm" className="h-7 text-[11px] uppercase" onClick={() => setForm({ name: "", kind, text: "" })}>
          <Plus className="mr-1 h-3.5 w-3.5" /> {kind === "single" ? t("cfg.addLadder") : t("cfg.addPairs")}
        </Button>
      }
    >
      <div className="mb-3 inline-flex overflow-hidden rounded-sm border border-border text-[11px] font-bold uppercase">
        {(["single", "pairs"] as const).map((k) => (
          <button key={k} onClick={() => { setKind(k); setSel(null); }} className={cn("h-7 px-3", kind === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
            {t(`cfg.kind.${k}`)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[300px_1fr] gap-4">
        <div className="rounded-sm border border-border bg-panel text-[11px]">
          {list.map((l) => (
            <div
              key={l.id}
              onClick={() => setSel(l.id)}
              className={cn("flex cursor-pointer items-center gap-2 border-b border-border px-3 py-1.5 last:border-0", cur?.id === l.id ? "bg-row-hover font-semibold" : "hover:bg-row-alt")}
            >
              {l.is_system && <Lock className="h-3 w-3 text-muted-foreground" />}
              <span className="flex-1">{l.name}</span>
              <span className="text-muted-foreground">{l.values.length}</span>
              <button title={t("cfg.duplicate")} onClick={(e) => { e.stopPropagation(); setForm({ name: `${l.name} (copy)`, kind: l.kind, text: toText(l) }); }}>
                <Copy className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </button>
              {!l.is_system && (
                <>
                  <button onClick={(e) => { e.stopPropagation(); setForm({ id: l.id, name: l.name, kind: l.kind, text: toText(l) }); }}>
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); if (confirm(t("cfg.deleteLadder"))) remove.mutate(l.id); }}>
                    <Trash2 className="h-3.5 w-3.5 text-danger" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="rounded-sm border border-border bg-panel p-3">
          {cur && (
            <div className="flex flex-wrap gap-1">
              {cur.kind === "single"
                ? (cur.values as number[]).map((v) => (
                    <span key={v} className="rounded-sm bg-odds-neutral px-2 py-0.5 font-mono text-[11px]">{formatOdds(v, format)}</span>
                  ))
                : (cur.values as number[][]).map((p, i) => (
                    <span key={i} className="rounded-sm bg-odds-neutral px-2 py-0.5 font-mono text-[11px]">
                      {formatOdds(p[0]!, format)} / {formatOdds(p[1]!, format)}
                    </span>
                  ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="text-sm">{form?.id ? t("cfg.editLadder") : form?.kind === "pairs" ? t("cfg.addPairs") : t("cfg.addLadder")}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3 text-[11px]">
              <div className="space-y-1">
                <Label className="text-[11px] uppercase">Name</Label>
                <Input value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] uppercase">{t("cfg.values")}</Label>
                <Textarea value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} className="min-h-[160px] font-mono text-[11px]" placeholder={form.kind === "single" ? "1.01, 1.02, 1.05, 1.10 …" : "1.10; 6.50\n1.50; 2.50"} />
                <p className="text-muted-foreground">{form.kind === "single" ? t("cfg.valuesSingle") : t("cfg.valuesPairs")}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setForm(null)}>{t("common.cancel")}</Button>
            <Button disabled={!form?.name.trim() || !form?.text.trim() || save.isPending} onClick={() => save.mutate()}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
