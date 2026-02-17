import { DashboardLayout } from "@/components/DashboardLayout";
import { useTools, useAgents, useBrainStatus, useBrainHealth } from "@/hooks/useBrain";
import {
  Brain,
  Database,
  FileText,
  MessageSquare,
  Phone,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  Search,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";

const knowledgeSources = [
  { name: "Meeting Notes", icon: FileText, count: 142, status: "synced" },
  { name: "Client Calls", icon: Phone, count: 87, status: "synced" },
  { name: "Sales KPIs", icon: TrendingUp, count: 23, status: "synced" },
  { name: "Audit Reports", icon: FileText, count: 1243, status: "synced" },
  { name: "Slack Messages", icon: MessageSquare, count: 3420, status: "pending" },
  { name: "CRO Playbooks", icon: Database, count: 56, status: "synced" },
];

const recentQueries = [
  { query: "What was the conversion lift for Braxley Bands?", time: "2m ago", answer: "40% increase in conversion rate after implementing Oddit's CRO recommendations." },
  { query: "Summarize last week's client calls", time: "15m ago", answer: "5 calls completed. Key themes: homepage redesign (2), checkout optimization (2), mobile UX audit (1)." },
  { query: "What are our top performing audit recommendations?", time: "1h ago", answer: "Hero section redesign (avg +22% CVR), trust badge placement (avg +15%), CTA copy changes (avg +12%)." },
];

const AuditBrain = () => {
  const [queryInput, setQueryInput] = useState("");
  const { data: brainStatus } = useBrainStatus();
  const { data: health } = useBrainHealth();
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const isConnected = !!health && health.status === "ok";

  return (
    <DashboardLayout>
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <Brain className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-cream">Audit Brain</h1>
            <p className="text-[13px] text-muted-foreground">Central AI knowledge base & operational assistant</p>
          </div>
        </div>
      </div>

      {/* Query Bar */}
      <div className="mb-10 glow-card rounded-xl bg-card p-6">
        <h2 className="text-sm font-bold text-cream uppercase tracking-wider mb-4">Ask the Brain</h2>
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Ask anything about clients, audits, KPIs, calls..."
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              className="w-full rounded-lg border border-border bg-secondary pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
            />
          </div>
          <button className="flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-bold text-accent-foreground hover:opacity-90 transition-opacity">
            <Brain className="h-4 w-4" />
            Query
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Knowledge Sources */}
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-5">
            <Database className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Knowledge Sources</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {knowledgeSources.map((src) => (
              <div key={src.name} className="glow-card rounded-xl bg-card p-4 flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <src.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-cream">{src.name}</p>
                  <p className="text-xs text-muted-foreground">{src.count.toLocaleString()} items</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {src.status === "synced" ? (
                    <CheckCircle2 className="h-4 w-4 text-accent" />
                  ) : (
                    <RefreshCw className="h-4 w-4 text-warning animate-spin" />
                  )}
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${src.status === "synced" ? "text-accent" : "text-warning"}`}>
                    {src.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Agents */}
        <div>
          <div className="flex items-center gap-2 mb-5">
            <Brain className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Active Agents</h2>
          </div>
          <div className="space-y-2.5">
            {agentsLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-xl bg-muted h-24" />
              ))
            ) : agents && agents.length > 0 ? (
              agents.map((a, i) => (
                <div key={i} className="glow-card rounded-xl bg-card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15">
                      <Brain className="h-3 w-3 text-primary" />
                    </div>
                    <span className="text-sm font-bold text-cream">{a.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{a.description}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {a.capabilities.map((cap) => (
                      <span key={cap} className="rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="glow-card rounded-xl bg-card p-4 text-sm text-muted-foreground">
                No agents connected. Start backend to load agents.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Queries */}
      <section className="mt-10 glow-card rounded-xl bg-card p-5">
        <div className="flex items-center gap-2 mb-5">
          <Search className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Recent Queries</h2>
        </div>
        <div className="space-y-3">
          {recentQueries.map((q, i) => (
            <div key={i} className="rounded-lg border border-border bg-secondary p-4">
              <div className="flex items-start justify-between mb-2">
                <p className="text-sm font-bold text-cream">{q.query}</p>
                <span className="text-[11px] text-muted-foreground shrink-0 ml-3">{q.time}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{q.answer}</p>
            </div>
          ))}
        </div>
      </section>
    </DashboardLayout>
  );
};

export default AuditBrain;
