import { DashboardLayout } from "@/components/DashboardLayout";
import { useKnowledgeSources } from "@/hooks/useDashboardData";
import ReactMarkdown from "react-markdown";
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
  Download,
} from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  FileText, Phone, TrendingUp, MessageSquare, Database,
};

const ASK_BRAIN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ask-brain`;
const SYNC_FIREFLIES_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-fireflies`;

interface QueryEntry {
  query: string;
  time: string;
  answer: string;
}

const AuditBrain = () => {
  const [queryInput, setQueryInput] = useState("");
  const [isQuerying, setIsQuerying] = useState(false);
  const [queries, setQueries] = useState<QueryEntry[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const { data: knowledgeSources, isLoading: ksLoading } = useKnowledgeSources();
  const abortRef = useRef<AbortController | null>(null);
  const qc = useQueryClient();

  const handleSyncFireflies = async () => {
    setIsSyncing(true);
    try {
      const resp = await fetch(SYNC_FIREFLIES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Sync failed");
      toast.success(`Synced ${data.synced} transcripts`, {
        description: data.skipped ? `${data.skipped} skipped` : `Total: ${data.total_transcripts}`,
      });
      qc.invalidateQueries({ queryKey: ["knowledge-sources"] });
    } catch (e: any) {
      toast.error("Fireflies sync failed", { description: e.message });
    } finally {
      setIsSyncing(false);
    }
  };

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
            <button
              onClick={handleSyncFireflies}
              disabled={isSyncing}
              className="ml-auto flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isSyncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              {isSyncing ? "Syncing..." : "Sync Fireflies"}
            </button>
          </div>
          {ksLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-xl bg-muted h-20" />
              ))}
            </div>
          ) : (
          <div className="grid gap-3 sm:grid-cols-2 stagger-children">
            {(knowledgeSources ?? []).map((src, idx) => {
              const IconComponent = iconMap[src.icon] || FileText;
              return (
              <div key={src.id} className={`glow-card ${['glow-card-coral', 'glow-card-electric', 'glow-card-gold', 'glow-card-violet', 'glow-card-coral', 'glow-card-electric'][idx % 6]} rounded-xl bg-card p-4 flex items-center gap-4 cursor-pointer hover-scale`}
                onClick={() => toast.info(`${src.name}`, { description: `${src.item_count.toLocaleString()} items indexed • ${src.status === "synced" ? "Up to date" : "Sync in progress..."}` })}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <IconComponent className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-cream">{src.name}</p>
                  <p className="text-xs text-muted-foreground">{src.item_count.toLocaleString()} items</p>
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
              );
            })}
          </div>
          )}
        </div>

        <div>
          <div className="flex items-center gap-2 mb-5">
            <Brain className="h-4 w-4 text-violet" />
            <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Active Agents</h2>
          </div>
          <div className="space-y-2.5">
            {[
              { name: "CRO Analyst", description: "Analyzes conversion funnels and identifies optimization opportunities", capabilities: ["funnel-analysis", "heatmap-review", "competitor-audit"] },
              { name: "Report Writer", description: "Generates detailed audit reports with actionable recommendations", capabilities: ["report-gen", "data-viz", "copywriting"] },
              { name: "Performance Monitor", description: "Tracks KPIs in real-time and alerts on anomalies", capabilities: ["kpi-tracking", "alerting", "trend-detection"] },
            ].map((a, i) => (
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
            ))}
          </div>
        </div>
      </div>

      {/* Chat Thread */}
      {queries.length > 0 && (
        <section className="mt-10 glow-card glow-card-electric rounded-xl bg-card p-6">
          <div className="flex items-center gap-2 mb-6">
            <MessageSquare className="h-4 w-4 text-electric" />
            <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Conversation</h2>
            <span className="ml-auto text-[11px] text-muted-foreground">{queries.length} {queries.length === 1 ? "query" : "queries"}</span>
          </div>
          <div className="space-y-5">
            {[...queries].reverse().map((q, i) => (
              <div key={i} className="space-y-3">
                {/* User message */}
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-3">
                    <p className="text-sm font-medium text-primary-foreground">{q.query}</p>
                  </div>
                </div>
                {/* Brain response */}
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 mt-0.5">
                    <Brain className="h-4 w-4 text-accent" />
                  </div>
                  <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-secondary border border-border px-4 py-3">
                    {q.answer ? (
                      <div className="prose prose-sm prose-invert max-w-none text-sm text-foreground leading-relaxed [&_p]:mb-2 [&_ul]:mb-2 [&_ol]:mb-2 [&_li]:mb-0.5 [&_strong]:text-cream [&_h1]:text-cream [&_h2]:text-cream [&_h3]:text-cream [&_code]:bg-background [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs">
                        <ReactMarkdown>{q.answer}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Thinking...</span>
                      </div>
                    )}
                    <span className="block text-[10px] text-muted-foreground mt-2">{q.time}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </DashboardLayout>
  );
};

export default AuditBrain;
