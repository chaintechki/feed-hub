// Feed worker: keeps the AMQP connection to the odds feed open, batches messages
// and forwards them (HMAC-signed) to the panel backend. Also drives schedule sync
// and producer recovery. Configuration: /etc/feed-panel/uof.env (see README).
import crypto from "node:crypto";
import os from "node:os";
import amqp from "amqplib";

const env = (k, d) => process.env[k] ?? d;
const C = {
  token: env("UOF_ACCESS_TOKEN"),
  apiHost: env("UOF_API_HOST"),
  mqHost: env("UOF_MQ_HOST"),
  mqPort: Number(env("UOF_MQ_PORT", "5671")),
  vhost: env("UOF_MQ_VHOST"),
  user: env("UOF_MQ_USER"),
  pass: env("UOF_MQ_PASS"),
  nodeId: env("UOF_NODE_ID", "1"),
  backend: env("FEED_BACKEND_URL"), // e.g. https://feed.feedarea.net
  apikey: env("FEED_BACKEND_KEY"),
};
for (const [k, v] of Object.entries(C)) if (!v) { console.error(`missing config: ${k}`); process.exit(1); }

const PRODUCT_URL = { 1: "liveodds", 3: "pre" };
const log = (...a) => console.log(new Date().toISOString(), ...a);

