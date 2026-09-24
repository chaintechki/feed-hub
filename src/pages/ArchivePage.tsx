import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { DataTable, type Column } from "@/components/common/DataTable";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

type ArchivedMatch = {
  id: string;
  home_team: string;
  away_team: string;
  scheduled: string;
  status: string;
};

function toCsv(rows: ArchivedMatch[]) {
  const head = "id,home,away,scheduled,status";
  const body = rows
    .map((r) => [r.id, r.home_team, r.away_team, r.scheduled, r.status].join(","))
    .join("\n");
  return `${head}\n${body}`;
}

export default function ArchivePage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["archive", from, to],
    queryFn: async () => {
      let q = supabase
        .from("matches")
        .select("id,home_team,away_team,scheduled,status")
        .in("status", ["ended", "closed", "cancelled"])
        .order("scheduled", { ascending: false })
        .limit(500);
      if (from) q = q.gte("scheduled", new Date(from).toISOString());
      if (to) q = q.lte("scheduled", new Date(to).toISOString());
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ArchivedMatch[];
    },
  });

  const columns: Column<ArchivedMatch>[] = [
    { key: "id", header: "Match id", render: (r) => r.id },
    { key: "home", header: "Home", render: (r) => r.home_team },
    { key: "away", header: "Away", render: (r) => r.away_team },
    { key: "date", header: "Kick-off", render: (r) => new Date(r.scheduled).toLocaleString() },
    { key: "status", header: "Status", render: (r) => r.status.toUpperCase() },
  ];

  function exportCsv() {
    const blob = new Blob([toCsv(data)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "archive.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageShell
      title="Archive"
      description="Finished, closed and cancelled events"
      actions={
        <>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-7 w-36 text-[11px]" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-7 w-36 text-[11px]" />
          <Button size="sm" className="h-7 text-[11px]" onClick={exportCsv}>
            Export CSV
          </Button>
        </>
      }
    >
      <DataTable columns={columns} rows={data} isLoading={isLoading} emptyText="No archived events." />
    </PageShell>
  );
}
