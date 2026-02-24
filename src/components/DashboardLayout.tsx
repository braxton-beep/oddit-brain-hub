import { ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";

export function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full">
      <AppSidebar />
      <main className="flex-1 overflow-auto relative min-w-0">
        {/* Subtle ambient glow */}
        <div className="orb orb-primary w-80 h-80 -top-24 -right-24 hidden sm:block" />
        <div className="orb orb-accent w-48 h-48 bottom-32 -left-12 hidden sm:block" style={{ animation: 'float 5s ease-in-out infinite 1s' }} />
        <div className="orb orb-violet w-40 h-40 top-1/2 right-1/4 hidden sm:block" style={{ opacity: 0.05, animation: 'float 7s ease-in-out infinite 2.5s' }} />
        <div className="relative z-10 p-5 sm:p-7 lg:p-10 max-w-[1400px]">{children}</div>
      </main>
    </div>
  );
}
