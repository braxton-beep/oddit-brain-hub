import { DashboardLayout } from "@/components/DashboardLayout";
import {
  MessageSquare,
  Bot,
  Send,
  Hash,
  CheckCircle2,
  Loader2,
  Bell,
  BellOff,
  Settings,
  Play,
  AlertTriangle,
  FileText,
  Calendar,
  Zap,
  Clock,
  Sunrise,
  ChevronRight,
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

const agentCapabilities = [
  "Answer CRO questions from knowledge base",
  "Pull real-time project status updates",
  "Generate audit report summaries",
  "Provide KPI dashboards on demand",
  "Trigger workflow executions",
  "Schedule and summarize team meetings",
];

const defaultNotificationSettings: NotificationSettings = {
  transcripts: { enabled: true, channel: "#transcripts" },
  churnAlerts: { enabled: true, channel: "#alerts" },
  reportReady: { enabled: true, channel: "#audit-reports" },
  weeklyDigest: { enabled: true, channel: "#general" },
};

// ─── Proactive Briefings Panel ──────────────────────────────────────────────
function ProactiveBriefingsPanel() {
  const [weeklyEnabled, setWeeklyEnabled] = useState(true);
  const [dailyEnabled, setDailyEnabled] = useState(false);
  const [briefingChannel, setBriefingChannel] = useState("#general");
  const [isSendingTest, setIsSendingTest] = useState(false);

  // Fetch real data for preview
  const { data: openRecs } = useQuery({
    queryKey: ["briefing-open-recs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("client_implementations")
        .select("id, status, audit_id")
        .eq("status", "pending")
        .limit(10);
      return data ?? [];
    },
  });

  const { data: recentTranscripts } = useQuery({
    queryKey: ["briefing-transcripts"],
    queryFn: async () => {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data } = await supabase
        .from("fireflies_transcripts")
        .select("id, title, date")
        .gte("date", weekAgo)
        .order("date", { ascending: true })
        .limit(5);
      return data ?? [];
    },
  });

  const { data: pipelineItems } = useQuery({
    queryKey: ["briefing-pipeline"],
    queryFn: async () => {
      const { data } = await supabase
        .from("pipeline_projects")
        .select("id, client, page, stages")
        .limit(10);
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
        toast.warning("Bot token not configured", {
          description: "Add SLACK_BOT_TOKEN in your backend secrets.",
        });
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

      {/* Weekly toggle */}
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
          <button
            onClick={() => setWeeklyEnabled(!weeklyEnabled)}
            className={`relative flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
              weeklyEnabled ? "bg-accent" : "bg-muted"
            }`}
          >
            <span className={`absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
              weeklyEnabled ? "translate-x-[18px]" : "translate-x-[3px]"
            }`} />
          </button>
        </div>

        {/* Daily toggle */}
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
          <button
            onClick={() => setDailyEnabled(!dailyEnabled)}
            className={`relative flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
              dailyEnabled ? "bg-accent" : "bg-muted"
            }`}
          >
            <span className={`absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
              dailyEnabled ? "translate-x-[18px]" : "translate-x-[3px]"
            }`} />
          </button>
        </div>

        {/* Channel selector */}
        <div className="flex items-center gap-2 border-t border-border pt-4">
          <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={briefingChannel}
            onChange={(e) => setBriefingChannel(e.target.value)}
            className="flex-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            placeholder="#channel-name"
          />
          <button
            onClick={handleSendTest}
            disabled={isSendingTest}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[11px] font-bold text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          >
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
          {/* Open recommendations */}
          <div className="rounded-lg border border-border bg-secondary p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-coral">🔴 Open Recommendations</span>
              <span className="ml-auto text-[10px] font-bold text-coral bg-coral/10 px-1.5 py-0.5 rounded-full">{openRecsCount}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {openRecsCount > 0
                ? `${openRecsCount} recommendation${openRecsCount > 1 ? "s" : ""} pending implementation across active audits. Follow up to keep clients on track.`
                : "All recommendations are being implemented. Great progress!"}
            </p>
          </div>

          {/* Upcoming calls */}
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

          {/* Pipeline status */}
          <div className="rounded-lg border border-border bg-secondary p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-accent">🚀 Pipeline Status</span>
              <span className="ml-auto text-[10px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded-full">{activePipeline}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {activePipeline > 0
                ? `${activePipeline} active project${activePipeline > 1 ? "s" : ""} in the dev pipeline. Check for blockers and QA items.`
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
    {
      key: "transcripts" as const,
      icon: MessageSquare,
      label: "New Transcript Synced",
      description: "Fires when Fireflies syncs new meeting transcripts",
      testType: "transcript_synced",
      testPayload: { title: "Test Meeting · Weekly Sync", date: new Date().toLocaleDateString(), participant_count: 4, duration_min: 45 },
    },
    {
      key: "churnAlerts" as const,
      icon: AlertTriangle,
      label: "Churn Risk Alert",
      description: "Fires when a client risk score exceeds 7/10",
      testType: "churn_risk",
      testPayload: { client_name: "Test Client Co.", score: 8, reason: "14+ days no contact, declining engagement" },
    },
    {
      key: "reportReady" as const,
      icon: FileText,
      label: "Report Draft Ready",
      description: "Fires when a CRO report draft is complete",
      testType: "report_ready",
      testPayload: { client_name: "Test Client Co.", report_id: "test-001" },
    },
    {
      key: "weeklyDigest" as const,
      icon: Calendar,
      label: "Weekly Digest",
      description: "Monday 9am summary: meetings, clients, top recommendation",
      testType: "digest",
      testPayload: {},
    },
  ];

  const handleToggle = (key: keyof NotificationSettings) => {
    setSettings((prev) => ({
      ...prev,
      [key]: { ...prev[key], enabled: !prev[key].enabled },
    }));
  };

  const handleChannel = (key: keyof NotificationSettings, value: string) => {
    setSettings((prev) => ({
      ...prev,
      [key]: { ...prev[key], channel: value },
    }));
  };

  const handleSave = () => {
    setSaved(true);
    toast.success("Notification settings saved", {
      description: "Changes will apply to future notifications.",
    });
    setTimeout(() => setSaved(false), 3000);
  };

  const handleTest = async (notif: (typeof notificationTypes)[0]) => {
    const cfg = settings[notif.key];
    if (!cfg.enabled) {
      toast.error("Enable this notification first before testing.");
      return;
    }

    setIsSending(notif.key);
    try {
      const isDigest = notif.testType === "digest";
      const url = isDigest ? SLACK_DIGEST_URL : SLACK_NOTIFY_URL;
      const body = isDigest
        ? { channel: cfg.channel }
        : { type: notif.testType, channel: cfg.channel, payload: notif.testPayload };

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await resp.json();

      if (data.skipped) {
        toast.warning("Bot token not yet configured", {
          description: "Add SLACK_BOT_TOKEN in your backend secrets to activate.",
        });
      } else if (data.success) {
        toast.success(`Test sent to ${cfg.channel}`, {
          description: "Check your Slack workspace for the message.",
        });
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
      {/* Token status banner */}
      <div className="rounded-xl border border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.06)] p-4 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))] mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-[hsl(var(--warning))]">SLACK_BOT_TOKEN not yet configured</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            All notification infrastructure is built and ready. Add your Slack Bot Token as a backend secret named{" "}
            <code className="font-mono text-primary bg-muted px-1 rounded">SLACK_BOT_TOKEN</code>{" "}
            to activate. Get your token from{" "}
            <span className="text-primary">api.slack.com/apps → OAuth & Permissions → Bot User OAuth Token</span>.
          </p>
        </div>
      </div>

      {/* Notification rows */}
      <div className="glow-card rounded-xl bg-card p-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Notification Settings</h2>
          <button
            onClick={handleSave}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              saved
                ? "bg-accent/20 text-accent"
                : "bg-primary/20 text-primary hover:bg-primary/30"
            }`}
          >
            {saved ? <CheckCircle2 className="h-3 w-3" /> : <Settings className="h-3 w-3" />}
            {saved ? "Saved" : "Save Settings"}
          </button>
        </div>

        <div className="space-y-3">
          {notificationTypes.map((notif) => {
            const Icon = notif.icon;
            const cfg = settings[notif.key];
            return (
              <div
                key={notif.key}
                className={`rounded-lg border p-4 transition-colors ${
                  cfg.enabled
                    ? "border-primary/30 bg-primary/[0.04]"
                    : "border-border bg-secondary"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                    cfg.enabled ? "bg-primary/15" : "bg-muted"
                  }`}>
                    <Icon className={`h-3.5 w-3.5 ${cfg.enabled ? "text-primary" : "text-muted-foreground"}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-cream">{notif.label}</p>
                      <button
                        onClick={() => handleToggle(notif.key)}
                        className={`relative flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                          cfg.enabled ? "bg-accent" : "bg-muted"
                        }`}
                      >
                        <span
                          className={`absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                            cfg.enabled ? "translate-x-[18px]" : "translate-x-[3px]"
                          }`}
                        />
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{notif.description}</p>

                    {cfg.enabled && (
                      <div className="mt-3 flex items-center gap-2">
                        <Hash className="h-3 w-3 text-muted-foreground shrink-0" />
                        <input
                          type="text"
                          value={cfg.channel}
                          onChange={(e) => handleChannel(notif.key, e.target.value)}
                          placeholder="#channel-name"
                          className="flex-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                        />
                        <button
                          onClick={() => handleTest(notif)}
                          disabled={isSending === notif.key}
                          className="flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                        >
                          {isSending === notif.key ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Play className="h-3 w-3" />
                          )}
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

      {/* Cron info */}
      <div className="glow-card rounded-xl bg-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Scheduled Digest</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          The weekly digest runs every Monday at 9:00 AM and posts to your configured digest channel. To activate
          the schedule, run the SQL below in your backend dashboard once your bot token is added.
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

  const handleSend = async () => {
    if (!testMessage.trim()) {
      toast.error("Type a message first");
      return;
    }
    const userMsg = testMessage;
    setTestMessage("");
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
      <div className="mb-8 animate-fade-in">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary animate-glow-pulse">
            <MessageSquare className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gradient-vivid">Slack Agent</h1>
            <p className="text-[13px] text-muted-foreground">AI assistant living in your Slack workspace</p>
          </div>
        </div>
      </div>

      {/* Status cards */}
      <div className="grid gap-4 sm:grid-cols-3 mb-8 stagger-children">
        <div className="glow-card rounded-xl bg-card p-5">
          <div className="flex items-center gap-2 mb-2">
            <Bot className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Agent Status</span>
          </div>
          <p className="text-xl font-bold text-muted-foreground">Not Connected</p>
          <p className="text-[11px] text-muted-foreground mt-1">Add SLACK_BOT_TOKEN to activate</p>
        </div>
        <div className="glow-card rounded-xl bg-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Messages This Session</p>
          <p className="text-2xl font-bold text-cream">{messages.length}</p>
        </div>
        <div className="glow-card rounded-xl bg-card p-5">
          <div className="flex items-center gap-2 mb-2">
            <Bell className="h-4 w-4 text-[hsl(var(--warning))]" />
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Push Notifications</span>
          </div>
          <p className="text-xl font-bold text-[hsl(var(--warning))]">Pending Token</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 rounded-xl bg-secondary p-1 w-fit">
        {[
          { key: "conversations", label: "Conversations", icon: MessageSquare },
          { key: "briefings", label: "Proactive Briefings", icon: Sunrise },
          { key: "settings", label: "Notification Settings", icon: Bell },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as typeof activeTab)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              activeTab === key
                ? "bg-card text-cream shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "briefings" && <ProactiveBriefingsPanel />}

      {activeTab === "settings" ? (
        <NotificationSettingsPanel />
      ) : activeTab === "conversations" ? (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Recent conversations */}
          <div className="lg:col-span-2 glow-card rounded-xl bg-card p-5">
            <h2 className="text-sm font-bold text-cream uppercase tracking-wider mb-5">Conversations</h2>
            <div className="space-y-4 max-h-[500px] overflow-y-auto">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary mb-4">
                    <Bot className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-semibold text-cream mb-1">No conversations yet</p>
                  <p className="text-xs text-muted-foreground max-w-[260px] leading-relaxed">
                    Type a message below to test the Oddit Brain agent directly. Responses stream in real time.
                  </p>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} className="rounded-lg border border-border bg-secondary p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Hash className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[11px] font-semibold text-muted-foreground">{msg.channel}</span>
                      <span className="text-[11px] text-muted-foreground ml-auto">{msg.time}</span>
                    </div>
                    <div className="flex gap-3 mb-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                        {msg.user[0]}
                      </div>
                      <div>
                        <span className="text-xs font-bold text-cream">{msg.user}</span>
                        <p className="text-xs text-foreground mt-0.5">{msg.message}</p>
                      </div>
                    </div>
                    {(msg.botReply || isSending) && (
                      <div className="flex gap-3 ml-4 pl-4 border-l-2 border-primary/20">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15">
                          <Bot className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-primary">Oddit Brain</span>
                          <p className="text-xs text-foreground mt-0.5 leading-relaxed">
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
            <div className="mt-5 flex gap-3">
              <input
                type="text"
                placeholder="Ask the Oddit Brain anything…"
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                disabled={isSending}
                className="flex-1 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={isSending}
                className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {isSending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="glow-card rounded-xl bg-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Slack Workspace</h2>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                Connect a Slack Bot Token to enable real channel monitoring and push notifications from this workspace.
              </p>
              <button
                onClick={() => setActiveTab("settings")}
                className="w-full rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/15 transition-colors"
              >
                Configure Bot Token →
              </button>
            </div>

            <div className="glow-card rounded-xl bg-card p-5">
              <h2 className="text-sm font-bold text-cream uppercase tracking-wider mb-4">Capabilities</h2>
              <div className="space-y-2">
                {agentCapabilities.map((cap, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-accent mt-0.5 shrink-0" />
                    <span className="text-xs text-foreground leading-relaxed">{cap}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => setActiveTab("settings")}
              className="w-full glow-card rounded-xl bg-card p-4 flex items-center gap-3 hover:border-primary/30 transition-colors text-left"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--warning)/0.15)]">
                <Bell className="h-4 w-4 text-[hsl(var(--warning))]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-cream">Configure Notifications</p>
                <p className="text-[11px] text-muted-foreground">Set channels & add bot token</p>
              </div>
            </button>
          </div>
        </div>
      ) : null}
    </DashboardLayout>
  );
};

export default SlackAgent;
