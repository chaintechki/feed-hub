/**
 * Guarded service-worker registration.
 * The worker only ever runs in a production build served from a real origin —
 * never in dev, never inside an embedded preview iframe, and never with ?sw=off.
 */
import { clearReloadMark, markReload, reloadAttempted } from "./version";

const SW_URL = "/sw.js";
export const SW_UPDATE_EVENT = "fp:sw-update";

/** The worker only runs on the production domain(s); everywhere else it is removed. */
const SW_HOSTS = ((import.meta.env["VITE_SW_HOSTS"] as string | undefined) ?? "feed.feedarea.net")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

function blockedHost(hostname: string) {
  return !SW_HOSTS.includes(hostname) && hostname !== "localhost";
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

let registration: ServiceWorkerRegistration | null = null;

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

  window.addEventListener("load", async () => {
    try {
      registration = await navigator.serviceWorker.register(SW_URL, {
        scope: "/",
        updateViaCache: "none",
      });
      registration.addEventListener("updatefound", () => {
        window.dispatchEvent(new Event(SW_UPDATE_EVENT));
      });
    } catch {
      /* ignore */
    }
  });
}

export async function checkServiceWorkerUpdate() {
  try {
    await registration?.update();
  } catch {
    /* offline */
  }
}

function waitForControllerChange(ms: number) {
  return new Promise<void>((resolve) => {
    if (!("serviceWorker" in navigator)) return resolve();
    const done = () => resolve();
    navigator.serviceWorker.addEventListener("controllerchange", done, { once: true });
    setTimeout(done, ms);
  });
}

/**
 * Activates the newest worker, purges caches and reloads.
 * If a reload to this build was already attempted, forces a cache-busting URL.
 */
export async function applyUpdate(targetBuildId: string) {
  const retry = reloadAttempted(targetBuildId);
  markReload(targetBuildId);

  if ("serviceWorker" in navigator) {
    try {
      const reg = registration ?? (await navigator.serviceWorker.getRegistration());
      if (reg) {
        await reg.update().catch(() => undefined);
        const waiting = reg.waiting ?? reg.installing;
        if (waiting) {
          waiting.postMessage({ type: "SKIP_WAITING" });
          await waitForControllerChange(3000);
        }
      }
    } catch {
      /* continue with reload */
    }
  }

  if ("caches" in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {
      /* ignore */
    }
  }

  if (retry) {
    // Second attempt: drop the worker entirely and bypass every cache layer.
    await unregisterAll().catch(() => undefined);
    clearReloadMark();
    const url = new URL(window.location.href);
    url.searchParams.set("v", targetBuildId);
    window.location.replace(url.toString());
    return;
  }
  window.location.reload();
}
