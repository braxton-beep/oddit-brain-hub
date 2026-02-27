import { DashboardLayout } from "@/components/DashboardLayout";
import { useEmailDrafts, useUpdateEmailDraft, useActivityLog, type EmailDraft } from "@/hooks/useDashboardData";
import { useClients } from "@/hooks/useClients";
import { useIntegrationCredentials } from "@/hooks/useIntegrationCredentials";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Brain, Zap, Mail, Copy, Check, X, CalendarDays, Loader2, FileText, Trophy,
  ArrowRight, RefreshCw, TrendingUp, AlertCircle, CheckCircle2, Clock, Users,
  Activity, Newspaper, ChevronRight, BarChart3, Sparkles, Twitter, Heart,
  Repeat2, Eye, Rocket, Sun, Moon, CloudSun, Coffee,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

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
const activityIcon: Record<string, typeof CheckCircle2> = {
  completed: CheckCircle2, failed: AlertCircle, running: Activity,
};

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
    <div className="flex items-center gap-2 mb-4">
      <Icon className={`h-4 w-4 ${color}`} />
      <h2 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.1em]">{title}</h2>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

// ── Hero Banner ──────────────────────────────────────────
const CRO_TIPS = [
  "Social proof above the fold increases conversions by up to 34%.",
  "Reducing form fields from 4 to 3 can boost completion by 50%.",
  "Free shipping thresholds drive 24% higher average order values.",
  "Sticky add-to-cart buttons lift mobile conversions by 8%.",
  "Trust badges near CTAs reduce abandonment by 18%.",
  "Urgency copy works — but only when it's honest.",
  "Video on product pages can increase purchase intent by 144%.",
  "A/B test one thing at a time. Multivariate = noise.",
  "Page speed: every 100ms delay costs 1% in conversions.",
  "Your best-performing CTA color? The one that contrasts most.",
];

