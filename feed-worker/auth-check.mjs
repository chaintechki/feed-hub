import crypto from "node:crypto";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is missing`);
  return value;
}

const backendUrl = required("FEED_BACKEND_URL").replace(/\/$/, "");
const backendKey = required("FEED_BACKEND_KEY");
const token = required("UOF_ACCESS_TOKEN");
const body = "{}";
const ts = Date.now();
const signature = crypto.createHmac("sha256", token).update(`${ts}.${body}`).digest("hex");

const response = await fetch(`${backendUrl}/functions/v1/uof-ingest`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: backendKey,
    "x-uof-ts": String(ts),
    "x-uof-sig": signature,
  },
  body,
  signal: AbortSignal.timeout(20_000),
});

if (response.status === 401) {
  console.error("Feed authentication failed: UOF_ACCESS_TOKEN differs from the backend secret or the server clock is incorrect.");
  process.exit(41);
}
if (!response.ok) {
  console.error(`Feed authentication check failed with HTTP ${response.status}.`);
  process.exit(42);
}

console.log("Feed authentication check passed.");