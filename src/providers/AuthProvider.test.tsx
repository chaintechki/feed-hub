import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

type Cb = (e: string, s: unknown) => void;
let emit: Cb = () => {};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: Cb) => {
        emit = cb;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      getSession: () => Promise.resolve({ data: { session: null } }),
      signOut: () => Promise.resolve(),
    },
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [] }) }) }),
  },
}));

import { AuthProvider } from "./AuthProvider";

describe("user switch", () => {
  it("drops cached customer lists of the previous user before the next user renders", () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <div />
        </AuthProvider>
      </QueryClientProvider>,
    );
    act(() => emit("SIGNED_IN", { user: { id: "super" } }));
    qc.setQueryData(["api_clients", "super"], [{ id: "hidden-client" }]);
    act(() => emit("SIGNED_IN", { user: { id: "admin" } }));
    expect(qc.getQueryData(["api_clients", "super"])).toBeUndefined();
    expect(qc.getQueryCache().getAll()).toHaveLength(0);
  });
});
