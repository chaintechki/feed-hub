// Import-free helpers shared by edge functions (Deno) and the web app (Vite).

export const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
export const USERNAME_DOMAIN = "feedpanel.local";

export type PasswordCheck = "length" | "lower" | "upper" | "digit" | "symbol";
export const PASSWORD_CHECKS: PasswordCheck[] = ["length", "lower", "upper", "digit", "symbol"];

export function passwordChecks(pw: string): Record<PasswordCheck, boolean> {
  return {
    length: pw.length >= 6 && pw.length <= 128,
    lower: /[a-z]/.test(pw),
    upper: /[A-Z]/.test(pw),
    digit: /[0-9]/.test(pw),
    symbol: /[^A-Za-z0-9]/.test(pw),
  };
}

export function passwordValid(pw: string) {
  return Object.values(passwordChecks(pw)).every(Boolean);
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Password as stored in the auth service: only derivable with the server pepper. */
export function pepperPassword(pepper: string, username: string, password: string) {
  return hmac(pepper, `${username.trim().toLowerCase()}:${password}`);
}

export interface Challenge {
  a: number;
  b: number;
  op: "+" | "-" | "×";
  answer: number;
}

export function makeChallenge(rand: () => number = Math.random): Challenge {
  const r = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const kind = r(0, 2);
  if (kind === 0) {
    const a = r(2, 49), b = r(2, 49);
    return { a, b, op: "+", answer: a + b };
  }
  if (kind === 1) {
    const a = r(10, 60), b = r(1, a - 1);
    return { a, b, op: "-", answer: a - b };
  }
  const a = r(2, 12), b = r(2, 9);
  return { a, b, op: "×", answer: a * b };
}

export const CAPTCHA_TTL_MS = 2 * 60_000;

export async function signChallenge(secret: string, c: Challenge, now = Date.now()) {
  const id = crypto.randomUUID();
  const payload = b64url(
    enc.encode(JSON.stringify({ id, exp: now + CAPTCHA_TTL_MS, h: await hmac(secret, `${id}:${c.answer}`) })),
  );
  return `${payload}.${await hmac(secret, payload)}`;
}

export type CaptchaResult = { ok: true; id: string; exp: number } | { ok: false; reason: "invalid" | "expired" | "wrong" };

export async function verifyChallenge(secret: string, token: string, answer: string | number, now = Date.now()): Promise<CaptchaResult> {
  const [payload, sig] = String(token ?? "").split(".");
  if (!payload || !sig || !safeEqual(sig, await hmac(secret, payload))) return { ok: false, reason: "invalid" };
  let p: { id: string; exp: number; h: string };
  try {
    p = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (typeof p.exp !== "number" || p.exp < now) return { ok: false, reason: "expired" };
  const n = Number(String(answer).trim());
  if (!Number.isInteger(n)) return { ok: false, reason: "wrong" };
  if (!safeEqual(p.h, await hmac(secret, `${p.id}:${n}`))) return { ok: false, reason: "wrong" };
  return { ok: true, id: p.id, exp: p.exp };
}
