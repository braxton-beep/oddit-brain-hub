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
  RefreshCw,
  Loader2,
  Sparkles,
  Download,
  Send,
  Trash2,
  Plus,
  Pencil,
  X,
  Check,
  Settings2,
  Twitter,
  Users,
  Code2,
  FolderOpen,
  Figma,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  useBrainPrompts,
  useAddBrainPrompt,
  useUpdateBrainPrompt,
  useDeleteBrainPrompt,
} from "@/hooks/useBrainPrompts";

const iconMap: Record<string, LucideIcon> = {
  FileText, Phone, TrendingUp, MessageSquare, Database,
  Twitter, Users, Code2, FolderOpen, Figma,
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
  const [showPromptManager, setShowPromptManager] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editPrompt, setEditPrompt] = useState("");

  const { data: knowledgeSources, isLoading: ksLoading } = useKnowledgeSources();
  const { data: brainPrompts = [] } = useBrainPrompts();
  const addPrompt = useAddBrainPrompt();
  const updatePrompt = useUpdateBrainPrompt();
  const deletePrompt = useDeleteBrainPrompt();

  const abortRef = useRef<AbortController | null>(null);
  const qc = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const enabledPrompts = brainPrompts.filter((p) => p.enabled);

  // Auto-scroll to bottom on new messages (skip on mount / empty state)
  useEffect(() => {
    if (queries.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [queries]);

  // Auto-resize textarea
  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setQueryInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

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
    if (!queryInput.trim()) return;
    const question = queryInput;
    setQueryInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setIsQuerying(true);

    // Append to bottom (newest last)
    setQueries((prev) => [...prev, { query: question, time: "Just now", answer: "" }]);

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
                updated[updated.length - 1] = { ...updated[updated.length - 1], answer: captured };
                return updated;
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (e: any) {
      if (e.name === "AbortError") return;
      toast.error("Brain error", { description: e.message });
      setQueries((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { ...updated[updated.length - 1], answer: `Error: ${e.message}` };
        return updated;
      });
    } finally {
      setIsQuerying(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleQuery();
    }
  };

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mb-6 animate-fade-in">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary animate-glow-pulse">
            <Brain className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gradient-vivid">Oddit Brain</h1>
              <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-bold tracking-widest text-accent uppercase">v1.4</span>
            </div>
            <p className="text-[13px] text-muted-foreground">Central AI knowledge base & operational assistant</p>
          </div>
        </div>
      </div>

      {/* Chat Thread */}
      <div className="mb-8 glow-card glow-card-electric rounded-xl bg-card overflow-hidden flex flex-col animate-scale-in" style={{ minHeight: 480 }}>
        {/* Chat header */}
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border shrink-0">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/15">
            <Brain className="h-3.5 w-3.5 text-accent" />
          </div>
          <span className="text-sm font-bold text-cream">Oddit Brain</span>
          <span className="ml-1 flex h-2 w-2 rounded-full bg-accent animate-pulse" />
          <span className="text-[11px] text-muted-foreground ml-0.5">online</span>
          {queries.length > 0 && (
            <button
              onClick={() => setQueries([])}
              className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              title="Clear conversation"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5" style={{ maxHeight: 420 }}>
          {queries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16 gap-3 text-muted-foreground">
              <Brain className="h-10 w-10 opacity-15" />
              <p className="text-sm font-medium">Ask the Brain anything</p>
              <p className="text-[12px] text-muted-foreground/70 text-center max-w-xs">
                Query clients, audits, KPIs, calls, and more. Try a suggestion below to get started.
              </p>
            </div>
          ) : (
            queries.map((q, i) => (
              <div key={i} className="space-y-3">
                {/* User bubble */}
                <div className="flex justify-end">
                  <div className="max-w-[78%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5">
                    <p className="text-sm font-medium text-primary-foreground">{q.query}</p>
                  </div>
                </div>
                {/* Brain bubble */}
                <div className="flex gap-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 mt-0.5">
                    <Brain className="h-3.5 w-3.5 text-accent" />
                  </div>
                  <div className="max-w-[84%] rounded-2xl rounded-bl-md bg-secondary border border-border px-4 py-3">
                    {q.answer ? (
                      <div className="prose prose-sm prose-invert max-w-none text-sm text-foreground leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:mb-2 [&_ol]:mb-2 [&_li]:mb-0.5 [&_strong]:text-cream [&_h1]:text-cream [&_h2]:text-cream [&_h3]:text-cream [&_code]:bg-background [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs">
                        <ReactMarkdown>{q.answer}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Thinking...</span>
                      </div>
                    )}
                    <span className="block text-[10px] text-muted-foreground/60 mt-2">{q.time}</span>
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggestion chips — DB-driven */}
        {queries.length === 0 && enabledPrompts.length > 0 && (
          <div className="flex gap-2 px-5 pb-3 flex-wrap shrink-0">
            {enabledPrompts.map((p) => (
              <button
                key={p.id}
                onClick={() => { setQueryInput(p.prompt); textareaRef.current?.focus(); }}
                className="rounded-full border border-border bg-secondary px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        {/* Input bar */}
        <div className="shrink-0 border-t border-border px-4 py-3 bg-card/80 backdrop-blur-sm">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder="Message the Brain... (Enter to send, Shift+Enter for new line)"
              value={queryInput}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              disabled={isQuerying}
              className="flex-1 resize-none rounded-xl border border-border bg-secondary px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all disabled:opacity-50 leading-relaxed"
              style={{ minHeight: 40, maxHeight: 120 }}
            />
            <button
              onClick={handleQuery}
              disabled={isQuerying || !queryInput.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {isQuerying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          {isQuerying && (
            <div className="flex items-center gap-1.5 mt-2 pl-1">
              <Sparkles className="h-3 w-3 text-accent animate-pulse" />
              <span className="text-[11px] text-muted-foreground">Brain is generating a response...</span>
            </div>
          )}
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
              {isSyncing ? "Syncing..." : "Sync Transcripts"}
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
                const isEmpty = src.item_count === 0;
                return (
                  <div key={src.id} className={`glow-card ${['glow-card-coral', 'glow-card-electric', 'glow-card-gold', 'glow-card-violet', 'glow-card-coral', 'glow-card-electric'][idx % 6]} rounded-xl bg-card p-4 flex items-center gap-4 cursor-pointer hover-scale ${isEmpty ? "opacity-50" : ""}`}
                    onClick={() => toast.info(`${src.name}`, { description: `${src.item_count.toLocaleString()} items indexed • ${isEmpty ? "Not yet connected — add credentials in Settings" : src.status === "synced" ? "Up to date" : "Sync in progress..."}` })}
                  >
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${isEmpty ? "bg-muted" : "bg-primary/10"}`}>
                      <IconComponent className={`h-5 w-5 ${isEmpty ? "text-muted-foreground" : "text-primary"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-cream">{src.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {isEmpty ? "Not connected" : `${src.item_count.toLocaleString()} items`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isEmpty ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Empty</span>
                      ) : src.status === "synced" ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-accent" />
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">Synced</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4 text-warning animate-spin" />
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-warning">{src.status}</span>
                        </>
                      )}
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
            <h2 className="text-sm font-bold text-cream uppercase tracking-wider">What the Brain can do</h2>
          </div>
          <div className="space-y-2.5">
            {[
              { label: "CRO Audits", description: "Scrapes any Shopify URL and generates 10 before/after recommendations using Gemini.", tag: "Reports →" },
              { label: "Oddit Score", description: "Scores 8 dimensions (clarity, trust, mobile UX, funnel, copy, social proof) out of 100.", tag: "Reports →" },
              { label: "Competitive Intel", description: "Scrapes competitor sites and surfaces design patterns, copy gaps, and priority wins.", tag: "Competitive Intel →" },
              { label: "Transcript Q&A", description: "Answers questions about past client calls using indexed Fireflies transcripts.", tag: "Ask below" },
              { label: "Report Drafts", description: "Generates AI-written CRO report summaries from audit data and client context.", tag: "Reports →" },
              { label: "Tweet Crafter", description: "Writes tweet variations in the @itsOddit voice, trained on the indexed tweet library.", tag: "Twitter / X →" },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-border bg-secondary px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-cream">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.description}</p>
                </div>
                <span className="shrink-0 text-[10px] font-semibold text-primary border border-primary/20 rounded-md px-2 py-1 whitespace-nowrap">
                  {item.tag}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Starting Prompts Manager */}
      <div className="mt-8 animate-fade-in">
        <div className="flex items-center gap-2 mb-4">
          <Settings2 className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Starting Prompts</h2>
          <span className="text-[11px] text-muted-foreground ml-1">— editable by the team</span>
          <button
            onClick={() => setShowPromptManager((v) => !v)}
            className="ml-auto text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {showPromptManager ? "Hide" : "Manage"}
          </button>
        </div>

        {showPromptManager && (
          <div className="glow-card rounded-xl bg-card border border-border p-5 space-y-4">
            {/* Existing prompts */}
            <div className="space-y-2">
              {brainPrompts.map((p) => (
                <div key={p.id} className="flex items-start gap-3 rounded-lg border border-border bg-background/50 px-4 py-3">
                  {editingId === p.id ? (
                    <div className="flex-1 space-y-2">
                      <input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        placeholder="Label (chip text)"
                        className="w-full rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                      <textarea
                        value={editPrompt}
                        onChange={(e) => setEditPrompt(e.target.value)}
                        rows={2}
                        placeholder="Full prompt sent to the Brain"
                        className="w-full resize-none rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            await updatePrompt.mutateAsync({ id: p.id, label: editLabel, prompt: editPrompt });
                            setEditingId(null);
                            toast.success("Prompt updated");
                          }}
                          className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90"
                        >
                          <Check className="h-3 w-3" /> Save
                        </button>
                        <button onClick={() => setEditingId(null)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-cream">{p.label}</p>
                        <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-2">{p.prompt}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 mt-0.5">
                        <button
                          onClick={() => updatePrompt.mutateAsync({ id: p.id, enabled: !p.enabled })}
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border transition-colors ${
                            p.enabled
                              ? "border-accent/30 bg-accent/10 text-accent"
                              : "border-border bg-muted/20 text-muted-foreground"
                          }`}
                        >
                          {p.enabled ? "On" : "Off"}
                        </button>
                        <button
                          onClick={() => { setEditingId(p.id); setEditLabel(p.label); setEditPrompt(p.prompt); }}
                          className="text-muted-foreground hover:text-foreground transition-colors p-1"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={async () => { await deletePrompt.mutateAsync(p.id); toast.success("Prompt removed"); }}
                          className="text-muted-foreground hover:text-destructive transition-colors p-1"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Add new prompt */}
            <div className="border-t border-border pt-4 space-y-2">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Add new prompt</p>
              <div className="flex gap-2">
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Chip label (e.g. Weekly wins)"
                  className="w-48 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <input
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  placeholder="Full prompt text…"
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <button
                  onClick={async () => {
                    if (!newLabel.trim() || !newPrompt.trim()) { toast.error("Label and prompt are required"); return; }
                    await addPrompt.mutateAsync({ label: newLabel.trim(), prompt: newPrompt.trim() });
                    setNewLabel(""); setNewPrompt("");
                    toast.success("Prompt added");
                  }}
                  disabled={addPrompt.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-bold text-accent-foreground hover:opacity-90 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AuditBrain;
