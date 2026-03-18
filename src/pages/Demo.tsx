import { DashboardLayout } from "@/components/DashboardLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BeforeAfterSlider } from "@/components/BeforeAfterSlider";
import {
  Brain, Eye, Target, Sparkles, Layers, TrendingUp, ArrowRight, CheckCircle2,
  AlertTriangle, Zap, Crown, Clock, DollarSign, ChevronDown, ChevronUp,
  BarChart3, FileText, Users, Flame, Code2, Star, ExternalLink,
} from "lucide-react";
import { useState } from "react";
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip } from "recharts";

// ── Types ────────────────────────────────────────────────
interface Recommendation {
  id: number;
  section: string;
  severity: "high" | "medium" | "low";
  aida_stage?: string;
  current_issue: string;
  recommended_change: string;
  before_copy?: string;
  after_copy?: string;
  competitor_reference?: string;
  expected_impact: string;
  revenue_impact_estimate?: string;
  difficulty?: "quick_win" | "moderate" | "complex";
  mockup_prompt: string;
  mockup_url?: string;
  section_screenshot_url?: string;
  cro_rationale: string;
  reference_examples: string;
  implementation_spec: string;
  priority_score: number;
}

interface CroAudit {
  id: string;
  shop_url: string;
  client_name: string;
  status: string;
  screenshot_url: string | null;
  recommendations: Recommendation[];
  created_at: string;
}

interface OdditScore {
  total_score: number;
  clarity_value_prop: number;
  visual_hierarchy: number;
  trust_signals: number;
  mobile_ux: number;
  funnel_logic: number;
  copy_strength: number;
  social_proof: number;
  speed_perception: number;
  dimension_notes: Record<string, string>;
}

// ── Helpers ──────────────────────────────────────────────
const severityColor = {
  high: "text-coral border-coral/20 bg-coral/8",
  medium: "text-gold border-gold/20 bg-gold/8",
  low: "text-accent border-accent/20 bg-accent/8",
};

const difficultyConfig = {
  quick_win: { label: "Quick Win", icon: Zap, color: "text-accent bg-accent/10 border-accent/20" },
  moderate: { label: "Moderate", icon: Clock, color: "text-gold bg-gold/10 border-gold/20" },
  complex: { label: "Complex", icon: Layers, color: "text-coral bg-coral/10 border-coral/20" },
};

