import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";

export type AppRole = "super_admin" | "admin" | "trader" | "viewer";

type AuthState = {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();
  const lastUser = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      const uid = next?.user?.id ?? null;
      // Drop every cached result when the signed-in user changes, so no data of the previous user is ever shown.
      if (lastUser.current !== undefined && lastUser.current !== uid) qc.clear();
      lastUser.current = uid;
      setSession(next);
      if (!next) setRoles([]);
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    let active = true;
    void supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .then(({ data }) => {
        if (active) setRoles((data ?? []).map((r) => r.role as AppRole));
      });
    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      roles,
      loading,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, roles, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
