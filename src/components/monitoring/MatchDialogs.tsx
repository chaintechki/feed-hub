import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatOdds, useOddsFormat } from "@/hooks/useOddsFormat";
import { supabase } from "@/integrations/supabase/client";
import { useMatchAlerts, useMatchComments } from "@/lib/feed/queries";
import type { MatchRow } from "@/lib/feed/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";
import { friendlyError } from "@/lib/errors";

type Factor = { factor: string; value: number };

export async function logAction(matchId: string, action: string, details?: Record<string, unknown>) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.from("alert_log").insert({ match_id: matchId, user_id: data.user.id, action, details: (details ?? null) as never });
}

/** Recompute alerts from own vs average deviation on the key markets. */
export async function regenerateAlerts(m: MatchRow) {
  const factors: Factor[] = [];
  for (const own of m.odds.filter((o) => o.source === "own")) {
    const avg = m.odds.find((o) => o.source === "average" && o.market === own.market && o.specifier === own.specifier);
    if (!avg) continue;
    own.outcomes.forEach((oc, i) => {
      const a = avg.outcomes[i]?.odds;
      if (oc.odds && a) {
        const dev = Math.abs(oc.odds - a) / a;
        if (dev >= 0.03) factors.push({ factor: `${own.market}${own.specifier ? " " + own.specifier : ""} ${oc.label} ${oc.odds} vs ${a}`, value: Math.round(dev * 400) });
      }
    });
  }
  const score = factors.reduce((s, f) => s + f.value, 0);
  if (score > 0) {
    const { error } = await supabase.from("alerts").insert({
      match_id: m.id,
      type: "odds_deviation",
      severity: score >= 60 ? "critical" : score >= 25 ? "warning" : "info",
      message: `Own odds deviate from market average (${factors.length} outcomes)`,
      score,
      factors: factors as never,
    });
    if (error) throw error;
  }
  await logAction(m.id, "alerts_regenerated", { score, outcomes: factors.length });
  return score;
}

