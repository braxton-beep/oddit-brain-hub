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
  Play,
  RotateCcw,
  Bell,
  BellOff,
  ScrollText,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

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

// ── Audit trail entry ────────────────────────────────────────────────────────
interface AuditTrailEntry {
  id: string;
  timestamp: string;
  action: string;
  detail: string;
  runId?: string;
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
function RunCard({ run, onRetryStep, onAddAuditEntry }: { run: SetupRun; onRetryStep: (runId: string, stepName: string) => void; onAddAuditEntry: (entry: Omit<AuditTrailEntry, "id">) => void }) {
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
                    {/* Retry button for failed steps */}
                    {step.status === "error" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRetryStep(run.id, step.name);
                          onAddAuditEntry({
                            timestamp: new Date().toISOString(),
                            action: "Retry Step",
                            detail: `Retried "${step.name}" for ${run.client_name}`,
                            runId: run.id,
                          });
                        }}
                        className="flex items-center gap-1 rounded-md bg-destructive/10 border border-destructive/20 px-2 py-0.5 text-[10px] font-bold text-destructive hover:bg-destructive/20 transition-colors"
                      >
                        <RotateCcw className="h-2.5 w-2.5" />
                        Retry
                      </button>
                    )}
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

// ── Workflow pipeline ─────────────────────────────────────────────────────────
const WORKFLOW_STEPS: Array<{
  number: number;
  label: string;
  description: string;
  mode: "manual" | "automated";
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { number: 1, label: "Card moved to Ready For Setup", description: "Someone moves the Asana card into the Ready For Setup column — this is the trigger.", mode: "manual", icon: ArrowRight },
  { number: 2, label: "Screenshots captured", description: "Desktop (1440px) and mobile (390px) screenshots taken of the website URL and focus URL on the card.", mode: "automated", icon: Camera },
  { number: 3, label: "Figma template duplicated & injected", description: "The template file is duplicated for the client, screenshots injected into the correct frames.", mode: "automated", icon: Figma },
  { number: 4, label: "Figma links posted to Asana card", description: "The new Figma file URL and (if applicable) Figma Slides URL are written back into the card description.", mode: "automated", icon: Link2 },
  { number: 5, label: "Card moved to Setup Complete", description: "The card is automatically moved to the Setup Complete column — ready for the next person.", mode: "automated", icon: MoveRight },
];

