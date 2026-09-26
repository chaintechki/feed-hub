// USDT payment verification across BSC, Ethereum, Polygon (Etherscan V2) and Tron (TronGrid).
// Pure decision logic is exported separately so it can be unit-tested with fixtures.

export type Network = "bsc" | "eth" | "polygon" | "tron";
export const NETWORKS: Network[] = ["bsc", "eth", "polygon", "tron"];

export const USDT: Record<Network, { contract: string; decimals: number; chainId?: number; label: string }> = {
  bsc: { contract: "0x55d398326f99059ff775485246999027b3197955", decimals: 18, chainId: 56, label: "BNB Smart Chain (BEP20)" },
  eth: { contract: "0xdac17f958d2ee523a2206206994597c13d831ec7", decimals: 6, chainId: 1, label: "Ethereum (ERC20)" },
  polygon: { contract: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", decimals: 6, chainId: 137, label: "Polygon" },
  tron: { contract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", decimals: 6, label: "Tron (TRC20)" },
};

const TRANSFER_TOPIC = "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export type Log = { address: string; topics: string[]; data: string };
export type TxFacts = { found: boolean; success: boolean; logs: Log[]; timestamp: number | null; confirmations: number };
export type Order = { network: Network; address: string; amount: string; createdAt: number; expiresAt: number };
export type Verdict =
  | { state: "paid"; received: string }
  | { state: "confirming"; confirmations: number }
  | { state: "not_found" }
  | { state: "rejected"; reason: string };

const strip = (h: string) => h.toLowerCase().replace(/^0x/, "");
/** Last 20 bytes of a hex value/topic as lowercase hex (no prefix). */
const addr20 = (h: string) => strip(h).padStart(40, "0").slice(-40);

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
/** Tron base58check address -> 20-byte hex (without the 0x41 prefix). */
export function tronToHex(a: string): string {
  let n = 0n;
  for (const c of a) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error("invalid base58");
    n = n * 58n + BigInt(i);
  }
  const hex = n.toString(16).padStart(50, "0"); // 25 bytes: 0x41 + 20 + 4 checksum
  return hex.slice(2, 42);
}

export const normAddr = (network: Network, a: string) => (network === "tron" ? tronToHex(a) : addr20(a));

/** Convert decimal string like "10.0347" to integer base units. */
export function toUnits(amount: string, decimals: number): bigint {
  const [i, f = ""] = amount.split(".");
  return BigInt(i + f.padEnd(decimals, "0").slice(0, decimals));
}
export function fromUnits(v: bigint, decimals: number): string {
  const s = v.toString().padStart(decimals + 1, "0");
  const f = s.slice(-decimals).replace(/0+$/, "");
  return s.slice(0, -decimals) + (f ? "." + f : "");
}

/** Sum of USDT transferred to `to` inside the tx logs. */
export function receivedUnits(network: Network, logs: Log[], to: string): bigint {
  const c = normAddr(network, USDT[network].contract);
  const dest = normAddr(network, to);
  let sum = 0n;
  for (const l of logs) {
    if (addr20(l.address) !== c) continue;
    if (strip(l.topics[0] ?? "") !== TRANSFER_TOPIC || l.topics.length < 3) continue;
    if (addr20(l.topics[2]) !== dest) continue;
    const d = strip(l.data);
    if (d) sum += BigInt("0x" + d);
  }
  return sum;
}

/** Decide the payment state from chain facts. Amount must match to 4 decimals (unique cents); overpayment keeping the same cents is accepted. */
export function decide(o: Order, tx: TxFacts, need: number): Verdict {
  if (!tx.found) return { state: "not_found" };
  if (!tx.success) return { state: "rejected", reason: "tx_failed" };
  const dec = USDT[o.network].decimals;
  const got = receivedUnits(o.network, tx.logs, o.address);
  if (got === 0n) return { state: "rejected", reason: "no_usdt_to_address" };
  const want = toUnits(o.amount, dec);
  const step = 10n ** BigInt(dec - 4);
  const got4 = got / step, want4 = want / step;
  if (got4 < want4) return { state: "rejected", reason: "amount_too_low" };
  if (got4 % 10000n !== want4 % 10000n) return { state: "rejected", reason: "amount_mismatch" };
  if (tx.timestamp != null) {
    if (tx.timestamp < o.createdAt - 120_000) return { state: "rejected", reason: "tx_before_order" };
    if (tx.timestamp > o.expiresAt) return { state: "rejected", reason: "tx_after_expiry" };
  }
  if (tx.confirmations < need) return { state: "confirming", confirmations: tx.confirmations };
  return { state: "paid", received: fromUnits(got, dec) };
}

export const validTxHash = (network: Network, h: string) =>
  network === "tron" ? /^(0x)?[0-9a-fA-F]{64}$/.test(h) : /^0x[0-9a-fA-F]{64}$/.test(h);

// ---------- network adapters ----------

async function etherscan(chainId: number, key: string, params: Record<string, string>) {
  const u = new URL("https://api.etherscan.io/v2/api");
  u.searchParams.set("chainid", String(chainId));
  u.searchParams.set("module", "proxy");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("apikey", key);
  const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`explorer_${r.status}`);
  const j = await r.json();
  if (j.error) throw new Error(`explorer_${j.error.message ?? "error"}`);
  if (typeof j.result === "string" && j.status === "0") throw new Error(`explorer_${j.result}`);
  return j.result;
}

