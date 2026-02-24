import { DashboardLayout } from "@/components/DashboardLayout";
import {
  Code2,
  Figma,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  Eye,
  Layers,
  Smartphone,
  Monitor,
  Play,
  RotateCcw,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type StageStatus = "done" | "active" | "pending" | "error";

interface PipelineStage {
  name: string;
  status: StageStatus;
}

interface PipelineProject {
  id: string;
  client: string;
  page: string;
  stages: PipelineStage[];
  last_update: string;
  created_at: string;
}

const DEFAULT_STAGES: PipelineStage[] = [
  { name: "Figma Pull", status: "pending" },
  { name: "Section Split", status: "pending" },
  { name: "Code Gen", status: "pending" },
  { name: "QA", status: "pending" },
  { name: "Refinement", status: "pending" },
];

const stageIcon: Record<StageStatus, { icon: typeof CheckCircle2; color: string }> = {
  done: { icon: CheckCircle2, color: "text-accent" },
  active: { icon: RefreshCw, color: "text-primary" },
  pending: { icon: Clock, color: "text-muted-foreground" },
  error: { icon: AlertCircle, color: "text-destructive" },
};

// ─── DB helpers ─────────────────────────────────────────────────────────────

async function fetchProjects(): Promise<PipelineProject[]> {
  const { data, error } = await supabase
    .from("pipeline_projects")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    client: row.client ?? "",
    page: row.page ?? "",
    stages: (row.stages as unknown as PipelineStage[]) ?? DEFAULT_STAGES,
    last_update: row.last_update ?? "Just now",
    created_at: row.created_at,
  }));
}

async function createProject(payload: { client: string; page: string }) {
  const { error } = await supabase.from("pipeline_projects").insert({
    client: payload.client,
    page: payload.page,
    stages: DEFAULT_STAGES as unknown as import("@/integrations/supabase/types").Json,
    last_update: "Just now",
  });
  if (error) throw error;
}

async function updateProjectStages(id: string, stages: PipelineStage[]) {
  const { error } = await supabase
    .from("pipeline_projects")
    .update({
      stages: stages as unknown as import("@/integrations/supabase/types").Json,
      last_update: "Just now",
    })
    .eq("id", id);
  if (error) throw error;
}

async function deleteProject(id: string) {
  const { error } = await supabase.from("pipeline_projects").delete().eq("id", id);
  if (error) throw error;
}

// ─── Add-project modal ───────────────────────────────────────────────────────

