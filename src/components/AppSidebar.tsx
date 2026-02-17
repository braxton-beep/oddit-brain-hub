import { NavLink } from "@/components/NavLink";
import { TourTrigger } from "@/components/WelcomeTour";
import {
  LayoutDashboard,
  Brain,
  FileText,
  Code2,
  MessageSquare,
  Link2,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Audit Brain", url: "/audit-brain", icon: Brain },
  { title: "Reports", url: "/reports", icon: FileText },
  { title: "Dev Pipeline", url: "/dev-pipeline", icon: Code2 },
  { title: "Slack Agent", url: "/slack-agent", icon: MessageSquare },
  { title: "Integrations", url: "/integrations", icon: Link2 },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`flex flex-col border-r border-border bg-sidebar transition-all duration-200 ${
        collapsed ? "w-16" : "w-56"
      }`}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-border px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
          <Brain className="h-4 w-4 text-primary-foreground" />
        </div>
        {!collapsed && (
          <div>
            <span className="text-sm font-bold tracking-tight text-cream">oddit</span>
            <span className="ml-1 text-xs font-medium text-accent">brain</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 p-3">
        {navItems.map((item) => (
          <NavLink
            key={item.url}
            to={item.url}
            end={item.url === "/"}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-sidebar-foreground transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            activeClassName="bg-primary/10 text-primary border border-primary/20"
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{item.title}</span>}
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
  );
}
