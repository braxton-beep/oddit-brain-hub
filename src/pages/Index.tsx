import { DashboardLayout } from "@/components/DashboardLayout";
import {
  useBrainStatus,
  useBrainHealth,
  useTools,
  useWorkflows,
  useAgents,
  useProjects,
  useStats,
  useRunWorkflow,
} from "@/hooks/useBrain";
import {
  Brain,
  Zap,
  Users,
  Play,
  Loader2,
  WifiOff,
  CheckCircle2,
  AlertCircle,
  Clock,
  Wrench,
  Bot,
  BarChart3,
  Activity,
} from "lucide-react";

const statusBadge: Record<string, string> = {
  active:      "bg-success/15 text-success border-success/30",
  running:     "bg-primary/15 text-primary border-primary/30",
  idle:        "bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30",
  paused:      "bg-warning/15 text-warning border-warning/30",
  completed:   "bg-success/15 text-success border-success/30",
  failed:      "bg-destructive/15 text-destructive border-destructive/30",
  "in-progress": "bg-primary/15 text-primary border-primary/30",
  "up-next":   "bg-warning/15 text-warning border-warning/30",
  planned:     "bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30",
};

const priorityDot: Record<string, string> = {
  high: "bg-destructive",
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
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadge[status] ?? statusBadge.idle}`}>
      {status}
    </span>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

const Index = () => {
  const { data: brainStatus, isError: statusError } = useBrainStatus();
  const { data: health } = useBrainHealth();
  const { data: tools, isLoading: toolsLoading } = useTools();
  const { data: workflows, isLoading: wfLoading } = useWorkflows();
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const { data: projects, isLoading: projLoading } = useProjects();
  const { data: stats, isLoading: statsLoading } = useStats();
  const runWorkflow = useRunWorkflow();

  const isConnected = !!health && health.status === "ok";

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            <span className="text-gradient">{brainStatus?.name ?? "Oddit Brain"}</span>
            {brainStatus?.version && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">v{brainStatus.version}</span>
            )}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${isConnected ? "bg-success animate-pulse" : "bg-destructive"}`} />
            {isConnected ? "Backend connected" : "Backend unreachable"}
            {brainStatus && <span>• {brainStatus.connected_tools} tools connected</span>}
          </p>
        </div>
      </div>

      {statusError && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>Cannot reach backend. Set <code className="rounded bg-secondary px-1 font-mono text-xs">VITE_API_URL</code> or start your FastAPI server.</span>
        </div>
      )}

      {/* Stats Overview */}
      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        {statsLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : stats ? (
          <>
            <div className="glow-card rounded-lg bg-card p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Tools Connected</p>
                <Wrench className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="mt-3 text-2xl font-bold text-card-foreground">{stats.tools_connected}</p>
            </div>
            <div className="glow-card rounded-lg bg-card p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Workflows Active</p>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="mt-3 text-2xl font-bold text-card-foreground">{stats.workflows_active}</p>
            </div>
            <div className="glow-card rounded-lg bg-card p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Executions Today</p>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="mt-3 text-2xl font-bold text-card-foreground">{stats.executions_today}</p>
            </div>
          </>
        ) : null}
      </div>

      {/* Projects */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" /> Projects
        </h2>
        {projLoading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
          </div>
        ) : projects && projects.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {projects.map((p) => (
              <div key={p.id} className="glow-card rounded-lg bg-card p-5">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${priorityDot[p.priority] ?? "bg-muted-foreground"}`} />
                    <h3 className="text-sm font-semibold text-foreground">{p.name}</h3>
                  </div>
                  <Badge status={p.status} />
                </div>
                <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{p.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{p.owner}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 rounded-full bg-secondary overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${p.progress}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground">{p.progress}%</span>
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
        {/* Connected Tools */}
        <div className="glow-card rounded-lg bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Wrench className="h-4 w-4 text-primary" /> Tools
          </h2>
          {toolsLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : tools ? (
            <div className="space-y-1.5">
              {tools.available.map((t) => {
                const connected = tools.connected.includes(t.name);
                return (
                  <div key={t.name} className={`flex items-center gap-3 rounded-md p-2 text-sm ${connected ? "bg-secondary" : "opacity-50"}`}>
                    <span className="text-lg">{t.emoji}</span>
                    <span className={connected ? "text-foreground" : "text-muted-foreground"}>{t.display}</span>
                    {connected && <CheckCircle2 className="ml-auto h-3 w-3 text-success" />}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        {/* Workflows */}
        <div className="glow-card rounded-lg bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" /> Workflows
          </h2>
          {wfLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : workflows && workflows.length > 0 ? (
            <div className="space-y-2">
              {workflows.map((wf) => (
                <div key={wf.id} className="rounded-md border border-border bg-secondary p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-foreground">{wf.name}</span>
                    <button
                      onClick={() => runWorkflow.mutate(wf.id)}
                      disabled={runWorkflow.isPending}
                      className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {runWorkflow.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                      Run
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">{wf.description}</p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{wf.steps} steps</span>
                    <span>•</span>
                    <Badge status={wf.status} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No workflows.</p>
          )}
        </div>

        {/* AI Agents */}
        <div className="glow-card rounded-lg bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" /> AI Agents
          </h2>
          {agentsLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
          ) : agents && agents.length > 0 ? (
            <div className="space-y-2">
              {agents.map((a, i) => (
                <div key={i} className="rounded-md border border-border bg-secondary p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Brain className="h-3.5 w-3.5 text-primary" />
                    <span className="text-sm font-medium text-foreground">{a.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{a.type}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{a.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {a.capabilities.map((cap) => (
                      <span key={cap} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No agents.</p>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      {stats?.recent_activity && stats.recent_activity.length > 0 && (
        <section className="mt-8 glow-card rounded-lg bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" /> Recent Activity
          </h2>
          <div className="space-y-2">
            {stats.recent_activity.map((act, i) => {
              const Icon = activityStatusIcon[act.status] ?? Activity;
              return (
                <div key={i} className="flex items-center gap-3 rounded-md p-2 hover:bg-secondary transition-colors">
                  <Icon className={`h-4 w-4 shrink-0 ${act.status === "completed" ? "text-success" : act.status === "failed" ? "text-destructive" : "text-primary"}`} />
                  <span className="text-sm text-card-foreground flex-1">{act.workflow}</span>
                  <span className="text-xs text-muted-foreground">{act.timestamp}</span>
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
