import { DashboardLayout } from "@/components/DashboardLayout";
import {
  MessageSquare,
  Bot,
  Send,
  Hash,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";

const ASK_BRAIN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ask-brain`;

const channels = [
  { name: "#oddit-brain-ai", members: 6, status: "active" as const },
  { name: "#dev-pipeline", members: 4, status: "active" as const },
  { name: "#audit-reports", members: 5, status: "active" as const },
  { name: "#general", members: 12, status: "monitoring" as const },
];

interface Message {
  channel: string;
  user: string;
  message: string;
  time: string;
  botReply: string;
}

// Real AI is used via the ask-brain edge function

const agentCapabilities = [
  "Answer CRO questions from knowledge base",
  "Pull real-time project status updates",
  "Generate audit report summaries",
  "Provide KPI dashboards on demand",
  "Trigger workflow executions",
  "Schedule and summarize team meetings",
];

const SlackAgent = () => {
  const [testMessage, setTestMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      channel: "#oddit-brain-ai", user: "Braxton",
      message: "@oddit-brain What was the conversion lift for the last 5 audits?", time: "10:32 AM",
      botReply: "Here's the breakdown: Braxley Bands +40%, TechFlow +22%, NovaPay +18%, GreenLeaf +31%, UrbanFit +15%. Average lift: 25.2%.",
    },
    {
      channel: "#dev-pipeline", user: "Ryan",
      message: "@oddit-brain Status on the Braxley homepage build?", time: "10:15 AM",
      botReply: "Braxley Bands Homepage Redesign is in QA stage (4/5 complete). Code gen finished 22 minutes ago. Estimated completion: ~45 min.",
    },
    {
      channel: "#audit-reports", user: "Taylor",
      message: "@oddit-brain Generate a report summary for NovaPay", time: "9:48 AM",
      botReply: "Generating NovaPay Checkout Optimization report... This includes 3 high-priority recommendations and 8 quick wins identified from the audit.",
    },
  ]);

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

    // Add placeholder message
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
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <MessageSquare className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-cream">Slack Agent</h1>
            <p className="text-[13px] text-muted-foreground">AI assistant living in your Slack workspace</p>
          </div>
        </div>
      </div>

      {/* Status cards */}
      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <div className="glow-card rounded-xl bg-card p-5">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-4 w-4 text-accent" />
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Agent Status</span>
          </div>
          <p className="text-xl font-bold text-accent">Online</p>
        </div>
        <div className="glow-card rounded-xl bg-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Messages Today</p>
          <p className="text-2xl font-bold text-cream">{47 + messages.length - 3}</p>
        </div>
        <div className="glow-card rounded-xl bg-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Avg Response Time</p>
          <p className="text-2xl font-bold text-cream">1.2s</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent conversations */}
        <div className="lg:col-span-2 glow-card rounded-xl bg-card p-5">
          <h2 className="text-sm font-bold text-cream uppercase tracking-wider mb-5">Recent Conversations</h2>
          <div className="space-y-4 max-h-[500px] overflow-y-auto">
            {messages.map((msg, i) => (
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
                <div className="flex gap-3 ml-4 pl-4 border-l-2 border-primary/20">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-primary">Oddit Brain</span>
                    <p className="text-xs text-foreground mt-0.5 leading-relaxed">{msg.botReply}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Test input */}
          <div className="mt-5 flex gap-3">
            <input
              type="text"
              placeholder="Test a message to the agent..."
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
              {isSending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="glow-card rounded-xl bg-card p-5">
            <h2 className="text-sm font-bold text-cream uppercase tracking-wider mb-4">Monitored Channels</h2>
            <div className="space-y-2">
              {channels.map((ch) => (
                <div key={ch.name} className="flex items-center gap-3 rounded-lg bg-secondary p-3 cursor-pointer hover:bg-secondary/80 transition-colors"
                  onClick={() => toast.info(`${ch.name}`, { description: `${ch.members} members • ${ch.status}` })}
                >
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-cream">{ch.name}</p>
                    <p className="text-[11px] text-muted-foreground">{ch.members} members</p>
                  </div>
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${ch.status === "active" ? "text-accent" : "text-muted-foreground"}`}>
                    {ch.status}
                  </span>
                </div>
              ))}
            </div>
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
        </div>
      </div>
    </DashboardLayout>
  );
};

export default SlackAgent;
