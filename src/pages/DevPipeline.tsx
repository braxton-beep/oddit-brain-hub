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
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type StageStatus = "done" | "active" | "pending" | "error";

interface PipelineProject {
  id: string;
  client: string;
  page: string;
  stages: { name: string; status: StageStatus }[];
  lastUpdate: string;
}

const initialPipeline: PipelineProject[] = [
  {
    id: "1", client: "Braxley Bands", page: "Homepage Redesign",
    stages: [
      { name: "Figma Pull", status: "done" }, { name: "Section Split", status: "done" },
      { name: "Code Gen", status: "done" }, { name: "QA", status: "active" }, { name: "Refinement", status: "pending" },
    ],
    lastUpdate: "5m ago",
  },
  {
    id: "2", client: "TechFlow", page: "Product Page",
    stages: [
      { name: "Figma Pull", status: "done" }, { name: "Section Split", status: "done" },
      { name: "Code Gen", status: "active" }, { name: "QA", status: "pending" }, { name: "Refinement", status: "pending" },
    ],
    lastUpdate: "22m ago",
  },
  {
    id: "3", client: "NovaPay", page: "Checkout Flow",
    stages: [
      { name: "Figma Pull", status: "done" }, { name: "Section Split", status: "active" },
      { name: "Code Gen", status: "pending" }, { name: "QA", status: "pending" }, { name: "Refinement", status: "pending" },
    ],
    lastUpdate: "1h ago",
  },
  {
    id: "4", client: "GreenLeaf Co", page: "Landing Page",
    stages: [
      { name: "Figma Pull", status: "error" }, { name: "Section Split", status: "pending" },
      { name: "Code Gen", status: "pending" }, { name: "QA", status: "pending" }, { name: "Refinement", status: "pending" },
    ],
    lastUpdate: "3h ago",
  },
];

const pipelineStats = [
  { label: "In Pipeline", value: "4" },
  { label: "Completed This Week", value: "7" },
  { label: "Avg. Build Time", value: "2.4h" },
  { label: "Code Quality Score", value: "94%" },
];

const stageIcon: Record<StageStatus, { icon: typeof CheckCircle2; color: string }> = {
  done: { icon: CheckCircle2, color: "text-accent" },
  active: { icon: RefreshCw, color: "text-primary" },
  pending: { icon: Clock, color: "text-muted-foreground" },
  error: { icon: AlertCircle, color: "text-destructive" },
};

