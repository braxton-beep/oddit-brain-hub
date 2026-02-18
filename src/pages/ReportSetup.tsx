import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
  SkipForward,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Zap,
  ClipboardList,
  Figma,
  Link2,
  ArrowRight,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ── Types ────────────────────────────────────────────────────────────────────
type Tier = "pro" | "essential";
type StepStatus = "idle" | "running" | "done" | "error" | "skipped";

interface StepResult {
  step: number;
  name: string;
  status: StepStatus;
  detail?: string;
  error?: string;
}

interface RunResult {
  success: boolean;
  task_gid?: string;
  asana_url?: string;
  figma_file_link?: string | null;
  figma_slides_link?: string | null;
  steps: StepResult[];
  error?: string;
}

interface RunRecord {
  id: string;
  client_name: string;
  tier: Tier;
  timestamp: Date;
  result: RunResult;
}

// ── Step metadata ─────────────────────────────────────────────────────────────
const STEP_ICONS: Record<number, React.ComponentType<{ className?: string }>> = {
  1: ClipboardList,
  2: ArrowRight,
  3: Figma,
  4: Link2,
  5: Figma,
  6: Link2,
  7: CheckCircle2,
};

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: StepStatus }) {
  if (status === "idle") return <div className="h-5 w-5 rounded-full border-2 border-border" />;
  if (status === "running")
    return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
  if (status === "done")
    return <CheckCircle2 className="h-5 w-5 text-green-400" />;
  if (status === "error")
    return <XCircle className="h-5 w-5 text-destructive" />;
  if (status === "skipped")
    return <SkipForward className="h-5 w-5 text-muted-foreground" />;
  return null;
}

// ── Step row ──────────────────────────────────────────────────────────────────
function StepRow({ step, index, isActive }: { step: StepResult; index: number; isActive: boolean }) {
  const Icon = STEP_ICONS[step.step] ?? ClipboardList;
  const isLast = step.step === 7;

  return (
    <div className="flex gap-3">
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <StatusBadge status={step.status} />
        {!isLast && (
          <div
            className={`w-px flex-1 mt-1 transition-colors duration-500 ${
              step.status === "done" || step.status === "skipped"
                ? "bg-green-400/40"
                : "bg-border"
            }`}
            style={{ minHeight: "24px" }}
          />
        )}
      </div>

      {/* Content */}
      <div className={`pb-4 flex-1 min-w-0 ${isLast ? "" : ""}`}>
        <div className="flex items-center gap-2 mb-0.5">
          <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span
            className={`text-sm font-medium transition-colors ${
              step.status === "done"
                ? "text-foreground"
                : step.status === "running"
                ? "text-primary"
                : step.status === "error"
                ? "text-destructive"
                : "text-muted-foreground"
            }`}
          >
            {step.name}
          </span>
          {step.status === "running" && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-primary animate-pulse">
              Running…
            </span>
          )}
        </div>
        {step.detail && (
          <p className="text-xs text-muted-foreground pl-5 leading-relaxed break-all">{step.detail}</p>
        )}
        {step.error && (
          <p className="text-xs text-destructive pl-5 leading-relaxed break-all">{step.error}</p>
        )}
      </div>
    </div>
  );
}

