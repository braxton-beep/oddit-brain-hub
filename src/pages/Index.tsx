import { DashboardLayout } from "@/components/DashboardLayout";
import {
  useProjects,
  useWorkflows,
  useActivityLog,
  useDashboardStats,
} from "@/hooks/useDashboardData";
import { useIntegrationCredentials } from "@/hooks/useIntegrationCredentials";
import {
  Brain,
  Zap,
  Users,
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Wrench,
  Bot,
  BarChart3,
  Activity,
  ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

const statusBadge: Record<string, string> = {
  active:        "bg-accent/15 text-accent border-accent/30",
  running:       "bg-primary/15 text-primary border-primary/30",
  idle:          "bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30",
  paused:        "bg-warning/15 text-warning border-warning/30",
  completed:     "bg-accent/15 text-accent border-accent/30",
  failed:        "bg-destructive/15 text-destructive border-destructive/30",
  "in-progress": "bg-primary/15 text-primary border-primary/30",
  "up-next":     "bg-warning/15 text-warning border-warning/30",
  planned:       "bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30",
};

const priorityDot: Record<string, string> = {
  high: "bg-primary",
  medium: "bg-warning",
  low: "bg-muted-foreground",
};

const activityStatusIcon: Record<string, typeof CheckCircle2> = {
  completed: CheckCircle2,
  failed: AlertCircle,
  running: Activity,
};

function Badge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusBadge[status] ?? statusBadge.idle}`}>
      {status}
    </span>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted ${className}`} />;
}

function StatCard({ label, value, icon: Icon, color = "primary" }: { label: string; value: number | string; icon: typeof Wrench; color?: string }) {
  const colorMap: Record<string, { bg: string; text: string; glow: string }> = {
    primary: { bg: "bg-primary/10", text: "text-primary", glow: "glow-card" },
    coral: { bg: "bg-coral/10", text: "text-coral", glow: "glow-card glow-card-coral" },
    electric: { bg: "bg-electric/10", text: "text-electric", glow: "glow-card glow-card-electric" },
    gold: { bg: "bg-gold/10", text: "text-gold", glow: "glow-card glow-card-gold" },
  };
  const c = colorMap[color] || colorMap.primary;
  return (
    <div className={`${c.glow} rounded-xl bg-card p-6 hover-scale`}>
      <div className="flex items-center justify-between mb-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${c.bg}`}>
          <Icon className={`h-5 w-5 ${c.text}`} />
        </div>
        <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="text-3xl font-bold text-cream">{value}</p>
      <p className="mt-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
    </div>
  );
}

// Tool definitions for display (connected status comes from integration_credentials)
const toolDefs = [
  { id: "slack", display: "Slack", emoji: "💬" },
  { id: "google-drive", display: "Google Drive", emoji: "📁" },
  { id: "fireflies", display: "Fireflies.ai", emoji: "🔥" },
  { id: "notion", display: "Notion", emoji: "📝" },
  { id: "figma", display: "Figma", emoji: "🎨" },
  { id: "shopify", display: "Shopify", emoji: "🛒" },
  { id: "github", display: "GitHub", emoji: "🐙" },
  { id: "google-analytics", display: "Google Analytics", emoji: "📊" },
];

