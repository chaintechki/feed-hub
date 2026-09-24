// Production backend client used for server builds (FP_PRODUCTION_CLIENT=1).
// Same API as the generated client, without development-environment helpers.
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

const URL_ = import.meta.env.VITE_SUPABASE_URL as string;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

function keyFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined);
    if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

export const supabase = createClient<Database>(URL_, KEY, {
  global: { fetch: keyFetch(KEY) },
  auth: { storage: localStorage, storageKey: "fp.session", persistSession: true, autoRefreshToken: true },
});
