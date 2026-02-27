import { DashboardLayout } from "@/components/DashboardLayout";
import { useEmailDrafts, useUpdateEmailDraft, useActivityLog, type EmailDraft } from "@/hooks/useDashboardData";
import { useClientHealthScores } from "@/hooks/useClientHealthScores";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Brain, Zap, Mail, Copy, Check, X, CalendarDays, Loader2, FileText, Trophy,
  ArrowRight, RefreshCw, TrendingUp, AlertCircle, CheckCircle2, Clock, Users,
  Activity, Newspaper, ChevronRight, Sparkles, Target, Flame, Eye, BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

// ── Types ────────────────────────────────────────────────
interface NewsItem { title: string; summary: string; category: string; impact: "High" | "Medium" | "Low"; emoji: string; }

const categoryColor: Record<string, string> = {
  "AI Tools": "text-primary border-primary/20 bg-primary/8",
  Ecommerce: "text-electric border-electric/20 bg-electric/8",
  "UX & Design": "text-violet border-violet/20 bg-violet/8",
  Shopify: "text-accent border-accent/20 bg-accent/8",
  CRO: "text-gold border-gold/20 bg-gold/8",
};

// ── Fun facts / quirky lines ─────────────────────────────
const QUIRKY_LINES = [
  { emoji: "🧪", text: "Hypothesis of the day: hero banners with faces convert 23% better" },
  { emoji: "☕", text: "Fun fact: the average Shopify store has 3.2 abandoned carts right now" },
  { emoji: "🎯", text: "CRO tip: sticky add-to-cart buttons lift mobile CVR by ~8%" },
  { emoji: "🔥", text: "You've processed more transcripts than most agencies do in a year" },
  { emoji: "🧠", text: "The Brain has read more call transcripts than any human could" },
  { emoji: "⚡", text: "Speed wins: every 100ms of load time costs ~1% conversion" },
  { emoji: "🎨", text: "Hot take: your best-performing audit recommendation is probably trust signals" },
  { emoji: "🚀", text: "The machine is running. You're just steering it." },
  { emoji: "📊", text: "Data point: social proof above the fold lifts trust by 33%" },
  { emoji: "💡", text: "Reminder: the best CRO wins are boring UX improvements" },
  { emoji: "🏆", text: "Top auditors run at least one competitive intel scan per client" },
  { emoji: "🌊", text: "Flow state: when the dashboard is green, the team is winning" },
];

// ── Micro components ─────────────────────────────────────
function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${className}`}>
      {label}
    </span>
  );
}

function SectionHeader({ icon: Icon, title, color, action }: {
  icon: typeof Brain; title: string; color: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${color === "text-electric" ? "from-electric/15 to-electric/5" : color === "text-gold" ? "from-gold/15 to-gold/5" : color === "text-coral" ? "from-coral/15 to-coral/5" : "from-primary/15 to-primary/5"}`}>
        <Icon className={`h-3.5 w-3.5 ${color}`} />
      </div>
      <h2 className="text-sm font-bold text-foreground tracking-tight">{title}</h2>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, href, subtext }: {
  icon: typeof Users; label: string; value: number | string; color: string; href: string; subtext?: string;
}) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(href)}
      className={`group flex flex-col gap-1 rounded-2xl border bg-card/50 p-4 text-left transition-all duration-200 hover:translate-y-[-2px] hover:border-${color}/30 hover:shadow-lg`}
      style={{ borderColor: `hsl(var(--border))` }}
    >
      <div className="flex items-center justify-between">
        <Icon className={`h-4 w-4 text-${color}`} />
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
      </div>
      <span className="text-2xl font-extrabold text-foreground tabular-nums mt-1">{value}</span>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {subtext && <span className="text-[10px] text-muted-foreground/60">{subtext}</span>}
    </button>
  );
}

