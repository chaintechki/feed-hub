import { useCallback, useEffect, useState } from "react";

export type OddsFormat = "EU" | "UK" | "US" | "HK";

const FORMATS: OddsFormat[] = ["EU", "UK", "US", "HK"];
const KEY = "fp.oddsFormat";

export function useOddsFormat() {
  const [format, setFormatState] = useState<OddsFormat>(() => {
    if (typeof window === "undefined") return "EU";
    return (window.localStorage.getItem(KEY) as OddsFormat) ?? "EU";
  });

  useEffect(() => {
    window.localStorage.setItem(KEY, format);
  }, [format]);

  useEffect(() => {
    const handler = (e: Event) => setFormatState((e as CustomEvent<OddsFormat>).detail);
    window.addEventListener("fp:odds-format", handler);
    return () => window.removeEventListener("fp:odds-format", handler);
  }, []);

  const setFormat = useCallback((f: OddsFormat) => {
    setFormatState(f);
    window.dispatchEvent(new CustomEvent("fp:odds-format", { detail: f }));
  }, []);

  return { format, setFormat, formats: FORMATS };
}

/** Convert decimal (EU) odds into the selected display format. */
export function formatOdds(decimal: number | null | undefined, format: OddsFormat): string {
  if (decimal == null || !Number.isFinite(decimal) || decimal <= 1) return "—";
  switch (format) {
    case "UK": {
      const numerator = Math.round((decimal - 1) * 100);
      const denominator = 100;
      const g = gcd(numerator, denominator);
      return `${numerator / g}/${denominator / g}`;
    }
    case "US":
      return decimal >= 2
        ? `+${Math.round((decimal - 1) * 100)}`
        : `${Math.round(-100 / (decimal - 1))}`;
    case "HK":
      return (decimal - 1).toFixed(2);
    default:
      return decimal.toFixed(3);
  }
}

function gcd(a: number, b: number): number {
  return b === 0 ? a || 1 : gcd(b, a % b);
}