async function evmFacts(network: Network, hash: string, key: string): Promise<TxFacts> {
  const chainId = USDT[network].chainId!;
  const rc = await etherscan(chainId, key, { action: "eth_getTransactionReceipt", txhash: hash });
  if (!rc) return { found: false, success: false, logs: [], timestamp: null, confirmations: 0 };
  const [head, block] = await Promise.all([
    etherscan(chainId, key, { action: "eth_blockNumber" }),
    etherscan(chainId, key, { action: "eth_getBlockByNumber", tag: rc.blockNumber, boolean: "false" }),
  ]);
  return {
    found: true,
    success: rc.status === "0x1",
    logs: (rc.logs ?? []).map((l: Log) => ({ address: l.address, topics: l.topics, data: l.data })),
    timestamp: block?.timestamp ? parseInt(block.timestamp, 16) * 1000 : null,
    confirmations: parseInt(head, 16) - parseInt(rc.blockNumber, 16) + 1,
  };
}

async function tronFacts(hash: string, key?: string): Promise<TxFacts> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (key) h["TRON-PRO-API-KEY"] = key;
  const post = async (path: string, body: unknown) => {
    const r = await fetch(`https://api.trongrid.io${path}`, { method: "POST", headers: h, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`tron_${r.status}`);
    return r.json();
  };
  const info = await post("/wallet/gettransactioninfobyid", { value: strip(hash) });
  if (!info?.id || !info.blockNumber) return { found: false, success: false, logs: [], timestamp: null, confirmations: 0 };
  const now = await post("/wallet/getnowblock", {});
  const head = now?.block_header?.raw_data?.number ?? info.blockNumber;
  return {
    found: true,
    success: (info.receipt?.result ?? "SUCCESS") === "SUCCESS" && info.result !== "FAILED",
    logs: (info.log ?? []).map((l: { address: string; topics: string[]; data?: string }) => ({ address: l.address, topics: l.topics, data: l.data ?? "" })),
    timestamp: info.blockTimeStamp ?? null,
    confirmations: head - info.blockNumber + 1,
  };
}

export async function fetchFacts(network: Network, hash: string, env: { etherscan?: string; tron?: string }): Promise<TxFacts> {
  if (network === "tron") return tronFacts(hash, env.tron);
  if (!env.etherscan) throw new Error("explorer_key_missing");
  return evmFacts(network, hash, env.etherscan);
}
