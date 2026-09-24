import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import { applyUpdate } from "@/lib/pwa";
import { formatBuildTime } from "@/lib/version";

export function UpdateDialog() {
  const { t } = useTranslation();
  const { current, remote, snooze } = useVersionCheck();
  const [busy, setBusy] = useState(false);

  if (!remote) return null;

  return (
    <AlertDialog open>
      <AlertDialogContent data-testid="update-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("version.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("version.body")}</AlertDialogDescription>
        </AlertDialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-sm border border-border bg-muted/40 p-3 text-sm">
          <dt className="text-muted-foreground">{t("version.installed")}</dt>
          <dd className="font-mono">
            v{current.version} · {formatBuildTime(current.buildTime)}
          </dd>
          <dt className="text-muted-foreground">{t("version.available")}</dt>
          <dd className="font-mono font-semibold text-primary">
            v{remote.version} · {formatBuildTime(remote.buildTime)}
          </dd>
        </dl>
        <AlertDialogFooter>
          <Button variant="ghost" size="sm" onClick={snooze} disabled={busy}>
            {t("version.later")}
          </Button>
          <Button
            onClick={() => {
              setBusy(true);
              void applyUpdate(remote.buildId);
            }}
            disabled={busy}
          >
            <RefreshCw className={busy ? "animate-spin" : ""} />
            {t("version.reload")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