function HeroBanner() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const GreetIcon = hour < 12 ? Coffee : hour < 17 ? Sun : Moon;

  const dayOfWeek = format(now, "EEEE");
  const dateStr = format(now, "MMMM d, yyyy");
  const timeStr = format(now, "h:mm:ss a");

  // Day progress (0-100)
  const minutesElapsed = hour * 60 + now.getMinutes();
  const dayProgress = Math.round((minutesElapsed / 1440) * 100);

  // Tip of the day based on day-of-year
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  const todayTip = CRO_TIPS[dayOfYear % CRO_TIPS.length];

  // Week number
  const weekNum = Math.ceil(((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000 + new Date(now.getFullYear(), 0, 1).getDay() + 1) / 7);

  return (
    <div className="glass-card rounded-2xl p-6 mb-8 animate-fade-in relative overflow-hidden">
      {/* Decorative gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.06] via-violet/[0.03] to-accent/[0.04] pointer-events-none" />
      <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-primary/[0.06] blur-3xl pointer-events-none" />

      <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
        {/* Left: Greeting + Date */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <GreetIcon className="h-5 w-5 text-gold" />
            <h1 className="text-lg font-extrabold text-foreground">{greeting}</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-gradient">{dayOfWeek}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{dateStr}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-[11px] text-muted-foreground/70">Week {weekNum}</span>
          </div>

          {/* Day progress */}
          <div className="mt-3 flex items-center gap-2.5">
            <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden max-w-[200px]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary via-violet to-accent transition-all duration-1000"
                style={{ width: `${dayProgress}%` }}
              />
            </div>
            <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">{dayProgress}% of day</span>
          </div>
        </div>

        {/* Right: Clock + Tip */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="font-mono text-2xl font-bold text-foreground tabular-nums tracking-tight">
            {timeStr}
          </div>
          <div className="flex items-start gap-1.5 max-w-[280px]">
            <Sparkles className="h-3 w-3 text-gold shrink-0 mt-0.5" />
            <p className="text-[10px] text-muted-foreground leading-relaxed italic">"{todayTip}"</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function OnboardingCard() {
  const { data: credentials } = useIntegrationCredentials();
  const { data: clients } = useClients();
  const [dismissed, setDismissed] = useState(() => {
    try { return JSON.parse(localStorage.getItem("onboarding_dismissed") ?? "false"); } catch { return false; }
  });
  const { data: tweetCount } = useQuery({ queryKey: ["onboard-tweet-count"], queryFn: async () => { const { count } = await supabase.from("twitter_tweets").select("*", { count: "exact", head: true }); return count ?? 0; } });
  const { data: transcriptCount } = useQuery({ queryKey: ["onboard-transcript-count"], queryFn: async () => { const { count } = await supabase.from("fireflies_transcripts").select("*", { count: "exact", head: true }); return count ?? 0; } });
  const { data: auditCount } = useQuery({ queryKey: ["onboard-audit-count"], queryFn: async () => { const { count } = await supabase.from("cro_audits").select("*", { count: "exact", head: true }); return count ?? 0; } });

  if (dismissed) return null;
  const connectedIds = new Set((credentials ?? []).map((c) => c.integration_id));
  const steps = [
    { label: "Connect OpenAI API key", done: connectedIds.has("openai") },
    { label: "Connect Twitter/X", done: connectedIds.has("twitter-consumer-key") || (tweetCount ?? 0) > 0 },
    { label: "Sync Meeting Transcripts", done: (transcriptCount ?? 0) > 0 },
    { label: "Add First Client", done: (clients?.length ?? 0) > 0 },
    { label: "Run First CRO Audit", done: (auditCount ?? 0) > 0 },
  ];
  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;

  return (
    <div className="glass-card rounded-2xl p-6 mb-8 animate-fade-in relative overflow-hidden">
      {/* Subtle gradient accent */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] via-transparent to-accent/[0.02] pointer-events-none" />
      <div className="relative">
        {allDone && (
          <button onClick={() => { setDismissed(true); localStorage.setItem("onboarding_dismissed", "true"); }} className="absolute top-0 right-0 text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        )}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-violet/10">
            <Rocket className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-foreground">Get Started with Oddit Brain</h2>
            <p className="text-xs text-muted-foreground">{completedCount} of {steps.length} complete</p>
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden mb-5">
          <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-700 ease-out" style={{ width: `${(completedCount / steps.length) * 100}%` }} />
        </div>
        <div className="space-y-2.5">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              {step.done ? <CheckCircle2 className="h-4 w-4 text-accent shrink-0" /> : <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/20 shrink-0" />}
              <span className={`text-[13px] ${step.done ? "text-muted-foreground/50 line-through" : "text-foreground"}`}>{step.label}</span>
            </div>
          ))}
        </div>
        {allDone && <p className="text-xs text-accent font-semibold mt-4">🎉 All set — your Brain is ready.</p>}
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
    <div className="glass-card rounded-2xl p-5">
      <SectionHeader icon={Newspaper} title="AI & Ecommerce Intel" color="text-electric" action={
        <button onClick={() => setRefreshKey((k) => k + 1)} disabled={isLoading} className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:border-primary/20 transition-all disabled:opacity-40">
          <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} /> Refresh
        </button>
      } />
      {isLoading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => (<div key={i} className="animate-pulse space-y-1.5"><div className="h-3.5 w-3/4 rounded bg-muted" /><div className="h-3 w-full rounded bg-muted/60" /></div>))}</div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive"><AlertCircle className="h-4 w-4 shrink-0" />{(error as Error).message}</div>
      ) : data?.news && data.news.length > 0 ? (
        <div className="space-y-2.5">
          {data.news.map((item, i) => (
            <div key={i} className="group rounded-xl border border-border/60 bg-secondary/50 p-3.5 hover:border-primary/15 hover:bg-secondary/80 transition-all">
              <div className="flex items-start gap-2.5">
                <span className="text-base shrink-0 mt-0.5">{item.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-foreground leading-snug mb-1">{item.title}</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">{item.summary}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge label={item.category} className={categoryColor[item.category] ?? "text-muted-foreground border-border bg-muted/10"} />
                    <Badge label={`${item.impact} Impact`} className={impactColor[item.impact]} />
                  </div>
                </div>
              </div>
            </div>
          ))}
          {data.fetched_at && <p className="text-[10px] text-muted-foreground/60 text-right">Updated {formatDistanceToNow(new Date(data.fetched_at), { addSuffix: true })}</p>}
        </div>
      ) : (
        <div className="py-10 text-center"><Newspaper className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-20" /><p className="text-xs text-muted-foreground">Click Refresh to load the latest intel.</p></div>
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
    queryFn: async () => { const { data } = await supabase.from("recommendation_insights").select("*").order("frequency_count", { ascending: false }).limit(8); return data || []; },
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

  const catColors: Record<string, string> = {
    "Trust Signals": "text-accent border-accent/20 bg-accent/8",
    "Copy & Messaging": "text-gold border-gold/20 bg-gold/8",
    "Visual Hierarchy": "text-violet border-violet/20 bg-violet/8",
    "Social Proof": "text-primary border-primary/20 bg-primary/8",
    "CTA Optimization": "text-coral border-coral/20 bg-coral/8",
    "Mobile UX": "text-electric border-electric/20 bg-electric/8",
  };

  return (
    <div className="glass-card rounded-2xl p-5">
      <SectionHeader icon={Trophy} title="Greatest Hits" color="text-gold" action={
        <button onClick={handleScan} disabled={isScanning} className="flex items-center gap-1.5 rounded-lg border border-gold/20 bg-gold/5 px-2.5 py-1.5 text-[11px] font-semibold text-gold hover:bg-gold/10 transition-all disabled:opacity-40">
          {isScanning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />} {isScanning ? "Scanning…" : "Scan Audits"}
        </button>
      } />
      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="animate-pulse h-10 rounded-lg bg-muted" />)}</div>
      ) : !insights || insights.length === 0 ? (
        <div className="py-10 text-center"><Trophy className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-20" /><p className="text-xs text-muted-foreground">Scan your audits to discover top patterns.</p></div>
      ) : (
        <div className="space-y-1.5">
          {(insights as any[]).map((insight, i) => {
            const catStyle = catColors[insight.category] || "text-muted-foreground border-border bg-muted/10";
            return (
              <div key={insight.id} className="flex items-center gap-3 rounded-xl border border-border/50 bg-secondary/40 px-3 py-2.5 hover:bg-secondary/70 transition-colors">
                <span className="text-sm font-black text-muted-foreground/25 w-5 shrink-0 tabular-nums">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{insight.recommendation_text}</p>
                  <Badge label={insight.category} className={`mt-1 ${catStyle}`} />
                </div>
                <span className="shrink-0 rounded-full bg-gold/10 border border-gold/20 px-2 py-0.5 text-[11px] font-bold text-gold tabular-nums">×{insight.frequency_count}</span>
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
      <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10"><Mail className="h-4 w-4 text-accent" /></div>
            <div>
              <p className="text-sm font-bold text-foreground">{draft.client_name}</p>
              {draft.call_date && <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5"><CalendarDays className="h-3 w-3" />Call on {format(new Date(draft.call_date), "MMM d, yyyy")}</p>}
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-6 pt-4 pb-2"><p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-1">Subject</p><p className="text-sm font-semibold text-foreground">{draft.subject_line}</p></div>
        <div className="px-6 pt-2 pb-4"><p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-2">Draft</p>
          <div className="rounded-xl border border-border bg-secondary/50 p-4 max-h-72 overflow-y-auto"><p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{draft.draft_body}</p></div>
        </div>
        <div className="flex items-center gap-3 border-t border-border px-6 py-4">
          <button onClick={handleCopy} className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-accent-foreground hover:opacity-90 transition-opacity">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied!" : "Review & Copy"}
          </button>
          <button onClick={onDismiss} className="flex items-center gap-2 rounded-xl border border-border bg-secondary px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Dismiss Draft</button>
        </div>
      </div>
    </div>
  );
}

// ── Tweet Intel ──────────────────────────────────────────
const INTEL_TOPICS = ["ai", "figma", "shopify", "web development", "webdev", "ux", "design", "cro", "ecommerce", "llm", "gpt"];

function TweetIntelFeed() {
  const { data: tweets, isLoading } = useQuery({
    queryKey: ["tweet-intel-feed"],
    queryFn: async () => {
      const { data, error } = await supabase.from("twitter_tweets").select("id, text, like_count, retweet_count, impression_count, created_at_twitter, tweet_type, topics").order("like_count", { ascending: false }).limit(300);
      if (error) throw error;
      return (data ?? []).filter((t) => { const lower = t.text.toLowerCase(); return INTEL_TOPICS.some((kw) => lower.includes(kw)); }).slice(0, 8);
    },
    staleTime: 1000 * 60 * 5,
  });

  const topicTag = (text: string) => {
    const lower = text.toLowerCase();
    if (lower.includes("figma")) return { label: "Figma", cls: "text-violet border-violet/20 bg-violet/8" };
    if (lower.includes("shopify")) return { label: "Shopify", cls: "text-accent border-accent/20 bg-accent/8" };
    if (lower.includes("ai") || lower.includes("gpt") || lower.includes("llm")) return { label: "AI", cls: "text-primary border-primary/20 bg-primary/8" };
    if (lower.includes("webdev") || lower.includes("web development")) return { label: "Web Dev", cls: "text-electric border-electric/20 bg-electric/8" };
    if (lower.includes("cro") || lower.includes("ecommerce")) return { label: "CRO", cls: "text-gold border-gold/20 bg-gold/8" };
    return { label: "Design", cls: "text-coral border-coral/20 bg-coral/8" };
  };

  return (
    <div className="glass-card rounded-2xl p-5">
      <SectionHeader icon={Twitter} title="X Tweet Intel" color="text-primary" action={
        <a href="/twitter" className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">View all <ArrowRight className="h-3 w-3" /></a>
      } />
      {isLoading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => (<div key={i} className="animate-pulse space-y-1.5"><div className="h-3.5 w-full rounded bg-muted" /><div className="h-3 w-2/3 rounded bg-muted/60" /></div>))}</div>
      ) : !tweets || tweets.length === 0 ? (
        <div className="py-10 text-center"><Twitter className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-20" /><p className="text-xs text-muted-foreground">No relevant tweets yet.</p><a href="/twitter" className="mt-2 inline-block text-xs text-primary hover:underline">Sync tweets →</a></div>
      ) : (
        <div className="space-y-2">
          {tweets.map((tweet) => {
            const tag = topicTag(tweet.text);
            return (
              <div key={tweet.id} className="rounded-xl border border-border/50 bg-secondary/40 p-3.5 hover:bg-secondary/70 hover:border-primary/15 transition-all">
                <p className="text-[12px] text-foreground/90 leading-relaxed mb-2.5 line-clamp-3">{tweet.text}</p>
                <div className="flex items-center gap-3">
                  <Badge label={tag.label} className={tag.cls} />
                  <div className="flex items-center gap-3 ml-auto text-[10px] text-muted-foreground">
                    {(tweet.like_count ?? 0) > 0 && <span className="flex items-center gap-1"><Heart className="h-2.5 w-2.5 text-coral" />{tweet.like_count?.toLocaleString()}</span>}
                    {(tweet.retweet_count ?? 0) > 0 && <span className="flex items-center gap-1"><Repeat2 className="h-2.5 w-2.5 text-electric" />{tweet.retweet_count?.toLocaleString()}</span>}
                    {(tweet.impression_count ?? 0) > 0 && <span className="flex items-center gap-1"><Eye className="h-2.5 w-2.5" />{tweet.impression_count?.toLocaleString()}</span>}
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
    queryFn: async () => { const { count } = await supabase.from("twitter_tweets").select("*", { count: "exact", head: true }); return { total: count ?? 0 }; },
  });

  const handleDismissDraft = (id: string) => { updateDraft.mutate({ id, status: "dismissed" }); setSelectedDraft(null); toast.success("Draft dismissed"); };

  const quickActions = [
    { label: "Run CRO Audit", icon: Brain, gradient: "from-primary/20 via-violet/10 to-transparent", border: "border-primary/20 hover:border-primary/40", text: "text-primary", href: "/oddit-brain", glow: "hover:shadow-[0_0_30px_-8px_hsl(240_80%_68%_/_0.25)]" },
    { label: "New Report", icon: FileText, gradient: "from-accent/20 via-electric/10 to-transparent", border: "border-accent/20 hover:border-accent/40", text: "text-accent", href: "/reports", glow: "hover:shadow-[0_0_30px_-8px_hsl(165_55%_55%_/_0.25)]" },
    { label: "Competitive Intel", icon: TrendingUp, gradient: "from-coral/20 via-gold/10 to-transparent", border: "border-coral/20 hover:border-coral/40", text: "text-coral", href: "/competitive-intel", glow: "hover:shadow-[0_0_30px_-8px_hsl(4_80%_62%_/_0.25)]" },
    { label: "Craft a Tweet", icon: Sparkles, gradient: "from-violet/20 via-primary/10 to-transparent", border: "border-violet/20 hover:border-violet/40", text: "text-violet", href: "/twitter", glow: "hover:shadow-[0_0_30px_-8px_hsl(270_70%_65%_/_0.25)]" },
  ];

  const recentClients = (clients ?? []).slice(0, 3);

  return (
    <DashboardLayout>
      {/* ── Header ────────────────────────────────────── */}
      <div className="mb-10 flex items-center justify-between animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 rounded-xl bg-primary/20 blur-xl" />
            <svg viewBox="0 0 44 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="relative h-7 w-auto">
              <circle cx="10" cy="12" r="9" stroke="hsl(var(--primary))" strokeWidth="3.5"/>
              <circle cx="10" cy="12" r="4" fill="hsl(var(--primary))"/>
              <circle cx="34" cy="12" r="9" stroke="hsl(var(--primary))" strokeWidth="3.5"/>
              <circle cx="34" cy="12" r="4" fill="hsl(var(--primary))"/>
            </svg>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-extrabold tracking-tight text-gradient">oddit</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Dashboard</span>
            </div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent animate-glow-pulse" />
              {connectedIds.size} tools connected
            </p>
          </div>
        </div>

        {pendingCount > 0 && (
          <button onClick={() => pendingDrafts?.[0] && setSelectedDraft(pendingDrafts[0])} className="flex items-center gap-2 rounded-xl border border-gold/25 bg-gradient-to-r from-gold/10 to-gold/5 px-4 py-2 text-sm font-semibold text-gold hover:from-gold/15 hover:to-gold/10 hover:shadow-[0_0_24px_-6px_hsl(40_95%_58%_/_0.2)] transition-all">
            <Mail className="h-4 w-4" /> {pendingCount} draft{pendingCount > 1 ? "s" : ""} pending <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <HeroBanner />
      <OnboardingCard />

      {/* ── Stat Row ──────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8 stagger-children">
        {[
          { label: "Clients", value: auditStats?.totalClients ?? clients?.length ?? "—", icon: Users, color: "text-electric", gradient: "from-electric/15 via-electric/5 to-transparent", glowClass: "stat-glow-electric" },
          { label: "CRO Audits", value: auditStats?.totalAudits ?? "—", icon: Brain, color: "text-primary", gradient: "from-primary/15 via-primary/5 to-transparent", glowClass: "stat-glow-primary" },
          { label: "Tweets Indexed", value: tweetStats?.total ?? "—", icon: BarChart3, color: "text-violet", gradient: "from-violet/15 via-violet/5 to-transparent", glowClass: "stat-glow-violet" },
          { label: "Integrations", value: `${connectedIds.size}`, icon: Zap, color: "text-gold", gradient: "from-gold/15 via-gold/5 to-transparent", glowClass: "stat-glow-gold" },
        ].map(({ label, value, icon: Icon, color, gradient, glowClass }) => (
          <div key={label} className="glass-card gradient-border rounded-2xl p-4 relative overflow-hidden group hover:translate-y-[-2px] transition-all duration-300">
            <div className={`absolute inset-0 ${glowClass} opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`} />
            <div className={`absolute inset-0 bg-gradient-to-br ${gradient} pointer-events-none opacity-70 group-hover:opacity-100 transition-opacity`} />
            <div className="relative">
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} mb-3`}>
                <Icon className={`h-5 w-5 ${color}`} />
              </div>
              <p className="text-2xl font-extrabold text-foreground tabular-nums">{value}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-[0.1em] mt-1 font-medium">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Quick Actions ─────────────────────────────── */}
      <div className="mb-8">
        <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-[0.12em] mb-3">Quick Actions</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {quickActions.map(({ label, icon: Icon, gradient, border, text, href, glow }) => (
            <button key={label} onClick={() => navigate(href)} className={`flex items-center gap-2.5 rounded-xl border bg-gradient-to-br ${gradient} ${border} ${glow} px-4 py-3 text-[13px] font-semibold ${text} transition-all duration-300 hover:translate-y-[-2px] active:translate-y-0`}>
              <Icon className="h-4 w-4 shrink-0" /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main Grid ─────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <AINewsFeed />
          <TweetIntelFeed />
          <GreatestHits />
        </div>

        <div className="space-y-5">
          {pendingDrafts && pendingDrafts.length > 0 && (
            <div className="glass-card rounded-2xl p-5">
              <SectionHeader icon={Mail} title="Pending Drafts" color="text-gold" />
              <div className="space-y-1.5">
                {pendingDrafts.slice(0, 5).map((draft) => (
                  <div key={draft.id} className="flex items-center gap-3 rounded-xl border border-border/50 bg-secondary/40 px-3 py-2.5 hover:bg-secondary/70 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{draft.client_name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{draft.subject_line}</p>
                    </div>
                    <button onClick={() => setSelectedDraft(draft)} className="shrink-0 rounded-lg bg-gold/8 border border-gold/20 px-2.5 py-1 text-[10px] font-semibold text-gold hover:bg-gold/15 transition-colors">Review</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="glass-card rounded-2xl p-5">
            <SectionHeader icon={Users} title="Recent Clients" color="text-electric" action={
              <button onClick={() => navigate("/clients")} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">View all <ArrowRight className="h-3 w-3" /></button>
            } />
            {recentClients.length === 0 ? (
              <div className="py-8 text-center"><Users className="h-7 w-7 text-muted-foreground mx-auto mb-2 opacity-20" /><p className="text-xs text-muted-foreground">No clients yet.</p><button onClick={() => navigate("/clients")} className="mt-2 text-xs text-primary hover:underline">Add first client →</button></div>
            ) : (
              <div className="space-y-1.5">
                {recentClients.map((client) => (
                  <div key={client.id} className="flex items-center gap-3 rounded-xl border border-border/50 bg-secondary/40 px-3 py-2.5 hover:bg-secondary/70 transition-colors">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">{client.name.charAt(0).toUpperCase()}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{client.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{client.industry || client.vertical || "—"}</p>
                    </div>
                    <Badge label={client.project_status} className={client.project_status === "Active" ? "text-accent border-accent/20 bg-accent/8" : "text-muted-foreground border-border bg-muted/10"} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="glass-card rounded-2xl p-5">
            <SectionHeader icon={Clock} title="Recent Activity" color="text-coral" />
            {actLoading ? (
              <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="animate-pulse h-8 rounded-lg bg-muted" />)}</div>
            ) : !activity || activity.length === 0 ? (
              <div className="py-8 text-center"><Clock className="h-7 w-7 text-muted-foreground mx-auto mb-2 opacity-20" /><p className="text-xs text-muted-foreground">No recent activity.</p></div>
            ) : (
              <div className="space-y-0.5">
                {activity.slice(0, 8).map((act) => {
                  const Icon = activityIcon[act.status] ?? Activity;
                  const iconColor = act.status === "completed" ? "text-accent" : act.status === "failed" ? "text-destructive" : "text-primary";
                  return (
                    <div key={act.id} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-secondary/50 transition-colors">
                      <Icon className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} />
                      <span className="text-xs text-foreground/80 flex-1 truncate">{act.workflow_name}</span>
                      <span className="text-[10px] text-muted-foreground/60 shrink-0">{formatDistanceToNow(new Date(act.created_at), { addSuffix: true })}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedDraft && <DraftModal draft={selectedDraft} onClose={() => setSelectedDraft(null)} onDismiss={() => handleDismissDraft(selectedDraft.id)} />}
    </DashboardLayout>
  );
};

export default Index;
