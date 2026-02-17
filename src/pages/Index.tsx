import { DashboardLayout } from "@/components/DashboardLayout";
import {
  Brain,
  FileText,
  Code2,
  MessageSquare,
  Zap,
  Users,
  TrendingUp,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowRight,
  Figma,
  Bot,
  BarChart3,
} from "lucide-react";

// Priority projects from call
const priorityProjects = [
  {
    name: "Audit Brain Setup",
    owner: "Braxton",
    status: "in-progress" as const,
    priority: "high" as const,
    description: "Central AI hub connecting company data, meeting notes, client calls, and sales KPIs for real-time insights.",
    progress: 35,
  },
  {
    name: "Report Automation",
    owner: "Braxton",
    status: "up-next" as const,
    priority: "high" as const,
    description: "Automate audit report PDF assembly from existing templates and layouts. Quick win — thousands of PDFs already created.",
    progress: 10,
  },
  {
    name: "Dev Pipeline (Figma → Code)",
    owner: "Ryan",
    status: "in-progress" as const,
    priority: "high" as const,
    description: "AI-assisted Figma-to-Shopify Liquid code conversion. Pixel-perfect, bug-free output with minimal human touch.",
    progress: 55,
  },
  {
    name: "Slack AI Agent",
    owner: "Braxton",
    status: "planned" as const,
    priority: "medium" as const,
    description: "Install AI agent in Slack for real-time Audit Brain queries. Acts like an employee providing conversational updates.",
    progress: 0,
  },
];

const actionItems = [
  { owner: "Braxton", task: "Share refined granular project plan from Claude AI with the team", done: false },
  { owner: "Braxton", task: "Get Audit Brain app loading successfully", done: false },
  { owner: "Braxton", task: "Install Slack AI agent for real-time querying", done: false },
  { owner: "Braxton", task: "Focus on automating audit report generation as initial priority", done: false },
  { owner: "Ryan", task: "Continue refining Figma → Shopify Liquid pipeline", done: false },
  { owner: "Ryan", task: "Collaborate with Braxton on AI tool alignment", done: false },
  { owner: "Taylor", task: "Set up Slack channel for AI project collaboration", done: false },
  { owner: "Shaun", task: "Add Braxton to Fireflies call note system", done: false },
];

const kpiTargets = [
  { label: "Dev Time Reduction", target: "50–80%", current: "~25%", icon: TrendingUp },
  { label: "Report Automation", target: "90% auto", current: "Manual", icon: FileText },
  { label: "Active AI Agents", target: "5+", current: "1", icon: Bot },
  { label: "Pipeline Quality", target: "Prod-ready", current: "Beta", icon: Code2 },
];

const statusStyles = {
  "in-progress": "bg-primary/15 text-primary border-primary/30",
  "up-next": "bg-warning/15 text-warning border-warning/30",
  planned: "bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30",
  done: "bg-success/15 text-success border-success/30",
};

const priorityDot = {
  high: "bg-destructive",
  medium: "bg-warning",
  low: "bg-muted-foreground",
};

const Index = () => {
  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">
          <span className="text-gradient">Oddit Brain</span> — Operations Hub
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          AI-powered CRO agency command center • Updated from team call
        </p>
      </div>

      {/* KPI Targets */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {kpiTargets.map((kpi) => (
          <div key={kpi.label} className="glow-card rounded-lg bg-card p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{kpi.label}</p>
              <kpi.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-3">
              <span className="text-2xl font-bold text-card-foreground">{kpi.current}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                → Target: <span className="text-primary font-medium">{kpi.target}</span>
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Priority Projects */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Priority Projects
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {priorityProjects.map((project) => (
            <div key={project.name} className="glow-card rounded-lg bg-card p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${priorityDot[project.priority]}`} />
                  <h3 className="text-sm font-semibold text-foreground">{project.name}</h3>
                </div>
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusStyles[project.status]}`}>
                  {project.status}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{project.description}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  <Users className="inline h-3 w-3 mr-1" />
                  {project.owner}
                </span>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-24 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{project.progress}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Action Items */}
        <div className="lg:col-span-2 glow-card rounded-lg bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Action Items from Call</h2>
          </div>
          <div className="space-y-2">
            {actionItems.map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-md p-2 transition-colors hover:bg-secondary"
              >
                <div className={`mt-1 h-4 w-4 shrink-0 rounded border ${item.done ? "bg-primary border-primary" : "border-border"} flex items-center justify-center`}>
                  {item.done && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${item.done ? "line-through text-muted-foreground" : "text-card-foreground"}`}>
                    {item.task}
                  </p>
                  <p className="text-xs text-muted-foreground">{item.owner}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Strategic Vision */}
        <div className="glow-card rounded-lg bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Strategic Vision
          </h2>
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-secondary p-3">
              <p className="text-xs font-medium text-foreground mb-1">Hybrid Human-AI Model</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                AI at low cost, human experts at premium prices. Dual approach for broad market coverage.
              </p>
            </div>
            <div className="rounded-md border border-border bg-secondary p-3">
              <p className="text-xs font-medium text-foreground mb-1">Subscription Audit Brain</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                $50–$500+/mo tiers. Basic AI access → automated code gen. Recurring revenue engine.
              </p>
            </div>
            <div className="rounded-md border border-border bg-secondary p-3">
              <p className="text-xs font-medium text-foreground mb-1">Figma → Code Pipeline</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Pixel-perfect Shopify Liquid from Figma designs. Minimal human touch for delivery at scale.
              </p>
            </div>
            <div className="rounded-md border border-border bg-secondary p-3">
              <p className="text-xs font-medium text-foreground mb-1">Self-Optimizing AI</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Within months: auto-execute tasks, self-optimize, act like an employee in Slack.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Index;
