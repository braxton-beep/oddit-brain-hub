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
  ArrowUpRight,
} from "lucide-react";

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

function StatCard({ label, value, icon: Icon }: { label: string; value: number | string; icon: typeof Wrench }) {
  return (
    <div className="glow-card rounded-xl bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="text-3xl font-bold text-cream">{value}</p>
      <p className="mt-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
    </div>
  );
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
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <Brain className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-cream">
              {brainStatus?.name ?? "Oddit Brain"}
              {brainStatus?.version && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">v{brainStatus.version}</span>
              )}
            </h1>
            <p className="text-[13px] text-muted-foreground flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${isConnected ? "bg-accent animate-pulse" : "bg-destructive"}`} />
              {isConnected ? "Connected" : "Unreachable"}
              {brainStatus && <span>• {brainStatus.connected_tools} tools</span>}
            </p>
          </div>
        </div>
      </div>

      {statusError && (
        <div className="mb-8 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-foreground">
          <WifiOff className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="font-medium">Backend unreachable</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Set <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-accent">VITE_API_URL</code> or start your FastAPI server.
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3 mb-10">
        {statsLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)
        ) : stats ? (
          <>
            <StatCard label="Tools Connected" value={stats.tools_connected} icon={Wrench} />
            <StatCard label="Workflows Active" value={stats.workflows_active} icon={Zap} />
            <StatCard label="Executions Today" value={stats.executions_today} icon={BarChart3} />
          </>
        ) : null}
      </div>

      {/* Projects */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-5">
          <Users className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Projects</h2>
        </div>
        {projLoading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
          </div>
        ) : projects && projects.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {projects.map((p) => (
              <div key={p.id} className="glow-card rounded-xl bg-card p-5">
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
            <Wrench className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Tools</h2>
          </div>
          {toolsLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
          ) : tools ? (
            <div className="space-y-1.5">
              {tools.available.map((t) => {
                const connected = tools.connected.includes(t.name);
                return (
                  <div key={t.name} className={`flex items-center gap-3 rounded-lg p-2.5 text-sm transition-colors ${connected ? "bg-secondary" : "opacity-40"}`}>
                    <span className="text-base">{t.emoji}</span>
                    <span className={connected ? "text-cream font-medium" : "text-muted-foreground"}>{t.display}</span>
                    {connected && <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-accent" />}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        {/* Workflows */}
        <div className="glow-card rounded-xl bg-card p-5">
          <div className="flex items-center gap-2 mb-5">
            <Zap className="h-4 w-4 text-accent" />
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
                      onClick={() => runWorkflow.mutate(wf.id)}
                      disabled={runWorkflow.isPending}
                      className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {runWorkflow.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                      Run
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

        {/* AI Agents */}
        <div className="glow-card rounded-xl bg-card p-5">
          <div className="flex items-center gap-2 mb-5">
            <Bot className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-bold text-cream uppercase tracking-wider">AI Agents</h2>
          </div>
          {agentsLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
          ) : agents && agents.length > 0 ? (
            <div className="space-y-2.5">
              {agents.map((a, i) => (
                <div key={i} className="rounded-lg border border-border bg-secondary p-3.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15">
                      <Brain className="h-3 w-3 text-primary" />
                    </div>
                    <span className="text-sm font-bold text-cream">{a.name}</span>
                    <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{a.type}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2.5">{a.description}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {a.capabilities.map((cap) => (
                      <span key={cap} className="rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">
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
        <section className="mt-10 glow-card rounded-xl bg-card p-5">
          <div className="flex items-center gap-2 mb-5">
            <Clock className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Recent Activity</h2>
          </div>
          <div className="space-y-1.5">
            {stats.recent_activity.map((act, i) => {
              const Icon = activityStatusIcon[act.status] ?? Activity;
              return (
                <div key={i} className="flex items-center gap-3 rounded-lg p-3 hover:bg-secondary transition-colors">
                  <Icon className={`h-4 w-4 shrink-0 ${act.status === "completed" ? "text-accent" : act.status === "failed" ? "text-destructive" : "text-primary"}`} />
                  <span className="text-sm text-cream flex-1 font-medium">{act.workflow}</span>
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
