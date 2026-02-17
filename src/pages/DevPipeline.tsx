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
} from "lucide-react";

type StageStatus = "done" | "active" | "pending" | "error";

interface PipelineProject {
  id: string;
  client: string;
  page: string;
  stages: { name: string; status: StageStatus }[];
  lastUpdate: string;
}

const pipelineProjects: PipelineProject[] = [
  {
    id: "1",
    client: "Braxley Bands",
    page: "Homepage Redesign",
    stages: [
      { name: "Figma Pull", status: "done" },
      { name: "Section Split", status: "done" },
      { name: "Code Gen", status: "done" },
      { name: "QA", status: "active" },
      { name: "Refinement", status: "pending" },
    ],
    lastUpdate: "5m ago",
  },
  {
    id: "2",
    client: "TechFlow",
    page: "Product Page",
    stages: [
      { name: "Figma Pull", status: "done" },
      { name: "Section Split", status: "done" },
      { name: "Code Gen", status: "active" },
      { name: "QA", status: "pending" },
      { name: "Refinement", status: "pending" },
    ],
    lastUpdate: "22m ago",
  },
  {
    id: "3",
    client: "NovaPay",
    page: "Checkout Flow",
    stages: [
      { name: "Figma Pull", status: "done" },
      { name: "Section Split", status: "active" },
      { name: "Code Gen", status: "pending" },
      { name: "QA", status: "pending" },
      { name: "Refinement", status: "pending" },
    ],
    lastUpdate: "1h ago",
  },
  {
    id: "4",
    client: "GreenLeaf Co",
    page: "Landing Page",
    stages: [
      { name: "Figma Pull", status: "error" },
      { name: "Section Split", status: "pending" },
      { name: "Code Gen", status: "pending" },
      { name: "QA", status: "pending" },
      { name: "Refinement", status: "pending" },
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
      <div className="mb-6 flex items-center gap-4 text-xs text-muted-foreground">
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
        {pipelineProjects.map((p) => (
          <div key={p.id} className="glow-card rounded-xl bg-card p-6">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="text-sm font-bold text-cream">{p.client}</h3>
                <p className="text-xs text-muted-foreground">{p.page}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-muted-foreground">{p.lastUpdate}</span>
                <div className="flex gap-1.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary border border-border">
                    <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary border border-border">
                    <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
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
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
};

export default DevPipeline;