function AddProjectModal({
  onClose,
  onSave,
  isSaving,
}: {
  onClose: () => void;
  onSave: (v: { client: string; page: string }) => void;
  isSaving: boolean;
}) {
  const [client, setClient] = useState("");
  const [page, setPage] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-card border border-border p-6 shadow-2xl animate-fade-in">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-cream">New Pipeline Project</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-cream transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
              Client Name
            </label>
            <input
              className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm text-cream placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              placeholder="e.g. Braxley Bands"
              value={client}
              onChange={(e) => setClient(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
              Page / Scope
            </label>
            <input
              className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm text-cream placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              placeholder="e.g. Homepage Redesign"
              value={page}
              onChange={(e) => setPage(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-cream transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave({ client: client.trim(), page: page.trim() })}
            disabled={!client.trim() || !page.trim() || isSaving}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isSaving ? "Adding…" : "Add to Pipeline"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

const DevPipeline = () => {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["pipeline_projects"],
    queryFn: fetchProjects,
  });

  const addMutation = useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline_projects"] });
      setShowAdd(false);
      toast.success("Project added to pipeline");
    },
    onError: () => toast.error("Failed to add project"),
  });

  const stageMutation = useMutation({
    mutationFn: ({ id, stages }: { id: string; stages: PipelineStage[] }) =>
      updateProjectStages(id, stages),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline_projects"] }),
    onError: () => toast.error("Failed to update stage"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline_projects"] });
      toast.success("Project removed");
    },
    onError: () => toast.error("Failed to remove project"),
  });

  // Derived stats
  const completed = projects.filter((p) => p.stages.every((s) => s.status === "done")).length;
  const inProgress = projects.filter((p) =>
    p.stages.some((s) => s.status === "active" || s.status === "error")
  ).length;
  const avgComplete =
    projects.length === 0
      ? 0
      : Math.round(
          (projects.reduce(
            (acc, p) => acc + p.stages.filter((s) => s.status === "done").length,
            0
          ) /
            (projects.length * 5)) *
            100
        );

  const pipelineStats = [
    { label: "In Pipeline", value: String(projects.length) },
    { label: "In Progress", value: String(inProgress) },
    { label: "Completed", value: String(completed) },
    { label: "Avg. Progress", value: `${avgComplete}%` },
  ];

  const advanceStage = (project: PipelineProject) => {
    const activeIdx = project.stages.findIndex((s) => s.status === "active");
    if (activeIdx === -1) return;
    const newStages = project.stages.map((s, i) => {
      if (i === activeIdx) return { ...s, status: "done" as StageStatus };
      if (i === activeIdx + 1) return { ...s, status: "active" as StageStatus };
      return s;
    });
    stageMutation.mutate({ id: project.id, stages: newStages });
    const activeStage = project.stages[activeIdx];
    toast.success(`${project.client}: "${activeStage.name}" completed`, {
      description: "Moving to next stage",
    });
  };

  const startProject = (project: PipelineProject) => {
    const newStages = project.stages.map((s, i) =>
      i === 0 ? { ...s, status: "active" as StageStatus } : s
    );
    stageMutation.mutate({ id: project.id, stages: newStages });
    toast.success(`${project.client}: Pipeline started`);
  };

  const retryStage = (project: PipelineProject) => {
    const errorIdx = project.stages.findIndex((s) => s.status === "error");
    if (errorIdx === -1) return;
    const newStages = project.stages.map((s, i) =>
      i === errorIdx ? { ...s, status: "active" as StageStatus } : s
    );
    stageMutation.mutate({ id: project.id, stages: newStages });
    toast.loading(`Retrying ${project.client}…`, { id: `retry-${project.id}` });
    setTimeout(() => {
      const retried = newStages.map((s, i) => {
        if (i === errorIdx) return { ...s, status: "done" as StageStatus };
        if (i === errorIdx + 1) return { ...s, status: "active" as StageStatus };
        return s;
      });
      stageMutation.mutate({ id: project.id, stages: retried });
      toast.success(`${project.client} retry successful!`, { id: `retry-${project.id}` });
    }, 2000);
  };

  const handlePreview = (client: string, device: string) => {
    toast.info(`Opening ${device} preview for ${client}`, {
      description: "Preview would open in a new tab",
    });
  };

  return (
    <DashboardLayout>
      {showAdd && (
        <AddProjectModal
          onClose={() => setShowAdd(false)}
          onSave={(v) => addMutation.mutate(v)}
          isSaving={addMutation.isPending}
        />
      )}

      <div className="mb-8 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary animate-glow-pulse">
              <Code2 className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gradient-cool">Dev Pipeline</h1>
              <p className="text-[13px] text-muted-foreground">
                Figma → Shopify Liquid code automation
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" /> Add Project
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4 mb-8 stagger-children">
        {pipelineStats.map((s, i) => {
          const glows = ["stat-glow-primary", "stat-glow-electric", "stat-glow-violet", "stat-glow-gold"];
          return (
            <div key={s.label} className={`glow-card gradient-border rounded-xl bg-card p-5 hover-scale ${glows[i % 4]}`}>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{s.label}</p>
              <p className="mt-2 text-2xl font-bold text-cream">{s.value}</p>
            </div>
          );
        })}
      </div>

      {/* Pipeline stages legend */}
      <div className="mb-6 flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span className="font-bold text-cream uppercase tracking-wider">Stages:</span>
        <span className="flex items-center gap-1">
          <Figma className="h-3 w-3" /> Figma Pull
        </span>
        <ArrowRight className="h-3 w-3" />
        <span className="flex items-center gap-1">
          <Layers className="h-3 w-3" /> Section Split
        </span>
        <ArrowRight className="h-3 w-3" />
        <span className="flex items-center gap-1">
          <Code2 className="h-3 w-3" /> Code Gen
        </span>
        <ArrowRight className="h-3 w-3" />
        <span className="flex items-center gap-1">
          <Eye className="h-3 w-3" /> QA
        </span>
        <ArrowRight className="h-3 w-3" />
        <span className="flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" /> Refinement
        </span>
      </div>

      {/* Projects */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
          Loading pipeline…
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-secondary mb-4">
            <Code2 className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold text-cream mb-1">No projects in the pipeline yet</p>
          <p className="text-xs text-muted-foreground mb-5">
            Add your first project to start tracking Figma → code builds
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" /> Add First Project
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map((p) => {
            const hasError = p.stages.some((s) => s.status === "error");
            const hasActive = p.stages.some((s) => s.status === "active");
            const allPending = p.stages.every((s) => s.status === "pending");
            const allDone = p.stages.every((s) => s.status === "done");

            return (
              <div key={p.id} className="glow-card rounded-xl bg-card p-6">
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <h3 className="text-sm font-bold text-cream">{p.client}</h3>
                    <p className="text-xs text-muted-foreground">{p.page}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-muted-foreground">{p.last_update}</span>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handlePreview(p.client, "Desktop")}
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary border border-border hover:border-primary/30 transition-colors"
                        title="Desktop preview"
                      >
                        <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => handlePreview(p.client, "Mobile")}
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary border border-border hover:border-primary/30 transition-colors"
                        title="Mobile preview"
                      >
                        <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(p.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary border border-border hover:border-destructive/30 transition-colors"
                        title="Remove project"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Pipeline visualization */}
                <div className="flex items-center gap-2">
                  {p.stages.map((stage, i) => {
                    const si = stageIcon[stage.status];
                    const Icon = si.icon;
                    return (
                      <div key={stage.name} className="flex items-center gap-2 flex-1">
                        <div
                          className={`flex items-center gap-2 flex-1 rounded-lg border p-3 ${
                            stage.status === "active"
                              ? "border-primary/30 bg-primary/5"
                              : stage.status === "done"
                              ? "border-accent/20 bg-accent/5"
                              : stage.status === "error"
                              ? "border-destructive/30 bg-destructive/5"
                              : "border-border bg-secondary"
                          }`}
                        >
                          <Icon
                            className={`h-3.5 w-3.5 shrink-0 ${si.color} ${
                              stage.status === "active" ? "animate-spin" : ""
                            }`}
                          />
                          <span
                            className={`text-[11px] font-semibold ${
                              stage.status === "done"
                                ? "text-accent"
                                : stage.status === "active"
                                ? "text-primary"
                                : stage.status === "error"
                                ? "text-destructive"
                                : "text-muted-foreground"
                            }`}
                          >
                            {stage.name}
                          </span>
                        </div>
                        {i < p.stages.length - 1 && (
                          <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 mt-4">
                  {allPending && (
                    <button
                      onClick={() => startProject(p)}
                      className="flex items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/20 px-3 py-1.5 text-[11px] font-bold text-primary hover:opacity-90 transition-opacity"
                    >
                      <Play className="h-3 w-3" /> Start Pipeline
                    </button>
                  )}
                  {hasError && (
                    <button
                      onClick={() => retryStage(p)}
                      className="flex items-center gap-1.5 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-1.5 text-[11px] font-bold text-destructive hover:opacity-90 transition-opacity"
                    >
                      <RotateCcw className="h-3 w-3" /> Retry Failed Stage
                    </button>
                  )}
                  {hasActive && !allDone && (
                    <button
                      onClick={() => advanceStage(p)}
                      className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[11px] font-bold text-accent-foreground hover:opacity-90 transition-opacity"
                    >
                      <Play className="h-3 w-3" /> Advance Stage
                    </button>
                  )}
                  {allDone && (
                    <span className="flex items-center gap-1.5 rounded-lg bg-accent/10 border border-accent/20 px-3 py-1.5 text-[11px] font-bold text-accent">
                      <CheckCircle2 className="h-3 w-3" /> Pipeline Complete
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
};

export default DevPipeline;
