// Feed worker: keeps the AMQP connection to the odds feed open, batches messages
// and forwards them (HMAC-signed) to the panel backend. Also drives schedule sync
// and producer recovery. Configuration: /etc/feed-panel/uof.env (see README).
import crypto from "node:crypto";
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
async function flush() {
  if (flushing || !buf.length) return;
  flushing = true;
  try {
    for (let round = 0; round < 20 && buf.length; round++) {
      const batch = takeBatch();
      if (!batch.length) break;
      try {
        await signedPost("uof-ingest", { messages: batch });
        if (maxBytes < 1_500_000) maxBytes = Math.min(1_500_000, maxBytes * 2);
      } catch (e) {
        buf.unshift(...batch);
        if (/ 413 /.test(e.message) && maxBytes > 50_000) { maxBytes = Math.floor(maxBytes / 2); continue; }
        log("ingest failed, requeue", e.message);
        break;
      }
    }
    if (buf.length > 20000) buf = buf.slice(-20000);
  } finally {
    flushing = false;
  }
}
setInterval(flush, 1000);

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

function onMessage(xml) {
  const aliveTag = xml.match(/^<alive\b([^>]*)>/)?.[1];
  if (aliveTag) {
    const attrs = Object.fromEntries([...aliveTag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    const id = Number(attrs.product);
    const timestamp = Number(attrs.timestamp);
    const subscribed = attrs.subscribed;
    if (!id || !timestamp || (subscribed !== "0" && subscribed !== "1")) {
      log("ignored malformed alive message");
      return;
    }
    const p = (producers[id] ??= { lastAlive: 0, lastOk: null, down: true });
    const wasDown = p.down;
    p.lastAlive = Date.now();
    p.down = subscribed === "0";
    if (subscribed === "1") p.lastOk = timestamp;
    if (wasDown && subscribed === "1") {
      recover(id);
    }
    buf.push({ xml });
    void flush(); // forward alive signals immediately so the panel status is current
    return;
  }
  buf.push({ xml });
}

// ---------- AMQP ----------
async function connect() {
  const conn = await amqp.connect({
    protocol: "amqps",
    hostname: C.mqHost,
    port: C.mqPort,
    vhost: C.vhost,
    username: C.user,
    password: C.pass,
    heartbeat: 30,
  }, { servername: C.mqHost });
  conn.on("error", (e) => log("amqp error", e.message));
  conn.on("close", () => { log("amqp closed, reconnecting in 5 s"); for (const p of Object.values(producers)) p.down = true; setTimeout(start, 5000); });
  const ch = await conn.createChannel();
  const q = await ch.assertQueue("", { exclusive: true, autoDelete: true });
  await ch.bindQueue(q.queue, "unifiedfeed", "#");
  await ch.consume(q.queue, (m) => { if (m) onMessage(m.content.toString("utf8")); }, { noAck: true });
  log("amqp connected", C.mqHost, C.vhost);
}
async function start() {
  try { await connect(); } catch (e) { log("connect failed", e.message); setTimeout(start, 10_000); }
}

// ---------- schedule sync ----------
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
}
syncCycle();
setInterval(syncCycle, 10 * 60_000);

start();
process.on("SIGTERM", async () => { await flush(); process.exit(0); });
