import { ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";

export function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full">
      <AppSidebar />
      <main className="flex-1 overflow-auto relative min-w-0">
        {/* Ambient background orbs — multi-color */}
        <div className="orb orb-primary w-72 h-72 -top-20 -right-20 animate-float hidden sm:block" />
        <div className="orb orb-accent w-56 h-56 bottom-20 -left-10 hidden sm:block" style={{ animationDelay: '1.5s', animation: 'float 4s ease-in-out infinite 1.5s' }} />
        <div className="orb orb-coral w-44 h-44 top-1/3 right-1/3 hidden sm:block" style={{ opacity: 0.08, animation: 'float 5s ease-in-out infinite 0.8s' }} />
        <div className="orb orb-violet w-36 h-36 bottom-1/4 right-10 hidden sm:block" style={{ opacity: 0.07, animation: 'float 6s ease-in-out infinite 2s' }} />
        <div className="relative z-10 p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