const Index = () => {
  const { data: projects, isLoading: projLoading } = useProjects();
  const { data: workflows, isLoading: wfLoading } = useWorkflows();
  const { data: activity, isLoading: actLoading } = useActivityLog();
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: credentials } = useIntegrationCredentials();

  const connectedIds = new Set((credentials ?? []).map((c) => c.integration_id));

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mb-10 animate-fade-in">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary animate-glow-pulse">
            <Brain className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-cream">Oddit Brain</h1>
            <p className="text-[13px] text-muted-foreground flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-accent animate-pulse" />
              Connected • {connectedIds.size} tools
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3 mb-10 stagger-children">
        {statsLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)
        ) : stats ? (
          <>
            <StatCard label="Tools Connected" value={connectedIds.size} icon={Wrench} color="electric" />
            <StatCard label="Workflows Active" value={stats.workflows_active} icon={Zap} color="coral" />
            <StatCard label="Executions Today" value={stats.executions_today} icon={BarChart3} color="gold" />
          </>
        ) : null}
      </div>

      {/* Projects */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-5">
          <Users className="h-4 w-4 text-coral" />
          <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Projects</h2>
        </div>
        {projLoading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
          </div>
        ) : projects && projects.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2 stagger-children">
            {projects.map((p) => (
              <div key={p.id} className="glow-card rounded-xl bg-card p-5 cursor-pointer hover-scale" onClick={() => toast.info(`Opening project: ${p.name}`, { description: p.description })}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`h-2.5 w-2.5 rounded-full ${priorityDot[p.priority] ?? "bg-muted-foreground"}`} />
                    <h3 className="text-sm font-bold text-cream">{p.name}</h3>
                  </div>
                  <Badge status={p.status} />
                </div>
                <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{p.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{p.owner}</span>
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 w-28 rounded-full bg-secondary overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${p.progress}%` }} />
                    </div>
                    <span className="text-xs font-bold text-cream">{p.progress}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No projects found.</p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Tools */}
        <div className="glow-card rounded-xl bg-card p-5">
          <div className="flex items-center gap-2 mb-5">
            <Wrench className="h-4 w-4 text-electric" />
            <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Tools</h2>
          </div>
          <div className="space-y-1.5">
            {toolDefs.map((t) => {
              const connected = connectedIds.has(t.id);
              return (
                <div key={t.id} className={`flex items-center gap-3 rounded-lg p-2.5 text-sm transition-colors cursor-pointer hover:bg-secondary ${connected ? "bg-secondary" : "opacity-40 hover:opacity-70"}`}
                  onClick={() => toast(connected ? `${t.display} is connected and syncing` : `${t.display} is not connected yet`, { description: connected ? "Receiving real-time data" : "Go to Integrations to connect" })}
                >
                  <span className="text-base">{t.emoji}</span>
                  <span className={connected ? "text-cream font-medium" : "text-muted-foreground"}>{t.display}</span>
                  {connected && <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-accent" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Workflows */}
        <div className="glow-card rounded-xl bg-card p-5">
          <div className="flex items-center gap-2 mb-5">
            <Zap className="h-4 w-4 text-gold" />
            <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Workflows</h2>
          </div>
          {wfLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
          ) : workflows && workflows.length > 0 ? (
            <div className="space-y-2.5">
              {workflows.map((wf) => (
                <div key={wf.id} className="rounded-lg border border-border bg-secondary p-3.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-bold text-cream">{wf.name}</span>
                    <button
                      onClick={() => toast.info(`Workflow "${wf.name}" — ${wf.steps} steps`, { description: wf.description })}
                      className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-accent-foreground hover:opacity-90 transition-opacity"
                    >
                      <Play className="h-3 w-3" />
                      View
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{wf.description}</p>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{wf.steps} steps</span>
                    <span className="text-border">•</span>
                    <Badge status={wf.status} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No workflows.</p>
          )}
        </div>

        {/* Quick Stats */}
        <div className="glow-card rounded-xl bg-card p-5">
          <div className="flex items-center gap-2 mb-5">
            <Bot className="h-4 w-4 text-violet" />
            <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Quick Info</h2>
          </div>
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-secondary p-3.5">
              <p className="text-xs text-muted-foreground mb-1">Total Projects</p>
              <p className="text-xl font-bold text-cream">{projects?.length ?? 0}</p>
            </div>
            <div className="rounded-lg border border-border bg-secondary p-3.5">
              <p className="text-xs text-muted-foreground mb-1">Active Workflows</p>
              <p className="text-xl font-bold text-cream">{workflows?.filter(w => w.status === 'active' || w.status === 'running').length ?? 0}</p>
            </div>
            <div className="rounded-lg border border-border bg-secondary p-3.5">
              <p className="text-xs text-muted-foreground mb-1">Integrations</p>
              <p className="text-xl font-bold text-cream">{connectedIds.size} / {toolDefs.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      {activity && activity.length > 0 && (
        <section className="mt-10 glow-card rounded-xl bg-card p-5">
          <div className="flex items-center gap-2 mb-5">
            <Clock className="h-4 w-4 text-coral" />
            <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Recent Activity</h2>
          </div>
          <div className="space-y-1.5">
            {activity.map((act) => {
              const Icon = activityStatusIcon[act.status] ?? Activity;
              const timeAgo = formatDistanceToNow(new Date(act.created_at), { addSuffix: true });
              return (
                <div key={act.id} className="flex items-center gap-3 rounded-lg p-3 hover:bg-secondary transition-colors cursor-pointer"
                  onClick={() => toast.info(act.workflow_name, { description: `Status: ${act.status} • ${timeAgo}` })}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${act.status === "completed" ? "text-accent" : act.status === "failed" ? "text-destructive" : "text-primary"}`} />
                  <span className="text-sm text-cream flex-1 font-medium">{act.workflow_name}</span>
                  <span className="text-xs text-muted-foreground">{timeAgo}</span>
                  <Badge status={act.status} />
                </div>
              );
            })}
          </div>
        </section>
      )}
    </DashboardLayout>
  );
};

export default Index;