function WorkflowPipeline() {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Workflow Pipeline</p>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-muted-foreground/40 inline-block" />
            Manual trigger
          </span>
          <span className="flex items-center gap-1.5 text-primary">
            <span className="h-2 w-2 rounded-full bg-primary inline-block" />
            Automated
          </span>
        </div>
      </div>

      <div className="px-5 py-4">
        {WORKFLOW_STEPS.map((step, i) => {
          const isLast = i === WORKFLOW_STEPS.length - 1;
          const Icon = step.icon;
          const isManual = step.mode === "manual";

          return (
            <div key={step.number} className="flex gap-4">
              <div className="flex flex-col items-center shrink-0">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold border-2 transition-colors ${
                    isManual
                      ? "border-muted-foreground/30 text-muted-foreground bg-muted/30"
                      : "border-primary/50 text-primary bg-primary/10"
                  }`}
                >
                  {step.number}
                </div>
                {!isLast && (
                  <div
                    className={`w-px flex-1 mt-1 ${isManual ? "bg-muted-foreground/15" : "bg-primary/20"}`}
                    style={{ minHeight: 24 }}
                  />
                )}
              </div>
              <div className={`pb-5 flex-1 min-w-0 ${isLast ? "pb-1" : ""}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium text-foreground">{step.label}</span>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      isManual ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
                    }`}
                  >
                    {isManual ? "Manual" : "Automated"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 pl-5 leading-relaxed">{step.description}</p>
              </div>
            </div>
          );
        })}
      </div>
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

// ── Manual run form ───────────────────────────────────────────────────────────
function ManualRunForm() {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [submitted, setSubmitted] = useState<{ tier: string; pages: number; client: string; urlCount: number } | null>(null);
  const [form, setForm] = useState({
    client_name: "",
    shop_url: "",
    tier: "pro" as "pro" | "essential",
    pages: 5,
  });
  const [focusUrls, setFocusUrls] = useState<string[]>([""]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: key === "pages" ? Number(e.target.value) : e.target.value }));

  // Keep focusUrls array in sync with page count
  const pageCount = form.tier === "pro" ? form.pages : 1 + focusUrls.length - 1;
  const requiredUrlCount = form.tier === "pro" ? form.pages : focusUrls.length;

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.client_name || !form.shop_url) return;
    const trimmedUrls = focusUrls.map((u) => u.trim()).filter(Boolean);
    if (trimmedUrls.length === 0) {
      toast.error("At least one focus URL is required");
      return;
    }
    setRunning(true);
    setSubmitted(null);
    try {
      const { data, error } = await supabase.functions.invoke("run-report-setup", {
        body: {
          client_name: form.client_name.trim(),
          shop_url: form.shop_url.trim(),
          focus_urls: trimmedUrls,
          tier: form.tier,
          pages: form.tier === "pro" ? form.pages : trimmedUrls.length,
        },
      });
      if (error) throw error;
      setSubmitted({
        tier: form.tier,
        pages: form.tier === "pro" ? form.pages : trimmedUrls.length,
        client: form.client_name,
        urlCount: trimmedUrls.length,
      });
      toast.success(`Pipeline started for ${form.client_name}`);
      setForm({ client_name: "", shop_url: "", tier: "pro", pages: 5 });
      setFocusUrls([""]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start pipeline");
    } finally {
      setRunning(false);
    }
  };

  const inputClass = "w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/50 text-sm focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition";

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => { setOpen((o) => !o); setSubmitted(null); }}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/20 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Play className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Manual Test Run</span>
          <span className="text-xs text-muted-foreground">— trigger the full pipeline without a Stripe order</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && !submitted && (
        <form onSubmit={handleRun} className="border-t border-border px-5 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Client name *</label>
              <input type="text" value={form.client_name} onChange={set("client_name")} placeholder="Test Brand" required className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Tier</label>
              <select value={form.tier} onChange={set("tier")} className={inputClass}>
                <option value="pro">Pro</option>
                <option value="essential">Essential</option>
              </select>
            </div>
            <div className={form.tier === "essential" ? "sm:col-span-2" : ""}>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Shop URL *</label>
              <input type="url" value={form.shop_url} onChange={set("shop_url")} placeholder="https://yourstore.com" required className={inputClass} />
            </div>
            {form.tier === "pro" && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Pages to audit <span className="text-muted-foreground/50">(1–10)</span></label>
                <select
                  value={form.pages}
                  onChange={(e) => {
                    const newPages = Number(e.target.value);
                    setForm((f) => ({ ...f, pages: newPages }));
                    setFocusUrls((prev) => {
                      if (prev.length < newPages) return [...prev, ...Array(newPages - prev.length).fill("")];
                      return prev.slice(0, newPages);
                    });
                  }}
                  className={inputClass}
                >
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n} {n === 1 ? "page" : "pages"}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Focus URLs — one per page */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-foreground">
              Focus URLs <span className="text-destructive">*</span>
              <span className="text-muted-foreground font-normal ml-1">— one URL per page to audit</span>
            </label>
            {focusUrls.map((url, i) => (
              <div key={i} className="flex gap-2 items-center">
                <span className="text-[10px] font-bold text-muted-foreground w-5 text-right shrink-0">{i + 1}.</span>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setFocusUrls((prev) => prev.map((u, j) => j === i ? e.target.value : u))}
                  placeholder={i === 0 ? "https://yourstore.com" : `https://yourstore.com/page-${i + 1}`}
                  required
                  className={inputClass + " flex-1"}
                />
                {form.tier === "essential" && focusUrls.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setFocusUrls((prev) => prev.filter((_, j) => j !== i))}
                    className="px-2 text-muted-foreground hover:text-destructive transition-colors text-sm"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {form.tier === "essential" && (
              <button
                type="button"
                onClick={() => setFocusUrls((prev) => [...prev, ""])}
                className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
              >
                + Add another page
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={running || !form.client_name || !form.shop_url || focusUrls.every((u) => !u.trim())} size="sm" className="gap-2">
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              {running ? "Running…" : "Run Pipeline"}
            </Button>
            <p className="text-xs text-muted-foreground">Creates a real Asana card + captures screenshots + applies tags</p>
          </div>
        </form>
      )}

      {open && submitted && (
        <div className="border-t border-border px-5 py-6 text-center space-y-3">
          <CheckCircle2 className="h-8 w-8 text-green-400 mx-auto" />
          <div>
            <p className="text-sm font-semibold text-foreground">Thank you — report submitted!</p>
            <p className="text-xs text-muted-foreground mt-1">
              <strong className="text-foreground capitalize">{submitted.tier}</strong> tier
              {submitted.tier === "pro" && <> · <strong className="text-foreground">{submitted.pages} {submitted.pages === 1 ? "page" : "pages"}</strong></>}
              {submitted.urlCount > 1 && <> · <strong className="text-foreground">{submitted.urlCount} URLs</strong></>}
              {" "}· Client: <strong className="text-foreground">{submitted.client}</strong>
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setSubmitted(null)} className="mt-2">
            Run another
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Audit Trail ───────────────────────────────────────────────────────────────
function AuditTrail({ entries }: { entries: AuditTrailEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center gap-2">
        <ScrollText className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Audit Trail</p>
        <span className="text-[10px] text-muted-foreground ml-auto">{entries.length} events</span>
      </div>
      <div className="max-h-64 overflow-y-auto divide-y divide-border">
        {entries.map((entry) => (
          <div key={entry.id} className="px-5 py-3 flex items-start gap-3">
            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-foreground">{entry.action}</span>
                <span className="text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">{entry.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ReportSetup() {
  const [runs, setRuns] = useState<SetupRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [filter, setFilter] = useState<"all" | RunStatus>("all");
  const [slackOnFailure, setSlackOnFailure] = useState(() => {
    try { return JSON.parse(localStorage.getItem("reportSetup_slackOnFailure") ?? "false"); } catch { return false; }
  });
  const [slackChannel, setSlackChannel] = useState(() => localStorage.getItem("reportSetup_slackChannel") ?? "#alerts");
  const [auditTrail, setAuditTrail] = useState<AuditTrailEntry[]>([]);

  const addAuditEntry = (entry: Omit<AuditTrailEntry, "id">) => {
    setAuditTrail((prev) => [{ ...entry, id: crypto.randomUUID() }, ...prev]);
  };

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
    addAuditEntry({ timestamp: new Date().toISOString(), action: "Page Loaded", detail: "Setup Monitor opened" });

    const interval = setInterval(loadRuns, 5000);

    const channel = supabase
      .channel("setup_runs_feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "setup_runs" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setRuns((prev) => [payload.new as unknown as SetupRun, ...prev]);
            addAuditEntry({
              timestamp: new Date().toISOString(),
              action: "Run Created",
              detail: `New run for ${(payload.new as any).client_name ?? "unknown"}`,
              runId: (payload.new as any).id,
            });
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as unknown as SetupRun;
            setRuns((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
            if (updated.status === "error") {
              addAuditEntry({
                timestamp: new Date().toISOString(),
                action: "Run Failed",
                detail: `${updated.client_name} — ${updated.error || "Unknown error"}`,
                runId: updated.id,
              });
            } else if (updated.status === "done") {
              addAuditEntry({
                timestamp: new Date().toISOString(),
                action: "Run Completed",
                detail: `${updated.client_name} finished successfully`,
                runId: updated.id,
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  // Persist slack settings
  useEffect(() => {
    localStorage.setItem("reportSetup_slackOnFailure", JSON.stringify(slackOnFailure));
  }, [slackOnFailure]);
  useEffect(() => {
    localStorage.setItem("reportSetup_slackChannel", slackChannel);
  }, [slackChannel]);

  async function handlePollNow() {
    setPolling(true);
    addAuditEntry({ timestamp: new Date().toISOString(), action: "Poll Triggered", detail: "Manual poll for new Asana cards" });
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

  async function handleRetryStep(runId: string, stepName: string) {
    toast.info(`Retrying "${stepName}"…`);
    try {
      const { error } = await supabase.functions.invoke("run-report-setup", {
        body: { retry_run_id: runId, retry_step: stepName },
      });
      if (error) throw error;
      toast.success(`Retry triggered for "${stepName}"`);
    } catch (e: unknown) {
      toast.error(`Retry failed: ${e instanceof Error ? e.message : "Unknown error"}`);
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
              <Badge variant="outline" className="text-[10px] px-2 py-0.5 text-muted-foreground border-dashed">
                Internal testing only — remove once live pipeline is confirmed
              </Badge>
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

          <Button onClick={handlePollNow} disabled={polling} className="shrink-0 gap-2">
            {polling ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
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

        {/* Slack Notification on Failure Toggle */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {slackOnFailure ? (
                <Bell className="h-4 w-4 text-primary" />
              ) : (
                <BellOff className="h-4 w-4 text-muted-foreground" />
              )}
              <div>
                <p className="text-sm font-semibold text-foreground">Slack Notification on Failure</p>
                <p className="text-xs text-muted-foreground">Get alerted in Slack when a pipeline step fails</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {slackOnFailure && (
                <input
                  type="text"
                  value={slackChannel}
                  onChange={(e) => setSlackChannel(e.target.value)}
                  placeholder="#channel"
                  className="w-32 px-2.5 py-1.5 rounded-lg border border-border bg-secondary text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              )}
              <button
                onClick={() => setSlackOnFailure((v: boolean) => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors ${
                  slackOnFailure ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg transition-transform ${
                    slackOnFailure ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Manual test run */}
        <ManualRunForm />

        {/* Workflow pipeline */}
        <WorkflowPipeline />

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
            filteredRuns.map((run) => (
              <RunCard
                key={run.id}
                run={run}
                onRetryStep={handleRetryStep}
                onAddAuditEntry={addAuditEntry}
              />
            ))
          )}
        </div>

        {/* Audit Trail */}
        <AuditTrail entries={auditTrail} />
      </div>
    </DashboardLayout>
  );
}
