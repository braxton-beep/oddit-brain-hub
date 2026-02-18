import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  SkipForward,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Figma,
  Link2,
  ArrowRight,
  Clock,
  RefreshCw,
  Activity,
  Camera,
  MoveRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ── Types ────────────────────────────────────────────────────────────────────
type StepStatus = "done" | "error" | "skipped";
type RunStatus = "pending" | "running" | "done" | "error";

interface StepResult {
  step: number;
  name: string;
  status: StepStatus;
  detail?: string;
  error?: string;
}

interface SetupRun {
  id: string;
  asana_task_gid: string;
  client_name: string;
  tier: string;
  shop_url: string | null;
  focus_url: string | null;
  status: RunStatus;
  steps: StepResult[] | null;
  figma_file_link: string | null;
  figma_slides_link: string | null;
  asana_url: string | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StepStatusIcon({ status }: { status: StepStatus }) {
  if (status === "done") return <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />;
  if (status === "error") return <XCircle className="h-4 w-4 text-destructive shrink-0" />;
  return <SkipForward className="h-4 w-4 text-muted-foreground shrink-0" />;
}

const STEP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "Screenshot & Figma Injection": Camera,
  "Link Figma File → Asana": Link2,
  "Create Figma Slides Report": Figma,
  "Link Figma Slides → Asana": Link2,
  "Move to Setup Complete": MoveRight,
};

function RunStatusBadge({ status }: { status: RunStatus }) {
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Processing
      </span>
    );
  }
  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Complete
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
        <XCircle className="h-3.5 w-3.5" />
        Error
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <Clock className="h-3.5 w-3.5" />
      Pending
    </span>
  );
}

