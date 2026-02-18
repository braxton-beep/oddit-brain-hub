import brainMascot from "@/assets/brain-mascot.png";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useEmailDrafts, useUpdateEmailDraft, useActivityLog, type EmailDraft } from "@/hooks/useDashboardData";
import { useClients } from "@/hooks/useClients";
import { useIntegrationCredentials } from "@/hooks/useIntegrationCredentials";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Brain,
  Zap,
  Mail,
  Copy,
  Check,
  X,
  CalendarDays,
  Loader2,
  FileText,
  Trophy,
  ArrowRight,
  RefreshCw,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  Users,
  Activity,
  Newspaper,
  ChevronRight,
  BarChart3,
  Sparkles,
  Twitter,
  Heart,
  Repeat2,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

// ── Types ────────────────────────────────────────────────
interface NewsItem {
  title: string;
  summary: string;
  category: string;
  impact: "High" | "Medium" | "Low";
  emoji: string;
}

// ── Constants ────────────────────────────────────────────
const impactColor: Record<string, string> = {
  High: "text-coral border-coral/30 bg-coral/10",
  Medium: "text-gold border-gold/30 bg-gold/10",
  Low: "text-muted-foreground border-border bg-muted/20",
};

const categoryColor: Record<string, string> = {
  "AI Tools": "text-primary border-primary/20 bg-primary/10",
  Ecommerce: "text-electric border-electric/20 bg-electric/10",
  "UX & Design": "text-violet border-violet/20 bg-violet/10",
  Shopify: "text-accent border-accent/20 bg-accent/10",
  CRO: "text-gold border-gold/20 bg-gold/10",
};

const activityIcon: Record<string, typeof CheckCircle2> = {
  completed: CheckCircle2,
  failed: AlertCircle,
  running: Activity,
};

