import { Outlet } from "react-router-dom";

import { NavBar } from "@/components/layout/NavBar";
import { TopBar } from "@/components/layout/TopBar";

export function AppLayout() {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      <TopBar />
      <NavBar />
      <main className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}
