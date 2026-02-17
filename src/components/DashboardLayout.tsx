import { ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";

export function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full">
      <AppSidebar />
      <main className="flex-1 overflow-auto relative">
        {/* Ambient background orbs */}
        <div className="orb orb-primary w-72 h-72 -top-20 -right-20 animate-float" />
        <div className="orb orb-accent w-56 h-56 bottom-20 -left-10" style={{ animationDelay: '1.5s', animation: 'float 4s ease-in-out infinite 1.5s' }} />
        <div className="orb orb-primary w-40 h-40 top-1/2 right-1/4" style={{ opacity: 0.06, animation: 'float 5s ease-in-out infinite 0.8s' }} />
        <div className="relative z-10 p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