export function AlertScoreDialog({ match, onClose }: { match: MatchRow | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { format } = useOddsFormat();
  const qc = useQueryClient();
  const { data = [] } = useMatchAlerts(match?.id ?? null);
  const ack = useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("alerts").update({ acknowledged_at: new Date().toISOString(), acknowledged_by: u.user?.id ?? null }).eq("id", id);
      if (error) throw error;
      await logAction(match!.id, "alert_acknowledged", { alert_id: id });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["match-alerts"] });
      void qc.invalidateQueries({ queryKey: ["matches"] });
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
  const critical = (match?.odds ?? []).filter((o) => o.source === "own" && ["1x2", "total", "handicap"].includes(o.market));

  return (
    <Dialog open={!!match} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {t("mu.alertScore")} {match?.alertScore} · {match?.homeTeam} – {match?.awayTeam}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-[11px]">
          {data.length === 0 && <p className="text-muted-foreground">{t("mu.noAlerts")}</p>}
          {data.map((a) => (
            <div key={a.id} className={cn("rounded-sm border border-border", a.acknowledged_at && "opacity-60")}>
              <div className="flex items-center gap-2 border-b border-border bg-panel-header px-2 py-1">
                <span className={cn("font-bold uppercase", a.severity === "critical" ? "text-danger" : a.severity === "warning" ? "text-warning" : "text-muted-foreground")}>
                  {a.severity}
                </span>
                <span className="font-semibold">{a.type}</span>
                <span className="ml-auto font-mono font-bold">{Number(a.score)}</span>
                {!a.acknowledged_at && (
                  <Button size="sm" variant="outline" className="h-6 text-[10px] uppercase" onClick={() => ack.mutate(a.id)}>
                    {t("mu.ack")}
                  </Button>
                )}
              </div>
              <div className="px-2 py-1">
                <p className="mb-1">{a.message}</p>
                {((a.factors as Factor[]) ?? []).map((f, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="flex-1 text-muted-foreground">{f.factor}</span>
                    <span className="h-1.5 rounded-full bg-danger" style={{ width: Math.min(120, f.value * 2) }} />
                    <span className="w-8 text-right font-mono">{f.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div>
            <div className="mb-1 font-bold uppercase text-muted-foreground">{t("mu.criticalMarkets")}</div>
            <table className="w-full">
              <tbody>
                {critical.map((own) => {
                  const avg = match!.odds.find((o) => o.source === "average" && o.market === own.market && o.specifier === own.specifier);
                  return (
                    <tr key={own.market + own.specifier} className="border-b border-border">
                      <td className="py-1 font-semibold uppercase">{own.market} {own.specifier}</td>
                      {own.outcomes.map((oc, i) => (
                        <td key={i} className="py-1 text-center font-mono">
                          {oc.odds == null ? oc.label : formatOdds(oc.odds, format)}
                          <span className="text-muted-foreground"> / {avg?.outcomes[i]?.odds == null ? "–" : formatOdds(avg.outcomes[i]!.odds, format)}</span>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-1 text-muted-foreground">{t("mu.ownVsAvg")}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CommentsDialog({ match, onClose }: { match: MatchRow | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [tab, setTab] = useState<"comments" | "log">("comments");
  const [body, setBody] = useState("");
  const { data } = useMatchComments(match?.id ?? null);
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("match_comments").insert({ match_id: match!.id, author_id: user!.id, body: body.trim() });
      if (error) throw error;
      await supabase.from("matches").update({ comment_count: (match!.commentCount ?? 0) + 1 }).eq("id", match!.id);
    },
    onSuccess: () => {
      setBody("");
      void qc.invalidateQueries({ queryKey: ["match-comments"] });
      void qc.invalidateQueries({ queryKey: ["matches"] });
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  return (
    <Dialog open={!!match} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-sm">{match?.homeTeam} – {match?.awayTeam}</DialogTitle>
        </DialogHeader>
        <div className="flex gap-1 border-b border-border text-[11px] font-semibold uppercase">
          {(["comments", "log"] as const).map((k) => (
            <button key={k} onClick={() => setTab(k)} className={cn("px-3 py-1.5", tab === k ? "border-b-2 border-primary text-primary" : "text-muted-foreground")}>
              {t(`mu.${k}`)} ({k === "comments" ? data?.comments.length ?? 0 : data?.log.length ?? 0})
            </button>
          ))}
        </div>
        <div className="panel-scroll max-h-72 space-y-1 overflow-auto text-[11px]">
          {tab === "comments"
            ? data?.comments.map((c) => (
                <div key={c.id} className="rounded-sm border border-border px-2 py-1">
                  <div className="text-[10px] text-muted-foreground">{new Date(c.created_at).toLocaleString()}{c.author_id === user?.id ? ` · ${t("mu.you")}` : ""}</div>
                  {c.body}
                </div>
              ))
            : data?.log.map((l) => (
                <div key={l.id} className="flex gap-2 border-b border-border py-1">
                  <span className="text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span>
                  <span className="font-semibold">{l.action}</span>
                  <span className="truncate text-muted-foreground">{l.details ? JSON.stringify(l.details) : ""}</span>
                </div>
              ))}
          {tab === "comments" && !data?.comments.length && <p className="text-muted-foreground">{t("mu.noComments")}</p>}
          {tab === "log" && !data?.log.length && <p className="text-muted-foreground">{t("mu.noLog")}</p>}
        </div>
        {tab === "comments" && (
          <div className="flex gap-2">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} className="min-h-[60px] text-[11px]" placeholder={t("mu.commentPh")} />
            <Button size="sm" disabled={!body.trim() || add.isPending} onClick={() => add.mutate()}>{t("common.save")}</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Head-to-head: demo statistics until the stats feed is connected. */
export function H2HDialog({ match, onClose }: { match: MatchRow | null; onClose: () => void }) {
  const { t } = useTranslation();
  const seed = match ? [...match.id].reduce((a, c) => a + c.charCodeAt(0), 0) : 0;
  const games = Array.from({ length: 5 }, (_, i) => ({
    date: new Date(Date.now() - (i + 1) * 120 * 864e5).toLocaleDateString(),
    home: (seed + i * 3) % 4,
    away: (seed + i * 5) % 3,
  }));
  const w = games.filter((g) => g.home > g.away).length;
  const d = games.filter((g) => g.home === g.away).length;
  return (
    <Dialog open={!!match} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">{t("mu.h2h")} · {match?.homeTeam} – {match?.awayTeam}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-px bg-border text-center text-[11px]">
          <div className="bg-panel py-2"><div className="text-lg font-bold">{w}</div>{match?.homeTeam}</div>
          <div className="bg-panel py-2"><div className="text-lg font-bold">{d}</div>{t("mu.draws")}</div>
          <div className="bg-panel py-2"><div className="text-lg font-bold">{5 - w - d}</div>{match?.awayTeam}</div>
        </div>
        <table className="w-full text-[11px]">
          <tbody>
            {games.map((g, i) => (
              <tr key={i} className="border-b border-border">
                <td className="py-1 text-muted-foreground">{g.date}</td>
                <td className="py-1">{match?.homeTeam}</td>
                <td className="py-1 text-center font-mono font-bold">{g.home}:{g.away}</td>
                <td className="py-1 text-right">{match?.awayTeam}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10px] text-muted-foreground">{t("mu.demoStats")}</p>
      </DialogContent>
    </Dialog>
  );
}
