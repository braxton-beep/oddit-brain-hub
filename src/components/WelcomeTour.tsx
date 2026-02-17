import { useState, useEffect } from "react";
import {
  Brain,
  LayoutDashboard,
  FileText,
  Code2,
  MessageSquare,
  Link2,
  ArrowRight,
  ArrowLeft,
  X,
  Sparkles,
  Rocket,
} from "lucide-react";

interface TourStep {
  title: string;
  description: string;
  icon: typeof Brain;
  highlight: string;
}

const steps: TourStep[] = [
  {
    title: "Welcome to Oddit Brain",
    description: "Your AI-powered CRO command center. The Brain connects all your tools, knowledge, and workflows into one intelligent system that learns and improves over time.",
    icon: Brain,
    highlight: "Let's take a quick tour →",
  },
  {
    title: "Dashboard",
    description: "Your home base. See live stats on connected tools, active workflows, project progress, and AI agent status — all at a glance. Click any card for more details.",
    icon: LayoutDashboard,
    highlight: "Real-time data from all sources",
  },
  {
    title: "Audit Brain",
    description: "Ask the Brain anything about your clients, audits, or KPIs. It searches across 11,000+ Oddit Reports, meetings, calls, and Slack to give you instant answers.",
    icon: Brain,
    highlight: "Natural language queries",
  },
  {
    title: "Reports",
    description: "Generate beautiful CRO audit reports automatically. Choose from templates, enter a client name, and the Brain creates a comprehensive report in minutes.",
    icon: FileText,
    highlight: "Auto-generated with AI",
  },
  {
    title: "Dev Pipeline",
    description: "Track the Figma → Shopify Liquid code pipeline. Each project moves through 5 stages: Figma Pull, Section Split, Code Gen, QA, and Refinement.",
    icon: Code2,
    highlight: "Visual progress tracking",
  },
  {
    title: "Slack Agent",
    description: "The Brain lives in your Slack workspace too. Team members can @mention it to get answers, trigger workflows, and generate reports — all from Slack.",
    icon: MessageSquare,
    highlight: "AI in your team chat",
  },
  {
    title: "Integrations",
    description: "Connect your tools so the Brain learns in real time. Slack, Google Drive, Fireflies, Shopify, GitHub, and more — each connection makes the Brain smarter.",
    icon: Link2,
    highlight: "13 integrations available",
  },
  {
    title: "Vision",
    description: "See where Oddit Brain is headed — the roadmap, core pillars, and success metrics. From centralized intelligence to automated CRO at scale.",
    icon: Rocket,
    highlight: "The big picture",
  },
  {
    title: "You're all set!",
    description: "Start by asking the Brain a question, generating a report, or connecting a new tool. The more you use it, the smarter it gets.",
    icon: Rocket,
    highlight: "Let's go!",
  },
];

const TOUR_KEY = "oddit-brain-tour-completed";

export function WelcomeTour() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const completed = localStorage.getItem(TOUR_KEY);
    if (!completed) {
      // Small delay so the page renders first
      const timer = setTimeout(() => setIsOpen(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    localStorage.setItem(TOUR_KEY, "true");
  };

  const handleNext = () => {
    if (currentStep === steps.length - 1) {
      handleClose();
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const handlePrev = () => {
    setCurrentStep((s) => Math.max(0, s - 1));
  };

  if (!isOpen) return null;

  const step = steps[currentStep];
  const Icon = step.icon;
  const isLast = currentStep === steps.length - 1;
  const isFirst = currentStep === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-8 shadow-2xl shadow-primary/10 animate-in fade-in zoom-in-95 duration-300">
        {/* Close */}
        <button onClick={handleClose} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-5 w-5" />
        </button>

        {/* Progress dots */}
        <div className="flex gap-1.5 mb-6">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${
                i === currentStep ? "w-8 bg-primary" : i < currentStep ? "w-4 bg-accent" : "w-4 bg-muted"
              }`}
            />
          ))}
        </div>

        {/* Icon */}
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 mb-5">
          <Icon className="h-7 w-7 text-primary" />
        </div>

        {/* Content */}
        <h2 className="text-xl font-bold text-cream mb-3">{step.title}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">{step.description}</p>
        <div className="flex items-center gap-2 mb-8">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          <span className="text-xs font-semibold text-accent">{step.highlight}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <div>
            {!isFirst && (
              <button
                onClick={handlePrev}
                className="flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {!isLast && (
              <button onClick={handleClose} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Skip tour
              </button>
            )}
            <button
              onClick={handleNext}
              className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity"
            >
              {isLast ? "Get Started" : "Next"}
              {!isLast && <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Button to re-trigger the tour from anywhere */
export function TourTrigger() {
  const handleRestart = () => {
    localStorage.removeItem(TOUR_KEY);
    window.location.reload();
  };

  return (
    <button
      onClick={handleRestart}
      className="flex items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      title="Restart tour"
    >
      <Sparkles className="h-3 w-3" />
      <span>Tour</span>
    </button>
  );
}
