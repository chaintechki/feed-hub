import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { AuthProvider } from "@/providers/AuthProvider";

const AuthPage = lazy(() => import("@/pages/AuthPage"));
const MonitorMatches = lazy(() => import("@/pages/monitoring/MonitorMatches"));
const MonitorOutrights = lazy(() => import("@/pages/monitoring/MonitorOutrights"));
const AlertsPage = lazy(() => import("@/pages/AlertsPage"));
const ArchivePage = lazy(() => import("@/pages/ArchivePage"));
const SettlementsPage = lazy(() => import("@/pages/SettlementsPage"));
const MarginsPage = lazy(() => import("@/pages/trading/MarginsPage"));
const LimitsPage = lazy(() => import("@/pages/trading/LimitsPage"));
const BulkActionsPage = lazy(() => import("@/pages/trading/BulkActionsPage"));
const TemplatesPage = lazy(() => import("@/pages/trading/TemplatesPage"));
const ConfigurationPage = lazy(() => import("@/pages/ConfigurationPage"));
const UserSettingsPage = lazy(() => import("@/pages/UserSettingsPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false } },
});

function Fallback() {
  return (
    <div className="flex h-full items-center justify-center p-8 text-xs text-muted-foreground">
      Loading…
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider delayDuration={200}>
          <BrowserRouter>
            <Suspense fallback={<Fallback />}>
              <Routes>
                <Route path="/auth" element={<AuthPage />} />
                <Route
                  element={
                    <RequireAuth>
                      <AppLayout />
                    </RequireAuth>
                  }
                >
                  <Route path="/" element={<Navigate to="/monitoring/matches" replace />} />
                  <Route path="/monitoring" element={<Navigate to="/monitoring/matches" replace />} />
                  <Route path="/monitoring/matches" element={<MonitorMatches />} />
                  <Route path="/monitoring/outrights" element={<MonitorOutrights />} />
                  <Route path="/alerts" element={<AlertsPage />} />
                  <Route path="/archive" element={<ArchivePage />} />
                  <Route path="/trading-tools" element={<Navigate to="/trading-tools/margins" replace />} />
                  <Route path="/trading-tools/margins" element={<MarginsPage />} />
                  <Route path="/trading-tools/limits" element={<LimitsPage />} />
                  <Route path="/trading-tools/bulk" element={<BulkActionsPage />} />
                  <Route path="/trading-tools/templates" element={<TemplatesPage />} />
                  <Route path="/settlements" element={<SettlementsPage />} />
                  <Route path="/configuration" element={<ConfigurationPage />} />
                  <Route path="/settings" element={<UserSettingsPage />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </Suspense>
          </BrowserRouter>
          <Toaster position="top-right" />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
