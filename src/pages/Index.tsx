import { DashboardLayout } from "@/components/DashboardLayout";
import {
  useProjects,
  useWorkflows,
  useActivityLog,
  useDashboardStats,
  useEmailDrafts,
  useUpdateEmailDraft,
  type EmailDraft,
} from "@/hooks/useDashboardData";
import { useIntegrationCredentials } from "@/hooks/useIntegrationCredentials";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import {
  Brain,
  Zap,
  Users,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  Wrench,
  Bot,
  BarChart3,
  Activity,
  ArrowUpRight,
  Mail,
  Copy,
  Check,
  X,
  CalendarDays,
  Trophy,
  Loader2,
  FileText,
} from "lucide-react";

import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { useState } from "react";

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

// ── Draft Review Modal ────────────────────────────────
function DraftModal({ draft, onClose, onDismiss }: { draft: EmailDraft; onClose: () => void; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(`Subject: ${draft.subject_line}\n\n${draft.draft_body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Draft copied to clipboard");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15">
              <Mail className="h-4 w-4 text-accent" />
            </div>
            <div>
              <p className="text-sm font-bold text-cream">{draft.client_name}</p>
              {draft.call_date && (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  <CalendarDays className="h-3 w-3" />
                  Call on {format(new Date(draft.call_date), "MMM d, yyyy")}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Subject line */}
        <div className="px-6 pt-4 pb-2">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Subject</p>
          <p className="text-sm font-semibold text-cream">{draft.subject_line}</p>
        </div>

        {/* Draft body */}
        <div className="px-6 pt-2 pb-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Draft</p>
          <div className="rounded-xl border border-border bg-secondary p-4 max-h-72 overflow-y-auto">
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{draft.draft_body}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 border-t border-border px-6 py-4">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-accent-foreground hover:opacity-90 transition-opacity"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied!" : "Review & Copy"}
          </button>
          <button
            onClick={onDismiss}
            className="flex items-center gap-2 rounded-xl border border-border bg-secondary px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Dismiss Draft
          </button>
        </div>
      </div>
    </div>
  );
}

const SCAN_RECS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-recommendations`;

function GreatestHits() {
  const [isScanning, setIsScanning] = useState(false);
  const qc = useQueryClient();
  const { data: insights, isLoading } = useQuery({
    queryKey: ["recommendation-insights"],
    queryFn: async () => {
      const { data } = await supabase
        .from("recommendation_insights")
        .select("*")
        .order("frequency_count", { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  const handleScan = async () => {
    setIsScanning(true);
    try {
      const resp = await fetch(SCAN_RECS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Scan failed");
      toast.success(`Found ${data.insights?.length || 0} recurring patterns`);
      qc.invalidateQueries({ queryKey: ["recommendation-insights"] });
    } catch (e: any) {
      toast.error("Scan failed", { description: e.message });
    } finally {
      setIsScanning(false);
    }
  };

  const categoryColors: Record<string, string> = {
    "Trust Signals": "text-accent border-accent/30 bg-accent/10",
    "Copy & Messaging": "text-gold border-gold/30 bg-gold/10",
    "Visual Hierarchy": "text-violet border-violet/30 bg-violet/10",
    "Social Proof": "text-primary border-primary/30 bg-primary/10",
    "CTA Optimization": "text-coral border-coral/30 bg-coral/10",
    "Mobile UX": "text-electric border-electric/30 bg-electric/10",
  };

  return (
    <section className="mt-10 glow-card glow-card-coral rounded-xl bg-card p-5">
      <div className="flex items-center gap-2 mb-5">
        <Trophy className="h-4 w-4 text-gold" />
        <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Greatest Hits</h2>
        <span className="text-[11px] text-muted-foreground ml-1">Top recurring recommendations</span>
        <button
          onClick={handleScan}
          disabled={isScanning}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-gold/10 border border-gold/30 px-3 py-1.5 text-xs font-bold text-gold hover:bg-gold/20 transition-colors disabled:opacity-50"
        >
          {isScanning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
          {isScanning ? "Scanning..." : "Scan Audits"}
        </button>
      </div>
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="animate-pulse h-12 rounded-lg bg-muted" />)}</div>
      ) : !insights || insights.length === 0 ? (
        <div className="text-center py-8">
          <Trophy className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-30" />
          <p className="text-xs text-muted-foreground">Click "Scan Audits" to discover recurring recommendation patterns.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(insights as any[]).map((insight, i) => {
            const catStyle = categoryColors[insight.category] || "text-muted-foreground border-border bg-muted/20";
            return (
              <div key={insight.id} className="flex items-center gap-3 rounded-xl border border-border bg-secondary px-4 py-3">
                <span className="text-lg font-black text-muted-foreground/30 w-6 shrink-0">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-cream truncate">{insight.recommendation_text}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] font-bold rounded-full border px-2 py-0.5 ${catStyle}`}>{insight.category}</span>
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <span className="flex items-center gap-1 rounded-full bg-gold/15 border border-gold/30 px-2.5 py-1 text-xs font-bold text-gold">
                    We've made this <span className="text-sm">{insight.frequency_count}x</span>
                  </span>
                  <button
                    onClick={() => toast.info("Build Template", { description: `Template builder for "${insight.recommendation_text.substring(0, 40)}..." coming soon.` })}
                    className="flex items-center gap-1 rounded-lg bg-primary/10 border border-primary/20 px-2.5 py-1.5 text-[10px] font-bold text-primary hover:bg-primary/20 transition-colors"
                  >
                    <FileText className="h-3 w-3" />
                    Build Template
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const Index = () => {

  const { data: projects, isLoading: projLoading } = useProjects();
  const { data: workflows, isLoading: wfLoading } = useWorkflows();
  const { data: activity, isLoading: actLoading } = useActivityLog();
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: credentials } = useIntegrationCredentials();
  const { data: pendingDrafts } = useEmailDrafts("pending");
  const updateDraft = useUpdateEmailDraft();
  const [selectedDraft, setSelectedDraft] = useState<EmailDraft | null>(null);

  const connectedIds = new Set((credentials ?? []).map((c) => c.integration_id));

  const handleDismissDraft = (id: string) => {
    updateDraft.mutate({ id, status: "dismissed" });
    setSelectedDraft(null);
    toast.success("Draft dismissed");
  };

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

      {/* Pending Drafts */}
      {pendingDrafts && pendingDrafts.length > 0 && (
        <section className="mt-10 glow-card glow-card-gold rounded-xl bg-card p-5">
          <div className="flex items-center gap-2 mb-5">
            <Mail className="h-4 w-4 text-gold" />
            <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Pending Drafts</h2>
            <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-gold/20 text-[10px] font-bold text-gold">
              {pendingDrafts.length}
            </span>
          </div>
          <div className="space-y-2.5">
            {pendingDrafts.map((draft) => (
              <div key={draft.id} className="flex items-center gap-4 rounded-xl border border-border bg-secondary px-4 py-3 hover:border-gold/40 transition-colors">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold/10">
                  <Mail className="h-4 w-4 text-gold" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-cream truncate">{draft.client_name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {draft.call_date && (
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {format(new Date(draft.call_date), "MMM d")}
                      </span>
                    )}
                    {draft.call_date && <span className="text-border text-[11px]">•</span>}
                    <span className="text-[11px] text-muted-foreground truncate">{draft.subject_line}</span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedDraft(draft)}
                  className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-accent-foreground hover:opacity-90 transition-opacity"
                >
                  Review & Copy
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Greatest Hits */}
      <GreatestHits />

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


      {/* Draft Modal */}
      {selectedDraft && (
        <DraftModal
          draft={selectedDraft}
          onClose={() => setSelectedDraft(null)}
          onDismiss={() => handleDismissDraft(selectedDraft.id)}
        />
      )}
    </DashboardLayout>
  );
};

export default Index;
