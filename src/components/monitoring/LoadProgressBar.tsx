import { useTranslation } from "react-i18next";

import { useMatchLoadProgress } from "@/lib/feed/queries";

/** Preload progress while matches/odds load, afterwards the hit count. */
export function LoadProgressBar({ count, total }: { count: number; total: number }) {
  const { t, i18n } = useTranslation();
  const p = useMatchLoadProgress();
  const pct = p.chunksTotal ? Math.min(100, Math.round((p.chunksDone / p.chunksTotal) * 100)) : 0;
  const nf = new Intl.NumberFormat(i18n.language);
  return (
    <div data-testid="load-progress" className="relative flex h-6 shrink-0 items-center border-b border-border bg-subbar px-2 text-[10px] text-muted-foreground">
      {p.active ? (
        <>
          <span className="absolute inset-y-0 left-0 bg-primary/15 transition-[width] duration-300" style={{ width: `${Math.max(4, pct)}%` }} />
          <span className="absolute bottom-0 left-0 h-[2px] bg-primary transition-[width] duration-300" style={{ width: `${Math.max(4, pct)}%` }} />
          <span className="relative font-semibold text-foreground">{t("preload.loading", { matches: nf.format(p.matches), pct })}</span>
        </>
      ) : (
        <span>{t("preload.shown", { count: nf.format(count), total: nf.format(total) })}</span>
      )}
    </div>
  );
}