const DevPipeline = () => {
  const [projects, setProjects] = useState(initialPipeline);

  const advanceStage = (projectId: string) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        const activeIdx = p.stages.findIndex((s) => s.status === "active");
        if (activeIdx === -1) return p;
        const newStages = p.stages.map((s, i) => {
          if (i === activeIdx) return { ...s, status: "done" as StageStatus };
          if (i === activeIdx + 1) return { ...s, status: "active" as StageStatus };
          return s;
        });
        return { ...p, stages: newStages, lastUpdate: "Just now" };
      })
    );
    const project = projects.find((p) => p.id === projectId);
    if (project) {
      const activeStage = project.stages.find((s) => s.status === "active");
      toast.success(`${project.client}: "${activeStage?.name}" completed`, { description: "Moving to next stage" });
    }
  };

  const retryStage = (projectId: string) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        const errorIdx = p.stages.findIndex((s) => s.status === "error");
        if (errorIdx === -1) return p;
        const newStages = p.stages.map((s, i) =>
          i === errorIdx ? { ...s, status: "active" as StageStatus } : s
        );
        return { ...p, stages: newStages, lastUpdate: "Just now" };
      })
    );
    const project = projects.find((p) => p.id === projectId);
    toast.loading(`Retrying ${project?.client}...`, { id: `retry-${projectId}` });
    setTimeout(() => {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== projectId) return p;
          const activeIdx = p.stages.findIndex((s) => s.status === "active");
          const newStages = p.stages.map((s, i) => {
            if (i === activeIdx) return { ...s, status: "done" as StageStatus };
            if (i === activeIdx + 1) return { ...s, status: "active" as StageStatus };
            return s;
          });
          return { ...p, stages: newStages, lastUpdate: "Just now" };
        })
      );
      toast.success(`${project?.client} retry successful!`, { id: `retry-${projectId}` });
    }, 2000);
  };

  const handlePreview = (client: string, device: string) => {
    toast.info(`Opening ${device} preview for ${client}`, { description: "Preview would open in a new tab" });
  };

  return (
    <DashboardLayout>
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <Code2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-cream">Dev Pipeline</h1>
            <p className="text-[13px] text-muted-foreground">Figma → Shopify Liquid code automation</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4 mb-8">
        {pipelineStats.map((s) => (
          <div key={s.label} className="glow-card rounded-xl bg-card p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{s.label}</p>
            <p className="mt-2 text-2xl font-bold text-cream">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Pipeline stages legend */}
      <div className="mb-6 flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span className="font-bold text-cream uppercase tracking-wider">Stages:</span>
        <span className="flex items-center gap-1"><Figma className="h-3 w-3" /> Figma Pull</span>
        <ArrowRight className="h-3 w-3" />
        <span className="flex items-center gap-1"><Layers className="h-3 w-3" /> Section Split</span>
        <ArrowRight className="h-3 w-3" />
        <span className="flex items-center gap-1"><Code2 className="h-3 w-3" /> Code Gen</span>
        <ArrowRight className="h-3 w-3" />
        <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> QA</span>
        <ArrowRight className="h-3 w-3" />
        <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Refinement</span>
      </div>

      {/* Projects */}
      <div className="space-y-4">
        {projects.map((p) => {
          const hasError = p.stages.some((s) => s.status === "error");
          const hasActive = p.stages.some((s) => s.status === "active");
          const allDone = p.stages.every((s) => s.status === "done");

          return (
            <div key={p.id} className="glow-card rounded-xl bg-card p-6">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h3 className="text-sm font-bold text-cream">{p.client}</h3>
                  <p className="text-xs text-muted-foreground">{p.page}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-muted-foreground">{p.lastUpdate}</span>
                  <div className="flex gap-1.5">
                    <button onClick={() => handlePreview(p.client, "Desktop")} className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary border border-border hover:border-primary/30 transition-colors" title="Desktop preview">
                      <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button onClick={() => handlePreview(p.client, "Mobile")} className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary border border-border hover:border-primary/30 transition-colors" title="Mobile preview">
                      <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
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
                      <div className={`flex items-center gap-2 flex-1 rounded-lg border p-3 ${
                        stage.status === "active" ? "border-primary/30 bg-primary/5" :
                        stage.status === "done" ? "border-accent/20 bg-accent/5" :
                        stage.status === "error" ? "border-destructive/30 bg-destructive/5" :
                        "border-border bg-secondary"
                      }`}>
                        <Icon className={`h-3.5 w-3.5 shrink-0 ${si.color} ${stage.status === "active" ? "animate-spin" : ""}`} />
                        <span className={`text-[11px] font-semibold ${
                          stage.status === "done" ? "text-accent" :
                          stage.status === "active" ? "text-primary" :
                          stage.status === "error" ? "text-destructive" :
                          "text-muted-foreground"
                        }`}>
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
                {hasError && (
                  <button onClick={() => retryStage(p.id)} className="flex items-center gap-1.5 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-1.5 text-[11px] font-bold text-destructive hover:opacity-90 transition-opacity">
                    <RotateCcw className="h-3 w-3" /> Retry Failed Stage
                  </button>
                )}
                {hasActive && !allDone && (
                  <button onClick={() => advanceStage(p.id)} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[11px] font-bold text-accent-foreground hover:opacity-90 transition-opacity">
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
    </DashboardLayout>
  );
};

export default DevPipeline;
