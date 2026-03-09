import { NavLink } from "@/components/NavLink";
import { TourTrigger } from "@/components/WelcomeTour";
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
  Zap,
  Activity,
  Store,
  Layout,
  Target,
} from "lucide-react";
import { useState } from "react";
import { useEmailDrafts } from "@/hooks/useDashboardData";

function OdditEyes({ size = 28 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 44 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: size, height: size * (24 / 44) }}
    >
      <circle cx="10" cy="12" r="9" stroke="hsl(var(--primary))" strokeWidth="3.5" />
      <circle cx="10" cy="12" r="4" fill="hsl(var(--primary))" />
      <circle cx="34" cy="12" r="9" stroke="hsl(var(--primary))" strokeWidth="3.5" />
      <circle cx="34" cy="12" r="4" fill="hsl(var(--primary))" />
    </svg>
  );
}

const mainNav = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Oddit Brain", url: "/oddit-brain", icon: Brain },
  { title: "Clients", url: "/clients", icon: Users },
  { title: "Reports", url: "/reports", icon: FileText },
  { title: "Report Setup", url: "/report-setup", icon: Zap },
];

const toolsNav = [
  { title: "CRO Agent", url: "/cro-agent", icon: Activity },
  { title: "Lead Scout", url: "/lead-gen", icon: Target },
  { title: "AI Wireframes", url: "/wireframes", icon: Layout },
  { title: "Dev Pipeline", url: "/dev-pipeline", icon: Code2 },
  { title: "Slack Agent", url: "/slack-agent", icon: MessageSquare },
  { title: "Social Content", url: "/twitter", icon: Twitter },
  { title: "Competitive Intel", url: "/competitive-intel", icon: Telescope },
  { title: "Benchmarks", url: "/benchmarks", icon: BarChart3 },
];

const systemNav = [
  { title: "Shopify Connect", url: "/shopify-connect", icon: Store },
  { title: "Integrations", url: "/integrations", icon: Link2 },
  { title: "Vision", url: "/vision", icon: Rocket },
  { title: "Settings", url: "/settings", icon: Settings },
];

function NavSection({ label, items, collapsed, pendingCount, onNavigate }: {
  label: string;
  items: typeof mainNav;
  collapsed: boolean;
  pendingCount?: number;
  onNavigate?: () => void;
}) {
  return (
    <div className="mb-1">
      {!collapsed && (
        <p className="px-3 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/50 first:pt-0">
          {label}
        </p>
      )}
      {collapsed && <div className="h-3" />}
      <div className="space-y-0.5">
        {items.map((item) => (
          <NavLink
            key={item.url}
            to={item.url}
            end={item.url === "/"}
            className="relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-sidebar-foreground/80 transition-all duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            activeClassName="bg-primary/10 text-primary font-semibold nav-glow"
            onClick={onNavigate}
          >
            <item.icon className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span>{item.title}</span>}
            {item.url === "/" && (pendingCount ?? 0) > 0 && !collapsed && (
              <span className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gold/20 px-1 text-[10px] font-bold text-gold">
                {pendingCount}
              </span>
            )}
            {item.url === "/" && (pendingCount ?? 0) > 0 && collapsed && (
              <span className="absolute top-1.5 right-1.5 flex h-2 w-2 rounded-full bg-gold" />
            )}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: pendingDrafts } = useEmailDrafts("pending");
  const pendingCount = pendingDrafts?.length ?? 0;

  const sections = [
    { label: "Core", items: mainNav },
    { label: "Tools", items: toolsNav },
    { label: "System", items: systemNav },
  ];

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-50 flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar border border-sidebar-border text-muted-foreground md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm md:hidden" onClick={() => setMobileOpen(false)}>
          <aside
            className="flex flex-col w-60 h-full bg-sidebar border-r border-sidebar-border animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4">
              <div className="flex items-center gap-2.5">
                <OdditEyes size={30} />
                <span className="text-sm font-extrabold tracking-tight text-primary">oddit</span>
              </div>
              <button onClick={() => setMobileOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 py-2">
              {sections.map((s) => (
                <NavSection key={s.label} label={s.label} items={s.items} collapsed={false} pendingCount={pendingCount} onNavigate={() => setMobileOpen(false)} />
              ))}
            </nav>
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200 ${
          collapsed ? "w-[60px]" : "w-52"
        }`}
      >
        {/* Logo */}
        <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/8">
            <OdditEyes size={28} />
          </div>
          {!collapsed && (
            <span className="text-sm font-extrabold tracking-tight text-primary animate-fade-in">oddit</span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-1">
          {sections.map((s) => (
            <NavSection key={s.label} label={s.label} items={s.items} collapsed={collapsed} pendingCount={pendingCount} />
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-sidebar-border px-2 py-2 flex items-center justify-between">
          {!collapsed && <TourTrigger />}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-sidebar-accent transition-colors ml-auto"
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>
        </div>
      </aside>
    </>
  );
}
