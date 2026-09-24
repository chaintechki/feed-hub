import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useBookmakerLists } from "@/lib/feed/bookmakers";
import { resolveList } from "@/lib/feed/normalize";

/** Shows at which level the effective bookmaker list is configured; click opens that level. */
export function BookmakerListCell({ sportId, categoryId, tournamentId }: { sportId: string; categoryId: string; tournamentId: string }) {
  const { t } = useTranslation();
  const { data = [] } = useBookmakerLists();
  const l = resolveList(data, { sportId, categoryId, tournamentId });
  if (!l) return <Link to={`/configuration/bookmakers?level=tournament&ref=${encodeURIComponent(tournamentId)}`} className="text-muted-foreground hover:underline">—</Link>;
  return (
    <Link to={`/configuration/bookmakers?level=${l.from}&ref=${encodeURIComponent(l.ref_id)}`} className="text-primary hover:underline">
      {t(`cfg.level.${l.from}`)} · {l.items.length}
    </Link>
  );
}
