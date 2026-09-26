import { describe, expect, it } from "vitest";
import { decide, toUnits, tronToHex, type TxFacts } from "../../supabase/functions/_shared/chain-verify";

const TO = "0x1111111111111111111111111111111111111111";
const USDT_ETH = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const pad = (a: string) => "0x" + a.replace(/^0x/, "").padStart(64, "0");
const created = Date.parse("2026-09-26T10:00:00Z");
const order = { network: "eth" as const, address: TO, amount: "10.0347", createdAt: created, expiresAt: created + 3600_000 };
const tx = (units: bigint, over: Partial<TxFacts> = {}, to = TO, token = USDT_ETH): TxFacts => ({
  found: true,
  success: true,
  timestamp: created + 60_000,
  confirmations: 20,
  logs: [{ address: token, topics: [TOPIC, pad("0x2222"), pad(to)], data: "0x" + units.toString(16) }],
  ...over,
});

describe("chain verify", () => {
  it("accepts exact payment", () => expect(decide(order, tx(10034700n), 12)).toEqual({ state: "paid", received: "10.0347" }));
  it("waits for confirmations", () => expect(decide(order, tx(10034700n, { confirmations: 3 }), 12)).toEqual({ state: "confirming", confirmations: 3 }));
  it("rejects wrong recipient", () => expect(decide(order, tx(10034700n, {}, "0x3333333333333333333333333333333333333333"), 12).state).toBe("rejected"));
  it("rejects wrong token", () => expect(decide(order, tx(10034700n, {}, TO, "0x4444444444444444444444444444444444444444"), 12)).toEqual({ state: "rejected", reason: "no_usdt_to_address" }));
  it("rejects underpayment", () => expect(decide(order, tx(10000000n), 12)).toEqual({ state: "rejected", reason: "amount_too_low" }));
  it("rejects other order's cents", () => expect(decide(order, tx(10050000n), 12)).toEqual({ state: "rejected", reason: "amount_mismatch" }));
  it("rejects tx before order", () => expect(decide(order, tx(10034700n, { timestamp: created - 3600_000 }), 12)).toEqual({ state: "rejected", reason: "tx_before_order" }));
  it("rejects failed tx", () => expect(decide(order, tx(10034700n, { success: false }), 12)).toEqual({ state: "rejected", reason: "tx_failed" }));
  it("handles 18 decimals (BSC)", () => expect(toUnits("10.0347", 18)).toBe(10034700000000000000n));
  it("decodes tron addresses", () => expect(tronToHex("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t")).toBe("a614f803b6fd780986a42c78ec9c7f77e6ded13c"));
});
