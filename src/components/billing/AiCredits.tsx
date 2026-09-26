import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, ShoppingCart } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { billing, NETWORK_LABEL, type Network, type Order, type Summary } from "@/lib/billing";
import { cn } from "@/lib/utils";

export function useAiCredits() {
  return useQuery({ queryKey: ["ai-credits"], queryFn: () => billing<Summary>({ action: "summary" }), staleTime: 15_000 });
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }}
        className="flex w-full items-center justify-between gap-2 rounded-sm border border-border bg-muted px-2 py-1.5 text-left font-mono text-[12px] hover:border-primary"
      >
        <span className="break-all">{value}</span>
        {done ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> : <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
      </button>
    </div>
  );
}

function Countdown({ until }: { until: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((Date.parse(until) - now) / 1000));
  return <span className="font-mono">{String(Math.floor(s / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}</span>;
}

export function StatusBadge({ order }: { order: Order }) {
  const { t } = useTranslation();
  const cls =
    order.status === "paid" ? "bg-primary/15 text-primary" : order.status === "rejected" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground";
  return <span className={cn("rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase", cls)}>{t(`billing.status.${order.status}`)}</span>;
}

export function BuyCreditsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: s } = useAiCredits();
  const [network, setNetwork] = useState<Network | null>(null);
  const [packs, setPacks] = useState(1);
  const [order, setOrder] = useState<Order | null>(null);
  const [tx, setTx] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setOrder(null);
      setTx("");
    } else if (!network && s?.networks[0]) setNetwork(s.networks[0].network);
  }, [open, s, network]);

  // Poll while confirming.
  useEffect(() => {
    if (!order || order.status !== "confirming") return;
    const id = setInterval(async () => {
      try {
        const r = await billing<{ order: Order }>({ action: "status", order_id: order.id });
        setOrder(r.order);
        if (r.order.status === "paid") {
          toast.success(t("billing.credited", { n: r.order.credits }));
          qc.invalidateQueries({ queryKey: ["ai-credits"] });
        }
      } catch {
        /* retry next tick */
      }
    }, 15_000);
    return () => clearInterval(id);
  }, [order, qc, t]);

  async function create() {
    if (!network) return;
    setBusy(true);
    try {
      const r = await billing<{ order: Order }>({ action: "create_order", network, packs });
      setOrder(r.order);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!order) return;
    setBusy(true);
    try {
      const r = await billing<{ order: Order }>({ action: "submit_tx", order_id: order.id, tx: tx.trim() });
      setOrder(r.order);
      if (r.order.status === "paid") {
        toast.success(t("billing.credited", { n: r.order.credits }));
      }
      qc.invalidateQueries({ queryKey: ["ai-credits"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const amount = order ? Number(order.amount_exact).toFixed(4) : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("billing.buyTitle")}</DialogTitle>
        </DialogHeader>

        {!s ? (
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        ) : !order ? (
          s.networks.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("billing.noNetworks")}</p>
          ) : (
            <div className="space-y-4">
              <p className="text-[12px] text-muted-foreground">{t("billing.packInfo", { size: s.pack_size, price: s.pack_price })}</p>
              <div className="space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t("billing.network")}</div>
                <div className="grid grid-cols-2 gap-2">
                  {s.networks.map((n) => (
                    <button
                      key={n.network}
                      onClick={() => setNetwork(n.network)}
                      className={cn(
                        "rounded-sm border px-2 py-2 text-left text-[12px] font-semibold",
                        network === n.network ? "border-primary bg-primary/10" : "border-border bg-muted hover:border-primary",
                      )}
                    >
                      USDT · {n.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t("billing.packs")}</div>
                <div className="flex flex-wrap gap-1.5">
                  {[1, 2, 3, 5, 10].map((p) => (
                    <button
                      key={p}
                      onClick={() => setPacks(p)}
                      className={cn("rounded-sm border px-2.5 py-1 text-[12px]", packs === p ? "border-primary bg-primary/10" : "border-border bg-muted")}
                    >
                      {p * s.pack_size} · {p * s.pack_price} USDT
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={create}
                disabled={busy || !network}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-sm bg-primary text-[12px] font-bold uppercase text-primary-foreground disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("billing.createOrder")}
              </button>
            </div>
          )
        ) : order.status === "paid" ? (
          <div className="space-y-2 py-4 text-center">
            <Check className="mx-auto h-10 w-10 text-primary" />
            <div className="text-sm font-semibold">{t("billing.credited", { n: order.credits })}</div>
          </div>
        ) : order.status === "rejected" || order.status === "expired" ? (
          <div className="space-y-3 py-2">
            <StatusBadge order={order} />
            <p className="text-sm">{t(`billing.reason.${order.reject_reason ?? order.status}`, order.reject_reason ?? "")}</p>
            <button onClick={() => setOrder(null)} className="h-8 rounded-sm border border-border bg-muted px-3 text-[12px]">
              {t("billing.newOrder")}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-semibold">USDT · {NETWORK_LABEL[order.network]}</span>
              {order.status === "pending" && (
                <span className="text-muted-foreground">
                  {t("billing.validFor")} <Countdown until={order.expires_at} />
                </span>
              )}
            </div>
            <div className="flex justify-center rounded-sm bg-card p-3">
              <div className="rounded-sm bg-background p-2">
                <QRCodeSVG value={order.address} size={180} includeMargin />
              </div>
            </div>
            <CopyField label={t("billing.address")} value={order.address} />
            <CopyField label={t("billing.exactAmount")} value={amount} />
            <p className="rounded-sm border border-primary/40 bg-primary/5 p-2 text-[11px]">{t("billing.exactHint", { network: NETWORK_LABEL[order.network] })}</p>

            {order.status === "pending" ? (
              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t("billing.txId")}</div>
                <input
                  value={tx}
                  onChange={(e) => setTx(e.target.value)}
                  placeholder={order.network === "tron" ? "a1b2…" : "0x…"}
                  className="h-9 w-full rounded-sm border border-border bg-background px-2 font-mono text-[12px]"
                />
                <button
                  onClick={submit}
                  disabled={busy || tx.trim().length < 60}
                  className="flex h-9 w-full items-center justify-center gap-2 rounded-sm bg-primary text-[12px] font-bold uppercase text-primary-foreground disabled:opacity-50"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("billing.verify")}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-sm bg-muted p-2 text-[12px]">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("billing.confirming", { n: order.confirmations ?? 0 })}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AiCreditsBar({ onBuy }: { onBuy: () => void }) {
  const { t } = useTranslation();
  const { data } = useAiCredits();
  if (!data) return null;
  return (
    <div className="flex items-center gap-2 text-[11px]">
      {data.unlimited ? (
        <span className="rounded-sm bg-primary/15 px-2 py-0.5 font-semibold text-primary">{t("billing.unlimited")}</span>
      ) : (
        <>
          <span className="rounded-sm bg-muted px-2 py-0.5">
            {t("billing.freeLeft", { n: data.free_left, total: data.free_total })} · {t("billing.purchasedN", { n: data.purchased })}
          </span>
          <button onClick={onBuy} className="flex h-7 items-center gap-1 rounded-sm border border-primary px-2 font-semibold uppercase text-primary hover:bg-primary/10">
            <ShoppingCart className="h-3.5 w-3.5" />
            {t("billing.buy")}
          </button>
        </>
      )}
    </div>
  );
}

export function PurchaseHistory() {
  const { t } = useTranslation();
  const { data } = useAiCredits();
  if (!data?.orders.length) return null;
  return (
    <details className="text-[11px]">
      <summary className="cursor-pointer text-muted-foreground">{t("billing.history")}</summary>
      <table className="mt-1 w-full">
        <tbody>
          {data.orders.map((o) => (
            <tr key={o.id} className="border-t border-border">
              <td className="py-1">{new Date(o.created_at).toLocaleString()}</td>
              <td>{NETWORK_LABEL[o.network]}</td>
              <td className="text-right font-mono">{Number(o.amount_exact).toFixed(4)}</td>
              <td className="text-right">{o.credits}</td>
              <td className="text-right">
                <StatusBadge order={o} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
