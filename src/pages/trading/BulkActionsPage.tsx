import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/PageShell";
import { SportTree, type TreeSelection } from "@/components/monitoring/SportTree";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useMatches } from "@/lib/feed/queries";

type MatchPatch = Partial<{ suspended: boolean; hotlisted: boolean; control_mode: string }>;

export default function BulkActionsPage() {
  const [selection, setSelection] = useState<TreeSelection>({
    sportIds: [],
    categoryIds: [],
    tournamentIds: [],
  });
  const { data: matches = [] } = useMatches(selection);
  const queryClient = useQueryClient();

  const bulk = useMutation({
    mutationFn: async (patch: MatchPatch) => {
      const ids = matches.map((m) => m.id);
      if (!ids.length) throw new Error("No events in the current selection.");
      const { error } = await supabase.from("matches").update(patch).in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      toast.success(`${count} events updated`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex min-h-0 flex-1">
      <SportTree selection={selection} onSelectionChange={setSelection} />
      <PageShell
        title="Bulk actions"
        description="Apply trading actions to every event in the current tree selection"
      >
        <div className="max-w-xl space-y-4">
          <p className="text-[12px] text-muted-foreground">
            {matches.length} events currently selected.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="h-7 text-[11px]" onClick={() => bulk.mutate({ suspended: true })}>
              Suspend all
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => bulk.mutate({ suspended: false })}
            >
              Unsuspend all
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => bulk.mutate({ control_mode: "semi_auto" })}
            >
              Set semi-auto
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => bulk.mutate({ control_mode: "manual" })}
            >
              Set manual
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => bulk.mutate({ hotlisted: true })}
            >
              Add to hotlist
            </Button>
          </div>
        </div>
      </PageShell>
    </div>
  );
}
