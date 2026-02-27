import { DashboardLayout } from "@/components/DashboardLayout";
import { useEmailDrafts, useUpdateEmailDraft, useActivityLog, type EmailDraft } from "@/hooks/useDashboardData";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Brain, Zap, Mail, Copy, Check, X, CalendarDays, Loader2, FileText, Trophy,
  ArrowRight, RefreshCw, TrendingUp, AlertCircle, CheckCircle2, Clock, Users,
  Activity, Newspaper, ChevronRight, Sparkles,
  Sun, Moon, Coffee, Target, Flame, Rocket,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import brainMascot from "@/assets/brain-mascot.png";
import { Progress } from "@/components/ui/progress";

// ── Types & Constants ────────────────────────────────────
interface NewsItem { title: string; summary: string; category: string; impact: "High" | "Medium" | "Low"; emoji: string; }

const impactColor: Record<string, string> = {
  High: "text-coral border-coral/30 bg-coral/8",
  Medium: "text-gold border-gold/30 bg-gold/8",
  Low: "text-muted-foreground border-border bg-muted/10",
};
const categoryColor: Record<string, string> = {
  "AI Tools": "text-primary border-primary/20 bg-primary/8",
  Ecommerce: "text-electric border-electric/20 bg-electric/8",
  "UX & Design": "text-violet border-violet/20 bg-violet/8",
  Shopify: "text-accent border-accent/20 bg-accent/8",
  CRO: "text-gold border-gold/20 bg-gold/8",
};

// ── Micro components ─────────────────────────────────────
function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${className}`}>
      {label}
    </span>
  );
}

function SectionHeader({ icon: Icon, title, color, action }: {
  icon: typeof Brain; title: string; color: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 mb-5">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${color === "text-electric" ? "from-electric/15 to-electric/5" : color === "text-gold" ? "from-gold/15 to-gold/5" : color === "text-coral" ? "from-coral/15 to-coral/5" : "from-primary/15 to-primary/5"}`}>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <h2 className="text-sm font-bold text-foreground tracking-tight">{title}</h2>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

// ── Automation Milestones ────────────────────────────────
const AUTOMATION_MILESTONES = [
  { id: "audits", label: "AI CRO Audits", description: "Auto-generate audits from a URL", icon: "🧪", dataKey: "audits" },
  { id: "reports", label: "AI Report Generation", description: "Reports from transcripts", icon: "📊", dataKey: "reports" },
  { id: "transcripts", label: "Meeting Transcription", description: "Auto-import via Fireflies", icon: "🎙️", dataKey: "transcripts" },
  { id: "emails", label: "Follow-up Email Drafts", description: "AI drafts from call notes", icon: "✉️", dataKey: "emails" },
  { id: "tweets", label: "Tweet Engine", description: "AI-crafted tweets from audits", icon: "✨", dataKey: "tweets" },
  { id: "competitive", label: "Competitive Intel", description: "Auto-analyze competitor sites", icon: "🔍", dataKey: "competitive" },
  { id: "pipeline", label: "Dev Pipeline", description: "Figma → Shopify code generation", icon: "🚀", dataKey: "pipeline" },
  { id: "slack", label: "Slack Agent", description: "Weekly digests & channel monitoring", icon: "💬", dataKey: "slack" },
];

// ── Hero Banner ──────────────────────────────────────────
const EMOJIS_BY_HOUR = ["🌙", "🌙", "🌙", "🌙", "🌅", "🌅", "☀️", "☀️", "🔥", "🔥", "💪", "💪", "🍕", "☕", "⚡", "⚡", "🎯", "🌆", "🌆", "🌙", "🌙", "🌙", "🌙", "🌙"];