function HealthDot({ score }: { score: "green" | "yellow" | "red" }) {
  const colors = {
    green: "bg-accent shadow-accent/40",
    yellow: "bg-gold shadow-gold/40",
    red: "bg-coral shadow-coral/40",
  };
  return <div className={`h-2.5 w-2.5 rounded-full ${colors[score]} shadow-sm`} />;
}

// ── Hero Banner (Fun & Compact) ──────────────────────────
function HeroBanner({ actionCount }: { actionCount: number }) {
  const [quirkIndex, setQuirkIndex] = useState(() => Math.floor(Math.random() * QUIRKY_LINES.length));

  useEffect(() => {
    const t = setInterval(() => {
      setQuirkIndex((i) => (i + 1) % QUIRKY_LINES.length);
    }, 12000);
    return () => clearInterval(t);
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const quirk = QUIRKY_LINES[quirkIndex];

  return (
    <div className="rounded-2xl p-6 mb-6 animate-fade-in relative overflow-hidden" style={{
      background: "linear-gradient(135deg, hsl(240 80% 68% / 0.10) 0%, hsl(270 70% 65% / 0.06) 40%, hsl(165 55% 55% / 0.04) 100%)",
      border: "1px solid hsl(240 80% 68% / 0.12)",
    }}>
      <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-primary/[0.06] blur-3xl pointer-events-none" />

      <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight mb-1">{greeting} 👋</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground transition-all duration-500 min-h-[24px]" key={quirkIndex}>
            <span className="text-lg">{quirk.emoji}</span>
            <span className="animate-fade-in">{quirk.text}</span>
          </div>
        </div>

        {actionCount > 0 && (
          <div className="flex items-center gap-3 rounded-xl bg-gold/8 border border-gold/20 px-4 py-2.5 shrink-0">
            <Target className="h-4 w-4 text-gold" />
            <div>
              <span className="text-sm font-bold text-gold">{actionCount} item{actionCount > 1 ? "s" : ""}</span>
              <span className="text-xs text-muted-foreground ml-1.5">need attention</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Live Stats Row ───────────────────────────────────────
function StatsRow() {
  const { data: counts } = useQuery({
    queryKey: ["dashboard-live-counts"],
    queryFn: async () => {
      const [
        { count: clients },
        { count: audits },
        { count: transcripts },
        { count: scores },
        { count: reportsThisWeek },
      ] = await Promise.all([
        supabase.from("clients").select("*", { count: "exact", head: true }),
        supabase.from("cro_audits").select("*", { count: "exact", head: true }),
        supabase.from("fireflies_transcripts").select("*", { count: "exact", head: true }),
        supabase.from("oddit_scores").select("*", { count: "exact", head: true }),
        supabase.from("report_drafts").select("*", { count: "exact", head: true })
          .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()),
      ]);
      return {
        clients: clients ?? 0,
        audits: audits ?? 0,
        transcripts: transcripts ?? 0,
        scores: scores ?? 0,
        reportsThisWeek: reportsThisWeek ?? 0,
      };
    },
  });

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      <StatCard icon={Users} label="Clients" value={counts?.clients ?? "–"} color="primary" href="/clients" />
      <StatCard icon={Eye} label="CRO Audits" value={counts?.audits ?? "–"} color="accent" href="/cro-agent" />
      <StatCard icon={FileText} label="Transcripts" value={counts?.transcripts ? counts.transcripts.toLocaleString() : "–"} color="electric" href="/oddit-brain" />
      <StatCard icon={BarChart3} label="Oddit Scores" value={counts?.scores ?? "–"} color="gold" href="/cro-agent" subtext={counts?.reportsThisWeek ? `${counts.reportsThisWeek} reports this week` : undefined} />
    </div>
  );
}

// ── Automation Phase Tracker ─────────────────────────────
const PHASES = [
  { id: "foundation", label: "Foundation", emoji: "🧱", description: "Clients & transcripts ingested", checks: ["clients", "transcripts"] as const },
  { id: "intelligence", label: "Intelligence", emoji: "🧠", description: "Audits & scores running", checks: ["audits", "scores"] as const },
  { id: "generation", label: "Generation", emoji: "⚡", description: "Reports, emails & tweets auto-generating", checks: ["reports", "emails", "tweets"] as const },
  { id: "integration", label: "Integration", emoji: "🔗", description: "Shopify, Figma & Slack wired up", checks: ["shopify", "figma", "slack"] as const },
  { id: "autonomous", label: "Fully Automated", emoji: "🚀", description: "All systems active with throughput", checks: ["pipeline", "competitive"] as const },
];

function AutomationPhaseTracker() {
  const { data: phaseCounts } = useQuery({
    queryKey: ["automation-phase-data"],
    queryFn: async () => {
      const [
        { count: clients },
        { count: transcripts },
        { count: audits },
        { count: scores },
        { count: reports },
        { count: emails },
        { count: tweets },
        { count: shopify },
        { count: figma },
        { data: slackActivity },
        { count: pipeline },
        { count: competitive },
      ] = await Promise.all([
        supabase.from("clients").select("*", { count: "exact", head: true }),
        supabase.from("fireflies_transcripts").select("*", { count: "exact", head: true }),
        supabase.from("cro_audits").select("*", { count: "exact", head: true }),
        supabase.from("oddit_scores").select("*", { count: "exact", head: true }),
        supabase.from("report_drafts").select("*", { count: "exact", head: true }),
        supabase.from("email_drafts").select("*", { count: "exact", head: true }),
        supabase.from("tweet_drafts").select("*", { count: "exact", head: true }),
        supabase.from("shopify_connections").select("*", { count: "exact", head: true }),
        supabase.from("figma_files").select("*", { count: "exact", head: true }),
        supabase.from("activity_log").select("workflow_name").eq("workflow_name", "slack-weekly-digest").limit(1),
        supabase.from("pipeline_projects").select("*", { count: "exact", head: true }),
        supabase.from("competitive_intel").select("*", { count: "exact", head: true }),
      ]);
      return {
        clients: clients ?? 0,
        transcripts: transcripts ?? 0,
        audits: audits ?? 0,
        scores: scores ?? 0,
        reports: reports ?? 0,
        emails: emails ?? 0,
        tweets: tweets ?? 0,
        shopify: shopify ?? 0,
        figma: figma ?? 0,
        slack: slackActivity?.length ?? 0,
        pipeline: pipeline ?? 0,
        competitive: competitive ?? 0,
      };
    },
  });

  const phaseStatus = PHASES.map((phase) => {
    const allComplete = phase.checks.every((key) => (phaseCounts?.[key] ?? 0) > 0);
    const someComplete = phase.checks.some((key) => (phaseCounts?.[key] ?? 0) > 0);
    const status: "complete" | "in-progress" | "locked" = allComplete ? "complete" : someComplete ? "in-progress" : "locked";
    return { ...phase, status };
  });

  // Find the current phase (first non-complete, or last if all complete)
  const currentPhaseIndex = phaseStatus.findIndex((p) => p.status !== "complete");
  const activeIndex = currentPhaseIndex === -1 ? PHASES.length - 1 : currentPhaseIndex;
  const completedPhases = phaseStatus.filter((p) => p.status === "complete").length;
  const progressPct = Math.round((completedPhases / PHASES.length) * 100);

  return (
    <div className="mb-6 animate-fade-in">
      <div className="rounded-2xl border border-border/60 bg-card/30 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-accent" />
            <span className="text-sm font-bold text-foreground">Road to Full Automation</span>
          </div>
          <span className={`text-xs font-bold tabular-nums ${progressPct === 100 ? "text-accent" : "text-muted-foreground"}`}>
            {progressPct === 100 ? "🎉 100%" : `${progressPct}%`}
          </span>
        </div>

        {/* Phase bar */}
        <div className="relative mb-5">
          {/* Background track */}
          <div className="h-2 rounded-full bg-secondary/80 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${Math.max(progressPct, 4)}%`,
                background: progressPct === 100
                  ? "linear-gradient(90deg, hsl(165 55% 55%), hsl(140 60% 50%))"
                  : "linear-gradient(90deg, hsl(240 80% 68%), hsl(270 70% 65%), hsl(165 55% 55%))",
              }}
            />
          </div>

          {/* Phase dots on the track */}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between px-[2px]">
            {phaseStatus.map((phase, i) => (
              <div
                key={phase.id}
                className={`h-4 w-4 rounded-full border-2 transition-all duration-300 flex items-center justify-center ${
                  phase.status === "complete"
                    ? "bg-accent border-accent shadow-[0_0_8px_hsl(165_55%_55%_/_0.4)]"
                    : phase.status === "in-progress"
                    ? "bg-primary border-primary shadow-[0_0_8px_hsl(240_80%_68%_/_0.3)] animate-pulse"
                    : "bg-secondary border-border/60"
                }`}
              >
                {phase.status === "complete" && <Check className="h-2.5 w-2.5 text-accent-foreground" />}
              </div>
            ))}
          </div>
        </div>

        {/* Phase labels */}
        <div className="grid grid-cols-5 gap-1">
          {phaseStatus.map((phase, i) => (
            <div key={phase.id} className={`text-center transition-opacity duration-300 ${phase.status === "locked" ? "opacity-40" : "opacity-100"}`}>
              <span className="text-lg block mb-0.5">{phase.emoji}</span>
              <p className={`text-[11px] font-bold leading-tight ${
                phase.status === "complete" ? "text-accent" : phase.status === "in-progress" ? "text-primary" : "text-muted-foreground"
              }`}>{phase.label}</p>
              <p className="text-[9px] text-muted-foreground/60 leading-tight mt-0.5 hidden sm:block">{phase.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Action Queue ─────────────────────────────────────────
function ActionQueue({ pendingDrafts, onReviewDraft }: {
  pendingDrafts: EmailDraft[];
  onReviewDraft: (draft: EmailDraft) => void;
}) {
  const navigate = useNavigate();

  const { data: recentSetups } = useQuery({
    queryKey: ["recent-setups"],
    queryFn: async () => {
      const { data } = await supabase.from("setup_runs")
        .select("id, client_name, status, created_at")
        .in("status", ["completed", "failed"])
        .order("created_at", { ascending: false })
        .limit(3);
      return data || [];
    },
  });

  const { data: pendingAudits } = useQuery({
    queryKey: ["pending-audits"],
    queryFn: async () => {
      const { data } = await supabase.from("cro_audits")
        .select("id, client_name, status, created_at")
        .eq("status", "generating")
        .order("created_at", { ascending: false })
        .limit(3);
      return data || [];
    },
  });

  const hasItems = pendingDrafts.length > 0 || (recentSetups && recentSetups.length > 0) || (pendingAudits && pendingAudits.length > 0);

  if (!hasItems) return null;

  return (
    <div className="glass-card rounded-2xl p-5 mb-6">
      <SectionHeader icon={Target} title="Needs Your Attention" color="text-gold" />
      <div className="space-y-2">
        {pendingDrafts.slice(0, 3).map((draft) => (
          <div key={draft.id} className="flex items-center gap-3 rounded-xl border border-gold/15 bg-gold/[0.03] px-4 py-3 hover:bg-gold/[0.06] transition-colors">
            <span className="text-base">✉️</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{draft.client_name}</p>
              <p className="text-xs text-muted-foreground truncate">{draft.subject_line}</p>
            </div>
            <button onClick={() => onReviewDraft(draft)} className="shrink-0 rounded-lg bg-gold/10 border border-gold/20 px-3 py-1.5 text-xs font-semibold text-gold hover:bg-gold/15 transition-colors">
              Review
            </button>
          </div>
        ))}
        {(pendingAudits || []).map((audit: any) => (
          <div key={audit.id} className="flex items-center gap-3 rounded-xl border border-primary/15 bg-primary/[0.03] px-4 py-3">
            <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">Audit generating: {audit.client_name}</p>
              <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(audit.created_at), { addSuffix: true })}</p>
            </div>
          </div>
        ))}
        {(recentSetups || []).filter((s: any) => s.status === "failed").map((setup: any) => (
          <div key={setup.id} className="flex items-center gap-3 rounded-xl border border-destructive/15 bg-destructive/[0.03] px-4 py-3">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">Setup failed: {setup.client_name}</p>
              <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(setup.created_at), { addSuffix: true })}</p>
            </div>
            <button onClick={() => navigate("/report-setup")} className="shrink-0 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
              View →
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Client Pulse ─────────────────────────────────────────
function ClientPulse() {
  const navigate = useNavigate();
  const { data: healthMap } = useClientHealthScores();
  const { data: clients } = useQuery({
    queryKey: ["recent-clients-dashboard"],
    queryFn: async () => {
      const { data } = await supabase.from("clients")
        .select("id, name, project_status, industry, updated_at")
        .order("updated_at", { ascending: false })
        .limit(8);
      return data || [];
    },
  });

  if (!clients || clients.length === 0) return null;

  return (
    <div className="glass-card rounded-2xl p-5 mb-6">
      <SectionHeader icon={Users} title="Client Pulse" color="text-primary" action={
        <button onClick={() => navigate("/clients")} className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
          View all →
        </button>
      } />
      <div className="space-y-1">
        {clients.map((client: any) => {
          const health = healthMap?.[client.name?.toLowerCase().trim()];
          return (
            <button
              key={client.id}
              onClick={() => navigate("/clients")}
              className="flex items-center gap-3 w-full rounded-xl px-3 py-2.5 hover:bg-secondary/50 transition-colors text-left"
            >
              <HealthDot score={health?.score ?? "yellow"} />
              <span className="text-sm font-medium text-foreground flex-1 truncate">{client.name}</span>
              <span className="text-[10px] text-muted-foreground/50 shrink-0">{client.project_status}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Quick Actions ────────────────────────────────────────
function QuickActions() {
  const navigate = useNavigate();
  const actions = [
    { label: "Run Audit", emoji: "🧠", gradient: "from-primary/15 to-violet/10", border: "border-primary/20 hover:border-primary/40", text: "text-primary", href: "/oddit-brain" },
    { label: "New Report", emoji: "📊", gradient: "from-accent/15 to-electric/10", border: "border-accent/20 hover:border-accent/40", text: "text-accent", href: "/reports" },
    { label: "Competitive Intel", emoji: "🔍", gradient: "from-coral/15 to-gold/10", border: "border-coral/20 hover:border-coral/40", text: "text-coral", href: "/competitive-intel" },
    { label: "Ask Brain", emoji: "⚡", gradient: "from-violet/15 to-primary/10", border: "border-violet/20 hover:border-violet/40", text: "text-violet", href: "/oddit-brain" },
  ];

  return (
    <div className="mb-6">
      <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-[0.14em] mb-2.5">Quick Launch</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {actions.map(({ label, emoji, gradient, border, text, href }) => (
          <button key={label} onClick={() => navigate(href)} className={`flex items-center gap-2.5 rounded-xl border bg-gradient-to-br ${gradient} ${border} px-4 py-3 text-[13px] font-bold ${text} transition-all duration-200 hover:translate-y-[-2px] active:translate-y-0`}>
            <span className="text-lg">{emoji}</span> {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Compact AI News ──────────────────────────────────────
const AI_NEWS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-news`;

function CompactNewsFeed() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, isLoading, error } = useQuery({
    queryKey: ["ai-news", refreshKey],
    queryFn: async () => {
      const res = await fetch(AI_NEWS_URL, { headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } });
      if (res.status === 429) throw new Error("Rate limit — try again in a moment");
      if (res.status === 402) throw new Error("AI credits exhausted");
      if (!res.ok) throw new Error("Failed to fetch news");
      return res.json() as Promise<{ news: NewsItem[]; fetched_at: string }>;
    },
    staleTime: 1000 * 60 * 30,
  });

  return (
    <div className="glass-card rounded-2xl p-5">
      <SectionHeader icon={Newspaper} title="Intel Feed" color="text-electric" action={
        <button onClick={() => setRefreshKey((k) => k + 1)} disabled={isLoading} className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-all disabled:opacity-40">
          <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      } />
      {isLoading ? (
        <div className="space-y-2.5">{[...Array(3)].map((_, i) => <div key={i} className="animate-pulse h-12 rounded-xl bg-muted/40" />)}</div>
      ) : error ? (
        <p className="text-xs text-destructive">{(error as Error).message}</p>
      ) : data?.news && data.news.length > 0 ? (
        <div className="space-y-2">
          {data.news.slice(0, 3).map((item, i) => (
            <div key={i} className="flex items-start gap-2.5 rounded-xl border border-border/40 bg-secondary/30 p-3 hover:bg-secondary/50 transition-colors">
              <span className="text-base shrink-0 mt-0.5">{item.emoji}</span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-foreground leading-snug mb-1 line-clamp-2">{item.title}</p>
                <Badge label={item.category} className={categoryColor[item.category] ?? "text-muted-foreground border-border bg-muted/10"} />
              </div>
            </div>
          ))}
          {data.fetched_at && <p className="text-[10px] text-muted-foreground/40 text-right mt-1">{formatDistanceToNow(new Date(data.fetched_at), { addSuffix: true })}</p>}
        </div>
      ) : (
        <button onClick={() => setRefreshKey((k) => k + 1)} className="w-full py-6 text-center text-xs text-muted-foreground hover:text-foreground transition-colors">
          Click to load intel →
        </button>
      )}
    </div>
  );
}

// ── Greatest Hits (compact) ──────────────────────────────
const SCAN_RECS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-recommendations`;

function GreatestHits() {
  const [isScanning, setIsScanning] = useState(false);
  const qc = useQueryClient();
  const { data: insights, isLoading } = useQuery({
    queryKey: ["recommendation-insights"],
    queryFn: async () => { const { data } = await supabase.from("recommendation_insights").select("*").order("frequency_count", { ascending: false }).limit(5); return data || []; },
  });

  const handleScan = async () => {
    setIsScanning(true);
    try {
      const resp = await fetch(SCAN_RECS_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Scan failed");
      toast.success(`Found ${data.insights?.length || 0} recurring patterns`);
      qc.invalidateQueries({ queryKey: ["recommendation-insights"] });
    } catch (e: any) { toast.error("Scan failed", { description: e.message }); } finally { setIsScanning(false); }
  };

  const catEmoji: Record<string, string> = {
    "Trust Signals": "🛡️", "Copy & Messaging": "✍️", "Visual Hierarchy": "👁️",
    "Social Proof": "⭐", "CTA Optimization": "🎯", "Mobile UX": "📱",
  };

  return (
    <div className="glass-card rounded-2xl p-5">
      <SectionHeader icon={Trophy} title="Top Patterns" color="text-gold" action={
        <button onClick={handleScan} disabled={isScanning} className="flex items-center gap-1 rounded-lg border border-gold/20 bg-gold/5 px-2.5 py-1 text-[11px] font-semibold text-gold hover:bg-gold/10 transition-all disabled:opacity-40">
          {isScanning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />} {isScanning ? "…" : "Scan"}
        </button>
      } />
      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="animate-pulse h-10 rounded-xl bg-muted/40" />)}</div>
      ) : !insights || insights.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">Scan audits to discover patterns</p>
      ) : (
        <div className="space-y-1.5">
          {(insights as any[]).map((insight) => (
            <div key={insight.id} className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-secondary/30 px-3 py-2.5 hover:bg-secondary/50 transition-colors">
              <span className="text-sm shrink-0">{catEmoji[insight.category] || "💡"}</span>
              <p className="text-[13px] font-medium text-foreground flex-1 truncate">{insight.recommendation_text}</p>
              <span className="shrink-0 rounded-full bg-gold/10 border border-gold/20 px-2 py-0.5 text-[10px] font-bold text-gold tabular-nums">×{insight.frequency_count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Recent Activity ──────────────────────────────────────
function RecentActivity() {
  const { data: activity, isLoading } = useActivityLog();

  const activityIcon: Record<string, typeof CheckCircle2> = {
    completed: CheckCircle2, failed: AlertCircle, running: Activity,
  };

  return (
    <div className="glass-card rounded-2xl p-5">
      <SectionHeader icon={Clock} title="Recent Activity" color="text-coral" />
      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="animate-pulse h-9 rounded-xl bg-muted/40" />)}</div>
      ) : !activity || activity.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">No activity yet</p>
      ) : (
        <div className="space-y-0.5">
          {activity.slice(0, 8).map((act) => {
            const Icon = activityIcon[act.status] ?? Activity;
            const iconColor = act.status === "completed" ? "text-accent" : act.status === "failed" ? "text-destructive" : "text-primary";
            return (
              <div key={act.id} className="flex items-center gap-2.5 rounded-xl px-3 py-2 hover:bg-secondary/40 transition-colors">
                <Icon className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} />
                <span className="text-[13px] text-foreground/80 flex-1 truncate">{act.workflow_name}</span>
                <span className="text-[10px] text-muted-foreground/40 shrink-0">{formatDistanceToNow(new Date(act.created_at), { addSuffix: true })}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Draft Modal ──────────────────────────────────────────
function DraftModal({ draft, onClose, onDismiss }: { draft: EmailDraft; onClose: () => void; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => { navigator.clipboard.writeText(`Subject: ${draft.subject_line}\n\n${draft.draft_body}`); setCopied(true); setTimeout(() => setCopied(false), 2000); toast.success("Draft copied"); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✉️</span>
            <div>
              <p className="text-base font-bold text-foreground">{draft.client_name}</p>
              {draft.call_date && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><CalendarDays className="h-3 w-3" />Call on {format(new Date(draft.call_date), "MMM d, yyyy")}</p>}
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-6 pt-4 pb-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-1">Subject</p>
          <p className="text-base font-semibold text-foreground">{draft.subject_line}</p>
        </div>
        <div className="px-6 pt-2 pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-2">Draft</p>
          <div className="rounded-xl border border-border bg-secondary/50 p-4 max-h-72 overflow-y-auto">
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{draft.draft_body}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 border-t border-border px-6 py-4">
          <button onClick={handleCopy} className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-accent-foreground hover:opacity-90 transition-opacity">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied!" : "Review & Copy"}
          </button>
          <button onClick={onDismiss} className="flex items-center gap-2 rounded-xl border border-border bg-secondary px-5 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Dismiss</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────
const Index = () => {
  const { data: pendingDrafts } = useEmailDrafts("pending");
  const updateDraft = useUpdateEmailDraft();
  const [selectedDraft, setSelectedDraft] = useState<EmailDraft | null>(null);

  const pendingCount = pendingDrafts?.length ?? 0;
  const handleDismissDraft = (id: string) => { updateDraft.mutate({ id, status: "dismissed" }); setSelectedDraft(null); toast.success("Draft dismissed"); };

  return (
    <DashboardLayout>
      <HeroBanner actionCount={pendingCount} />
      <StatsRow />
      <AutomationPhaseTracker />
      <QuickActions />
      <ActionQueue pendingDrafts={pendingDrafts || []} onReviewDraft={setSelectedDraft} />
      <ClientPulse />

      {/* Main Grid */}
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-5">
          <RecentActivity />
        </div>
        <div className="lg:col-span-2 space-y-5">
          <CompactNewsFeed />
          <GreatestHits />
        </div>
      </div>

      {selectedDraft && <DraftModal draft={selectedDraft} onClose={() => setSelectedDraft(null)} onDismiss={() => handleDismissDraft(selectedDraft.id)} />}
    </DashboardLayout>
  );
};

export default Index;