// ── Small helpers ────────────────────────────────────────
function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${className}`}
    >
      {label}
    </span>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  color,
  action,
}: {
  icon: typeof Brain;
  title: string;
  color: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className={`h-4 w-4 ${color}`} />
      <h2 className="text-xs font-bold text-cream uppercase tracking-widest">{title}</h2>
      {action && <div className="ml-auto">{action}</div>}
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
      const res = await fetch(AI_NEWS_URL, {
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
      });
      if (res.status === 429) throw new Error("Rate limit — try again in a moment");
      if (res.status === 402) throw new Error("AI credits exhausted");
      if (!res.ok) throw new Error("Failed to fetch news");
      return res.json() as Promise<{ news: NewsItem[]; fetched_at: string }>;
    },
    staleTime: 1000 * 60 * 30, // 30 min cache
  });

  return (
    <div className="glow-card rounded-xl bg-card p-5">
      <SectionHeader
        icon={Newspaper}
        title="AI & Ecommerce Intel"
        color="text-electric"
        action={
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse space-y-1.5">
              <div className="h-3.5 w-3/4 rounded bg-muted" />
              <div className="h-3 w-full rounded bg-muted/60" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {(error as Error).message}
        </div>
      ) : data?.news && data.news.length > 0 ? (
        <div className="space-y-3">
          {data.news.map((item, i) => (
            <div
              key={i}
              className="group rounded-xl border border-border bg-secondary p-3.5 hover:border-primary/20 transition-colors"
            >
              <div className="flex items-start gap-2.5">
                <span className="text-lg shrink-0 mt-0.5">{item.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-cream leading-snug mb-1">{item.title}</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">{item.summary}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge
                      label={item.category}
                      className={categoryColor[item.category] ?? "text-muted-foreground border-border bg-muted/20"}
                    />
                    <Badge label={`${item.impact} Impact`} className={impactColor[item.impact]} />
                  </div>
                </div>
              </div>
            </div>
          ))}
          {data.fetched_at && (
            <p className="text-[10px] text-muted-foreground text-right">
              Updated {formatDistanceToNow(new Date(data.fetched_at), { addSuffix: true })}
            </p>
          )}
        </div>
      ) : (
        <div className="py-8 text-center">
          <Newspaper className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-30" />
          <p className="text-xs text-muted-foreground">Click Refresh to load the latest intel.</p>
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
    queryFn: async () => {
      const { data } = await supabase
        .from("recommendation_insights")
        .select("*")
        .order("frequency_count", { ascending: false })
        .limit(8);
      return data || [];
    },
  });

  const handleScan = async () => {
    setIsScanning(true);
    try {
      const resp = await fetch(SCAN_RECS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Scan failed");
      toast.success(`Found ${data.insights?.length || 0} recurring patterns`);
      qc.invalidateQueries({ queryKey: ["recommendation-insights"] });
    } catch (e: any) {
      toast.error("Scan failed", { description: e.message });
    } finally {
      setIsScanning(false);
    }
  };

  const categoryColors: Record<string, string> = {
    "Trust Signals": "text-accent border-accent/30 bg-accent/10",
    "Copy & Messaging": "text-gold border-gold/30 bg-gold/10",
    "Visual Hierarchy": "text-violet border-violet/30 bg-violet/10",
    "Social Proof": "text-primary border-primary/30 bg-primary/10",
    "CTA Optimization": "text-coral border-coral/30 bg-coral/10",
    "Mobile UX": "text-electric border-electric/30 bg-electric/10",
  };

  return (
    <div className="glow-card rounded-xl bg-card p-5">
      <SectionHeader
        icon={Trophy}
        title="Greatest Hits"
        color="text-gold"
        action={
          <button
            onClick={handleScan}
            disabled={isScanning}
            className="flex items-center gap-1.5 rounded-lg border border-gold/30 bg-gold/10 px-2.5 py-1.5 text-[11px] font-bold text-gold hover:bg-gold/20 transition-colors disabled:opacity-40"
          >
            {isScanning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
            {isScanning ? "Scanning…" : "Scan Audits"}
          </button>
        }
      />
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="animate-pulse h-10 rounded-lg bg-muted" />
          ))}
        </div>
      ) : !insights || insights.length === 0 ? (
        <div className="py-8 text-center">
          <Trophy className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-30" />
          <p className="text-xs text-muted-foreground">Scan your audits to discover top patterns.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(insights as any[]).map((insight, i) => {
            const catStyle = categoryColors[insight.category] || "text-muted-foreground border-border bg-muted/20";
            return (
              <div
                key={insight.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-secondary px-3 py-2.5"
              >
                <span className="text-sm font-black text-muted-foreground/30 w-5 shrink-0 tabular-nums">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-cream truncate">{insight.recommendation_text}</p>
                  <span
                    className={`inline-flex mt-1 text-[9px] font-bold rounded-full border px-1.5 py-0.5 ${catStyle}`}
                  >
                    {insight.category}
                  </span>
                </div>
                <span className="shrink-0 rounded-full bg-gold/15 border border-gold/30 px-2 py-0.5 text-[11px] font-bold text-gold whitespace-nowrap">
                  ×{insight.frequency_count}
                </span>
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
  const handleCopy = () => {
    navigator.clipboard.writeText(`Subject: ${draft.subject_line}\n\n${draft.draft_body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Draft copied to clipboard");
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15">
              <Mail className="h-4 w-4 text-accent" />
            </div>
            <div>
              <p className="text-sm font-bold text-cream">{draft.client_name}</p>
              {draft.call_date && (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  <CalendarDays className="h-3 w-3" />
                  Call on {format(new Date(draft.call_date), "MMM d, yyyy")}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 pt-4 pb-2">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Subject</p>
          <p className="text-sm font-semibold text-cream">{draft.subject_line}</p>
        </div>
        <div className="px-6 pt-2 pb-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Draft</p>
          <div className="rounded-xl border border-border bg-secondary p-4 max-h-72 overflow-y-auto">
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{draft.draft_body}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 border-t border-border px-6 py-4">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-accent-foreground hover:opacity-90 transition-opacity"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied!" : "Review & Copy"}
          </button>
          <button
            onClick={onDismiss}
            className="flex items-center gap-2 rounded-xl border border-border bg-secondary px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Dismiss Draft
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tweet Intel Feed ─────────────────────────────────────
const INTEL_TOPICS = ["ai", "figma", "shopify", "web development", "webdev", "ux", "design", "cro", "ecommerce", "llm", "gpt"];

function TweetIntelFeed() {
  const { data: tweets, isLoading } = useQuery({
    queryKey: ["tweet-intel-feed"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("twitter_tweets")
        .select("id, text, like_count, retweet_count, impression_count, created_at_twitter, tweet_type, topics")
        .order("like_count", { ascending: false })
        .limit(300);
      if (error) throw error;
      // Filter client-side to tweets mentioning relevant topics
      return (data ?? []).filter((t) => {
        const lower = t.text.toLowerCase();
        return INTEL_TOPICS.some((kw) => lower.includes(kw));
      }).slice(0, 8);
    },
    staleTime: 1000 * 60 * 5,
  });

  const topicTag = (text: string) => {
    const lower = text.toLowerCase();
    if (lower.includes("figma")) return { label: "Figma", cls: "text-violet border-violet/30 bg-violet/10" };
    if (lower.includes("shopify")) return { label: "Shopify", cls: "text-accent border-accent/30 bg-accent/10" };
    if (lower.includes("ai") || lower.includes("gpt") || lower.includes("llm")) return { label: "AI", cls: "text-primary border-primary/30 bg-primary/10" };
    if (lower.includes("webdev") || lower.includes("web development")) return { label: "Web Dev", cls: "text-electric border-electric/30 bg-electric/10" };
    if (lower.includes("cro") || lower.includes("ecommerce")) return { label: "CRO", cls: "text-gold border-gold/30 bg-gold/10" };
    return { label: "Design", cls: "text-coral border-coral/30 bg-coral/10" };
  };

  return (
    <div className="glow-card rounded-xl bg-card p-5">
      <SectionHeader
        icon={Twitter}
        title="X Tweet Intel"
        color="text-primary"
        action={
          <a
            href="/twitter"
            className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            View all <ArrowRight className="h-3 w-3" />
          </a>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse space-y-1.5">
              <div className="h-3.5 w-full rounded bg-muted" />
              <div className="h-3 w-2/3 rounded bg-muted/60" />
            </div>
          ))}
        </div>
      ) : !tweets || tweets.length === 0 ? (
        <div className="py-8 text-center">
          <Twitter className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-30" />
          <p className="text-xs text-muted-foreground">No relevant tweets yet.</p>
          <a href="/twitter" className="mt-2 inline-block text-xs text-primary hover:underline">
            Sync tweets →
          </a>
        </div>
      ) : (
        <div className="space-y-2.5">
          {tweets.map((tweet) => {
            const tag = topicTag(tweet.text);
            return (
              <div
                key={tweet.id}
                className="rounded-xl border border-border bg-secondary p-3.5 hover:border-primary/20 transition-colors"
              >
                <p className="text-[12px] text-foreground leading-relaxed mb-2.5 line-clamp-3">{tweet.text}</p>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${tag.cls}`}>
                    {tag.label}
                  </span>
                  <div className="flex items-center gap-3 ml-auto text-[10px] text-muted-foreground">
                    {(tweet.like_count ?? 0) > 0 && (
                      <span className="flex items-center gap-1">
                        <Heart className="h-2.5 w-2.5 text-coral" />
                        {tweet.like_count?.toLocaleString()}
                      </span>
                    )}
                    {(tweet.retweet_count ?? 0) > 0 && (
                      <span className="flex items-center gap-1">
                        <Repeat2 className="h-2.5 w-2.5 text-electric" />
                        {tweet.retweet_count?.toLocaleString()}
                      </span>
                    )}
                    {(tweet.impression_count ?? 0) > 0 && (
                      <span className="flex items-center gap-1">
                        <Eye className="h-2.5 w-2.5 text-muted-foreground" />
                        {tweet.impression_count?.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────
const Index = () => {
  const navigate = useNavigate();
  const { data: credentials } = useIntegrationCredentials();
  const { data: pendingDrafts } = useEmailDrafts("pending");
  const { data: activity, isLoading: actLoading } = useActivityLog();
  const { data: clients } = useClients();
  const updateDraft = useUpdateEmailDraft();
  const [selectedDraft, setSelectedDraft] = useState<EmailDraft | null>(null);

  const connectedIds = new Set((credentials ?? []).map((c) => c.integration_id));
  const pendingCount = pendingDrafts?.length ?? 0;

  // Live stats from DB
  const { data: auditStats } = useQuery({
    queryKey: ["audit-stats"],
    queryFn: async () => {
      const [{ count: totalAudits }, { count: pendingAudits }, { count: totalClients }] = await Promise.all([
        supabase.from("cro_audits").select("*", { count: "exact", head: true }),
        supabase.from("cro_audits").select("*", { count: "exact", head: true }).eq("status", "generating"),
        supabase.from("clients").select("*", { count: "exact", head: true }),
      ]);
      return { totalAudits: totalAudits ?? 0, pendingAudits: pendingAudits ?? 0, totalClients: totalClients ?? 0 };
    },
  });

  const { data: tweetStats } = useQuery({
    queryKey: ["tweet-stats-dash"],
    queryFn: async () => {
      const { count } = await supabase.from("twitter_tweets").select("*", { count: "exact", head: true });
      return { total: count ?? 0 };
    },
  });

  const handleDismissDraft = (id: string) => {
    updateDraft.mutate({ id, status: "dismissed" });
    setSelectedDraft(null);
    toast.success("Draft dismissed");
  };

  // Quick nav items
  const quickActions = [
    {
      label: "Run CRO Audit",
      icon: Brain,
      color: "text-primary bg-primary/10 border-primary/20 hover:bg-primary/20",
      href: "/oddit-brain",
    },
    {
      label: "New Report",
      icon: FileText,
      color: "text-accent bg-accent/10 border-accent/20 hover:bg-accent/20",
      href: "/reports",
    },
    {
      label: "Competitive Intel",
      icon: TrendingUp,
      color: "text-coral bg-coral/10 border-coral/20 hover:bg-coral/20",
      href: "/competitive-intel",
    },
    {
      label: "Craft a Tweet",
      icon: Sparkles,
      color: "text-violet bg-violet/10 border-violet/20 hover:bg-violet/20",
      href: "/twitter",
    },
  ];

  // Recent clients (last 3)
  const recentClients = (clients ?? []).slice(0, 3);

  return (
    <DashboardLayout>
      {/* ── Header ────────────────────────────────────────── */}
      <div className="mb-8 flex items-center justify-between animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl overflow-hidden">
            <img src={brainMascot} alt="Oddit Brain" className="h-11 w-11 object-cover" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-cream">Command Center</h1>
            <p className="text-[12px] text-muted-foreground flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
              {connectedIds.size} tools connected
            </p>
          </div>
        </div>

        {/* Pending drafts alert */}
        {pendingCount > 0 && (
          <button
            onClick={() => pendingDrafts?.[0] && setSelectedDraft(pendingDrafts[0])}
            className="flex items-center gap-2 rounded-xl border border-gold/30 bg-gold/10 px-4 py-2 text-sm font-bold text-gold hover:bg-gold/20 transition-colors"
          >
            <Mail className="h-4 w-4" />
            {pendingCount} draft{pendingCount > 1 ? "s" : ""} pending
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ── Stat Row ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8 stagger-children">
        {[
          {
            label: "Clients",
            value: auditStats?.totalClients ?? clients?.length ?? "—",
            icon: Users,
            color: "text-electric",
            bg: "bg-electric/10",
          },
          {
            label: "CRO Audits",
            value: auditStats?.totalAudits ?? "—",
            icon: Brain,
            color: "text-primary",
            bg: "bg-primary/10",
          },
          {
            label: "Tweets Indexed",
            value: tweetStats?.total ?? "—",
            icon: BarChart3,
            color: "text-violet",
            bg: "bg-violet/10",
          },
          { label: "Integrations", value: `${connectedIds.size}`, icon: Zap, color: "text-gold", bg: "bg-gold/10" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="glow-card rounded-xl bg-card p-4">
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${bg} mb-3`}>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <p className="text-2xl font-black text-cream">{value}</p>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* ── Quick Actions ─────────────────────────────────── */}
      <div className="mb-8">
        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Quick Actions</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {quickActions.map(({ label, icon: Icon, color, href }) => (
            <button
              key={label}
              onClick={() => navigate(href)}
              className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-bold transition-all hover:translate-y-[-1px] ${color}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main Grid ─────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left col — AI News + Tweet Intel + Greatest Hits */}
        <div className="lg:col-span-2 space-y-6">
          <AINewsFeed />
          <TweetIntelFeed />
          <GreatestHits />
        </div>

        {/* Right col — Pending Drafts, Recent Clients, Activity */}
        <div className="space-y-6">
          {/* Pending Drafts */}
          {pendingDrafts && pendingDrafts.length > 0 && (
            <div className="glow-card glow-card-gold rounded-xl bg-card p-5">
              <SectionHeader icon={Mail} title="Pending Drafts" color="text-gold" />
              <div className="space-y-2">
                {pendingDrafts.slice(0, 5).map((draft) => (
                  <div
                    key={draft.id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-secondary px-3 py-2.5 hover:border-gold/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-cream truncate">{draft.client_name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{draft.subject_line}</p>
                    </div>
                    <button
                      onClick={() => setSelectedDraft(draft)}
                      className="shrink-0 rounded-lg bg-gold/15 border border-gold/30 px-2.5 py-1 text-[10px] font-bold text-gold hover:bg-gold/25 transition-colors"
                    >
                      Review
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Clients */}
          <div className="glow-card rounded-xl bg-card p-5">
            <SectionHeader
              icon={Users}
              title="Recent Clients"
              color="text-electric"
              action={
                <button
                  onClick={() => navigate("/clients")}
                  className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  View all <ArrowRight className="h-3 w-3" />
                </button>
              }
            />
            {recentClients.length === 0 ? (
              <div className="py-6 text-center">
                <Users className="h-7 w-7 text-muted-foreground mx-auto mb-2 opacity-30" />
                <p className="text-xs text-muted-foreground">No clients yet.</p>
                <button onClick={() => navigate("/clients")} className="mt-2 text-xs text-primary hover:underline">
                  Add first client →
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {recentClients.map((client) => (
                  <div
                    key={client.id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-secondary px-3 py-2.5"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                      {client.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-cream truncate">{client.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {client.industry || client.vertical || "—"}
                      </p>
                    </div>
                    <span
                      className={`text-[9px] font-bold rounded-full border px-1.5 py-0.5 ${
                        client.project_status === "Active"
                          ? "text-accent border-accent/30 bg-accent/10"
                          : "text-muted-foreground border-border bg-muted/20"
                      }`}
                    >
                      {client.project_status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="glow-card rounded-xl bg-card p-5">
            <SectionHeader icon={Clock} title="Recent Activity" color="text-coral" />
            {actLoading ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="animate-pulse h-8 rounded-lg bg-muted" />
                ))}
              </div>
            ) : !activity || activity.length === 0 ? (
              <div className="py-6 text-center">
                <Clock className="h-7 w-7 text-muted-foreground mx-auto mb-2 opacity-30" />
                <p className="text-xs text-muted-foreground">No recent activity.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {activity.slice(0, 8).map((act) => {
                  const Icon = activityIcon[act.status] ?? Activity;
                  const iconColor =
                    act.status === "completed"
                      ? "text-accent"
                      : act.status === "failed"
                        ? "text-destructive"
                        : "text-primary";
                  return (
                    <div
                      key={act.id}
                      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-secondary transition-colors"
                    >
                      <Icon className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} />
                      <span className="text-xs text-cream flex-1 truncate">{act.workflow_name}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(act.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Draft Modal */}
      {selectedDraft && (
        <DraftModal
          draft={selectedDraft}
          onClose={() => setSelectedDraft(null)}
          onDismiss={() => handleDismissDraft(selectedDraft.id)}
        />
      )}
    </DashboardLayout>
  );
};

export default Index;