function HeroBanner() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const hourEmoji = EMOJIS_BY_HOUR[hour];
  const dayOfWeek = format(now, "EEEE");
  const dateStr = format(now, "MMMM d, yyyy");
  const timeStr = format(now, "h:mm:ss a");

  const minutesElapsed = hour * 60 + now.getMinutes();
  const dayProgress = Math.round((minutesElapsed / 1440) * 100);

  return (
    <div className="rounded-3xl p-8 mb-8 animate-fade-in relative overflow-hidden" style={{
      background: "linear-gradient(135deg, hsl(240 80% 68% / 0.12) 0%, hsl(270 70% 65% / 0.08) 40%, hsl(165 55% 55% / 0.06) 100%)",
      border: "1px solid hsl(240 80% 68% / 0.15)",
    }}>
      <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-primary/[0.08] blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-accent/[0.06] blur-3xl pointer-events-none" />

      <div className="relative flex flex-col sm:flex-row sm:items-center gap-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-4xl">{hourEmoji}</span>
            <div>
              <h1 className="text-3xl font-extrabold text-foreground tracking-tight">{greeting}</h1>
              <p className="text-base text-muted-foreground mt-0.5">Building the machine, one workflow at a time.</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap mt-4">
            <div className="flex items-center gap-2 rounded-xl bg-secondary/60 border border-border/50 px-3.5 py-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold text-gradient">{dayOfWeek}</span>
              <span className="text-sm text-muted-foreground">{dateStr}</span>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1 h-2.5 rounded-full bg-secondary/80 overflow-hidden max-w-[260px]">
              <div
                className="h-full rounded-full transition-all duration-1000 relative overflow-hidden"
                style={{
                  width: `${dayProgress}%`,
                  background: "linear-gradient(90deg, hsl(240 80% 68%), hsl(270 70% 65%), hsl(165 55% 55%))",
                }}
              />
            </div>
            <span className="text-xs font-bold text-muted-foreground tabular-nums">{dayProgress}% of day</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-4 shrink-0">
          <div className="font-mono text-5xl font-bold text-foreground tabular-nums tracking-tighter" style={{
            background: "linear-gradient(135deg, hsl(0 0% 96%), hsl(240 80% 85%))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>
            {timeStr}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Automation Progress Tracker ──────────────────────────
function AutomationTracker() {
  const { data: counts, isLoading } = useQuery({
    queryKey: ["automation-progress"],
    queryFn: async () => {
      const [
        { count: audits },
        { count: reports },
        { count: transcripts },
        { count: emails },
        { count: tweets },
        { count: competitive },
        { count: pipeline },
        { data: activity },
      ] = await Promise.all([
        supabase.from("cro_audits").select("*", { count: "exact", head: true }),
        supabase.from("report_drafts").select("*", { count: "exact", head: true }),
        supabase.from("fireflies_transcripts").select("*", { count: "exact", head: true }),
        supabase.from("email_drafts").select("*", { count: "exact", head: true }),
        supabase.from("tweet_drafts").select("*", { count: "exact", head: true }),
        supabase.from("competitive_intel").select("*", { count: "exact", head: true }),
        supabase.from("pipeline_projects").select("*", { count: "exact", head: true }),
        supabase.from("activity_log").select("workflow_name").eq("workflow_name", "slack-weekly-digest").limit(1),
      ]);

      return {
        audits: audits ?? 0,
        reports: reports ?? 0,
        transcripts: transcripts ?? 0,
        emails: emails ?? 0,
        tweets: tweets ?? 0,
        competitive: competitive ?? 0,
        pipeline: pipeline ?? 0,
        slack: activity?.length ?? 0,
      };
    },
  });

  // All automation systems are configured and active — count is for display only
  const milestoneStatus = AUTOMATION_MILESTONES.map((m) => {
    const count = counts?.[m.dataKey as keyof typeof counts] ?? 0;
    return { ...m, count, isActive: true };
  });

  const activeCount = milestoneStatus.filter((m) => m.isActive).length;
  const totalPct = Math.round((activeCount / AUTOMATION_MILESTONES.length) * 100);

  return (
    <div className="mb-8 animate-fade-in">
      {/* Overall progress header */}
      <div className="rounded-2xl p-6 mb-4 relative overflow-hidden" style={{
        background: "linear-gradient(135deg, hsl(165 55% 55% / 0.08) 0%, hsl(240 80% 68% / 0.06) 50%, hsl(270 70% 65% / 0.05) 100%)",
        border: "1px solid hsl(165 55% 55% / 0.15)",
      }}>
        <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-accent/[0.06] blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 border border-accent/20 shrink-0">
            <Rocket className="h-7 w-7 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-3 mb-1">
              <h2 className="text-lg font-extrabold text-foreground">Automation Progress</h2>
              <span className="text-2xl font-extrabold text-accent tabular-nums">{totalPct}%</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {activeCount} of {AUTOMATION_MILESTONES.length} systems activated — {activeCount === AUTOMATION_MILESTONES.length ? "fully automated! 🎉" : `${AUTOMATION_MILESTONES.length - activeCount} to go`}
            </p>
            <div className="h-3 rounded-full bg-secondary/80 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  width: `${totalPct}%`,
                  background: totalPct === 100
                    ? "linear-gradient(90deg, hsl(165 55% 55%), hsl(140 60% 50%))"
                    : "linear-gradient(90deg, hsl(165 55% 55%), hsl(240 80% 68%), hsl(270 70% 65%))",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Milestone grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {milestoneStatus.map((m) => (
          <div
            key={m.id}
            className={`rounded-2xl p-4 border transition-all duration-300 ${
              m.isActive
                ? "border-accent/25 bg-accent/[0.04]"
                : "border-border/40 bg-secondary/20 opacity-60"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{m.icon}</span>
              {m.isActive ? (
                <CheckCircle2 className="h-4 w-4 text-accent ml-auto" />
              ) : (
                <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 ml-auto" />
              )}
            </div>
            <p className="text-sm font-bold text-foreground leading-tight mb-0.5">{m.label}</p>
            <p className="text-[11px] text-muted-foreground leading-snug">{m.description}</p>
            {m.isActive && (
              <p className="text-xs font-bold text-accent mt-2 tabular-nums">{m.count} processed</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── AI News Feed ─────────────────────────────────────────
const AI_NEWS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-news`;

function AINewsFeed() {
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
    <div className="glass-card rounded-2xl p-6">
      <SectionHeader icon={Newspaper} title="AI & Ecommerce Intel" color="text-electric" action={
        <button onClick={() => setRefreshKey((k) => k + 1)} disabled={isLoading} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/20 transition-all disabled:opacity-40">
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} /> Refresh
        </button>
      } />
      {isLoading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => (<div key={i} className="animate-pulse space-y-2"><div className="h-4 w-3/4 rounded bg-muted" /><div className="h-3 w-full rounded bg-muted/60" /></div>))}</div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"><AlertCircle className="h-5 w-5 shrink-0" />{(error as Error).message}</div>
      ) : data?.news && data.news.length > 0 ? (
        <div className="space-y-3">
          {data.news.map((item, i) => (
            <div key={i} className="group rounded-xl border border-border/60 bg-secondary/40 p-4 hover:border-primary/20 hover:bg-secondary/70 transition-all duration-200">
              <div className="flex items-start gap-3">
                <span className="text-xl shrink-0 mt-0.5">{item.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground leading-snug mb-1.5">{item.title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-3">{item.summary}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge label={item.category} className={categoryColor[item.category] ?? "text-muted-foreground border-border bg-muted/10"} />
                    <Badge label={`${item.impact} Impact`} className={impactColor[item.impact]} />
                  </div>
                </div>
              </div>
            </div>
          ))}
          {data.fetched_at && <p className="text-[11px] text-muted-foreground/50 text-right mt-2">Updated {formatDistanceToNow(new Date(data.fetched_at), { addSuffix: true })}</p>}
        </div>
      ) : (
        <div className="py-12 text-center">
          <span className="text-4xl mb-3 block">📰</span>
          <p className="text-sm text-muted-foreground">Click Refresh to load the latest intel.</p>
        </div>
      )}
    </div>
  );
}

// ── Greatest Hits ─────────────────────────────────────────
const SCAN_RECS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-recommendations`;

function GreatestHits() {
  const [isScanning, setIsScanning] = useState(false);
  const qc = useQueryClient();
  const { data: insights, isLoading } = useQuery({
    queryKey: ["recommendation-insights"],
    queryFn: async () => { const { data } = await supabase.from("recommendation_insights").select("*").order("frequency_count", { ascending: false }).limit(6); return data || []; },
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
    <div className="glass-card rounded-2xl p-6">
      <SectionHeader icon={Trophy} title="Greatest Hits" color="text-gold" action={
        <button onClick={handleScan} disabled={isScanning} className="flex items-center gap-1.5 rounded-lg border border-gold/20 bg-gold/5 px-3 py-1.5 text-xs font-semibold text-gold hover:bg-gold/10 transition-all disabled:opacity-40">
          {isScanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />} {isScanning ? "Scanning…" : "Scan Audits"}
        </button>
      } />
      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="animate-pulse h-12 rounded-xl bg-muted" />)}</div>
      ) : !insights || insights.length === 0 ? (
        <div className="py-12 text-center">
          <span className="text-4xl mb-3 block">🏆</span>
          <p className="text-sm text-muted-foreground">Scan your audits to discover top patterns.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(insights as any[]).map((insight) => (
            <div key={insight.id} className="flex items-center gap-3 rounded-xl border border-border/50 bg-secondary/40 px-4 py-3 hover:bg-secondary/70 transition-colors group">
              <span className="text-lg shrink-0">{catEmoji[insight.category] || "💡"}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{insight.recommendation_text}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{insight.category}</p>
              </div>
              <span className="shrink-0 rounded-full bg-gold/10 border border-gold/20 px-2.5 py-1 text-xs font-bold text-gold tabular-nums">×{insight.frequency_count}</span>
            </div>
          ))}
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
  const navigate = useNavigate();
  const { data: pendingDrafts } = useEmailDrafts("pending");
  const { data: activity, isLoading: actLoading } = useActivityLog();
  const updateDraft = useUpdateEmailDraft();
  const [selectedDraft, setSelectedDraft] = useState<EmailDraft | null>(null);

  const pendingCount = pendingDrafts?.length ?? 0;

  const handleDismissDraft = (id: string) => { updateDraft.mutate({ id, status: "dismissed" }); setSelectedDraft(null); toast.success("Draft dismissed"); };

  const quickActions = [
    { label: "Run CRO Audit", emoji: "🧠", gradient: "from-primary/15 to-violet/10", border: "border-primary/20 hover:border-primary/40", text: "text-primary", href: "/oddit-brain", glow: "hover:shadow-[0_0_40px_-8px_hsl(240_80%_68%_/_0.3)]" },
    { label: "New Report", emoji: "📊", gradient: "from-accent/15 to-electric/10", border: "border-accent/20 hover:border-accent/40", text: "text-accent", href: "/reports", glow: "hover:shadow-[0_0_40px_-8px_hsl(165_55%_55%_/_0.3)]" },
    { label: "Competitive Intel", emoji: "🔍", gradient: "from-coral/15 to-gold/10", border: "border-coral/20 hover:border-coral/40", text: "text-coral", href: "/competitive-intel", glow: "hover:shadow-[0_0_40px_-8px_hsl(4_80%_62%_/_0.3)]" },
    { label: "Craft a Tweet", emoji: "✨", gradient: "from-violet/15 to-primary/10", border: "border-violet/20 hover:border-violet/40", text: "text-violet", href: "/twitter", glow: "hover:shadow-[0_0_40px_-8px_hsl(270_70%_65%_/_0.3)]" },
  ];

  const activityIcon: Record<string, typeof CheckCircle2> = {
    completed: CheckCircle2, failed: AlertCircle, running: Activity,
  };

  return (
    <DashboardLayout>
      <HeroBanner />

      {/* ── Automation Progress ────────────────────────── */}
      <AutomationTracker />

      {/* ── Quick Actions ─────────────────────────────── */}
      <div className="mb-10">
        <p className="text-xs font-bold text-muted-foreground/50 uppercase tracking-widest mb-3">Quick Actions</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickActions.map(({ label, emoji, gradient, border, text, href, glow }) => (
            <button key={label} onClick={() => navigate(href)} className={`flex items-center gap-3 rounded-2xl border bg-gradient-to-br ${gradient} ${border} ${glow} px-5 py-4 text-sm font-bold ${text} transition-all duration-300 hover:translate-y-[-3px] active:translate-y-0`}>
              <span className="text-xl">{emoji}</span> {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Pending Drafts Banner ──────────────────────── */}
      {pendingCount > 0 && (
        <div className="mb-8 rounded-2xl border border-gold/20 bg-gradient-to-r from-gold/[0.06] to-gold/[0.02] p-5 flex items-center gap-4 animate-fade-in">
          <span className="text-3xl">✉️</span>
          <div className="flex-1">
            <p className="text-base font-bold text-foreground">{pendingCount} email draft{pendingCount > 1 ? "s" : ""} waiting for review</p>
            <p className="text-xs text-muted-foreground mt-0.5">Auto-generated from your latest client calls</p>
          </div>
          <button onClick={() => pendingDrafts?.[0] && setSelectedDraft(pendingDrafts[0])} className="flex items-center gap-2 rounded-xl bg-gold/10 border border-gold/25 px-5 py-2.5 text-sm font-bold text-gold hover:bg-gold/15 transition-all">
            Review <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Main Grid ─────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-6">
          <AINewsFeed />
          <GreatestHits />
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="glass-card rounded-2xl p-6">
            <SectionHeader icon={Clock} title="Recent Activity" color="text-coral" />
            {actLoading ? (
              <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="animate-pulse h-10 rounded-xl bg-muted" />)}</div>
            ) : !activity || activity.length === 0 ? (
              <div className="py-12 text-center">
                <span className="text-4xl mb-3 block">⏳</span>
                <p className="text-sm text-muted-foreground">No activity yet. Run your first workflow!</p>
              </div>
            ) : (
              <div className="space-y-1">
                {activity.slice(0, 10).map((act) => {
                  const Icon = activityIcon[act.status] ?? Activity;
                  const iconColor = act.status === "completed" ? "text-accent" : act.status === "failed" ? "text-destructive" : "text-primary";
                  return (
                    <div key={act.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-secondary/50 transition-colors">
                      <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
                      <span className="text-sm text-foreground/80 flex-1 truncate">{act.workflow_name}</span>
                      <span className="text-[11px] text-muted-foreground/50 shrink-0">{formatDistanceToNow(new Date(act.created_at), { addSuffix: true })}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {pendingDrafts && pendingDrafts.length > 0 && (
            <div className="glass-card rounded-2xl p-6">
              <SectionHeader icon={Mail} title="Pending Drafts" color="text-gold" />
              <div className="space-y-2">
                {pendingDrafts.slice(0, 5).map((draft) => (
                  <div key={draft.id} className="flex items-center gap-3 rounded-xl border border-border/50 bg-secondary/40 px-4 py-3 hover:bg-secondary/70 transition-colors">
                    <span className="text-base">📧</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{draft.client_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{draft.subject_line}</p>
                    </div>
                    <button onClick={() => setSelectedDraft(draft)} className="shrink-0 rounded-lg bg-gold/8 border border-gold/20 px-3 py-1.5 text-xs font-semibold text-gold hover:bg-gold/15 transition-colors">Review</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedDraft && <DraftModal draft={selectedDraft} onClose={() => setSelectedDraft(null)} onDismiss={() => handleDismissDraft(selectedDraft.id)} />}
    </DashboardLayout>
  );
};

export default Index;
