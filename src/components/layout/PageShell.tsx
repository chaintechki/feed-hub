import type { ReactNode } from "react";

export function PageShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-4 border-b border-border bg-subbar px-4">
        <div>
          <h1 className="text-[13px] font-semibold uppercase tracking-wide text-foreground">
            {title}
          </h1>
          {description ? (
            <p className="text-[11px] text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      </div>
      <div className="panel-scroll min-h-0 flex-1 overflow-auto p-4">{children}</div>
    </div>
  );
}
