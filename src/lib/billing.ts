import { supabase } from "@/integrations/supabase/client";

export type Network = "bsc" | "eth" | "polygon" | "tron";
export type Order = {
  id: string;
  network: Network;
  packs: number;
  credits: number;
  amount_exact: number | string;
  address: string;
  status: "pending" | "confirming" | "paid" | "expired" | "rejected";
  tx_hash?: string | null;
  reject_reason?: string | null;
  confirmations?: number | null;
  created_at: string;
  expires_at: string;
};
export type Summary = {
  unlimited: boolean;
  free_total: number;
  free_left: number;
  purchased: number;
  pack_size: number;
  pack_price: number;
  ttl_min: number;
  networks: { network: Network; label: string }[];
  orders: Order[];
};

export const NETWORK_LABEL: Record<Network, string> = {
  bsc: "BNB Smart Chain (BEP20)",
  eth: "Ethereum (ERC20)",
  polygon: "Polygon",
  tron: "Tron (TRC20)",
};

export async function billing<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("ai-billing", { body });
  if (error) {
    let msg = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) msg = (await ctx.json()).error ?? msg;
    } catch {
      /* keep default */
    }
    throw new Error(msg);
  }
  return data as T;
}
