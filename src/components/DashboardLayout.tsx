import { ReactNode, forwardRef } from "react";
import { AppSidebar } from "./AppSidebar";

export const DashboardLayout = forwardRef<HTMLDivElement, { children: ReactNode }>(
  function DashboardLayout({ children }, ref) {
    return (
      <div ref={ref} className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto relative min-w-0">
          {/* Rich ambient glow field */}
          <div className="orb orb-primary w-[500px] h-[500px] -top-32 -right-32 hidden sm:block" style={{ animation: 'float 6s ease-in-out infinite' }} />
          <div className="orb orb-accent w-72 h-72 bottom-24 -left-20 hidden sm:block" style={{ animation: 'float 5s ease-in-out infinite 1s' }} />
          <div className="orb orb-violet w-64 h-64 top-1/3 right-1/4 hidden sm:block" style={{ opacity: 0.08, animation: 'float 7s ease-in-out infinite 2.5s' }} />
          <div className="orb orb-coral w-48 h-48 top-2/3 left-1/3 hidden sm:block" style={{ opacity: 0.06, animation: 'float 8s ease-in-out infinite 3s' }} />
          <div className="orb orb-gold w-40 h-40 top-16 left-1/2 hidden sm:block" style={{ opacity: 0.05, animation: 'float 9s ease-in-out infinite 4s' }} />
          <div className="orb orb-electric w-56 h-56 bottom-48 right-16 hidden sm:block" style={{ opacity: 0.07, animation: 'float 6s ease-in-out infinite 1.5s' }} />
          {/* Gradient mesh overlay */}
          <div className="absolute inset-0 gradient-mesh pointer-events-none" />
          <div className="relative z-10 p-5 sm:p-7 lg:p-10 max-w-[1400px]">{children}</div>
        </main>
      </div>
    );
  }
);
