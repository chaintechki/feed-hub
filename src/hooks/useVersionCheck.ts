import { useCallback, useEffect, useRef, useState } from "react";

import { SW_UPDATE_EVENT, checkServiceWorkerUpdate } from "@/lib/pwa";
import { CURRENT, type VersionInfo, clearReloadMark, fetchRemoteVersion, isNewer } from "@/lib/version";

const INTERVAL = 60_000;
const SNOOZE = 10 * 60_000;

export function useVersionCheck() {
  const [remote, setRemote] = useState<VersionInfo | null>(null);
  const snoozedUntil = useRef(0);

  const check = useCallback(async () => {
    void checkServiceWorkerUpdate();
    const r = await fetchRemoteVersion();
    if (!r) return;
    if (!isNewer(CURRENT, r)) {
      clearReloadMark();
      setRemote(null);
      return;
    }
    if (Date.now() >= snoozedUntil.current) setRemote(r);
  }, []);

  useEffect(() => {
    void check();
    const id = window.setInterval(check, INTERVAL);
    const onVisible = () => document.visibilityState === "visible" && void check();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(SW_UPDATE_EVENT, check);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(SW_UPDATE_EVENT, check);
    };
  }, [check]);

  const snooze = useCallback(() => {
    snoozedUntil.current = Date.now() + SNOOZE;
    setRemote(null);
  }, []);

  return { current: CURRENT, remote, snooze };
}
