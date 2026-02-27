import { DashboardLayout } from "@/components/DashboardLayout";
import {
  MessageSquare, Bot, Send, Hash, CheckCircle2, Loader2, Bell, BellOff,
  Settings, Play, AlertTriangle, FileText, Calendar, Zap, Clock, Sunrise,
  ChevronRight, Sparkles, Brain, Target, TrendingUp, Users, Search,
  BarChart3, Lightbulb, Flame, ArrowRight,
} from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const ASK_BRAIN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ask-brain`;
const SLACK_NOTIFY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/slack-notify`;
const SLACK_DIGEST_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/slack-weekly-digest`;

interface Message {
  channel: string;
  user: string;
  message: string;
  time: string;
  botReply: string;
}

interface NotificationSettings {
  transcripts: { enabled: boolean; channel: string };
  churnAlerts: { enabled: boolean; channel: string };
  reportReady: { enabled: boolean; channel: string };
  weeklyDigest: { enabled: boolean; channel: string };
}

const defaultNotificationSettings: NotificationSettings = {
  transcripts: { enabled: true, channel: "#transcripts" },
  churnAlerts: { enabled: true, channel: "#alerts" },
  reportReady: { enabled: true, channel: "#audit-reports" },
  weeklyDigest: { enabled: true, channel: "#general" },
};

// ─── Example prompts organized by category ──────────────────────────────────
const EXAMPLE_PROMPTS = [
  { emoji: "📊", text: "What's our top client by revenue?", category: "Data" },
  { emoji: "🧠", text: "Analyze CRO patterns across all audits", category: "Strategy" },
  { emoji: "🔍", text: "Compare our conversion rates to industry benchmarks", category: "Analysis" },
  { emoji: "📞", text: "Summarize the last call with Buckleguy", category: "Meetings" },
  { emoji: "✍️", text: "Draft a follow-up email for our most recent audit", category: "Writing" },
  { emoji: "🚀", text: "What are the top 3 things we should focus on this week?", category: "Planning" },
  { emoji: "💡", text: "Give me 5 A/B test ideas for a luxury fashion brand", category: "Creative" },
  { emoji: "📈", text: "Which recommendation do we give most across all clients?", category: "Insights" },
];

// ─── Hockey Robot Avatar ────────────────────────────────────────────────────
function HockeyRobotAvatar({ size = "lg" }: { size?: "sm" | "lg" }) {
  const dim = size === "lg" ? "h-20 w-20" : "h-10 w-10";
  const textSize = size === "lg" ? "text-4xl" : "text-xl";
  return (
    <div className={`${dim} rounded-2xl flex items-center justify-center relative overflow-hidden`}
      style={{
        background: "linear-gradient(135deg, hsl(240 80% 68% / 0.2), hsl(4 80% 62% / 0.15), hsl(0 0% 96% / 0.05))",
        border: "2px solid hsl(240 80% 68% / 0.25)",
        boxShadow: "0 0 30px hsl(240 80% 68% / 0.15), inset 0 1px 0 hsl(0 0% 100% / 0.05)",
      }}
    >
      <span className={textSize} role="img" aria-label="Hockey Robot">🤖</span>
      <span className="absolute -bottom-0.5 -right-0.5 text-lg" role="img" aria-label="Hockey">🏒</span>
      {size === "lg" && <span className="absolute top-0.5 right-1 text-xs" role="img" aria-label="Maple leaf">🍁</span>}
    </div>
  );
}

// ─── Capability Card ────────────────────────────────────────────────────────
const CAPABILITIES = [
  { icon: Brain, label: "Deep CRO Strategy", desc: "Complex audit analysis & optimization patterns", color: "text-primary", bg: "bg-primary/10" },
  { icon: Search, label: "Data Lookups", desc: "Client metrics, KPIs, transcript search", color: "text-electric", bg: "bg-electric/10" },
  { icon: TrendingUp, label: "Competitive Intel", desc: "Industry trends & competitor analysis", color: "text-coral", bg: "bg-coral/10" },
  { icon: Lightbulb, label: "Creative Brainstorming", desc: "A/B test ideas, copy suggestions, UX concepts", color: "text-gold", bg: "bg-gold/10" },
  { icon: FileText, label: "Writing & Drafts", desc: "Emails, reports, summaries, proposals", color: "text-accent", bg: "bg-accent/10" },
  { icon: BarChart3, label: "General Business", desc: "Industry news, AI tools, tech updates", color: "text-violet", bg: "bg-violet/10" },
];

// ─── Proactive Briefings Panel ──────────────────────────────────────────────
function ProactiveBriefingsPanel() {
  const [weeklyEnabled, setWeeklyEnabled] = useState(true);
  const [dailyEnabled, setDailyEnabled] = useState(false);
  const [briefingChannel, setBriefingChannel] = useState("#general");
  const [isSendingTest, setIsSendingTest] = useState(false);

  const { data: openRecs } = useQuery({
    queryKey: ["briefing-open-recs"],
    queryFn: async () => {
      const { data } = await supabase.from("client_implementations").select("id, status, audit_id").eq("status", "pending").limit(10);
      return data ?? [];
    },
  });

  const { data: recentTranscripts } = useQuery({
    queryKey: ["briefing-transcripts"],
    queryFn: async () => {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data } = await supabase.from("fireflies_transcripts").select("id, title, date").gte("date", weekAgo).order("date", { ascending: true }).limit(5);
      return data ?? [];
    },
  });

  const { data: pipelineItems } = useQuery({
    queryKey: ["briefing-pipeline"],
    queryFn: async () => {
      const { data } = await supabase.from("pipeline_projects").select("id, client, page, stages").limit(10);
      return data ?? [];
    },
  });

  const openRecsCount = openRecs?.length ?? 0;
  const upcomingCalls = recentTranscripts?.length ?? 0;
  const activePipeline = pipelineItems?.length ?? 0;

  const handleSendTest = async () => {
    setIsSendingTest(true);
    try {
      const resp = await fetch(SLACK_DIGEST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: briefingChannel }),
      });
      const data = await resp.json();
      if (data.skipped) {
        toast.warning("Bot token not configured", { description: "Add SLACK_BOT_TOKEN in your backend secrets." });
      } else if (data.success) {
        toast.success(`Test briefing sent to ${briefingChannel}`);
      } else {
        throw new Error(data.error ?? "Unknown error");
      }
    } catch (e: any) {
      toast.error("Failed to send test", { description: e.message });
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-1">
        <Sunrise className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold text-cream">Proactive Briefings</h2>
      </div>
      <p className="text-xs text-muted-foreground -mt-4">
        Automated intelligence briefings delivered to Slack so you always know what to act on.
      </p>

      <div className="glow-card rounded-xl bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
              <Calendar className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-cream">Weekly Monday Briefing</p>
              <p className="text-[11px] text-muted-foreground">Every Monday at 9:00 AM</p>
            </div>
          </div>
          <button onClick={() => setWeeklyEnabled(!weeklyEnabled)}
            className={`relative flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${weeklyEnabled ? "bg-accent" : "bg-muted"}`}>
            <span className={`absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${weeklyEnabled ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
          </button>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/15">
              <Clock className="h-4 w-4 text-gold" />
            </div>
            <div>
              <p className="text-sm font-semibold text-cream">Daily Digest</p>
              <p className="text-[11px] text-muted-foreground">Short daily summary at 8:30 AM</p>
            </div>
          </div>
          <button onClick={() => setDailyEnabled(!dailyEnabled)}
            className={`relative flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${dailyEnabled ? "bg-accent" : "bg-muted"}`}>
            <span className={`absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${dailyEnabled ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
          </button>
        </div>

        <div className="flex items-center gap-2 border-t border-border pt-4">
          <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input type="text" value={briefingChannel} onChange={(e) => setBriefingChannel(e.target.value)}
            className="flex-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            placeholder="#channel-name" />
          <button onClick={handleSendTest} disabled={isSendingTest}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[11px] font-bold text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-50">
            {isSendingTest ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            Send Test Briefing
          </button>
        </div>
      </div>

      {/* Briefing preview */}
      <div className="glow-card rounded-xl bg-card p-5">
        <h3 className="text-xs font-bold text-cream uppercase tracking-wider mb-4 flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          Briefing Preview — This Week
        </h3>
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-secondary p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-coral">🔴 Open Recommendations</span>
              <span className="ml-auto text-[10px] font-bold text-coral bg-coral/10 px-1.5 py-0.5 rounded-full">{openRecsCount}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {openRecsCount > 0
                ? `${openRecsCount} recommendation${openRecsCount > 1 ? "s" : ""} pending implementation across active audits.`
                : "All recommendations are being implemented. Great progress!"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-secondary p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-primary">📞 Recent/Upcoming Calls</span>
              <span className="ml-auto text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">{upcomingCalls}</span>
            </div>
            {recentTranscripts && recentTranscripts.length > 0 ? (
              <div className="space-y-1">
                {recentTranscripts.slice(0, 3).map((t) => (
                  <div key={t.id} className="flex items-center gap-2">
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] text-foreground truncate">{t.title}</span>
                    {t.date && <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{new Date(t.date).toLocaleDateString()}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">No calls this week.</p>
            )}
          </div>
          <div className="rounded-lg border border-border bg-secondary p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-accent">🚀 Pipeline Status</span>
              <span className="ml-auto text-[10px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded-full">{activePipeline}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {activePipeline > 0
                ? `${activePipeline} active project${activePipeline > 1 ? "s" : ""} in the dev pipeline.`
                : "No active pipeline projects right now."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Notification Settings Panel ────────────────────────────────────────────
function NotificationSettingsPanel() {
  const [settings, setSettings] = useState<NotificationSettings>(defaultNotificationSettings);
  const [isSending, setIsSending] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const notificationTypes = [
    { key: "transcripts" as const, icon: MessageSquare, label: "New Transcript Synced", description: "Fires when Fireflies syncs new meeting transcripts", testType: "transcript_synced", testPayload: { title: "Test Meeting · Weekly Sync", date: new Date().toLocaleDateString(), participant_count: 4, duration_min: 45 } },
    { key: "churnAlerts" as const, icon: AlertTriangle, label: "Churn Risk Alert", description: "Fires when a client risk score exceeds 7/10", testType: "churn_risk", testPayload: { client_name: "Test Client Co.", score: 8, reason: "14+ days no contact, declining engagement" } },
    { key: "reportReady" as const, icon: FileText, label: "Report Draft Ready", description: "Fires when a CRO report draft is complete", testType: "report_ready", testPayload: { client_name: "Test Client Co.", report_id: "test-001" } },
    { key: "weeklyDigest" as const, icon: Calendar, label: "Weekly Digest", description: "Monday 9am summary: meetings, clients, top recommendation", testType: "digest", testPayload: {} },
  ];

  const handleToggle = (key: keyof NotificationSettings) => {
    setSettings((prev) => ({ ...prev, [key]: { ...prev[key], enabled: !prev[key].enabled } }));
  };
  const handleChannel = (key: keyof NotificationSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: { ...prev[key], channel: value } }));
  };
  const handleSave = () => {
    setSaved(true);
    toast.success("Notification settings saved", { description: "Changes will apply to future notifications." });
    setTimeout(() => setSaved(false), 3000);
  };

  const handleTest = async (notif: (typeof notificationTypes)[0]) => {
    const cfg = settings[notif.key];
    if (!cfg.enabled) { toast.error("Enable this notification first before testing."); return; }
    setIsSending(notif.key);
    try {
      const isDigest = notif.testType === "digest";
      const url = isDigest ? SLACK_DIGEST_URL : SLACK_NOTIFY_URL;
      const body = isDigest ? { channel: cfg.channel } : { type: notif.testType, channel: cfg.channel, payload: notif.testPayload };
      const resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await resp.json();
      if (data.skipped) {
        toast.warning("Bot token not yet configured", { description: "Add SLACK_BOT_TOKEN in your backend secrets to activate." });
      } else if (data.success) {
        toast.success(`Test sent to ${cfg.channel}`, { description: "Check your Slack workspace for the message." });
      } else {
        throw new Error(data.error ?? "Unknown error");
      }
    } catch (e: any) {
      toast.error("Test failed", { description: e.message });
    } finally {
      setIsSending(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.06)] p-4 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))] mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-[hsl(var(--warning))]">SLACK_BOT_TOKEN not yet configured</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            All notification infrastructure is built and ready. Add your Slack Bot Token as a backend secret named{" "}
            <code className="font-mono text-primary bg-muted px-1 rounded">SLACK_BOT_TOKEN</code> to activate.
          </p>
        </div>
      </div>

      <div className="glow-card rounded-xl bg-card p-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Notification Settings</h2>
          <button onClick={handleSave}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${saved ? "bg-accent/20 text-accent" : "bg-primary/20 text-primary hover:bg-primary/30"}`}>
            {saved ? <CheckCircle2 className="h-3 w-3" /> : <Settings className="h-3 w-3" />}
            {saved ? "Saved" : "Save Settings"}
          </button>
        </div>
        <div className="space-y-3">
          {notificationTypes.map((notif) => {
            const Icon = notif.icon;
            const cfg = settings[notif.key];
            return (
              <div key={notif.key} className={`rounded-lg border p-4 transition-colors ${cfg.enabled ? "border-primary/30 bg-primary/[0.04]" : "border-border bg-secondary"}`}>
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${cfg.enabled ? "bg-primary/15" : "bg-muted"}`}>
                    <Icon className={`h-3.5 w-3.5 ${cfg.enabled ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-cream">{notif.label}</p>
                      <button onClick={() => handleToggle(notif.key)}
                        className={`relative flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${cfg.enabled ? "bg-accent" : "bg-muted"}`}>
                        <span className={`absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${cfg.enabled ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{notif.description}</p>
                    {cfg.enabled && (
                      <div className="mt-3 flex items-center gap-2">
                        <Hash className="h-3 w-3 text-muted-foreground shrink-0" />
                        <input type="text" value={cfg.channel} onChange={(e) => handleChannel(notif.key, e.target.value)} placeholder="#channel-name"
                          className="flex-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
                        <button onClick={() => handleTest(notif)} disabled={isSending === notif.key}
                          className="flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
                          {isSending === notif.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                          Test
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="glow-card rounded-xl bg-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Scheduled Digest</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          The weekly digest runs every Monday at 9:00 AM and posts to your configured digest channel.
        </p>
        <pre className="rounded-lg bg-secondary p-3 text-[10px] text-muted-foreground overflow-x-auto leading-relaxed">
{`SELECT cron.schedule(
  'slack-weekly-digest',
  '0 9 * * 1',
  $$
  SELECT net.http_post(
    url := '${import.meta.env.VITE_SUPABASE_URL}/functions/v1/slack-weekly-digest',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{"channel":"${settings.weeklyDigest.channel}"}'::jsonb
  );
  $$
);`}
        </pre>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
const SlackAgent = () => {
  const [testMessage, setTestMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [activeTab, setActiveTab] = useState<"conversations" | "briefings" | "settings">("conversations");
  const abortRef = useRef<AbortController | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);

  const handleSend = async (overrideMsg?: string) => {
    const userMsg = overrideMsg || testMessage.trim();
    if (!userMsg) { toast.error("Type a message first"); return; }
    setTestMessage("");
    setSelectedPrompt(null);
    setIsSending(true);

    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    setMessages((prev) => [
      { channel: "#oddit-brain-ai", user: "You", message: userMsg, time, botReply: "" },
      ...prev,
    ]);

    try {
      abortRef.current = new AbortController();
      const resp = await fetch(ASK_BRAIN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ query: userMsg }),
        signal: abortRef.current.signal,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `Error ${resp.status}`);
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let fullReply = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              fullReply += content;
              const captured = fullReply;
              setMessages((prev) => {
                const updated = [...prev];
                updated[0] = { ...updated[0], botReply: captured };
                return updated;
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      toast.success("Brain responded");
    } catch (e: any) {
      if (e.name === "AbortError") return;
      toast.error("Brain error", { description: e.message });
      setMessages((prev) => {
        const updated = [...prev];
        updated[0] = { ...updated[0], botReply: `Error: ${e.message}` };
        return updated;
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <DashboardLayout>
      {/* ── Hero Section ────────────────────────────────────── */}
      <div className="mb-8 animate-fade-in">
        <div className="rounded-2xl p-6 relative overflow-hidden" style={{
          background: "linear-gradient(135deg, hsl(240 80% 68% / 0.12) 0%, hsl(4 80% 62% / 0.06) 50%, hsl(165 55% 55% / 0.04) 100%)",
          border: "1px solid hsl(240 80% 68% / 0.15)",
        }}>
          {/* Ambient glow */}
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-primary/[0.06] blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-coral/[0.05] blur-3xl pointer-events-none" />

          <div className="relative flex flex-col sm:flex-row items-start gap-5">
            <HockeyRobotAvatar size="lg" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-extrabold text-gradient-vivid tracking-tight">Slack Agent</h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 border border-accent/25 px-2.5 py-0.5 text-[10px] font-bold text-accent uppercase tracking-wider">
                  <Sparkles className="h-3 w-3" /> AI-Powered
                </span>
              </div>
              <p className="text-sm text-foreground leading-relaxed max-w-2xl mb-3">
                Your smartest teammate, living in Slack. Ask <strong>literally anything</strong> — 
                deep CRO strategy, client data lookups, competitive analysis, creative brainstorming, 
                industry trends, writing help, or general business advice. Powered by your full knowledge base 
                of <span className="text-primary font-semibold">3,000+ meeting transcripts</span>, audit data, and real-time web intelligence.
              </p>
              <div className="flex flex-wrap gap-2">
                {["CRO Strategy", "Data & Analytics", "Meeting Intel", "Creative Ideas", "General Knowledge"].map((tag) => (
                  <span key={tag} className="inline-flex items-center rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Capabilities Grid ──────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8 stagger-children">
        {CAPABILITIES.map((cap) => {
          const Icon = cap.icon;
          return (
            <div key={cap.label} className="glow-card rounded-xl bg-card p-4 text-center group cursor-default">
              <div className={`mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-xl ${cap.bg} transition-transform group-hover:scale-110`}>
                <Icon className={`h-4 w-4 ${cap.color}`} />
              </div>
              <p className="text-xs font-bold text-cream mb-0.5">{cap.label}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{cap.desc}</p>
            </div>
          );
        })}
      </div>

      {/* ── Tabs ───────────────────────────────────────────── */}
      <div className="flex gap-1 mb-6 rounded-xl bg-secondary p-1 w-fit">
        {[
          { key: "conversations", label: "Chat", icon: MessageSquare },
          { key: "briefings", label: "Proactive Briefings", icon: Sunrise },
          { key: "settings", label: "Notifications", icon: Bell },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key as typeof activeTab)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              activeTab === key ? "bg-card text-cream shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}>
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "briefings" && <ProactiveBriefingsPanel />}

      {activeTab === "settings" ? (
        <NotificationSettingsPanel />
      ) : activeTab === "conversations" ? (
        <div className="space-y-6">
          {/* ── Example Prompts (when no messages yet) ─────── */}
          {messages.length === 0 && (
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Flame className="h-4 w-4 text-gold" />
                <h2 className="text-sm font-bold text-cream">Try asking...</h2>
                <span className="text-[10px] text-muted-foreground ml-1">click any prompt to send</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <button key={prompt.text} onClick={() => handleSend(prompt.text)}
                    className="group flex items-center gap-3 rounded-xl border border-border bg-secondary/50 px-4 py-3 text-left transition-all hover:border-primary/30 hover:bg-primary/[0.04] hover:translate-y-[-1px]">
                    <span className="text-lg shrink-0">{prompt.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground truncate">{prompt.text}</p>
                      <p className="text-[10px] text-muted-foreground">{prompt.category}</p>
                    </div>
                    <ArrowRight className="h-3 w-3 text-muted-foreground/30 group-hover:text-primary transition-colors shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Conversation Area ─────────────────────────── */}
          <div className="glow-card rounded-xl bg-card p-5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <HockeyRobotAvatar size="sm" />
                <div>
                  <h2 className="text-sm font-bold text-cream">Oddit Brain Chat</h2>
                  <p className="text-[10px] text-muted-foreground">Streaming responses · Full knowledge base access</p>
                </div>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground bg-secondary px-2 py-1 rounded-md">
                {messages.length} message{messages.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="space-y-4 max-h-[500px] overflow-y-auto mb-5">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary mb-4" style={{
                    background: "linear-gradient(135deg, hsl(240 80% 68% / 0.1), hsl(165 55% 55% / 0.08))",
                  }}>
                    <Bot className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-semibold text-cream mb-1">Ready to chat</p>
                  <p className="text-xs text-muted-foreground max-w-[300px] leading-relaxed">
                    Ask anything — from "what's our top client?" to "draft a competitive analysis for luxury DTC brands." 
                    Responses stream in real time.
                  </p>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} className="rounded-lg border border-border bg-secondary/50 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Hash className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[11px] font-semibold text-muted-foreground">{msg.channel}</span>
                      <span className="text-[11px] text-muted-foreground ml-auto">{msg.time}</span>
                    </div>
                    <div className="flex gap-3 mb-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                        {msg.user[0]}
                      </div>
                      <div>
                        <span className="text-xs font-bold text-cream">{msg.user}</span>
                        <p className="text-xs text-foreground mt-0.5">{msg.message}</p>
                      </div>
                    </div>
                    {(msg.botReply || (i === 0 && isSending)) && (
                      <div className="flex gap-3 ml-4 pl-4 border-l-2 border-primary/20">
                        <HockeyRobotAvatar size="sm" />
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-bold text-primary">Oddit Brain</span>
                          <p className="text-xs text-foreground mt-0.5 leading-relaxed whitespace-pre-wrap">
                            {msg.botReply || <span className="animate-pulse text-muted-foreground">Thinking…</span>}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Input */}
            <div className="flex gap-3 rounded-xl border border-border bg-secondary/50 p-2">
              <input
                type="text"
                placeholder="Ask literally anything…"
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                disabled={isSending}
                className="flex-1 bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
              />
              <button onClick={() => handleSend()} disabled={isSending}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {isSending ? "Thinking…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardLayout>
  );
};

export default SlackAgent;