async function signedPost(fn, obj) {
  const body = JSON.stringify(obj);
  const ts = Date.now();
  const sig = crypto.createHmac("sha256", C.token).update(`${ts}.${body}`).digest("hex");
  const r = await fetch(`${C.backend}/functions/v1/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: C.apikey, "x-uof-ts": String(ts), "x-uof-sig": sig },
    body,
    signal: AbortSignal.timeout(150_000),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${fn} ${r.status} ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

// ---------- batching ----------
// Keeps the buffer bounded. Only superseded odds_change messages are dropped (oldest first,
// newer ones carry the current state); settlements, cancels, bet stops and fixture changes are never dropped.
export function trimBuffer(list, max) {
  if (list.length <= max) return list;
  let excess = list.length - max;
  const out = [];
  for (const m of list) {
    if (excess > 0 && /<odds_change\b/.test(m.xml.slice(0, 400))) { excess--; continue; }
    out.push(m);
  }
  if (excess > 0) log(`buffer over limit by ${excess} critical messages, kept`);
  else log(`buffer trimmed to ${out.length} (old odds updates dropped)`);
  return out;
}
let buf = [];
let flushing = false;
let maxBytes = 1_500_000; // backend accepts up to 5 MB per request
const MAX_MSGS = 300;
function takeBatch() {
  const batch = [];
  let size = 0;
  while (buf.length && batch.length < MAX_MSGS) {
    const len = buf[0].xml.length + 16;
    if (batch.length && size + len > maxBytes) break;
    if (len > 4_500_000) { log("dropping oversized message", len); buf.shift(); continue; }
    batch.push(buf.shift());
    size += len;
  }
  return batch;
}
// Adaptive pacing: flush every 10 s; if the backend answers slowly, wait longer so writes never pile up.
const BASE_DELAY = 10_000;
let delay = BASE_DELAY;
async function flush() {
  if (flushing || !buf.length) return;
  flushing = true;
  try {
    for (let round = 0; round < 20 && buf.length; round++) {
      const batch = takeBatch();
      if (!batch.length) break;
      const t0 = Date.now();
      try {
        await signedPost("uof-ingest", { messages: batch });
        if (maxBytes < 1_500_000) maxBytes = Math.min(1_500_000, maxBytes * 2);
        const took = Date.now() - t0;
        // Circuit breaker: slow database (> 2 s) -> back off and let messages coalesce.
        delay = took > 2000 ? Math.min(60_000, delay * 2) : Math.max(BASE_DELAY, Math.floor(delay / 2));
        if (took > 2000) { log(`ingest slow (${took} ms), next flush in ${delay / 1000}s`); break; }
      } catch (e) {
        buf.unshift(...batch);
        if (/ 413 /.test(e.message) && maxBytes > 50_000) { maxBytes = Math.floor(maxBytes / 2); continue; }
        delay = Math.min(60_000, delay * 2);
        log("ingest failed, requeue", e.message);
        break;
      }
    }
    buf = trimBuffer(buf, 20000);
  } finally {
    flushing = false;
  }
}
(function loop() {
  setTimeout(async () => { await flush().catch(() => {}); loop(); }, delay);
})();

// ---------- producers / recovery ----------
const producers = {}; // id -> { lastAlive, lastOk, down }
const lastFull = {}; // id -> timestamp of last full snapshot request
async function recover(id, full = false) {
  const name = PRODUCT_URL[id];
  if (!name) return;
  const p = producers[id] ?? {};
  const maxBack = Date.now() - 70 * 3600_000;
  // Full snapshot (no "after") on first start or when the gap exceeds the provider's 70 h window.
  const useFull = full || !lastFull[id] || !p.lastOk || p.lastOk < maxBack;
  const after = useFull ? null : p.lastOk;
  const url = `https://${C.apiHost}/v1/${name}/recovery/initiate_request?${after ? `after=${after}&` : ""}node_id=${C.nodeId}&request_id=${Date.now() % 1e9}`;
  try {
    const r = await fetch(url, { method: "POST", headers: { "x-access-token": C.token } });
    if (useFull && r.ok) lastFull[id] = Date.now();
    log(`recovery ${name} ${useFull ? "full snapshot" : `after=${new Date(after).toISOString()}`} -> ${r.status}`);
  } catch (e) {
    log("recovery failed", e.message);
  }
}
// Periodic full snapshot every 6 h so newly offered matches always get complete odds.
setInterval(() => {
  for (const id of Object.keys(producers)) recover(Number(id), true);
}, 6 * 3600_000);
setInterval(() => {
  for (const [id, p] of Object.entries(producers)) {
    if (!p.down && Date.now() - p.lastAlive > 20_000) {
      p.down = true;
      log(`producer ${id} down`);
    }
  }
}, 5000);

const aliveCount = {}; // product -> alive messages received in the last minute
setInterval(() => {
  log("alive/min", JSON.stringify(aliveCount));
  for (const k of Object.keys(aliveCount)) aliveCount[k] = 0;
}, 60_000);

function onMessage(xml) {
  // Provider messages start with an XML prolog (<?xml ...?>), so do not anchor to the start.
  const aliveTag = xml.slice(0, 400).match(/<alive\b([^>]*?)\/?>/)?.[1];
  if (aliveTag) {
    const attrs = Object.fromEntries([...aliveTag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    const id = Number(attrs.product);
    const timestamp = Number(attrs.timestamp);
    const subscribed = attrs.subscribed;
    if (!id || !timestamp || (subscribed !== "0" && subscribed !== "1")) {
      log("ignored malformed alive message");
      return;
    }
    aliveCount[id] = (aliveCount[id] ?? 0) + 1;
    const p = (producers[id] ??= { lastAlive: 0, lastOk: null, down: true });
    const wasDown = p.down;
    p.lastAlive = Date.now();
    p.down = subscribed === "0";
    if (subscribed === "1") p.lastOk = timestamp;
    if (wasDown && subscribed === "1") {
      recover(id);
    }
    // Send alive signals on their own, bypassing the odds backlog, so the panel status stays current.
    signedPost("uof-ingest", { messages: [{ xml }] }).catch((e) => log("alive forward failed", e.message));
    return;
  }
  buf.push({ xml });
}

// ---------- AMQP ----------
// Active connection is decided in the panel (super admin); polled every minute via uof-sync.
const UOF_MQ = { host: C.mqHost, port: C.mqPort, vhost: C.vhost, user: C.user, pass: C.pass, exchange: "unifiedfeed" };
let activeId = "uof";
let mq = UOF_MQ;
let conn = null;
let switching = false;
async function connect() {
  const cfg = mq;
  const c = await amqp.connect({
    protocol: "amqps", hostname: cfg.host, port: cfg.port, vhost: cfg.vhost, username: cfg.user, password: cfg.pass, heartbeat: 30,
  }, { servername: cfg.host });
  conn = c;
  c.on("error", (e) => log("amqp error", e.message));
  c.on("close", () => {
    for (const p of Object.values(producers)) p.down = true;
    if (conn !== c || switching) return; // intentional close during switch
    log("amqp closed, reconnecting in 5 s"); conn = null; setTimeout(start, 5000);
  });
  const ch = await c.createChannel();
  const q = await ch.assertQueue("", { exclusive: true, autoDelete: true });
  await ch.bindQueue(q.queue, cfg.exchange || "unifiedfeed", "#");
  await ch.consume(q.queue, (m) => { if (m) onMessage(m.content.toString("utf8")); }, { noAck: true });
  log("amqp connected", activeId, cfg.host, cfg.vhost);
}
async function start() {
  try { await connect(); } catch (e) { log("connect failed", e.message); setTimeout(start, 10_000); }
}
async function pollConnection() {
  try {
    const r = await signedPost("uof-sync", { connection: true });
    const next = r.active === "gateway" && r.mq ? "gateway" : "uof";
    const nextMq = next === "gateway" ? r.mq : UOF_MQ;
    if (next === activeId && JSON.stringify(nextMq) === JSON.stringify(mq)) return;
    log(`switching feed connection ${activeId} -> ${next}`);
    switching = true;
    const old = conn; conn = null;
    await old?.close().catch(() => {});
    activeId = next; mq = nextMq;
    switching = false;
    await start();
    for (const id of Object.keys(PRODUCT_URL)) recover(Number(id), true);
  } catch (e) {
    switching = false;
    log("connection poll failed", e.message);
  }
}
setInterval(pollConnection, 60_000);

// ---------- schedule sync + status reconcile ----------
function memory() {
  const m = process.memoryUsage();
  return { rss: m.rss, heap: m.heapUsed, total: os.totalmem(), free: os.freemem() };
}
async function statusReconcile() {
  try {
    const r = await signedPost("uof-sync", { status: true, mem: memory() });
    log("status reconcile", JSON.stringify({ checked: r.checked, updated: r.updated, forced: r.forced, changes: r.changes }));
  } catch (e) {
    log("status reconcile failed", e.message);
  }
}
async function syncCycle() {
  let startAt = 0, first = true;
  try {
    while (startAt !== null) {
      const r = await signedPost("uof-sync", { start: startAt, markets: first && new Date().getUTCHours() === 3 });
      log("sync", JSON.stringify(r.schedule), "next", r.next);
      startAt = r.next === startAt ? null : (r.next ?? null);
      first = false;
    }
  } catch (e) {
    log("sync failed", e.message);
  }
  // After every schedule/market reload: reconcile match status and record memory + DB size.
  await statusReconcile();
}
syncCycle();
setInterval(syncCycle, 10 * 60_000);

pollConnection().finally(() => { if (!conn) start(); });
process.on("SIGTERM", async () => { await flush(); process.exit(0); });