const aidaColors: Record<string, string> = {
  attention: "text-coral",
  interest: "text-electric",
  desire: "text-gold",
  action: "text-accent",
};

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const color = score >= 70 ? "text-accent" : score >= 45 ? "text-gold" : "text-coral";
  const ringColor = score >= 70 ? "stroke-accent" : score >= 45 ? "stroke-gold" : "stroke-coral";
  const pct = (score / 100) * 283;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-20 w-20">
        <svg className="h-20 w-20 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill="none" stroke="hsl(var(--border))" strokeWidth="6" opacity="0.3" />
          <circle cx="50" cy="50" r="45" fill="none" className={ringColor} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={`${pct} 283`} style={{ transition: "stroke-dasharray 1s ease" }} />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center text-xl font-black ${color}`}>{score}</span>
      </div>
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
    </div>
  );
}

// ── Main Demo Page ───────────────────────────────────────
export default function Demo() {
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const [expandedRec, setExpandedRec] = useState<number | null>(null);

  // Fetch completed audits
  const { data: audits } = useQuery({
    queryKey: ["demo-audits"],
    queryFn: async () => {
      const { data } = await supabase
        .from("cro_audits")
        .select("id, shop_url, client_name, status, screenshot_url, recommendations, created_at")
        .eq("status", "completed")
        .not("recommendations", "is", null)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data || []) as CroAudit[];
    },
  });

  const selectedAudit = audits?.find((a) => a.id === selectedAuditId) || audits?.[0];

  // Fetch Oddit Score for selected audit
  const { data: odditScore } = useQuery({
    queryKey: ["demo-score", selectedAudit?.id],
    enabled: !!selectedAudit?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("oddit_scores")
        .select("*")
        .eq("cro_audit_id", selectedAudit!.id)
        .limit(1);
      return data?.[0] as OdditScore | undefined;
    },
  });

  // Fetch context stats
  const { data: contextStats } = useQuery({
    queryKey: ["demo-context-stats", selectedAudit?.client_name],
    enabled: !!selectedAudit?.client_name,
    queryFn: async () => {
      const cn = selectedAudit!.client_name;
      const [transcripts, figmaFiles, compIntel, pastAudits, recInsights] = await Promise.all([
        supabase.from("fireflies_transcripts").select("id", { count: "exact", head: true }).or(`title.ilike.%${cn}%,transcript_text.ilike.%${cn}%`),
        supabase.from("figma_files").select("id", { count: "exact", head: true }).ilike("client_name", cn).eq("enabled", true),
        supabase.from("competitive_intel").select("id", { count: "exact", head: true }).ilike("client_name", cn),
        supabase.from("cro_audits").select("id", { count: "exact", head: true }).ilike("client_name", cn).eq("status", "completed"),
        supabase.from("recommendation_insights").select("id", { count: "exact", head: true }),
      ]);
      return {
        transcripts: transcripts.count ?? 0,
        figmaFiles: figmaFiles.count ?? 0,
        compIntel: compIntel.count ?? 0,
        pastAudits: pastAudits.count ?? 0,
        recInsights: recInsights.count ?? 0,
      };
    },
  });

  const recs = (selectedAudit?.recommendations || []).sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0));
  const quickWins = recs.filter((r) => r.difficulty === "quick_win");
  const totalRevenue = recs.reduce((sum, r) => {
    const match = (r.revenue_impact_estimate || "").match(/\$[\d,]+/);
    return sum + (match ? parseInt(match[0].replace(/[$,]/g, "")) : 0);
  }, 0);

  const radarData = odditScore
    ? [
        { dim: "Clarity", val: odditScore.clarity_value_prop },
        { dim: "Visual", val: odditScore.visual_hierarchy },
        { dim: "Trust", val: odditScore.trust_signals },
        { dim: "Mobile", val: odditScore.mobile_ux },
        { dim: "Funnel", val: odditScore.funnel_logic },
        { dim: "Copy", val: odditScore.copy_strength },
        { dim: "Social", val: odditScore.social_proof },
        { dim: "Speed", val: odditScore.speed_perception },
      ]
    : [];

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-8 pb-16">
        {/* ── Hero ──────────────────────────────────── */}
        <div className="rounded-2xl p-8 relative overflow-hidden" style={{
          background: "linear-gradient(135deg, hsl(240 80% 68% / 0.12) 0%, hsl(270 70% 65% / 0.08) 40%, hsl(165 55% 55% / 0.05) 100%)",
          border: "1px solid hsl(240 80% 68% / 0.15)",
        }}>
          <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-primary/[0.06] blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="h-5 w-5 text-primary" />
              <span className="text-xs font-bold text-primary uppercase tracking-widest">Intelligence Demo</span>
            </div>
            <h1 className="text-3xl font-black text-foreground tracking-tight mb-2">See What the Brain Sees</h1>
            <p className="text-muted-foreground max-w-2xl">
              Pick any completed audit below. This page shows the full intelligence pipeline — every data source the AI referenced,
              the scoring breakdown, before/after copy comparisons, revenue impact estimates, and mockup quality.
            </p>
          </div>
        </div>

        {/* ── Audit Selector ───────────────────────── */}
        {audits && audits.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
            {audits.map((a) => (
              <button
                key={a.id}
                onClick={() => setSelectedAuditId(a.id)}
                className={`shrink-0 rounded-xl border px-4 py-2.5 text-left transition-all duration-200 ${
                  (selectedAudit?.id === a.id)
                    ? "border-primary/40 bg-primary/8 shadow-md"
                    : "border-border/60 bg-card/30 hover:border-border"
                }`}
              >
                <p className="text-sm font-bold text-foreground truncate max-w-[200px]">{a.client_name || a.shop_url}</p>
                <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{a.shop_url}</p>
              </button>
            ))}
          </div>
        )}

        {selectedAudit && (
          <>
            {/* ── Context Assembly Visualization ──── */}
            <div className="rounded-2xl border border-border/60 bg-card/30 p-6">
              <div className="flex items-center gap-2 mb-5">
                <Layers className="h-4 w-4 text-electric" />
                <h2 className="text-sm font-bold text-foreground">Context Assembly — What the AI Had Access To</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { icon: FileText, label: "Call Transcripts", value: contextStats?.transcripts ?? "–", color: "electric" },
                  { icon: Layers, label: "Figma Files", value: contextStats?.figmaFiles ?? "–", color: "primary" },
                  { icon: Target, label: "Competitor Intel", value: contextStats?.compIntel ?? "–", color: "coral" },
                  { icon: Eye, label: "Past Audits", value: contextStats?.pastAudits ?? "–", color: "accent" },
                  { icon: TrendingUp, label: "CRO Patterns", value: contextStats?.recInsights ?? "–", color: "gold" },
                ].map(({ icon: Icon, label, value, color }) => (
                  <div key={label} className="rounded-xl border border-border/40 bg-card/50 p-4 text-center">
                    <Icon className={`h-5 w-5 mx-auto mb-2 text-${color}`} />
                    <p className="text-2xl font-black text-foreground">{value}</p>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">{label}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground/60 mt-4 text-center">
                All of this context was assembled in real-time via <code className="text-primary/80">assemble-dossier</code> before the AI wrote a single word.
              </p>
            </div>

            {/* ── Score + Summary Row ───────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Oddit Score */}
              {odditScore && (
                <div className="lg:col-span-1 rounded-2xl border border-border/60 bg-card/30 p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <BarChart3 className="h-4 w-4 text-gold" />
                    <h3 className="text-sm font-bold text-foreground">Oddit Score</h3>
                  </div>
                  <div className="flex justify-center mb-4">
                    <ScoreGauge score={odditScore.total_score} label="Overall" />
                  </div>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="hsl(var(--border))" strokeOpacity={0.3} />
                        <PolarAngleAxis dataKey="dim" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                        <Radar dataKey="val" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={2} />
                        <Tooltip />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Summary Stats */}
              <div className={`${odditScore ? "lg:col-span-2" : "lg:col-span-3"} rounded-2xl border border-border/60 bg-card/30 p-6`}>
                <div className="flex items-center gap-2 mb-5">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-bold text-foreground">Audit Intelligence Summary</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                  <div className="rounded-xl bg-primary/5 border border-primary/10 p-4 text-center">
                    <p className="text-2xl font-black text-primary">{recs.length}</p>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase">Recommendations</p>
                  </div>
                  <div className="rounded-xl bg-accent/5 border border-accent/10 p-4 text-center">
                    <p className="text-2xl font-black text-accent">{quickWins.length}</p>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase">Quick Wins</p>
                  </div>
                  <div className="rounded-xl bg-coral/5 border border-coral/10 p-4 text-center">
                    <p className="text-2xl font-black text-coral">{recs.filter((r) => r.severity === "high").length}</p>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase">High Severity</p>
                  </div>
                  <div className="rounded-xl bg-gold/5 border border-gold/10 p-4 text-center">
                    <p className="text-2xl font-black text-gold">{totalRevenue > 0 ? `$${totalRevenue.toLocaleString()}` : "—"}</p>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase">Est. Monthly Impact</p>
                  </div>
                </div>

                {/* AIDA funnel distribution */}
                <div className="flex items-center gap-2 mb-3">
                  <Target className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">AIDA Distribution</span>
                </div>
                <div className="flex gap-2">
                  {(["attention", "interest", "desire", "action"] as const).map((stage) => {
                    const count = recs.filter((r) => r.aida_stage === stage).length;
                    return (
                      <div key={stage} className="flex-1 rounded-lg bg-card/50 border border-border/30 p-3 text-center">
                        <p className={`text-lg font-black ${aidaColors[stage]}`}>{count}</p>
                        <p className="text-[9px] font-semibold text-muted-foreground uppercase">{stage}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Homepage Screenshot ──────────────── */}
            {selectedAudit.screenshot_url && (
              <div className="rounded-2xl border border-border/60 bg-card/30 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-bold text-foreground">Scraped Homepage</h3>
                  <a href={selectedAudit.shop_url} target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-primary flex items-center gap-1 hover:underline">
                    Visit site <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <img
                  src={selectedAudit.screenshot_url}
                  alt="Homepage screenshot"
                  className="w-full max-h-[500px] object-cover object-top rounded-xl border border-border/40"
                />
              </div>
            )}

            {/* ── Recommendations Deep Dive ────────── */}
            <div>
              <div className="flex items-center gap-2 mb-5">
                <Flame className="h-4 w-4 text-coral" />
                <h2 className="text-sm font-bold text-foreground">Recommendations — Sorted by Priority Score</h2>
              </div>
              <div className="space-y-4">
                {recs.map((rec, idx) => {
                  const isExpanded = expandedRec === rec.id;
                  const diff = rec.difficulty ? difficultyConfig[rec.difficulty] : null;
                  return (
                    <div key={rec.id} className="rounded-2xl border border-border/60 bg-card/30 overflow-hidden transition-all duration-200">
                      {/* Header */}
                      <button
                        onClick={() => setExpandedRec(isExpanded ? null : rec.id)}
                        className="w-full flex items-center gap-4 p-5 text-left hover:bg-card/50 transition-colors"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary font-black text-sm shrink-0">
                          {rec.priority_score || idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-sm font-bold text-foreground">{rec.section}</span>
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${severityColor[rec.severity]}`}>
                              {rec.severity}
                            </span>
                            {rec.aida_stage && (
                              <span className={`text-[9px] font-bold uppercase tracking-wider ${aidaColors[rec.aida_stage] || "text-muted-foreground"}`}>
                                {rec.aida_stage}
                              </span>
                            )}
                            {diff && (
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${diff.color}`}>
                                <diff.icon className="h-2.5 w-2.5" />
                                {diff.label}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-1">{rec.current_issue}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {rec.revenue_impact_estimate && (
                            <span className="text-xs font-bold text-accent hidden sm:block">{rec.revenue_impact_estimate}</span>
                          )}
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </button>

                      {/* Expanded content */}
                      {isExpanded && (
                        <div className="border-t border-border/40 p-5 space-y-5 animate-fade-in">
                          {/* Issue + Fix */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="rounded-xl bg-coral/5 border border-coral/10 p-4">
                              <div className="flex items-center gap-1.5 mb-2">
                                <AlertTriangle className="h-3.5 w-3.5 text-coral" />
                                <span className="text-[10px] font-bold text-coral uppercase tracking-wider">Current Issue</span>
                              </div>
                              <p className="text-sm text-foreground/80">{rec.current_issue}</p>
                            </div>
                            <div className="rounded-xl bg-accent/5 border border-accent/10 p-4">
                              <div className="flex items-center gap-1.5 mb-2">
                                <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
                                <span className="text-[10px] font-bold text-accent uppercase tracking-wider">Recommended Fix</span>
                              </div>
                              <p className="text-sm text-foreground/80">{rec.recommended_change}</p>
                            </div>
                          </div>

                          {/* Before/After Copy Comparison */}
                          {(rec.before_copy || rec.after_copy) && (
                            <div className="rounded-xl border border-border/40 p-4">
                              <div className="flex items-center gap-1.5 mb-3">
                                <Code2 className="h-3.5 w-3.5 text-electric" />
                                <span className="text-[10px] font-bold text-electric uppercase tracking-wider">Copy Comparison</span>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {rec.before_copy && (
                                  <div className="rounded-lg bg-destructive/5 border border-destructive/10 p-3">
                                    <span className="text-[9px] font-bold text-destructive uppercase tracking-wider block mb-1.5">Before</span>
                                    <p className="text-sm text-foreground/70 line-through decoration-destructive/30">{rec.before_copy}</p>
                                  </div>
                                )}
                                {rec.after_copy && (
                                  <div className="rounded-lg bg-accent/5 border border-accent/10 p-3">
                                    <span className="text-[9px] font-bold text-accent uppercase tracking-wider block mb-1.5">After</span>
                                    <p className="text-sm text-foreground font-medium">{rec.after_copy}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Impact + Psychology Row */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="rounded-xl border border-border/30 bg-card/50 p-3">
                              <span className="text-[9px] font-bold text-gold uppercase tracking-wider block mb-1">Expected Impact</span>
                              <p className="text-xs text-foreground/80">{rec.expected_impact}</p>
                            </div>
                            {rec.revenue_impact_estimate && (
                              <div className="rounded-xl border border-accent/20 bg-accent/5 p-3">
                                <span className="text-[9px] font-bold text-accent uppercase tracking-wider block mb-1">Revenue Impact</span>
                                <p className="text-xs text-foreground font-bold">{rec.revenue_impact_estimate}</p>
                              </div>
                            )}
                            <div className="rounded-xl border border-border/30 bg-card/50 p-3">
                              <span className="text-[9px] font-bold text-primary uppercase tracking-wider block mb-1">CRO Psychology</span>
                              <p className="text-xs text-foreground/80">{rec.cro_rationale}</p>
                            </div>
                          </div>

                          {/* Competitor + References */}
                          {rec.competitor_reference && (
                            <div className="rounded-xl border border-border/30 bg-card/50 p-3">
                              <span className="text-[9px] font-bold text-electric uppercase tracking-wider block mb-1">Competitor Reference</span>
                              <p className="text-xs text-foreground/80">{rec.competitor_reference}</p>
                            </div>
                          )}

                          {/* Mockup */}
                          {rec.mockup_url && rec.section_screenshot_url && (
                            <div>
                              <span className="text-[9px] font-bold text-primary uppercase tracking-wider block mb-2">Before / After Mockup</span>
                              <BeforeAfterSlider
                                beforeSrc={rec.section_screenshot_url}
                                afterSrc={rec.mockup_url}
                                className="max-h-[400px]"
                              />
                            </div>
                          )}
                          {rec.mockup_url && !rec.section_screenshot_url && (
                            <div>
                              <span className="text-[9px] font-bold text-primary uppercase tracking-wider block mb-2">AI Mockup</span>
                              <img src={rec.mockup_url} alt={`Mockup for ${rec.section}`} className="rounded-xl border border-border/40 max-h-[400px] w-full object-contain" />
                            </div>
                          )}

                          {/* Implementation Spec */}
                          <details className="rounded-xl border border-border/30 bg-card/50">
                            <summary className="flex items-center gap-2 p-3 cursor-pointer hover:bg-card/80 transition-colors">
                              <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Implementation Spec</span>
                            </summary>
                            <div className="px-3 pb-3">
                              <pre className="text-xs text-foreground/70 whitespace-pre-wrap font-mono bg-background/50 rounded-lg p-3">{rec.implementation_spec}</pre>
                            </div>
                          </details>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {(!audits || audits.length === 0) && (
          <div className="rounded-2xl border border-border/60 bg-card/30 p-12 text-center">
            <Brain className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-foreground mb-2">No Completed Audits Yet</h3>
            <p className="text-sm text-muted-foreground">Run a CRO audit from the Reports page, then come back here to see the full intelligence breakdown.</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
