import { CURRENT, formatBuildTime } from "@/lib/version";

export function AppFooter() {
  return (
    <footer className="flex h-6 shrink-0 items-center justify-end gap-3 border-t border-border bg-card px-3 text-[11px] text-muted-foreground">
      <span data-testid="app-version">
        Feed Panel v{CURRENT.version} · Build {formatBuildTime(CURRENT.buildTime)}
      </span>
    </footer>
  );
}
