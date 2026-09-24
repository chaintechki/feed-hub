import { Outlet } from "react-router-dom";

import { AppFooter } from "@/components/layout/AppFooter";
import { NavBar } from "@/components/layout/NavBar";
import { TopBar } from "@/components/layout/TopBar";
import { UpdateDialog } from "@/components/layout/UpdateDialog";

export function AppLayout() {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      <TopBar />
      <NavBar />
      <main className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </main>
      <AppFooter />
      <UpdateDialog />
    </div>
  );
}
