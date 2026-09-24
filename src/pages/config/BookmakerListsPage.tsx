import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useBookmakerLists, useBookmakers } from "@/lib/feed/bookmakers";
import { resolveList } from "@/lib/feed/normalize";
import { useSportTree } from "@/lib/feed/queries";
import { cn } from "@/lib/utils";

type Level = "sport" | "category" | "tournament";
type Node = { level: Level; ref: string };

export default function BookmakerListsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tree = useSportTree();
  const books = useBookmakers();
  const lists = useBookmakerLists();
  const node: Node | null = params.get("level") && params.get("ref") ? { level: params.get("level") as Level, ref: params.get("ref")! } : null;
  const select = (n: Node) => setParams({ level: n.level, ref: n.ref });
  const [items, setItems] = useState<{ bookmaker_id: string; weight: number }[] | null>(null);

  // ids chain for the selected node
  const chain = useMemo(() => {
    if (!node) return null;
    for (const s of tree.data ?? []) {
      if (node.level === "sport" && s.id === node.ref) return { sportId: s.id, categoryId: "", tournamentId: "", label: s.name };
      for (const c of s.categories) {
        if (node.level === "category" && c.id === node.ref) return { sportId: s.id, categoryId: c.id, tournamentId: "", label: `${s.name} / ${c.name}` };
        for (const tn of c.tournaments)
          if (node.level === "tournament" && tn.id === node.ref) return { sportId: s.id, categoryId: c.id, tournamentId: tn.id, label: `${s.name} / ${c.name} / ${tn.name}` };
      }
    }
    return null;
  }, [node, tree.data]);

  const own = lists.data?.find((l) => node && l.level === node.level && l.ref_id === node.ref);
  const effective = chain ? resolveList(lists.data ?? [], chain) : null;
  const inheritedFrom = !own && effective ? effective : null;

  useEffect(() => setItems(null), [node?.level, node?.ref]);
  const cur = items ?? own?.items ?? null;

  const save = useMutation({
    mutationFn: async () => {
      let listId = own?.id;
      if (!listId) {
        const { data, error } = await supabase.from("bookmaker_lists").insert({ level: node!.level, ref_id: node!.ref }).select("id").single();
        if (error) throw error;
        listId = data.id;
      }
      await supabase.from("bookmaker_list_items").delete().eq("list_id", listId);
      if (cur?.length) {
        if (cur.some((i) => !(i.weight > 0 && i.weight <= 10))) throw new Error(t("cfg.weightRange"));
        const { error } = await supabase.from("bookmaker_list_items").insert(cur.map((i) => ({ ...i, list_id: listId! })));
        if (error) throw error;
      }
      await supabase.from("bookmaker_lists").update({ updated_at: new Date().toISOString() }).eq("id", listId);
    },
    onSuccess: () => {
      setItems(null);
      toast.success(t("users.saved"));
      void qc.invalidateQueries({ queryKey: ["bookmaker_lists"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("bookmaker_lists").delete().eq("id", own!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setItems(null);
      void qc.invalidateQueries({ queryKey: ["bookmaker_lists"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hasList = (lvl: Level, ref: string) => lists.data?.some((l) => l.level === lvl && l.ref_id === ref);
  const nodeBtn = (lvl: Level, ref: string, label: string, indent: string) => (
    <button
      key={lvl + ref}
      onClick={() => select({ level: lvl, ref })}
      className={cn(
        "flex w-full items-center gap-1 px-2 py-1 text-left",
        indent,
        node?.level === lvl && node.ref === ref ? "bg-row-hover font-semibold text-primary" : "hover:bg-row-alt",
        lvl === "sport" && "font-bold uppercase",
      )}
    >
      <span className="flex-1 truncate">{label}</span>
      {hasList(lvl, ref) && <span className="h-2 w-2 rounded-full bg-success" />}
    </button>
  );
  const available = (books.data ?? []).filter((b) => !cur?.some((i) => i.bookmaker_id === b.id));

  return (
    <PageShell title={t("cfg.tab.bookmakers")} description={t("cfg.bookmakersHint")}>
      <div className="grid grid-cols-[300px_1fr] gap-4">
        <div className="panel-scroll max-h-[640px] overflow-auto rounded-sm border border-border bg-panel text-[11px]">
          {(tree.data ?? []).map((s) => [
            nodeBtn("sport", s.id, s.name, ""),
            ...s.categories.flatMap((c) => [nodeBtn("category", c.id, c.name, "pl-5"), ...c.tournaments.map((tn) => nodeBtn("tournament", tn.id, tn.name, "pl-9"))]),
          ])}
        </div>

        <div className="space-y-3">
          {!chain && <p className="text-[11px] text-muted-foreground">{t("cfg.pickLevel")}</p>}
          {chain && (
            <>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="rounded-sm bg-muted px-1.5 py-0.5 font-bold uppercase">{t(`cfg.level.${node!.level}`)}</span>
                <span className="font-semibold">{chain.label}</span>
                <div className="ml-auto flex gap-2">
                  {own && (
                    <Button size="sm" variant="ghost" className="h-7 text-[11px] text-danger" onClick={() => confirm(t("cfg.deleteList")) && remove.mutate()}>
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> {t("cfg.deleteListBtn")}
                    </Button>
                  )}
                  {cur && (
                    <Button size="sm" className="h-7 text-[11px] uppercase" disabled={save.isPending} onClick={() => save.mutate()}>
                      {t("common.save")}
                    </Button>
                  )}
                </div>
              </div>

              {!cur && (
                <div className="rounded-sm border border-border bg-panel p-3 text-[11px]">
                  {inheritedFrom ? (
                    <p>
                      {t("cfg.inheritedFrom")} <b>{t(`cfg.level.${inheritedFrom.from}`)}</b> ({inheritedFrom.items.length} {t("cfg.bookmakers")}).
                    </p>
                  ) : (
                    <p className="text-muted-foreground">{t("cfg.noList")}</p>
                  )}
                  <Button size="sm" variant="outline" className="mt-2 h-7 text-[11px]" onClick={() => setItems(inheritedFrom ? [...inheritedFrom.items] : [])}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> {t("cfg.createListHere")}
                  </Button>
                </div>
              )}

              {cur && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-sm border border-border bg-panel">
                    <div className="border-b border-border bg-panel-header px-3 py-1.5 text-[10px] font-bold uppercase text-muted-foreground">{t("cfg.listItems")}</div>
                    {[...cur].sort((a, b) => b.weight - a.weight).map((it) => (
                      <div key={it.bookmaker_id} className="flex items-center gap-2 border-b border-border px-3 py-1 text-[11px] last:border-0">
                        <span className="flex-1 font-semibold">{books.data?.find((b) => b.id === it.bookmaker_id)?.name}</span>
                        <span className="text-muted-foreground">{t("cfg.weight")}</span>
                        <Input
                          type="number"
                          min={0.1}
                          max={10}
                          step={0.1}
                          value={it.weight}
                          onChange={(e) => setItems(cur.map((x) => (x.bookmaker_id === it.bookmaker_id ? { ...x, weight: Number(e.target.value) } : x)))}
                          className="h-6 w-20 text-[11px]"
                        />
                        <button onClick={() => setItems(cur.filter((x) => x.bookmaker_id !== it.bookmaker_id))}>
                          <Trash2 className="h-3.5 w-3.5 text-danger" />
                        </button>
                      </div>
                    ))}
                    {!cur.length && <p className="px-3 py-2 text-[11px] text-muted-foreground">{t("cfg.emptyList")}</p>}
                  </div>
                  <div className="rounded-sm border border-border bg-panel">
                    <div className="border-b border-border bg-panel-header px-3 py-1.5 text-[10px] font-bold uppercase text-muted-foreground">{t("cfg.addBookmakers")}</div>
                    {[...available].sort((a, b) => Number(b.suggested) - Number(a.suggested)).map((b) => (
                      <button
                        key={b.id}
                        onClick={() => setItems([...cur, { bookmaker_id: b.id, weight: 1 }])}
                        className="flex w-full items-center gap-2 border-b border-border px-3 py-1 text-left text-[11px] last:border-0 hover:bg-row-alt"
                      >
                        <Plus className="h-3.5 w-3.5 text-primary" />
                        <span className="flex-1">{b.name}</span>
                        {b.suggested && <span className="rounded-sm bg-success px-1 text-[9px] font-bold uppercase text-primary-foreground">{t("cfg.suggested")}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}
