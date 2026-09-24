import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { PASSWORD_CHECKS, passwordChecks } from "../../../supabase/functions/_shared/auth-core.ts";

export function PasswordRules({ password, confirm }: { password: string; confirm?: string }) {
  const { t } = useTranslation();
  const checks = passwordChecks(password);
  const rows: [string, boolean][] = PASSWORD_CHECKS.map((k) => [t(`pw.${k}`), checks[k]]);
  if (confirm !== undefined) rows.push([t("pw.match"), confirm.length > 0 && confirm === password]);
  return (
    <ul className="grid grid-cols-1 gap-0.5 text-[11px]" data-testid="password-rules">
      {rows.map(([label, ok]) => (
        <li key={label} className={cn("flex items-center gap-1.5", ok ? "text-success" : "text-muted-foreground")}>
          {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
          {label}
        </li>
      ))}
    </ul>
  );
}
