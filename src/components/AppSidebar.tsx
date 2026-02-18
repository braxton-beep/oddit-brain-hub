import { NavLink } from "@/components/NavLink";
import { TourTrigger } from "@/components/WelcomeTour";
import brainMascot from "@/assets/brain-mascot.png";
import {
  LayoutDashboard,
  Brain,
  FileText,
  Code2,
  MessageSquare,
  Link2,
  Rocket,
  Settings,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Telescope,
  BarChart3,
  Users,
  Twitter,
} from "lucide-react";
import { useState } from "react";
import { useEmailDrafts } from "@/hooks/useDashboardData";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Oddit Brain", url: "/oddit-brain", icon: Brain },
  { title: "Clients", url: "/clients", icon: Users },
  { title: "Reports", url: "/reports", icon: FileText },
  { title: "Dev Pipeline", url: "/dev-pipeline", icon: Code2 },
  { title: "Slack Agent", url: "/slack-agent", icon: MessageSquare },
  { title: "Twitter / X", url: "/twitter", icon: Twitter },
  { title: "Competitive Intel", url: "/competitive-intel", icon: Telescope },
  { title: "Benchmarks", url: "/benchmarks", icon: BarChart3 },
  { title: "Integrations", url: "/integrations", icon: Link2 },
  { title: "Vision", url: "/vision", icon: Rocket },
  { title: "Settings", url: "/settings", icon: Settings },
];



export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: pendingDrafts } = useEmailDrafts("pending");
  const pendingCount = pendingDrafts?.length ?? 0;

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-50 flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar border border-border text-muted-foreground md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm md:hidden" onClick={() => setMobileOpen(false)}>
          <aside
            className="flex flex-col w-64 h-full bg-sidebar border-r border-border animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-16 items-center justify-between border-b border-border px-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl overflow-hidden animate-glow-pulse">
                  <img src={brainMascot} alt="Oddit Brain" className="h-10 w-10 object-cover" />
                </div>
                <div>
                  <span className="text-sm font-bold tracking-tight text-cream">oddit</span>
                  <span className="ml-1 text-xs font-medium text-accent">brain</span>
                </div>
              </div>
              <button onClick={() => setMobileOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-0.5 p-3">
              {navItems.map((item) => (
                <NavLink
                  key={item.url}
                  to={item.url}
                  end={item.url === "/"}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-sidebar-foreground transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  activeClassName="bg-primary/10 text-primary border border-primary/20 nav-glow"
                  onClick={() => setMobileOpen(false)}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span>{item.title}</span>
                  {item.url === "/" && pendingCount > 0 && (
                    <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-gold/20 px-1 text-[10px] font-bold text-gold">
                      {pendingCount}
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex flex-col border-r border-border bg-sidebar transition-all duration-200 ${
          collapsed ? "w-16" : "w-56"
        }`}
      >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-border px-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl overflow-hidden animate-glow-pulse">
          <img src={brainMascot} alt="Oddit Brain" className="h-10 w-10 object-cover" />
        </div>
        {!collapsed && (
          <div className="animate-fade-in-left">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-tight text-cream">oddit</span>
              <span className="text-xs font-medium text-accent">brain</span>
              <span className="rounded px-1 py-0.5 text-[9px] font-bold tracking-wider bg-primary/15 text-primary border border-primary/20">v1.2</span>
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 p-3 stagger-children">
        {navItems.map((item) => (
          <NavLink
            key={item.url}
            to={item.url}
            end={item.url === "/"}
            className="relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-sidebar-foreground transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:translate-x-0.5"
            activeClassName="bg-primary/10 text-primary border border-primary/20 nav-glow"
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{item.title}</span>}
            {item.url === "/" && pendingCount > 0 && !collapsed && (
              <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-gold/20 px-1 text-[10px] font-bold text-gold">
                {pendingCount}
              </span>
            )}
            {item.url === "/" && pendingCount > 0 && collapsed && (
              <span className="absolute top-1 right-1 flex h-2.5 w-2.5 rounded-full bg-gold" />
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3 flex items-center justify-between">
        {!collapsed && <TourTrigger />}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors ml-auto"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
    </>
  );
}
