import { DashboardLayout } from "@/components/DashboardLayout";
import {
  Telescope,
  Plus,
  X,
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  MousePointerClick,
  Shield,
  Type,
  Users,
  FileText,
  Trash2,
  RefreshCw,
  GitCompare,
  Calendar,
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const ANALYZE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-competitors`;

interface CompetitorFindings {
  url: string;
  brand_name?: string;
  design_patterns?: string[];
  copy_frameworks?: string[];
  trust_signals?: string[];
  ctas?: string[];
  social_proof?: string[];
  gaps_for_client?: string[];
  overall_score?: number;
  standout_feature?: string;
}

interface AnalysisResult {
  success: boolean;
  client_name: string;
  findings: {
    competitors?: CompetitorFindings[];
    client_recommendations?: string[];
    priority_wins?: string[];
  };
  record_ids?: string[];
  error?: string;
}

interface SavedAnalysis {
  id: string;
  client_name: string;
  competitor_url: string;
  findings: CompetitorFindings;
  status: string;
  created_at: string;
}

const CATEGORY_CONFIG = [
  { key: "design_patterns", label: "Design Patterns", icon: TrendingUp, color: "text-violet" },
  { key: "copy_frameworks", label: "Copy Frameworks", icon: Type, color: "text-gold" },
  { key: "trust_signals", label: "Trust Signals", icon: Shield, color: "text-accent" },
  { key: "ctas", label: "CTAs", icon: MousePointerClick, color: "text-coral" },
  { key: "social_proof", label: "Social Proof", icon: Users, color: "text-primary" },
];

function CompetitorCard({
  competitor,
  clientName,
  onAddToReport,
}: {
  competitor: CompetitorFindings;
  clientName: string;
  onAddToReport: (competitor: CompetitorFindings) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const score = competitor.overall_score ?? 0;
  const scoreColor =
    score >= 80 ? "text-coral" : score >= 60 ? "text-gold" : "text-accent";

  return (
    <div className="glow-card glow-card-violet rounded-xl bg-card overflow-hidden animate-scale-in">
      <div className="flex items-start justify-between gap-4 p-5 border-b border-border">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base font-bold text-cream truncate">
              {competitor.brand_name || competitor.url}
            </span>
            {score > 0 && (
              <span className={`text-xs font-bold ${scoreColor} border border-current/30 rounded-full px-2 py-0.5`}>
                {score}/100
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground truncate">{competitor.url}</p>
          {competitor.standout_feature && (
            <p className="text-xs text-foreground/80 mt-2 leading-relaxed">
              <span className="text-accent font-semibold">⭐ Standout: </span>
              {competitor.standout_feature}
            </p>
          )}
        </div>
        <button
          onClick={() => onAddToReport(competitor)}
          className="shrink-0 flex items-center gap-1.5 rounded-lg bg-primary/15 border border-primary/30 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/25 transition-colors"
        >
          <FileText className="h-3 w-3" />
          Add to Report
        </button>
      </div>

      {competitor.gaps_for_client && competitor.gaps_for_client.length > 0 && (
        <div className="px-5 py-4 bg-coral/5 border-b border-coral/15">
          <p className="text-[11px] font-bold text-coral uppercase tracking-wider mb-2">
            What {clientName} is missing
          </p>
          <div className="space-y-1.5">
            {competitor.gaps_for_client.slice(0, expanded ? undefined : 3).map((gap, i) => (
              <div key={i} className="flex items-start gap-2">
                <AlertCircle className="h-3.5 w-3.5 text-coral shrink-0 mt-0.5" />
                <span className="text-xs text-foreground leading-relaxed">{gap}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {expanded && (
        <div className="divide-y divide-border">
          {CATEGORY_CONFIG.map(({ key, label, icon: Icon, color }) => {
            const items = (competitor as any)[key] as string[] | undefined;
            if (!items?.length) return null;
            return (
              <div key={key} className="px-5 py-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <Icon className={`h-3.5 w-3.5 ${color}`} />
                  <span className={`text-[11px] font-bold ${color} uppercase tracking-wider`}>{label}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((item, i) => (
                    <span
                      key={i}
                      className="rounded-lg bg-secondary border border-border px-2.5 py-1 text-xs text-foreground"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-center gap-1.5 py-3 text-xs text-muted-foreground hover:text-foreground transition-colors border-t border-border"
      >
        {expanded ? (
          <>
            <ChevronUp className="h-3.5 w-3.5" />
            Collapse
          </>
        ) : (
          <>
            <ChevronDown className="h-3.5 w-3.5" />
            View Full Breakdown
          </>
        )}
      </button>
    </div>
  );
}

// ── Diff View ────────────────────────────────────────────────────────────────
function RunDiffView({
  runA,
  runB,
  onClose,
}: {
  runA: SavedAnalysis;
  runB: SavedAnalysis;
  onClose: () => void;
}) {
  const fA = runA.findings;
  const fB = runB.findings;

  const diffCategories = CATEGORY_CONFIG.map(({ key, label, icon: Icon, color }) => {
    const itemsA = new Set((fA as any)?.[key] as string[] ?? []);
    const itemsB = new Set((fB as any)?.[key] as string[] ?? []);
    const added = [...itemsB].filter((x) => !itemsA.has(x));
    const removed = [...itemsA].filter((x) => !itemsB.has(x));
    const unchanged = [...itemsA].filter((x) => itemsB.has(x));
    return { key, label, Icon, color, added, removed, unchanged, hasChanges: added.length > 0 || removed.length > 0 };
  });

  const scoreDiff = (fB?.overall_score ?? 0) - (fA?.overall_score ?? 0);

  return (
    <div className="glow-card rounded-xl bg-card p-5 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitCompare className="h-4 w-4 text-violet" />
          <h3 className="text-sm font-bold text-cream">Run Comparison</h3>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="bg-secondary border border-border rounded-lg px-2 py-1">
          {new Date(runA.created_at).toLocaleDateString()}
        </span>
        <span>→</span>
        <span className="bg-secondary border border-border rounded-lg px-2 py-1">
          {new Date(runB.created_at).toLocaleDateString()}
        </span>
        {scoreDiff !== 0 && (
          <span className={`font-bold ${scoreDiff > 0 ? "text-coral" : "text-accent"}`}>
            Score {scoreDiff > 0 ? "+" : ""}{scoreDiff}
          </span>
        )}
      </div>

      {diffCategories.filter((d) => d.hasChanges).length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">No significant changes detected between these runs.</p>
      ) : (
        <div className="space-y-3">
          {diffCategories.filter((d) => d.hasChanges).map(({ key, label, Icon, color, added, removed }) => (
            <div key={key} className="rounded-lg border border-border bg-secondary p-3">
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`h-3.5 w-3.5 ${color}`} />
                <span className={`text-[11px] font-bold ${color} uppercase tracking-wider`}>{label}</span>
              </div>
              {added.length > 0 && (
                <div className="space-y-1 mb-2">
                  {added.map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-accent font-bold text-[11px] shrink-0">+ Added</span>
                      <span className="text-xs text-foreground">{item}</span>
                    </div>
                  ))}
                </div>
              )}
              {removed.length > 0 && (
                <div className="space-y-1">
                  {removed.map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-coral font-bold text-[11px] shrink-0">− Removed</span>
                      <span className="text-xs text-foreground line-through opacity-60">{item}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
const CompetitiveIntel = () => {
  const [clientName, setClientName] = useState("");
  const [clientUrl, setClientUrl] = useState("");
  const [industry, setIndustry] = useState("");
  const [competitorUrls, setCompetitorUrls] = useState<string[]>(["", ""]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [rerunningId, setRerunningId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showDiff, setShowDiff] = useState(false);
  const qc = useQueryClient();

  // Load past analyses
  const { data: savedAnalyses } = useQuery({
    queryKey: ["competitive-intel"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("competitive_intel")
        .select("*")
        .eq("status", "complete")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        findings: (row.findings ?? {}) as unknown as CompetitorFindings,
      })) as SavedAnalysis[];
    },
  });

  // Group analyses by client
  const groupedByClient = useMemo(() => {
    if (!savedAnalyses) return {};
    const groups: Record<string, SavedAnalysis[]> = {};
    for (const a of savedAnalyses) {
      const key = a.client_name || "Unknown";
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    }
    return groups;
  }, [savedAnalyses]);

  const addUrlField = () => {
    if (competitorUrls.length < 5) setCompetitorUrls([...competitorUrls, ""]);
  };

  const removeUrlField = (i: number) => {
    setCompetitorUrls(competitorUrls.filter((_, idx) => idx !== i));
  };

  const updateUrl = (i: number, val: string) => {
    const updated = [...competitorUrls];
    updated[i] = val;
    setCompetitorUrls(updated);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("competitive_intel").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["competitive-intel"] });
    toast.success("Analysis deleted");
  };

  const handleRunAnalysis = async () => {
    const validUrls = competitorUrls.filter((u) => u.trim());
    if (!clientName.trim()) {
      toast.error("Enter a client name");
      return;
    }
    if (!clientUrl.trim()) {
      toast.error("Enter the client's URL so we can compare accurately");
      return;
    }
    if (validUrls.length === 0) {
      toast.error("Add at least one competitor URL");
      return;
    }

    setIsAnalyzing(true);
    setResult(null);

    try {
      const resp = await fetch(ANALYZE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          client_name: clientName.trim(),
          client_url: clientUrl.trim(),
          competitor_urls: validUrls,
          client_industry: industry.trim() || undefined,
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.error || `Error ${resp.status}`);
      }

      setResult(data);
      qc.invalidateQueries({ queryKey: ["competitive-intel"] });
      toast.success("Analysis complete!", {
        description: `${validUrls.length} competitor${validUrls.length > 1 ? "s" : ""} analyzed for ${clientName}`,
      });
    } catch (e: any) {
      toast.error("Analysis failed", { description: e.message });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRerun = async (analysis: SavedAnalysis) => {
    setRerunningId(analysis.id);
    try {
      const resp = await fetch(ANALYZE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          client_name: analysis.client_name,
          client_url: analysis.competitor_url,
          competitor_urls: [analysis.competitor_url],
        }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Re-run failed");

      qc.invalidateQueries({ queryKey: ["competitive-intel"] });
      toast.success(`Re-run complete for ${analysis.client_name}`);
    } catch (e: any) {
      toast.error("Re-run failed", { description: e.message });
    } finally {
      setRerunningId(null);
    }
  };

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
    setShowDiff(false);
  };

  const handleAddToReport = (competitor: CompetitorFindings) => {
    const summary = [
      `## Competitive Intel: ${competitor.brand_name || competitor.url}`,
      competitor.standout_feature ? `**Standout:** ${competitor.standout_feature}` : "",
      competitor.gaps_for_client?.length
        ? `**Gaps for client:**\n${competitor.gaps_for_client.map((g) => `- ${g}`).join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    navigator.clipboard.writeText(summary).then(() => {
      toast.success("Copied to clipboard!", {
        description: "Paste into your report or Slack channel.",
      });
    });
  };

  const compareRunA = savedAnalyses?.find((a) => a.id === compareIds[0]);
  const compareRunB = savedAnalyses?.find((a) => a.id === compareIds[1]);

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mb-6 animate-fade-in">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary animate-glow-pulse">
            <Telescope className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-cream">Competitive Intel</h1>
              <span className="rounded-full border border-violet/40 bg-violet/10 px-2 py-0.5 text-[10px] font-bold tracking-widest text-violet uppercase">
                Agent
              </span>
            </div>
            <p className="text-[13px] text-muted-foreground">
              Analyzes competitor sites and surfaces design/copy patterns your clients are missing.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Input form */}
        <div className="lg:col-span-1">
          <div className="glow-card glow-card-violet rounded-xl bg-card p-5 sticky top-6">
            <h2 className="text-sm font-bold text-cream uppercase tracking-wider mb-5 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet" />
              Run Analysis
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Client Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Allbirds"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-secondary px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Client URL <span className="text-coral font-bold">*</span>
                </label>
                <input
                  type="text"
                  placeholder="https://allbirds.com"
                  value={clientUrl}
                  onChange={(e) => setClientUrl(e.target.value)}
                  className="w-full rounded-lg border border-border bg-secondary px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
                />
                <p className="text-[10px] text-muted-foreground mt-1">Used to identify gaps specific to this brand</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Industry <span className="text-muted-foreground/50 normal-case font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. DTC footwear, SaaS, beauty"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full rounded-lg border border-border bg-secondary px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Competitor URLs
                </label>
                <div className="space-y-2">
                  {competitorUrls.map((url, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="text"
                        placeholder={`https://competitor${i + 1}.com`}
                        value={url}
                        onChange={(e) => updateUrl(i, e.target.value)}
                        className="flex-1 rounded-lg border border-border bg-secondary px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
                      />
                      {competitorUrls.length > 1 && (
                        <button
                          onClick={() => removeUrlField(i)}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {competitorUrls.length < 5 && (
                    <button
                      onClick={addUrlField}
                      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors mt-1"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add another URL (max 5)
                    </button>
                  )}
                </div>
              </div>

              <button
                onClick={handleRunAnalysis}
                disabled={isAnalyzing}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 mt-2"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing competitors...
                  </>
                ) : (
                  <>
                    <Telescope className="h-4 w-4" />
                    Run Competitive Analysis
                  </>
                )}
              </button>

              {isAnalyzing && (
                <div className="flex items-center gap-2 rounded-lg bg-violet/10 border border-violet/20 px-3 py-2.5">
                  <Sparkles className="h-3.5 w-3.5 text-violet animate-pulse shrink-0" />
                  <p className="text-xs text-violet leading-relaxed">
                    Scraping competitor pages and running Gemini analysis. This takes ~20–40 seconds.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Results */}
        <div className="lg:col-span-2 space-y-6">
          {/* Live result */}
          {result && result.findings?.competitors && (
            <div className="animate-fade-in">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="h-4 w-4 text-accent" />
                <h2 className="text-sm font-bold text-cream uppercase tracking-wider">
                  Analysis for {result.client_name}
                </h2>
              </div>

              {(result.findings.client_recommendations?.length || result.findings.priority_wins?.length) && (
                <div className="glow-card glow-card-gold rounded-xl bg-card p-5 mb-4">
                  {result.findings.priority_wins?.length ? (
                    <>
                      <p className="text-xs font-bold text-gold uppercase tracking-wider mb-3">
                        ⚡ Priority Wins for {result.client_name}
                      </p>
                      <div className="space-y-2 mb-4">
                        {result.findings.priority_wins.map((win, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-gold shrink-0 mt-0.5" />
                            <span className="text-sm text-foreground">{win}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                  {result.findings.client_recommendations?.length ? (
                    <>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                        Full Recommendations
                      </p>
                      <div className="space-y-1.5">
                        {result.findings.client_recommendations.map((rec, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className="text-xs text-muted-foreground shrink-0 mt-0.5">{i + 1}.</span>
                            <span className="text-xs text-foreground leading-relaxed">{rec}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
              )}

              <div className="space-y-4">
                {result.findings.competitors.map((comp, i) => (
                  <CompetitorCard
                    key={i}
                    competitor={comp}
                    clientName={result.client_name}
                    onAddToReport={handleAddToReport}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Compare diff view */}
          {showDiff && compareRunA && compareRunB && (
            <RunDiffView
              runA={compareRunA}
              runB={compareRunB}
              onClose={() => { setShowDiff(false); setCompareIds([]); }}
            />
          )}

          {/* Past analyses grouped by client */}
          {Object.keys(groupedByClient).length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-cream uppercase tracking-wider flex items-center gap-2">
                  <Telescope className="h-4 w-4 text-muted-foreground" />
                  Past Analyses
                </h2>
                {compareIds.length === 2 && (
                  <button
                    onClick={() => setShowDiff(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-violet/15 border border-violet/30 px-3 py-1.5 text-xs font-bold text-violet hover:bg-violet/25 transition-colors"
                  >
                    <GitCompare className="h-3.5 w-3.5" />
                    Compare Selected ({compareIds.length}/2)
                  </button>
                )}
                {compareIds.length === 1 && (
                  <span className="text-[11px] text-muted-foreground">Select 1 more run to compare</span>
                )}
              </div>

              <div className="space-y-6">
                {Object.entries(groupedByClient).map(([client, analyses]) => (
                  <div key={client}>
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-bold text-cream uppercase tracking-wider">{client}</span>
                      <span className="text-[10px] text-muted-foreground">({analyses.length} run{analyses.length > 1 ? "s" : ""})</span>
                    </div>

                    <div className="space-y-2 pl-2 border-l-2 border-border ml-1.5">
                      {analyses.map((analysis) => {
                        const f = analysis.findings as CompetitorFindings;
                        const isSelected = compareIds.includes(analysis.id);
                        return (
                          <div
                            key={analysis.id}
                            className={`glow-card rounded-xl bg-card p-4 flex items-start gap-4 transition-colors ${
                              isSelected ? "border-violet/50 bg-violet/5" : ""
                            }`}
                          >
                            {/* Compare checkbox */}
                            <button
                              onClick={() => toggleCompare(analysis.id)}
                              className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                                isSelected
                                  ? "bg-violet border-violet text-white"
                                  : "border-border hover:border-violet/50"
                              }`}
                            >
                              {isSelected && <CheckCircle2 className="h-3 w-3" />}
                            </button>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                <Calendar className="h-3 w-3 text-muted-foreground" />
                                <span className="text-xs font-semibold text-cream">
                                  {new Date(analysis.created_at).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  })}
                                </span>
                                <span className="text-muted-foreground text-xs">—</span>
                                <span className="text-xs text-muted-foreground truncate">
                                  {f?.brand_name || analysis.competitor_url}
                                </span>
                              </div>
                              {f?.standout_feature && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                                  {f.standout_feature}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {f?.overall_score && (
                                <span className="text-xs font-bold text-gold border border-gold/30 rounded-full px-2 py-0.5">
                                  {f.overall_score}/100
                                </span>
                              )}
                              <button
                                onClick={() => handleRerun(analysis)}
                                disabled={rerunningId === analysis.id}
                                className="flex items-center gap-1 rounded-lg bg-secondary border border-border px-2 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                                title="Re-run analysis"
                              >
                                <RefreshCw className={`h-3 w-3 ${rerunningId === analysis.id ? "animate-spin" : ""}`} />
                                Re-run
                              </button>
                              <button
                                onClick={() => handleAddToReport(f)}
                                className="flex items-center gap-1 rounded-lg bg-primary/10 border border-primary/20 px-2 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/20 transition-colors"
                              >
                                <FileText className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => handleDelete(analysis.id)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!result && (!savedAnalyses || savedAnalyses.length === 0) && (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary border border-border">
                <Telescope className="h-8 w-8 opacity-30" />
              </div>
              <div>
                <p className="text-sm font-medium text-cream/60 mb-1">No analyses yet</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Enter a client name and competitor URLs on the left, then run an analysis to surface what your clients are missing.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CompetitiveIntel;
