import { DashboardLayout } from "@/components/DashboardLayout";
import { MetricCard } from "@/components/MetricCard";
import {
  Brain,
  FileText,
  TrendingUp,
  Zap,
  Activity,
  Clock,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

const metrics = [
  { title: "Active Agents", value: "12", change: "+2 this week", changeType: "positive" as const, icon: Brain },
  { title: "Audits Completed", value: "847", change: "+23 today", changeType: "positive" as const, icon: FileText },
  { title: "Avg. Conversion Lift", value: "18.4%", change: "+2.1%", changeType: "positive" as const, icon: TrendingUp },
  { title: "Automations Running", value: "34", change: "3 paused", changeType: "neutral" as const, icon: Zap },
];

const recentActivity = [
  { icon: CheckCircle2, text: "Audit completed for client Acme Corp", time: "2m ago", status: "success" },
  { icon: Activity, text: "Agent 'Hero Analyzer' processed 42 pages", time: "8m ago", status: "neutral" },
  { icon: AlertCircle, text: "Automation 'CTA Optimizer' needs review", time: "15m ago", status: "warning" },
  { icon: CheckCircle2, text: "New client 'TechFlow' onboarded", time: "1h ago", status: "success" },
  { icon: Activity, text: "Weekly report generated for 6 clients", time: "2h ago", status: "neutral" },
  { icon: CheckCircle2, text: "A/B test results ready for NovaPay", time: "3h ago", status: "success" },
];

const quickActions = [
  { label: "Run New Audit", icon: FileText, description: "Analyze a website for CRO opportunities" },
  { label: "Deploy Agent", icon: Brain, description: "Launch an AI agent for a client" },
  { label: "Create Automation", icon: Zap, description: "Set up a new workflow automation" },
];

const statusColor: Record<string, string> = {
  success: "text-success",
  warning: "text-warning",
  neutral: "text-muted-foreground",
};

const Index = () => {
  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">
          Welcome back to <span className="text-gradient">Oddit Brain</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          AI operations hub • Connected to backend at localhost:8000
        </p>
      </div>

      {/* Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {metrics.map((m) => (
          <MetricCard key={m.title} {...m} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Activity */}
        <div className="lg:col-span-2 glow-card rounded-lg bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
          </div>
          <div className="space-y-3">
            {recentActivity.map((item, i) => (
              <div key={i} className="flex items-start gap-3 rounded-md p-2 transition-colors hover:bg-secondary">
                <item.icon className={`h-4 w-4 mt-0.5 shrink-0 ${statusColor[item.status]}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-card-foreground">{item.text}</p>
                  <p className="text-xs text-muted-foreground">{item.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="glow-card rounded-lg bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Quick Actions</h2>
          <div className="space-y-2">
            {quickActions.map((action) => (
              <button
                key={action.label}
                className="flex w-full items-center gap-3 rounded-md border border-border bg-secondary p-3 text-left transition-colors hover:border-primary/30 hover:bg-muted"
              >
                <action.icon className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">{action.label}</p>
                  <p className="text-xs text-muted-foreground">{action.description}</p>
                </div>
              </button>
            ))}
          </div>

          {/* System Status */}
          <div className="mt-6 rounded-md border border-border bg-secondary p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
              <span className="text-xs font-medium text-foreground">System Status</span>
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>FastAPI Backend</span>
                <span className="text-success">Connected</span>
              </div>
              <div className="flex justify-between">
                <span>AI Engine</span>
                <span className="text-success">Operational</span>
              </div>
              <div className="flex justify-between">
                <span>Queue</span>
                <span className="text-warning">3 pending</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Index;
