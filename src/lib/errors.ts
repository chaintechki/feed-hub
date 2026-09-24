import i18n from "@/i18n";

const KNOWN: [RegExp, string][] = [
  [/rate_limited|P0429|too many requests/i, "errors.rateLimited"],
  [/password_leaked/i, "errors.passwordLeaked"],
  [/weak_password/i, "errors.weakPassword"],
  [/username_locked/i, "errors.usernameLocked"],
  [/forbidden|row-level security|permission denied|42501/i, "errors.forbidden"],
];

/** Maps technical error codes to a translated, user-facing message. */
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  const hit = KNOWN.find(([re]) => re.test(msg));
  return hit ? i18n.t(hit[1]) : msg || i18n.t("errors.generic");
}
