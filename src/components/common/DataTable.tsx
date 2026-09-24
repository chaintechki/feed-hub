import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: string;
  className?: string;
  render: (row: T) => ReactNode;
};

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  isLoading,
  emptyText = "No records.",
}: {
  columns: Column<T>[];
  rows: T[];
  isLoading?: boolean;
  emptyText?: string;
}) {
  return (
    <div className="overflow-hidden rounded-sm border border-border bg-panel">
      <table className="w-full border-collapse text-[11px]">
        <thead className="bg-panel-header text-[10px] uppercase tracking-wide text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={cn("border-b border-border px-3 py-2 text-left", c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-3 text-muted-foreground">
                Loading…
              </td>
            </tr>
          ) : null}
          {!isLoading && !rows.length ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-3 text-muted-foreground">
                {emptyText}
              </td>
            </tr>
          ) : null}
          {rows.map((row) => (
            <tr key={row.id} className="odd:bg-row even:bg-row-alt hover:bg-row-hover">
              {columns.map((c) => (
                <td key={c.key} className={cn("border-b border-border px-3 py-1.5", c.className)}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
