import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  question: string | null;
  loading: boolean;
  value: string;
  onChange: (v: string) => void;
  onRefresh: () => void;
}

export function MathCaptcha({ question, loading, value, onChange, onRefresh }: Props) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <Label htmlFor="captcha" className="text-[11px] uppercase tracking-wide">
        {t("auth.captcha")}
      </Label>
      <div className="flex items-center gap-2">
        <div
          data-testid="captcha-question"
          className="flex h-9 min-w-28 select-none items-center justify-center rounded-sm border border-border bg-muted px-3 font-mono text-sm font-semibold tracking-wider text-foreground"
        >
          {question ? `${question} =` : "…"}
        </div>
        <Input
          id="captcha"
          required
          inputMode="numeric"
          autoComplete="off"
          pattern="-?[0-9]{1,4}"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9-]/g, ""))}
          className="h-9 w-20 text-center font-mono"
        />
        <button
          type="button"
          onClick={onRefresh}
          aria-label={t("auth.newCaptcha")}
          title={t("auth.newCaptcha")}
          className="flex h-9 w-9 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </button>
      </div>
    </div>
  );
}