// ── Individual run card ───────────────────────────────────────────────────────
function RunCard({ run }: { run: SetupRun }) {
  const [expanded, setExpanded] = useState(run.status === "running" || run.status === "error");
  const steps = run.steps ?? [];

  const elapsed = run.completed_at
    ? Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)
    : null;

  return (
    <div
      className={`rounded-xl border bg-card overflow-hidden transition-all ${
        run.status === "running"
          ? "border-primary/40 shadow-sm shadow-primary/10"
          : run.status === "error"
          ? "border-destructive/30"
          : "border-border"
      }`}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/20 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Running pulse dot */}
          {run.status === "running" && (
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
            </span>
          )}
          {run.status === "done" && <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />}
          {run.status === "error" && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
          {run.status === "pending" && <Clock className="h-4 w-4 text-muted-foreground shrink-0" />}

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground truncate">
                {run.client_name}
              </span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize shrink-0">
                {run.tier}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {run.shop_url || "—"}
              {elapsed !== null && (
                <span className="ml-2 text-muted-foreground/60">· {elapsed}s</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0 ml-4">
          <RunStatusBadge status={run.status} />
          {run.asana_url && (
            <a
              href={run.asana_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
            >
              Asana <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded steps */}
      {expanded && (
        <div className="border-t border-border px-5 py-4 space-y-3">
          {run.status === "running" && steps.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Starting pipeline…
            </div>
          )}

          {steps.map((step, i) => {
            const Icon = STEP_ICONS[step.name] ?? ArrowRight;
            const isLast = i === steps.length - 1;
            return (
              <div key={step.step} className="flex gap-3">
                {/* Timeline */}
                <div className="flex flex-col items-center shrink-0">
                  <StepStatusIcon status={step.status} />
                  {!isLast && (
                    <div
                      className={`w-px flex-1 mt-1 ${
                        step.status === "done" ? "bg-green-400/30" : "bg-border"
                      }`}
                      style={{ minHeight: 20 }}
                    />
                  )}
                </div>

                {/* Content */}
                <div className="pb-3 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span
                      className={`text-sm font-medium ${
                        step.status === "done"
                          ? "text-foreground"
                          : step.status === "error"
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }`}
                    >
                      {step.name}
                    </span>
                  </div>
                  {step.detail && (
                    <p className="text-xs text-muted-foreground pl-5 mt-0.5 break-all leading-relaxed">
                      {step.detail}
                    </p>
                  )}
                  {step.error && (
                    <p className="text-xs text-destructive pl-5 mt-0.5 break-all leading-relaxed">
                      {step.error}
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          {/* Output links */}
          {(run.figma_file_link || run.figma_slides_link) && (
            <div className="flex gap-4 pt-2 border-t border-border">
              {run.figma_file_link && (
                <a
                  href={run.figma_file_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <Figma className="h-3.5 w-3.5" />
                  Figma File
                </a>
              )}
              {run.figma_slides_link && (
                <a
                  href={run.figma_slides_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <Figma className="h-3.5 w-3.5" />
                  Figma Slides
                </a>
              )}
            </div>
          )}

          {run.error && !steps.some((s) => s.error) && (
            <p className="text-xs text-destructive">{run.error}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Activity className="h-10 w-10 text-muted-foreground/30 mb-4" />
      <p className="text-sm font-medium text-muted-foreground">No setup runs yet</p>
      <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs">
        When an Asana card enters the "Ready For Setup" column and you click <strong>Poll Now</strong>, it will appear here with live progress.
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ReportSetup() {
  const [runs, setRuns] = useState<SetupRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [filter, setFilter] = useState<"all" | RunStatus>("all");

  // Load existing runs
  async function loadRuns() {
    const { data, error } = await supabase
      .from("setup_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Failed to load runs:", error);
    } else {
      setRuns((data ?? []) as unknown as SetupRun[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadRuns();

    // Subscribe to realtime updates
    const channel = supabase
      .channel("setup_runs_feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "setup_runs" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setRuns((prev) => [payload.new as unknown as SetupRun, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setRuns((prev) =>
              prev.map((r) => (r.id === payload.new.id ? (payload.new as unknown as SetupRun) : r))
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function handlePollNow() {
    setPolling(true);
    try {
      const { data, error } = await supabase.functions.invoke("poll-asana-setups", {});
      if (error) throw error;

      if (data?.processed === 0) {
        toast.info(data?.message ?? "No new cards in Ready For Setup");
      } else {
        toast.success(`Started processing ${data?.processed} card${data?.processed === 1 ? "" : "s"}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Poll failed: ${msg}`);
    } finally {
      setPolling(false);
    }
  }

  const filteredRuns = filter === "all" ? runs : runs.filter((r) => r.status === filter);
  const runningCount = runs.filter((r) => r.status === "running").length;
  const errorCount = runs.filter((r) => r.status === "error").length;
  const doneCount = runs.filter((r) => r.status === "done").length;

  const filterLabels: Array<{ key: "all" | RunStatus; label: string }> = [
    { key: "all", label: `All (${runs.length})` },
    { key: "running", label: `Active (${runningCount})` },
    { key: "done", label: `Done (${doneCount})` },
    { key: "error", label: `Errors (${errorCount})` },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">Setup Monitor</h1>
              {runningCount > 0 && (
                <span className="relative flex h-2 w-2 ml-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
              )}
            </div>
            <p className="text-muted-foreground text-sm">
              Watches the <strong className="text-foreground">Oddit Setups</strong> Asana project for cards entering{" "}
              <strong className="text-foreground">Ready For Setup</strong> — automatically runs screenshots, Figma injection, and card updates.
            </p>
          </div>

          <Button
            onClick={handlePollNow}
            disabled={polling}
            className="shrink-0 gap-2"
          >
            {polling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {polling ? "Polling…" : "Poll Now"}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total Runs", value: runs.length, color: "text-foreground" },
            { label: "Completed", value: doneCount, color: "text-green-400" },
            { label: "Errors", value: errorCount, color: errorCount > 0 ? "text-destructive" : "text-muted-foreground" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className={`text-2xl font-bold mt-0.5 ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div className="rounded-xl border border-border bg-muted/20 px-5 py-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">How it works</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {[
              "Card moved to Ready For Setup",
              "Screenshots captured (desktop + mobile)",
              "Figma template duplicated & injected",
              "Links posted back to Asana card",
              "Card moved to Setup Complete",
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-foreground shrink-0">
                  {i + 1}
                </span>
                {step}
              </div>
            ))}
          </div>
        </div>

        {/* Filter tabs */}
        {runs.length > 0 && (
          <div className="flex gap-1 border-b border-border">
            {filterLabels.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px ${
                  filter === key
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Feed */}
        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredRuns.length === 0 ? (
            <EmptyState />
          ) : (
            filteredRuns.map((run) => <RunCard key={run.id} run={run} />)
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
