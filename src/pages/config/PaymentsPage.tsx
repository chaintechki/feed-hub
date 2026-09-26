import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";

import { StatusBadge } from "@/components/billing/AiCredits";
import { PageShell } from "@/components/layout/PageShell";
import { supabase } from "@/integrations/supabase/client";
import { billing, NETWORK_LABEL, type Network, type Order } from "@/lib/billing";
import { useAuth } from "@/providers/AuthProvider";

const NETS: Network[] = ["bsc", "eth", "polygon", "tron"];
type Addr = { network: Network; address: string; active: boolean };
type Settings = { free_monthly: number; pack_size: number; pack_price_usdt: number; order_ttl_min: number; confirmations: Record<string, number> };
type Overview = {
  orders: (Order & { user_id: string })[];
  credits: { user_id: string; purchased: number; free_used: number; period: string }[];
  profiles: { id: string; username: string | null; display_name: string | null }[];
};

const H = ({ children }: { children: React.ReactNode }) => <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{children}</h2>;
const inp = "h-8 rounded-sm border border-border bg-background px-2 text-[12px]";

export default function PaymentsPage() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const qc = useQueryClient();
  const isSuper = roles.includes("super_admin");

  const addrs = useQuery({
    queryKey: ["payment-addresses"],
    enabled: isSuper,
    queryFn: async () => ((await supabase.from("payment_addresses").select("network,address,active")).data ?? []) as Addr[],
  });
  const settings = useQuery({
    queryKey: ["payment-settings"],
    enabled: isSuper,
    queryFn: async () => (await supabase.from("payment_settings").select("*").eq("id", 1).single()).data as unknown as Settings,
  });
  const overview = useQuery({ queryKey: ["billing-overview"], enabled: isSuper, queryFn: () => billing<Overview>({ action: "admin_overview" }) });

  const [draft, setDraft] = useState<Record<Network, Addr>>({} as Record<Network, Addr>);
  const [st, setSt] = useState<Settings | null>(null);
  const [adj, setAdj] = useState({ user: "", delta: 100, reason: "" });

  useEffect(() => {
    if (addrs.data) {
      const d = {} as Record<Network, Addr>;
      for (const n of NETS) d[n] = addrs.data.find((a) => a.network === n) ?? { network: n, address: "", active: false };
      setDraft(d);
    }
  }, [addrs.data]);
  useEffect(() => {
    if (settings.data) setSt(settings.data);
  }, [settings.data]);

  if (!isSuper) return <Navigate to="/configuration" replace />;

  async function saveAddr(n: Network) {
    const a = draft[n];
    const { error } = a.address.trim()
      ? await supabase.from("payment_addresses").upsert({ network: n, address: a.address.trim(), active: a.active })
      : await supabase.from("payment_addresses").delete().eq("network", n);
    if (error) toast.error(error.message.includes("invalid") ? t("billing.admin.invalidAddress") : error.message);
    else {
      toast.success(t("billing.admin.saved"));
      qc.invalidateQueries({ queryKey: ["payment-addresses"] });
      qc.invalidateQueries({ queryKey: ["ai-credits"] });
    }
  }

  async function saveSettings() {
    if (!st) return;
    const { error } = await supabase
      .from("payment_settings")
      .update({ free_monthly: st.free_monthly, pack_size: st.pack_size, pack_price_usdt: st.pack_price_usdt, order_ttl_min: st.order_ttl_min, confirmations: st.confirmations, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) toast.error(error.message);
    else toast.success(t("billing.admin.saved"));
  }

  async function adjust() {
    try {
      await billing({ action: "admin_adjust", user_id: adj.user, delta: adj.delta, reason: adj.reason });
      toast.success(t("billing.admin.saved"));
      setAdj({ ...adj, reason: "" });
      overview.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const name = (id: string) => {
    const p = overview.data?.profiles.find((x) => x.id === id);
    return p?.display_name ?? p?.username ?? id.slice(0, 8);
  };
  const period = new Date().toISOString().slice(0, 7) + "-01";

  return (
    <PageShell title={t("billing.admin.title")} description={t("billing.admin.desc")}>
      <div className="space-y-6">
        <section className="space-y-2">
          <H>{t("billing.admin.addresses")}</H>
          <div className="space-y-2">
            {NETS.map((n) =>
              draft[n] ? (
                <div key={n} className="flex flex-wrap items-center gap-2">
                  <span className="w-48 text-[12px] font-semibold">USDT · {NETWORK_LABEL[n]}</span>
                  <input
                    className={`${inp} min-w-[22rem] flex-1 font-mono`}
                    placeholder={n === "tron" ? "T…" : "0x…"}
                    value={draft[n].address}
                    onChange={(e) => setDraft({ ...draft, [n]: { ...draft[n], address: e.target.value } })}
                  />
                  <label className="flex items-center gap-1 text-[12px]">
                    <input type="checkbox" checked={draft[n].active} onChange={(e) => setDraft({ ...draft, [n]: { ...draft[n], active: e.target.checked } })} />
                    {t("billing.admin.active")}
                  </label>
                  <button onClick={() => saveAddr(n)} className="h-8 rounded-sm bg-primary px-3 text-[11px] font-bold uppercase text-primary-foreground">
                    {t("billing.admin.save")}
                  </button>
                </div>
              ) : null,
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">{t("billing.admin.addrHint")}</p>
        </section>

        {st && (
          <section className="space-y-2">
            <H>{t("billing.admin.settings")}</H>
            <div className="flex flex-wrap items-end gap-3 text-[12px]">
              {(
                [
                  ["free_monthly", t("billing.admin.free")],
                  ["pack_size", t("billing.admin.packSize")],
                  ["pack_price_usdt", t("billing.admin.packPrice")],
                  ["order_ttl_min", t("billing.admin.ttl")],
                ] as const
              ).map(([k, l]) => (
                <label key={k} className="flex flex-col gap-1">
                  {l}
                  <input type="number" min={0} className={`${inp} w-28`} value={st[k]} onChange={(e) => setSt({ ...st, [k]: Number(e.target.value) })} />
                </label>
              ))}
              {NETS.map((n) => (
                <label key={n} className="flex flex-col gap-1">
                  {t("billing.admin.conf")} {n.toUpperCase()}
                  <input
                    type="number"
                    min={1}
                    className={`${inp} w-20`}
                    value={st.confirmations[n] ?? 12}
                    onChange={(e) => setSt({ ...st, confirmations: { ...st.confirmations, [n]: Number(e.target.value) } })}
                  />
                </label>
              ))}
              <button onClick={saveSettings} className="h-8 rounded-sm bg-primary px-3 text-[11px] font-bold uppercase text-primary-foreground">
                {t("billing.admin.save")}
              </button>
            </div>
          </section>
        )}

        <section className="space-y-2">
          <H>{t("billing.admin.credits")}</H>
          <div className="flex flex-wrap items-end gap-2 text-[12px]">
            <select className={inp} value={adj.user} onChange={(e) => setAdj({ ...adj, user: e.target.value })}>
              <option value="">{t("billing.admin.pickUser")}</option>
              {overview.data?.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name ?? p.username}
                </option>
              ))}
            </select>
            <input type="number" className={`${inp} w-24`} value={adj.delta} onChange={(e) => setAdj({ ...adj, delta: Number(e.target.value) })} />
            <input className={`${inp} w-64`} placeholder={t("billing.admin.reason")} value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} />
            <button disabled={!adj.user || adj.reason.trim().length < 3} onClick={adjust} className="h-8 rounded-sm bg-primary px-3 text-[11px] font-bold uppercase text-primary-foreground disabled:opacity-50">
              {t("billing.admin.apply")}
            </button>
          </div>
          <table className="w-full text-[12px]">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th>{t("billing.admin.user")}</th>
                <th className="text-right">{t("billing.admin.freeUsed")}</th>
                <th className="text-right">{t("billing.admin.purchased")}</th>
              </tr>
            </thead>
            <tbody>
              {overview.data?.credits.map((c) => (
                <tr key={c.user_id} className="border-t border-border">
                  <td className="py-1">{name(c.user_id)}</td>
                  <td className="text-right">{c.period === period ? c.free_used : 0}</td>
                  <td className="text-right">{c.purchased}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="space-y-2">
          <H>{t("billing.admin.orders")}</H>
          <table className="w-full text-[12px]">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th>{t("billing.admin.date")}</th>
                <th>{t("billing.admin.user")}</th>
                <th>{t("billing.network")}</th>
                <th className="text-right">USDT</th>
                <th className="text-right">{t("billing.admin.queries")}</th>
                <th>{t("billing.txId")}</th>
                <th className="text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {overview.data?.orders.map((o) => (
                <tr key={o.id} className="border-t border-border">
                  <td className="py-1">{new Date(o.created_at).toLocaleString()}</td>
                  <td>{name(o.user_id)}</td>
                  <td>{NETWORK_LABEL[o.network]}</td>
                  <td className="text-right font-mono">{Number(o.amount_exact).toFixed(4)}</td>
                  <td className="text-right">{o.credits}</td>
                  <td className="max-w-[12rem] truncate font-mono" title={o.tx_hash ?? ""}>{o.tx_hash ?? "—"}</td>
                  <td className="text-right">
                    <StatusBadge order={o} /> {o.reject_reason && <span className="text-muted-foreground">{t(`billing.reason.${o.reject_reason}`, o.reject_reason)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </PageShell>
  );
}
