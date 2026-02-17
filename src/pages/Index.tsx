import { DashboardLayout } from "@/components/DashboardLayout";
import { MetricCard } from "@/components/MetricCard";
import { useDashboardMetrics, useActivity, useSystemStatus } from "@/hooks/useDashboard";
import {
  Brain,
  FileText,
  TrendingUp,
  Zap,
  Clock,
  CheckCircle2,
  AlertCircle,
  Activity,
  Loader2,
  WifiOff,
} from "lucide-react";

const statusColor: Record<string, string> = {
  success: "text-success",
  warning: "text-warning",
  neutral: "text-muted-foreground",
};

const activityIcon: Record<string, typeof CheckCircle2> = {
  success: CheckCircle2,
  warning: AlertCircle,
  neutral: Activity,
};

const quickActions = [
  { label: "Run New Audit", icon: FileText, description: "Analyze a website for CRO opportunities" },
  { label: "Deploy Agent", icon: Brain, description: "Launch an AI agent for a client" },
  { label: "Create Automation", icon: Zap, description: "Set up a new workflow automation" },
];

function parseChangeType(change: string): "positive" | "negative" | "neutral" {
  if (change.startsWith("+")) return "positive";
  if (change.startsWith("-")) return "negative";
  return "neutral";
}

const Index = () => {
  const { data: metrics, isLoading: metricsLoading, isError: metricsError } = useDashboardMetrics();
  const { data: activity, isLoading: activityLoading, isError: activityError } = useActivity();
  const { data: status, isLoading: statusLoading } = useSystemStatus();

  const metricCards = metrics
    ? [
        { title: "Active Agents", value: String(metrics.active_agents), change: metrics.active_agents_change, changeType: parseChangeType(metrics.active_agents_change), icon: Brain },
        { title: "Audits Completed", value: String(metrics.audits_completed), change: metrics.audits_completed_change, changeType: parseChangeType(metrics.audits_completed_change), icon: FileText },
        { title: "Avg. Conversion Lift", value: metrics.avg_conversion_lift, change: metrics.avg_conversion_lift_change, changeType: parseChangeType(metrics.avg_conversion_lift_change), icon: TrendingUp },
        { title: "Automations Running", value: String(metrics.automations_running), change: metrics.automations_running_change, changeType: parseChangeType(metrics.automations_running_change), icon: Zap },
      ]
    : [];

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">
          Welcome back to <span className="text-gradient">Oddit Brain</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          AI operations hub • {status ? (
            <span className={status.backend === "connected" ? "text-success" : "text-destructive"}>
              Backend {status.backend}
            </span>
          ) : "Connecting…"}
        </p>
      </div>

      {/* Metrics */}
      {metricsError ? (
        <div className="mb-8 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <WifiOff className="h-4 w-4" />
          <span>Unable to reach backend at localhost:8000. Make sure your FastAPI server is running.</span>
        </div>
      ) : metricsLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glow-card rounded-lg bg-card p-5 animate-pulse h-24" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          {metricCards.map((m) => (
            <MetricCard key={m.title} {...m} />
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Activity */}
        <div className="lg:col-span-2 glow-card rounded-lg bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
          </div>
          {activityError ? (
            <p className="text-sm text-muted-foreground">Could not load activity feed.</p>
          ) : activityLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : activity && activity.length > 0 ? (
            <div className="space-y-3">
              {activity.map((item) => {
                const Icon = activityIcon[item.type] || Activity;
                return (
                  <div key={item.id} className="flex items-start gap-3 rounded-md p-2 transition-colors hover:bg-secondary">
                    <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${statusColor[item.type]}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-card-foreground">{item.text}</p>
                      <p className="text-xs text-muted-foreground">{item.time}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No recent activity.</p>
          )}
        </div>

        {/* Quick Actions + Status */}
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
              <div className={`h-2 w-2 rounded-full ${status?.backend === "connected" ? "bg-success animate-pulse" : "bg-destructive"}`} />
              <span className="text-xs font-medium text-foreground">System Status</span>
            </div>
            {statusLoading ? (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            ) : status ? (
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>FastAPI Backend</span>
                  <span className={status.backend === "connected" ? "text-success" : "text-destructive"}>
                    {status.backend === "connected" ? "Connected" : "Disconnected"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>AI Engine</span>
                  <span className={status.ai_engine === "operational" ? "text-success" : status.ai_engine === "degraded" ? "text-warning" : "text-destructive"}>
                    {status.ai_engine.charAt(0).toUpperCase() + status.ai_engine.slice(1)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Queue</span>
                  <span className={status.queue_pending > 0 ? "text-warning" : "text-success"}>
                    {status.queue_pending} pending
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Unavailable</p>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Index;
