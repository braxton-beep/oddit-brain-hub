import { DashboardLayout } from "@/components/DashboardLayout";
import { useState } from "react";
import {
  Twitter,
  RefreshCw,
  Wand2,
  Copy,
  Check,
  ChevronDown,
  Heart,
  Repeat2,
  MessageCircle,
  Sparkles,
  AlertCircle,
  FileImage,
} from "lucide-react";
import {
  useTweets,
  useTweetStats,
  useTweetDrafts,
  useSyncTweets,
  useCraftTweet,
  useUpdateTweetType,
  useUpdateDraftStatus,
  TWEET_TYPES,
  Tweet,
} from "@/hooks/useTwitter";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ── Tweet type badge dropdown ────────────────────────────────────────────────

function TweetTypeBadge({ tweet, onUpdate }: { tweet: Tweet; onUpdate: (type: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = TWEET_TYPES.find((t) => t.id === tweet.tweet_type) ?? TWEET_TYPES[TWEET_TYPES.length - 1];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        {current.emoji} {current.label}
        {tweet.manually_tagged && <span className="text-primary">·M</span>}
        <ChevronDown className="h-2.5 w-2.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-7 z-20 w-40 rounded-xl border border-border bg-card shadow-xl p-1">
            {TWEET_TYPES.filter((t) => t.id !== "all").map((type) => (
              <button
                key={type.id}
                onClick={() => { onUpdate(type.id); setOpen(false); }}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-[11px] transition-colors ${
                  tweet.tweet_type === type.id
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                {type.emoji} {type.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Tweet card ───────────────────────────────────────────────────────────────

function TweetCard({ tweet, onUpdateType }: { tweet: Tweet; onUpdateType: (id: string, type: string) => void }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(tweet.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const date = tweet.created_at_twitter
    ? new Date(tweet.created_at_twitter).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : null;

  return (
    <div className="glow-card rounded-xl bg-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <TweetTypeBadge tweet={tweet} onUpdate={(type) => onUpdateType(tweet.id, type)} />
        <div className="flex items-center gap-2 shrink-0">
          {date && <span className="text-[10px] text-muted-foreground">{date}</span>}
          <button onClick={copy} className="text-muted-foreground hover:text-foreground transition-colors">
            {copied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
      <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{tweet.text}</p>
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground border-t border-border pt-2">
        <span className="flex items-center gap-1"><Heart className="h-3 w-3 text-rose-400" /> {tweet.like_count.toLocaleString()}</span>
        <span className="flex items-center gap-1"><Repeat2 className="h-3 w-3 text-green-400" /> {tweet.retweet_count.toLocaleString()}</span>
        <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3 text-blue-400" /> {tweet.reply_count.toLocaleString()}</span>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

const TwitterPage = () => {
  const [activeTab, setActiveTab] = useState<"library" | "crafter">("crafter");
  const [filterType, setFilterType] = useState("all");
  const [filterFigmaId, setFilterFigmaId] = useState("");
  const [topic, setTopic] = useState("");
  const [craftType, setCraftType] = useState("insight");
  const [selectedFigmaId, setSelectedFigmaId] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [generatedContent, setGeneratedContent] = useState("");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const { data: tweets, isLoading: tweetsLoading } = useTweets(filterType, filterFigmaId || undefined);
  const { data: stats } = useTweetStats();
  const { data: drafts } = useTweetDrafts();
  const syncTweets = useSyncTweets();
  const craftTweet = useCraftTweet();
  const updateType = useUpdateTweetType();
  const updateDraftStatus = useUpdateDraftStatus();

  // Figma files for context picker
  const { data: figmaFiles } = useQuery({
    queryKey: ["figma-files-picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("figma_files")
        .select("id, name, design_type, client_name")
        .order("name")
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const handleSync = async () => {
    try {
      const result = await syncTweets.mutateAsync();
      toast.success(`Synced ${result.total_fetched} tweets from @itsOddit`);
    } catch (e: any) {
      if (e?.message?.includes("TWITTER_BEARER_TOKEN")) {
        toast.error("Twitter Bearer Token not configured — add it in Settings");
      } else {
        toast.error(e?.message ?? "Sync failed");
      }
    }
  };

  const handleCraft = async () => {
    try {
      const result = await craftTweet.mutateAsync({
        topic: topic || undefined,
        tweet_type: craftType !== "all" ? craftType : undefined,
        figma_file_id: selectedFigmaId || undefined,
        custom_prompt: customPrompt || undefined,
      });
      setGeneratedContent(result.content);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to generate tweet");
    }
  };

  // Parse numbered variations from AI output
  const variations = generatedContent
    ? generatedContent
        .split(/\n(?=\d\))/)
        .map((v) => v.replace(/^\d\)\s*/, "").trim())
        .filter(Boolean)
    : [];

  const copyVariation = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const hasTweets = (stats?.total ?? 0) > 0;

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary animate-glow-pulse">
            <Twitter className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-cream">Twitter / X</h1>
            <p className="text-[13px] text-muted-foreground">
              @itsOddit voice analysis & AI tweet crafter
            </p>
          </div>
        </div>
        <button
          onClick={handleSync}
          disabled={syncTweets.isPending}
          className="flex items-center gap-2 rounded-lg bg-primary/15 border border-primary/30 px-4 py-2 text-xs font-bold text-primary hover:bg-primary/25 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncTweets.isPending ? "animate-spin" : ""}`} />
          {syncTweets.isPending ? "Syncing…" : "Sync Tweets"}
        </button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4 mb-8">
        <div className="glow-card rounded-xl bg-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Tweets Indexed</p>
          <p className="mt-2 text-2xl font-bold text-cream">{stats?.total?.toLocaleString() ?? "0"}</p>
        </div>
        <div className="glow-card rounded-xl bg-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Likes</p>
          <p className="mt-2 text-2xl font-bold text-cream">{stats?.totalLikes?.toLocaleString() ?? "0"}</p>
        </div>
        <div className="glow-card rounded-xl bg-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Drafts Generated</p>
          <p className="mt-2 text-2xl font-bold text-cream">{drafts?.length ?? "0"}</p>
        </div>
        <div className="glow-card rounded-xl bg-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Account</p>
          <p className="mt-2 text-sm font-bold text-accent">@itsOddit</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">x.com/itsOddit</p>
        </div>
      </div>

      {/* No tweets warning */}
      {!hasTweets && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-300">No tweets synced yet</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Add your Twitter Bearer Token in Settings, then hit "Sync Tweets" to index @itsOddit's history. The crafter works best with tweet data loaded.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1.5 mb-6">
        {[
          { id: "crafter", label: "✍️ Tweet Crafter" },
          { id: "library", label: "📚 Tweet Library" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`rounded-lg px-4 py-2 text-xs font-bold transition-colors ${
              activeTab === tab.id
                ? "bg-primary/15 text-primary border border-primary/30"
                : "text-muted-foreground hover:text-foreground bg-card border border-border"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tweet Crafter ─────────────────────────────────────────── */}
      {activeTab === "crafter" && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left: inputs */}
          <div className="space-y-4">
            <div className="glow-card rounded-xl bg-card p-5 space-y-4">
              <h2 className="text-sm font-bold text-cream">Craft a Tweet</h2>

              <div>
                <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Topic / Idea</label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Why most landing pages fail at trust signals"
                  className="w-full rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                />
              </div>

              <div>
                <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Tweet Style</label>
                <div className="flex flex-wrap gap-1.5">
                  {TWEET_TYPES.filter((t) => t.id !== "all").map((type) => (
                    <button
                      key={type.id}
                      onClick={() => setCraftType(type.id)}
                      className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                        craftType === type.id
                          ? "bg-primary/15 text-primary border border-primary/30"
                          : "text-muted-foreground bg-secondary border border-border hover:text-foreground"
                      }`}
                    >
                      {type.emoji} {type.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Figma context */}
              <div>
                <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <FileImage className="h-3 w-3" /> Figma Context (optional)
                </label>
                <select
                  value={selectedFigmaId}
                  onChange={(e) => setSelectedFigmaId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                >
                  <option value="">No Figma file</option>
                  {(figmaFiles ?? []).map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} {f.client_name ? `(${f.client_name})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Custom prompt override */}
              <div>
                <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Custom Prompt (optional override)</label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="Override the default prompt entirely…"
                  rows={2}
                  className="w-full rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all resize-none"
                />
              </div>

              <button
                onClick={handleCraft}
                disabled={craftTweet.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-xs font-bold text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <Wand2 className={`h-3.5 w-3.5 ${craftTweet.isPending ? "animate-pulse" : ""}`} />
                {craftTweet.isPending ? "Crafting…" : "Generate 3 Variations"}
              </button>
            </div>

            {/* Recent drafts */}
            {(drafts ?? []).length > 0 && (
              <div className="glow-card rounded-xl bg-card p-5">
                <h3 className="text-xs font-bold text-cream mb-3">Recent Drafts</h3>
                <div className="space-y-2">
                  {(drafts ?? []).slice(0, 5).map((draft) => (
                    <div key={draft.id} className="rounded-lg border border-border bg-secondary p-3">
                      <p className="text-[11px] text-muted-foreground line-clamp-2">{draft.draft_text.substring(0, 120)}…</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          draft.status === "approved" ? "bg-accent/15 text-accent" :
                          draft.status === "posted" ? "bg-primary/15 text-primary" :
                          "bg-secondary text-muted-foreground border border-border"
                        }`}>{draft.status}</span>
                        {draft.status === "draft" && (
                          <button
                            onClick={() => updateDraftStatus.mutate({ id: draft.id, status: "approved" })}
                            className="text-[10px] text-accent hover:text-accent/80 font-bold transition-colors"
                          >
                            Approve
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: generated output */}
          <div>
            {generatedContent ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-bold text-cream">Generated Variations</h2>
                  <span className="text-[11px] text-muted-foreground">Trained on {stats?.total?.toLocaleString() ?? "0"} tweets</span>
                </div>
                {variations.length > 0 ? (
                  variations.map((v, idx) => (
                    <div key={idx} className="glow-card rounded-xl bg-card p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Variation {idx + 1}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] ${v.length > 280 ? "text-red-400" : "text-muted-foreground"}`}>{v.length}/280</span>
                          <button
                            onClick={() => copyVariation(v, idx)}
                            className="flex items-center gap-1 rounded-lg bg-secondary border border-border px-2 py-1 text-[11px] font-bold text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {copiedIdx === idx ? <Check className="h-3 w-3 text-accent" /> : <Copy className="h-3 w-3" />}
                            {copiedIdx === idx ? "Copied!" : "Copy"}
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{v}</p>
                    </div>
                  ))
                ) : (
                  <div className="glow-card rounded-xl bg-card p-4">
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{generatedContent}</p>
                    <button
                      onClick={() => copyVariation(generatedContent, 0)}
                      className="mt-3 flex items-center gap-1 rounded-lg bg-secondary border border-border px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {copiedIdx === 0 ? <Check className="h-3 w-3 text-accent" /> : <Copy className="h-3 w-3" />}
                      Copy
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="glow-card rounded-xl bg-card p-8 flex flex-col items-center justify-center text-center h-full min-h-[300px]">
                <Twitter className="h-8 w-8 text-muted-foreground mb-3" />
                <p className="text-sm font-bold text-muted-foreground">Your generated tweets will appear here</p>
                <p className="text-xs text-muted-foreground mt-1">AI trains on @itsOddit's top-performing tweets to match your voice</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tweet Library ─────────────────────────────────────────── */}
      {activeTab === "library" && (
        <div>
          {/* Type filters */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {TWEET_TYPES.map((type) => (
              <button
                key={type.id}
                onClick={() => setFilterType(type.id)}
                className={`rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  filterType === type.id
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "text-muted-foreground hover:text-foreground bg-card border border-border"
                }`}
              >
                {type.emoji} {type.label}
                {type.id !== "all" && stats?.byType?.[type.id]
                  ? ` (${stats.byType[type.id]})`
                  : ""}
              </button>
            ))}
          </div>

          {/* Figma filter */}
          {(figmaFiles ?? []).length > 0 && (
            <div className="flex items-center gap-2 mb-6">
              <FileImage className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <select
                value={filterFigmaId}
                onChange={(e) => setFilterFigmaId(e.target.value)}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              >
                <option value="">All Figma files</option>
                {(figmaFiles ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    🎨 {f.name}{f.client_name ? ` (${f.client_name})` : ""}
                  </option>
                ))}
              </select>
              {filterFigmaId && (
                <button
                  onClick={() => setFilterFigmaId("")}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {tweetsLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-40 rounded-xl bg-card animate-pulse" />
              ))}
            </div>
          ) : (tweets ?? []).length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Twitter className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No tweets synced yet. Hit "Sync Tweets" to pull @itsOddit's history.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(tweets ?? []).map((tweet) => (
                <TweetCard
                  key={tweet.id}
                  tweet={tweet}
                  onUpdateType={(id, type) => updateType.mutate({ id, tweet_type: type })}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </DashboardLayout>
  );
};

export default TwitterPage;
