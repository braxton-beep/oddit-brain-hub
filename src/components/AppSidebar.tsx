import { NavLink } from "@/components/NavLink";
import {
  LayoutDashboard,
  Brain,
  FileText,
  Code2,
  MessageSquare,
  Settings,
  Figma,
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
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`flex flex-col border-r border-border bg-sidebar transition-all duration-200 ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <Brain className="h-6 w-6 shrink-0 text-primary" />
        {!collapsed && (
          <span className="text-gradient text-lg font-bold tracking-tight">
            Oddit Brain
          </span>
        )}
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => (
          <NavLink
            key={item.url}
            to={item.url}
            end={item.url === "/"}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            activeClassName="bg-sidebar-accent text-primary font-medium"
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{item.title}</span>}
          </NavLink>
        ))}
      </nav>

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex h-10 items-center justify-center border-t border-border text-muted-foreground hover:text-foreground transition-colors"
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
    </aside>
  );
}
