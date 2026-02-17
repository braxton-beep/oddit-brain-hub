import { DashboardLayout } from "@/components/DashboardLayout";
import {
  Rocket,
  Brain,
  Zap,
  Target,
  Users,
  TrendingUp,
  Layers,
  ArrowRight,
  Sparkles,
  Globe,
  Bot,
  BarChart3,
} from "lucide-react";

const pillars = [
  {
    icon: Brain,
    title: "Centralized Intelligence",
    description: "One AI brain that connects every data source — calls, meetings, Slack, docs, analytics — and makes it all instantly queryable. No more hunting through tools.",
  },
  {
    icon: Zap,
    title: "Automated Workflows",
    description: "From audit report generation to A/B test monitoring, the Brain automates repetitive work so your team focuses on strategy and creativity.",
  },
  {
    icon: Target,
    title: "CRO at Scale",
    description: "Deliver conversion rate optimization at a scale previously impossible. Every insight, recommendation, and result is indexed and learned from.",
  },
  {
    icon: Layers,
    title: "Figma → Code Pipeline",
    description: "Automate the design-to-development pipeline. Figma designs become Shopify Liquid code through an AI-powered build process with QA built in.",
  },
  {
    icon: Bot,
    title: "AI Agents Everywhere",
    description: "The Brain lives where your team works — Slack, dashboards, reports. Team members interact naturally and get answers in seconds.",
  },
  {
    icon: Globe,
    title: "Always Learning",
    description: "Every client call, every audit, every experiment makes the Brain smarter. It compounds knowledge over time, becoming your unfair advantage.",
  },
];

const phases = [
  {
    phase: "Phase 1",
    title: "Foundation",
    status: "complete" as const,
    items: ["Central knowledge base", "Core integrations (Slack, Fireflies, Shopify)", "Query interface", "Team access controls"],
  },
  {
    phase: "Phase 2",
    title: "Automation",
    status: "active" as const,
    items: ["Automated report generation", "Figma → Liquid pipeline", "Workflow engine", "Slack agent"],
  },
  {
    phase: "Phase 3",
    title: "Intelligence",
    status: "upcoming" as const,
    items: ["Predictive CRO recommendations", "Auto-prioritized test roadmaps", "Client health scoring", "Revenue attribution"],
  },
  {
    phase: "Phase 4",
    title: "Scale",
    status: "upcoming" as const,
    items: ["White-label client portals", "Agency partner network", "Self-service audits", "Enterprise API"],
  },
];

const phaseStyles = {
  complete: { dot: "bg-accent", text: "text-accent", label: "Complete" },
  active: { dot: "bg-primary animate-pulse", text: "text-primary", label: "In Progress" },
  upcoming: { dot: "bg-muted-foreground", text: "text-muted-foreground", label: "Upcoming" },
};

const Vision = () => {
  return (
    <DashboardLayout>
      {/* Hero */}
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <Rocket className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-cream">The Vision</h1>
            <p className="text-[13px] text-muted-foreground">Where we're going and why it matters</p>
          </div>
        </div>

        <div className="glow-card rounded-2xl bg-card p-8 border border-primary/10">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-5 w-5 text-accent" />
            <span className="text-xs font-bold text-accent uppercase tracking-wider">The Big Idea</span>
          </div>
          <h2 className="text-3xl font-bold text-cream leading-tight mb-4">
            Build the operating system for
            <span className="text-gradient"> conversion rate optimization</span>
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">
            Oddit isn't just an agency — it's building the infrastructure that makes world-class CRO
            accessible at any scale. The Brain is the central nervous system: it ingests everything,
            learns continuously, and powers every workflow from audit to implementation. The goal is
            to make every team member 10x more effective by putting AI-driven insights at their fingertips.
          </p>
        </div>
      </div>

      {/* Pillars */}
      <section className="mb-12">
        <div className="flex items-center gap-2 mb-6">
          <Target className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Core Pillars</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pillars.map((pillar) => (
            <div key={pillar.title} className="glow-card rounded-xl bg-card p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mb-4">
                <pillar.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-sm font-bold text-cream mb-2">{pillar.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{pillar.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Roadmap */}
      <section className="mb-12">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Roadmap</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {phases.map((phase) => {
            const style = phaseStyles[phase.status];
            return (
              <div key={phase.phase} className="glow-card rounded-xl bg-card p-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{phase.phase}</span>
                  <span className={`ml-auto text-[10px] font-semibold uppercase tracking-wider ${style.text}`}>{style.label}</span>
                </div>
                <h3 className="text-sm font-bold text-cream mb-3">{phase.title}</h3>
                <ul className="space-y-2">
                  {phase.items.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <ArrowRight className={`h-3 w-3 mt-0.5 shrink-0 ${style.text}`} />
                      <span className="text-xs text-muted-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {/* Metrics Vision */}
      <section className="glow-card rounded-2xl bg-card p-8 border border-accent/10">
        <div className="flex items-center gap-2 mb-6">
          <BarChart3 className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-bold text-cream uppercase tracking-wider">What Success Looks Like</h2>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { metric: "10x", label: "Faster audit delivery", description: "Hours instead of weeks" },
            { metric: "25%+", label: "Avg conversion lift", description: "Across all client audits" },
            { metric: "90%", label: "Automated workflows", description: "Humans focus on strategy" },
            { metric: "∞", label: "Compounding knowledge", description: "Every insight makes the Brain smarter" },
          ].map((item) => (
            <div key={item.label} className="text-center">
              <p className="text-3xl font-bold text-accent mb-1">{item.metric}</p>
              <p className="text-sm font-bold text-cream mb-1">{item.label}</p>
              <p className="text-[11px] text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Team Note */}
      <div className="mt-8 rounded-xl border border-border bg-card p-6 flex items-start gap-4">
        <Users className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-cream mb-1">Built by the Oddit team</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            This isn't a side project — it's the core of what we're building. Every audit, every client call,
            every experiment feeds into the Brain. The more we grow, the smarter it gets. The vision is to
            make Oddit the most data-driven, AI-powered CRO agency in the world — and eventually, to make
            this technology available to every e-commerce brand.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Vision;
