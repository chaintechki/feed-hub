export interface VersionInfo {
  version: string;
  buildId: string;
  buildTime: string;
}

export const CURRENT: VersionInfo = {
  version: typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0",
  buildId: typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev",
  buildTime: typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : new Date().toISOString(),
};

export function formatBuildTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function isValidInfo(x: unknown): x is VersionInfo {
  const v = x as VersionInfo;
  return !!v && typeof v.version === "string" && typeof v.buildId === "string" && typeof v.buildTime === "string";
}

export function isNewer(current: VersionInfo, remote: VersionInfo | null) {
  return !!remote && remote.buildId !== current.buildId;
}

const RELOAD_KEY = "fp.reloadTarget";

/** Returns true if we already tried reloading to this build and still run an older one. */
export function reloadAttempted(targetBuildId: string, storage: Pick<Storage, "getItem"> = sessionStorage) {
  return storage.getItem(RELOAD_KEY) === targetBuildId;
}

export function markReload(targetBuildId: string, storage: Pick<Storage, "setItem"> = sessionStorage) {
  storage.setItem(RELOAD_KEY, targetBuildId);
}

export function clearReloadMark(storage: Pick<Storage, "removeItem"> = sessionStorage) {
  storage.removeItem(RELOAD_KEY);
}

export async function fetchRemoteVersion(): Promise<VersionInfo | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    return isValidInfo(json) ? json : null;
  } catch {
    return null;
  }
}