// ── History entry ─────────────────────────────────────────────────────────────
function HistoryEntry({ record }: { record: RunRecord }) {
  const [expanded, setExpanded] = useState(false);
  const allOk = record.result.steps.every((s) => s.status === "done" || s.status === "skipped");
  const hasError = record.result.steps.some((s) => s.status === "error");

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          {hasError ? (
            <XCircle className="h-4 w-4 text-destructive shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
          )}
          <div className="text-left min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {record.client_name}{" "}
              <span className="text-xs text-muted-foreground font-normal">
                ({record.tier === "pro" ? "Pro" : "Essential"})
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              {record.timestamp.toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-3">
          {record.result.asana_url && (
            <a
              href={record.result.asana_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Asana <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-4">
          {record.result.steps.map((step, i) => (
            <StepRow key={step.step} step={step} index={i} isActive={false} />
          ))}
          {(record.result.figma_file_link || record.result.figma_slides_link) && (
            <div className="mt-2 pt-3 border-t border-border flex gap-4">
              {record.result.figma_file_link && (
                <a href={record.result.figma_file_link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                  <Figma className="h-3 w-3" /> Figma File
                </a>
              )}
              {record.result.figma_slides_link && (
                <a href={record.result.figma_slides_link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                  <Figma className="h-3 w-3" /> Figma Slides
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ReportSetup() {
  const [clientName, setClientName] = useState("");
  const [shopUrl, setShopUrl] = useState("");
  const [tier, setTier] = useState<Tier>("pro");
  const [figmaTemplateKey, setFigmaTemplateKey] = useState("");
  const [figmaSlidesKey, setFigmaSlidesKey] = useState("");
  const [existingTaskGid, setExistingTaskGid] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [running, setRunning] = useState(false);
  const [liveSteps, setLiveSteps] = useState<StepResult[]>([]);
  const [liveResult, setLiveResult] = useState<RunResult | null>(null);
  const [history, setHistory] = useState<RunRecord[]>([]);

  const STEP_NAMES = [
    "Create Asana Card",
    "Move to Ready for Setup",
    "Figma File Setup",
    "Link Figma File to Asana",
    "Create Figma Slides Report",
    "Link Figma Slides to Asana",
    "Move to Setup Complete",
  ];

  async function handleRun() {
    if (!clientName.trim() || !shopUrl.trim()) {
      toast.error("Client name and shop URL are required.");
      return;
    }

    setRunning(true);
    setLiveResult(null);

    // Pre-populate steps as idle so the timeline renders immediately
    setLiveSteps(
      STEP_NAMES.map((name, i) => ({ step: i + 1, name, status: "idle" as StepStatus }))
    );

    // Mark step 1 as running immediately for visual feedback
    setLiveSteps((prev) =>
      prev.map((s) => (s.step === 1 ? { ...s, status: "running" } : s))
    );

    try {
      const { data, error } = await supabase.functions.invoke("run-report-setup", {
        body: {
          client_name: clientName.trim(),
          shop_url: shopUrl.trim().startsWith("http") ? shopUrl.trim() : `https://${shopUrl.trim()}`,
          tier,
          figma_template_key: figmaTemplateKey.trim() || undefined,
          figma_slides_template_key: figmaSlidesKey.trim() || undefined,
          existing_task_gid: existingTaskGid.trim() || undefined,
        },
      });

      if (error) throw error;

      const result: RunResult = data;

      // Animate steps in sequence
      for (let i = 0; i < result.steps.length; i++) {
        const step = result.steps[i];
        setLiveSteps((prev) =>
          prev.map((s) => (s.step === step.step ? { ...step } : s))
        );
        await new Promise((r) => setTimeout(r, 300));
      }

      setLiveResult(result);

      if (result.success) {
        toast.success(`Setup complete for ${clientName}!`);
        setHistory((prev) => [
          {
            id: crypto.randomUUID(),
            client_name: clientName.trim(),
            tier,
            timestamp: new Date(),
            result,
          },
          ...prev,
        ]);
      } else {
        toast.error(result.error ?? "Setup failed — check steps for details.");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Error: ${msg}`);
      setLiveSteps((prev) =>
        prev.map((s) => (s.status === "running" ? { ...s, status: "error", error: msg } : s))
      );
    } finally {
      setRunning(false);
    }
  }

  function handleReset() {
    setLiveSteps([]);
    setLiveResult(null);
  }

  const completedSteps = liveSteps.filter((s) => s.status === "done" || s.status === "skipped").length;
  const totalSteps = liveSteps.length;
  const hasSteps = liveSteps.length > 0;
  const asanaUrl = liveResult?.asana_url;

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Report Setup Automation</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Trigger the full report fulfillment workflow — Asana card creation, Figma file setup, and column management — in one click.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Trigger Form ─────────────────────────────────────────────────── */}
          <div className="space-y-5">
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Trigger Setup</h2>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="client-name" className="text-xs text-muted-foreground mb-1.5 block">Client Name *</Label>
                  <Input
                    id="client-name"
                    placeholder="e.g. Acme Store"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    disabled={running}
                  />
                </div>

                <div>
                  <Label htmlFor="shop-url" className="text-xs text-muted-foreground mb-1.5 block">Shop URL *</Label>
                  <Input
                    id="shop-url"
                    placeholder="acmestore.com"
                    value={shopUrl}
                    onChange={(e) => setShopUrl(e.target.value)}
                    disabled={running}
                  />
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Report Tier</Label>
                  <div className="flex gap-2">
                    {(["pro", "essential"] as Tier[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTier(t)}
                        disabled={running}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                          tier === t
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted/30 text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                        }`}
                      >
                        {t === "pro" ? "Pro" : "Essential"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Advanced */}
              <div>
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  Advanced options
                </button>

                {showAdvanced && (
                  <div className="mt-3 space-y-3 border-t border-border pt-3">
                    <div>
                      <Label htmlFor="figma-template" className="text-xs text-muted-foreground mb-1.5 block">
                        Figma Template File Key
                        <span className="text-[10px] ml-1 text-muted-foreground/60">(from URL: figma.com/file/KEY/...)</span>
                      </Label>
                      <Input
                        id="figma-template"
                        placeholder="abc123XYZ..."
                        value={figmaTemplateKey}
                        onChange={(e) => setFigmaTemplateKey(e.target.value)}
                        disabled={running}
                        className="font-mono text-xs"
                      />
                    </div>

                    <div>
                      <Label htmlFor="figma-slides" className="text-xs text-muted-foreground mb-1.5 block">
                        Figma Slides Template Key
                        <span className="text-[10px] ml-1 text-muted-foreground/60">(optional)</span>
                      </Label>
                      <Input
                        id="figma-slides"
                        placeholder="def456..."
                        value={figmaSlidesKey}
                        onChange={(e) => setFigmaSlidesKey(e.target.value)}
                        disabled={running}
                        className="font-mono text-xs"
                      />
                    </div>

                    <div>
                      <Label htmlFor="existing-task" className="text-xs text-muted-foreground mb-1.5 block">
                        Existing Asana Task GID
                        <span className="text-[10px] ml-1 text-muted-foreground/60">(update instead of create)</span>
                      </Label>
                      <Input
                        id="existing-task"
                        placeholder="1234567890..."
                        value={existingTaskGid}
                        onChange={(e) => setExistingTaskGid(e.target.value)}
                        disabled={running}
                        className="font-mono text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  onClick={handleRun}
                  disabled={running || !clientName.trim() || !shopUrl.trim()}
                  className="flex-1 gap-2"
                >
                  {running ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Running…
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Run Setup
                    </>
                  )}
                </Button>
                {hasSteps && !running && (
                  <Button variant="outline" onClick={handleReset} className="px-3">
                    Reset
                  </Button>
                )}
              </div>
            </div>

            {/* Info card */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Project Wired To</h3>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Board</span>
                  <a
                    href="https://app.asana.com/0/1203000364658371/board"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-1"
                  >
                    Oddit Fulfilment <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div className="flex items-center justify-between">
                  <span>Start column</span>
                  <span className="text-foreground font-medium">Client Figma Setup</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>End column</span>
                  <span className="text-foreground font-medium">Ready for Deck</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Live Progress ─────────────────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Workflow Progress</h2>
                {hasSteps && (
                  <span className="text-xs text-muted-foreground">
                    {completedSteps}/{totalSteps} steps
                  </span>
                )}
              </div>

              {!hasSteps ? (
                <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                  <Zap className="h-8 w-8 mb-3 opacity-20" />
                  <p className="text-sm">Fill in the form and click <strong className="text-foreground">Run Setup</strong> to start.</p>
                  <p className="text-xs mt-1 opacity-60">Each step will update in real time.</p>
                </div>
              ) : (
                <div className="space-y-0">
                  {liveSteps.map((step, i) => (
                    <StepRow
                      key={step.step}
                      step={step}
                      index={i}
                      isActive={step.status === "running"}
                    />
                  ))}
                </div>
              )}

              {/* Progress bar */}
              {hasSteps && totalSteps > 0 && (
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="w-full bg-muted/40 rounded-full h-1.5">
                    <div
                      className="bg-primary h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${(completedSteps / totalSteps) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Result links */}
              {liveResult && (
                <div className="mt-4 pt-4 border-t border-border space-y-2">
                  {asanaUrl && (
                    <a
                      href={asanaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      View task in Asana
                    </a>
                  )}
                  {liveResult.figma_file_link && (
                    <a
                      href={liveResult.figma_file_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <Figma className="h-3.5 w-3.5" />
                      Open Figma File
                    </a>
                  )}
                  {liveResult.figma_slides_link && (
                    <a
                      href={liveResult.figma_slides_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <Figma className="h-3.5 w-3.5" />
                      Open Figma Slides
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Run History ─────────────────────────────────────────────────────── */}
        {history.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Run History</h2>
              <span className="text-xs text-muted-foreground">({history.length} runs this session)</span>
            </div>
            <div className="space-y-2">
              {history.map((record) => (
                <HistoryEntry key={record.id} record={record} />
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
