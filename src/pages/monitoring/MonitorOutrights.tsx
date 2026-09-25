import { useState } from "react";

import { MonitorSubBar } from "@/components/monitoring/MonitorSubBar";
import { SportTree, type TreeSelection } from "@/components/monitoring/SportTree";
import { useOutrights } from "@/lib/feed/queries";

export default function MonitorOutrights() {
  const [selection, setSelection] = useState<TreeSelection>({
    sportIds: [],
    categoryIds: [],
    tournamentIds: [],
  });
  const { data = [], isLoading } = useOutrights();

  const rows = selection.tournamentIds.length
    ? data.filter((o) => selection.tournamentIds.includes(o.tournament_id))
    : data;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MonitorSubBar tabs={[]} activeTab={null} onActivate={() => {}} onClose={() => {}} onAdd={() => {}} />
      <div className="flex min-h-0 flex-1">
        <SportTree selection={selection} onSelectionChange={setSelection} />
        <div className="panel-scroll min-h-0 flex-1 overflow-auto bg-panel">
          <table className="w-full border-collapse text-[11px]">
            <thead className="sticky top-0 bg-panel-header text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="border-b border-border px-3 py-2 text-left">Outright</th>
                <th className="border-b border-border px-3 py-2 text-left">Scheduled</th>
                <th className="border-b border-border px-3 py-2 text-left">Status</th>
                <th className="border-b border-border px-3 py-2 text-left">Competitors</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : null}
              {!isLoading && !rows.length ? (
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-muted-foreground">
                    No outrights for the current selection.
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => (
                <tr key={row.id} className="odd:bg-row even:bg-row-alt hover:bg-row-hover">
                  <td className="border-b border-border px-3 py-1.5 font-semibold">{row.name}</td>
                  <td className="border-b border-border px-3 py-1.5">
                    {row.scheduled ? new Date(row.scheduled).toLocaleString() : "—"}
                  </td>
                  <td className="border-b border-border px-3 py-1.5 uppercase">{row.status}</td>
                  <td className="border-b border-border px-3 py-1.5">
                    {row.competitors.slice(0, 4).map((c, i) => (
                      <span key={c.id ?? i} className="mr-3 whitespace-nowrap">
                        {c.name} <b className="font-mono">{typeof c.odds === "number" ? c.odds.toFixed(2) : "—"}</b>
                      </span>
                    ))}
                    {row.competitors.length > 4 ? <span className="text-muted-foreground">+{row.competitors.length - 4}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
