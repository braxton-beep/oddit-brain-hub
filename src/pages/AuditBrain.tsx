import { DashboardLayout } from "@/components/DashboardLayout";
import { useAgents, useBrainStatus, useBrainHealth } from "@/hooks/useBrain";
import {
  Brain,
  Database,
  FileText,
  MessageSquare,
  Phone,
  TrendingUp,
  CheckCircle2,
  Search,
  RefreshCw,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";

const knowledgeSources = [
  { name: "Meeting Notes", icon: FileText, count: 142, status: "synced" },
  { name: "Client Calls", icon: Phone, count: 87, status: "synced" },
  { name: "Sales KPIs", icon: TrendingUp, count: 23, status: "synced" },
  { name: "Oddit Reports", icon: FileText, count: 11000, status: "synced" },
  { name: "Slack Messages", icon: MessageSquare, count: 3420, status: "synced" },
  { name: "CRO Playbooks", icon: Database, count: 56, status: "synced" },
];

const ASK_BRAIN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ask-brain`;

interface QueryEntry {
  query: string;
  time: string;
  answer: string;
}

const AuditBrain = () => {
  const [queryInput, setQueryInput] = useState("");
  const [isQuerying, setIsQuerying] = useState(false);
  const [queries, setQueries] = useState<QueryEntry[]>([]);
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const abortRef = useRef<AbortController | null>(null);

  const handleQuery = async () => {
    if (!queryInput.trim()) {
      toast.error("Please enter a question");
      return;
    }
    const question = queryInput;
    setQueryInput("");
    setIsQuerying(true);

    // Add a placeholder entry
    setQueries((prev) => [{ query: question, time: "Just now", answer: "" }, ...prev]);

    try {
      abortRef.current = new AbortController();
      const resp = await fetch(ASK_BRAIN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ query: question }),
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
      let fullAnswer = "";
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
              fullAnswer += content;
              const captured = fullAnswer;
              setQueries((prev) => {
                const updated = [...prev];
                updated[0] = { ...updated[0], answer: captured };
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
      setQueries((prev) => {
        const updated = [...prev];
        updated[0] = { ...updated[0], answer: `Error: ${e.message}` };
        return updated;
      });
    } finally {
      setIsQuerying(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="mb-8 animate-fade-in">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary animate-glow-pulse">
            <Brain className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-cream">Oddit Brain</h1>
            <p className="text-[13px] text-muted-foreground">Central AI knowledge base & operational assistant</p>
          </div>
        </div>
      </div>

      {/* Query Bar */}
      <div className="mb-10 glow-card glow-card-violet rounded-xl bg-card p-6 animate-scale-in">
        <h2 className="text-sm font-bold text-gradient-cool uppercase tracking-wider mb-4">Ask the Brain</h2>
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Ask anything about clients, audits, KPIs, calls..."
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleQuery()}
              disabled={isQuerying}
              className="w-full rounded-lg border border-border bg-secondary pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all disabled:opacity-50"
            />
          </div>
          <button
            onClick={handleQuery}
            disabled={isQuerying}
            className="flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-bold text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isQuerying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isQuerying ? "Thinking..." : "Query"}
          </button>
        </div>
        <div className="flex gap-2 mt-3">
          {["Conversion lifts", "Client status", "Top recommendations"].map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => setQueryInput(suggestion)}
              className="rounded-md border border-border bg-secondary px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Knowledge Sources */}
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-5">
            <Database className="h-4 w-4 text-coral" />
            <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Knowledge Sources</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 stagger-children">
            {knowledgeSources.map((src) => (
              <div key={src.name} className={`glow-card ${['glow-card-coral', 'glow-card-electric', 'glow-card-gold', 'glow-card-violet', 'glow-card-coral', 'glow-card-electric'][knowledgeSources.indexOf(src) % 6]} rounded-xl bg-card p-4 flex items-center gap-4 cursor-pointer hover-scale`}
                onClick={() => toast.info(`${src.name}`, { description: `${src.count.toLocaleString()} items indexed • ${src.status === "synced" ? "Up to date" : "Sync in progress..."}` })}
              >
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
            <Brain className="h-4 w-4 text-violet" />
            <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Active Agents</h2>
          </div>
          <div className="space-y-2.5">
            {agentsLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-xl bg-muted h-24" />
              ))
            ) : agents && agents.length > 0 ? (
              agents.map((a, i) => (
                <div key={i} className={`glow-card ${['glow-card-electric', 'glow-card-gold', 'glow-card-violet'][i % 3]} rounded-xl bg-card p-4 cursor-pointer`}
                  onClick={() => toast.info(`${a.name}`, { description: `${a.description}` })}
                >
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
      <section className="mt-10 glow-card glow-card-electric rounded-xl bg-card p-5">
        <div className="flex items-center gap-2 mb-5">
          <Search className="h-4 w-4 text-electric" />
          <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Recent Queries</h2>
          <span className="ml-auto text-[11px] text-muted-foreground">{queries.length} queries</span>
        </div>
        <div className="space-y-3">
          {queries.map((q, i) => (
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
