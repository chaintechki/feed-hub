/**
 * Guarded service-worker registration.
 * The worker only ever runs in a production build served from a real origin —
 * never in dev, never inside an embedded preview iframe, and never with ?sw=off.
 */
const SW_URL = "/sw.js";

function blockedHost(hostname: string) {
  return (
    hostname.startsWith("id-preview--") ||
    hostname.startsWith("preview--") ||
    hostname.endsWith("lovableproject.com") ||
    hostname.endsWith("lovableproject-dev.com") ||
    hostname.endsWith("beta.lovable.dev")
  );
}

async function unregisterAll() {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    registrations
      .filter((r) => (r.active?.scriptURL ?? "").endsWith(SW_URL))
      .map((r) => r.unregister()),
  );
}

export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const refused =
    !import.meta.env.PROD ||
    window.self !== window.top ||
    blockedHost(window.location.hostname) ||
    new URL(window.location.href).searchParams.get("sw") === "off";

  if (refused) {
    void unregisterAll();
    return;
  }

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(SW_URL, { scope: "/" });
  });
}
