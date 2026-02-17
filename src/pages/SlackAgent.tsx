import { DashboardLayout } from "@/components/DashboardLayout";
import {
  MessageSquare,
  Bot,
  Send,
  Hash,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  Settings,
} from "lucide-react";
import { useState } from "react";

const channels = [
  { name: "#oddit-brain-ai", members: 6, status: "active" as const },
  { name: "#dev-pipeline", members: 4, status: "active" as const },
  { name: "#audit-reports", members: 5, status: "active" as const },
  { name: "#general", members: 12, status: "monitoring" as const },
];

const recentMessages = [
  {
    channel: "#oddit-brain-ai",
    user: "Braxton",
    message: "@oddit-brain What was the conversion lift for the last 5 audits?",
    time: "10:32 AM",
    botReply: "Here's the breakdown: Braxley Bands +40%, TechFlow +22%, NovaPay +18%, GreenLeaf +31%, UrbanFit +15%. Average lift: 25.2%.",
  },
  {
    channel: "#dev-pipeline",
    user: "Ryan",
    message: "@oddit-brain Status on the Braxley homepage build?",
    time: "10:15 AM",
    botReply: "Braxley Bands Homepage Redesign is in QA stage (4/5 complete). Code gen finished 22 minutes ago. Estimated completion: ~45 min.",
  },
  {
    channel: "#audit-reports",
    user: "Taylor",
    message: "@oddit-brain Generate a report summary for NovaPay",
    time: "9:48 AM",
    botReply: "Generating NovaPay Checkout Optimization report... This includes 3 high-priority recommendations and 8 quick wins identified from the audit.",
  },
];

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
          <p className="text-2xl font-bold text-cream">47</p>
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
          <div className="space-y-4">
            {recentMessages.map((msg, i) => (
              <div key={i} className="rounded-lg border border-border bg-secondary p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Hash className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[11px] font-semibold text-muted-foreground">{msg.channel}</span>
                  <span className="text-[11px] text-muted-foreground ml-auto">{msg.time}</span>
                </div>
                {/* User message */}
                <div className="flex gap-3 mb-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                    {msg.user[0]}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-cream">{msg.user}</span>
                    <p className="text-xs text-foreground mt-0.5">{msg.message}</p>
                  </div>
                </div>
                {/* Bot reply */}
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
              className="flex-1 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            />
            <button className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground hover:opacity-90 transition-opacity">
              <Send className="h-4 w-4" />
              Send
            </button>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Channels */}
          <div className="glow-card rounded-xl bg-card p-5">
            <h2 className="text-sm font-bold text-cream uppercase tracking-wider mb-4">Monitored Channels</h2>
            <div className="space-y-2">
              {channels.map((ch) => (
                <div key={ch.name} className="flex items-center gap-3 rounded-lg bg-secondary p-3">
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

          {/* Capabilities */}
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
