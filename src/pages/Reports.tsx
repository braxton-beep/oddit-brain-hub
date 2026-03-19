import { DashboardLayout } from "@/components/DashboardLayout";
import {
  FileText, Eye, Clock, CheckCircle2, AlertCircle, Plus, Loader2,
  BarChart3, X, Globe, Sparkles, ImageIcon, ArrowRight, ExternalLink,
  AlertTriangle, ChevronDown, ChevronUp, Target, Share2, Copy, Check,
  Zap, RefreshCw, TrendingUp, Lightbulb, Code2, Layers, Star,
  ArrowLeft, Rocket, Wrench, Timer, Maximize2,
} from "lucide-react";
import { useState, useEffect } from "react";
import { BeforeAfterSlider } from "@/components/BeforeAfterSlider";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip } from "recharts";

const GENERATE_AUDIT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-cro-audit`;
const GENERATE_MOCKUP_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-audit-mockup`;
const GENERATE_SCORE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-oddit-score`;
const GENERATE_CODE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-shopify-code`;

interface Recommendation {
  id: number;
  section: string;
  severity: "high" | "medium" | "low";
  aida_stage?: "attention" | "interest" | "desire" | "action";
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
  mockup_variants?: string[];
  mockup_rating?: number;
  section_screenshot_url?: string;
  section_screenshot_focus_pct?: number;
  scroll_percentage?: number;
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
  portal_token: string | null;
  portal_enabled: boolean;
}

interface OdditScore {
  id: string;
  cro_audit_id: string;
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

const SCORE_DIMS = [
  { key: "clarity_value_prop", label: "Clarity" },
  { key: "visual_hierarchy", label: "Visual" },
  { key: "trust_signals", label: "Trust" },
  { key: "mobile_ux", label: "Mobile" },
  { key: "funnel_logic", label: "Funnel" },
  { key: "copy_strength", label: "Copy" },
  { key: "social_proof", label: "Social" },
  { key: "speed_perception", label: "Speed" },
];

const severityStyles = {
  high: { bg: "bg-destructive/15 text-destructive border-destructive/30", dot: "bg-destructive" },
  medium: { bg: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", dot: "bg-yellow-500" },
  low: { bg: "bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30", dot: "bg-muted-foreground" },
};

const difficultyStyles = {
  quick_win: { label: "Quick Win", icon: Zap, color: "text-accent bg-accent/10 border-accent/30" },
  moderate: { label: "Moderate", icon: Wrench, color: "text-blue-400 bg-blue-400/10 border-blue-400/30" },
  complex: { label: "Complex", icon: Timer, color: "text-orange-400 bg-orange-400/10 border-orange-400/30" },
};

const aidaStyles: Record<string, { label: string; color: string }> = {
  attention: { label: "Attention", color: "text-red-400 bg-red-400/10 border-red-400/30" },
  interest: { label: "Interest", color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30" },
  desire: { label: "Desire", color: "text-purple-400 bg-purple-400/10 border-purple-400/30" },
  action: { label: "Action", color: "text-accent bg-accent/10 border-accent/30" },
};

const statusIcon: Record<string, typeof CheckCircle2> = {
  completed: CheckCircle2,
  failed: AlertCircle,
  scraping: Loader2,
  analyzing: Loader2,
  screenshotting: Loader2,
  generating: Loader2,
};

const Reports = () => {
  const [audits, setAudits] = useState<CroAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewAudit, setShowNewAudit] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [viewingAudit, setViewingAudit] = useState<CroAudit | null>(null);
  const [activeRecId, setActiveRecId] = useState<number | null>(null);
  const [generatingMockups, setGeneratingMockups] = useState<Set<number>>(new Set());
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [selectedVariants, setSelectedVariants] = useState<Record<number, number>>({});
  const [generatingScore, setGeneratingScore] = useState<string | null>(null);
  const [sharingPortal, setSharingPortal] = useState<string | null>(null);
  const [copiedPortal, setCopiedPortal] = useState<string | null>(null);
  const [refinementInputs, setRefinementInputs] = useState<Record<number, string>>({});
  const [showRefinementInput, setShowRefinementInput] = useState<Set<number>>(new Set());
  const [mockupQuality, setMockupQuality] = useState<"draft" | "final">("draft");
  const [generatingCode, setGeneratingCode] = useState<Set<number>>(new Set());
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: scores } = useQuery({
    queryKey: ["oddit-scores"],
    queryFn: async () => {
      const { data } = await supabase.from("oddit_scores").select("*").order("created_at", { ascending: false });
      return (data || []) as OdditScore[];
    },
  });

  useEffect(() => { loadAudits(); }, []);

  // Poll for in-progress audits every 5 seconds
  useEffect(() => {
    const hasProcessing = audits.some(a => ["scraping", "analyzing", "screenshotting", "generating"].includes(a.status));
    if (!hasProcessing && !generating) return;
    const interval = setInterval(() => { loadAudits(); }, 5000);
    return () => clearInterval(interval);
  }, [audits, generating]);

  const loadAudits = async () => {
    const { data, error } = await supabase
      .from("cro_audits")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) {
      const STALE_MS = 5 * 60 * 1000;
      const now = Date.now();
      setAudits(data.map((d: any) => {
        const isProcessing = ["scraping", "analyzing", "screenshotting", "generating"].includes(d.status);
        const age = now - new Date(d.created_at).getTime();
        const isStale = isProcessing && age > STALE_MS;
        return {
          ...d,
          status: isStale ? "failed" : d.status,
          recommendations: (d.recommendations || []) as unknown as Recommendation[],
        };
      }));
    }
    setLoading(false);
  };

  const handleNewAudit = async () => {
    if (!newUrl.trim()) { toast.error("Enter a shop URL"); return; }
    setGenerating(true);
    setShowNewAudit(false);
    const toastId = `audit-${Date.now()}`;
    toast.loading("Scraping website & analyzing with AI...", { id: toastId, description: "This takes 60-90 seconds. The page will auto-update." });

    // Fire the request but don't block on it — polling will pick up the result
    fetch(GENERATE_AUDIT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
      body: JSON.stringify({ url: newUrl, clientName: newClientName }),
    })
      .then(async (resp) => {
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({ error: "Request failed" }));
          throw new Error(err.error || `Error ${resp.status}`);
        }
        const result = await resp.json();
        toast.success(`Audit complete! ${result.recommendations?.length || 0} recommendations found`, { id: toastId });
        await loadAudits();
        if (result.auditId) {
          const { data: newAudit } = await supabase.from("cro_audits").select("*").eq("id", result.auditId).single();
          if (newAudit) {
            setViewingAudit({ ...newAudit, recommendations: (newAudit.recommendations || []) as unknown as Recommendation[] });
            setActiveRecId(null);
          }
        }
      })
      .catch((e: any) => { toast.error("Audit failed", { id: toastId, description: e.message }); })
      .finally(() => { setGenerating(false); });

    setNewUrl(""); setNewClientName("");
    // Initial load to show the "scraping" status immediately
    setTimeout(() => loadAudits(), 2000);
  };

  const handleGenerateMockup = async (audit: CroAudit, rec: Recommendation, variantCount = 2, refinementNotes?: string) => {
    setGeneratingMockups((prev) => new Set(prev).add(rec.id));
    const isRefinement = !!refinementNotes;
    const toastId = `mockup-${rec.id}`;
    toast.loading(isRefinement ? `Refining mockup...` : `Generating ${variantCount} mockup variant(s)...`, { id: toastId });
    try {
      const resp = await fetch(GENERATE_MOCKUP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({
          auditId: audit.id, recommendationId: rec.id, mockupPrompt: rec.mockup_prompt,
          variantCount: isRefinement ? 1 : variantCount, refinementNotes: refinementNotes || undefined,
          previousMockupUrl: isRefinement ? (rec.mockup_variants?.[selectedVariants[rec.id] ?? 0] || rec.mockup_url) : undefined,
          quality: mockupQuality,
        }),
      });
      if (!resp.ok) { const err = await resp.json().catch(() => ({ error: "Request failed" })); throw new Error(err.error || `Error ${resp.status}`); }
      const result = await resp.json();
      const variantUrls = result.variants || [result.mockupUrl];
      toast.success(isRefinement ? "Mockup refined!" : `${variantUrls.length} variant(s) generated!`, { id: toastId });
      const updatedRecs = audit.recommendations.map((r) => r.id === rec.id ? { ...r, mockup_url: result.mockupUrl, mockup_variants: variantUrls } : r);
      const updatedAudit = { ...audit, recommendations: updatedRecs };
      setViewingAudit(updatedAudit);
      setAudits((prev) => prev.map((a) => (a.id === audit.id ? updatedAudit : a)));
      setRefinementInputs((prev) => ({ ...prev, [rec.id]: "" }));
      setShowRefinementInput((prev) => { const n = new Set(prev); n.delete(rec.id); return n; });
    } catch (e: any) { toast.error("Mockup generation failed", { id: toastId, description: e.message }); }
    finally { setGeneratingMockups((prev) => { const next = new Set(prev); next.delete(rec.id); return next; }); }
  };

  const handleRateMockup = async (audit: CroAudit, rec: Recommendation, rating: number) => {
    const updatedRecs = audit.recommendations.map((r) => r.id === rec.id ? { ...r, mockup_rating: rating } : r);
    const updatedAudit = { ...audit, recommendations: updatedRecs };
    setViewingAudit(updatedAudit);
    setAudits((prev) => prev.map((a) => (a.id === audit.id ? updatedAudit : a)));
    await supabase.from("cro_audits").update({ recommendations: updatedRecs as any }).eq("id", audit.id);
    toast.success(rating >= 4 ? "⭐ Starred as reference quality!" : `Rated ${rating}/5`);
  };

  const handleGenerateScore = async (audit: CroAudit) => {
    setGeneratingScore(audit.id);
    const toastId = `score-${audit.id}`;
    toast.loading("Generating Oddit Score...", { id: toastId });
    try {
      const recs = audit.recommendations;
      const context = `Site: ${audit.shop_url}\nClient: ${audit.client_name}\nRecommendations:\n${recs.map((r) => `- [${r.severity}] ${r.section}: ${r.current_issue}`).join("\n")}`;
      const resp = await fetch(GENERATE_SCORE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ audit_id: audit.id, client_name: audit.client_name, shop_url: audit.shop_url, site_content: context }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Score failed");
      toast.success(`Oddit Score: ${data.score?.total_score}/100`, { id: toastId });
      qc.invalidateQueries({ queryKey: ["oddit-scores"] });
    } catch (e: any) { toast.error("Score generation failed", { id: toastId, description: e.message }); }
    finally { setGeneratingScore(null); }
  };

  const handleSharePortal = async (audit: CroAudit) => {
    setSharingPortal(audit.id);
    try {
      let token = audit.portal_token;
      if (!token) {
        token = crypto.randomUUID();
        await supabase.from("cro_audits").update({ portal_token: token, portal_enabled: true }).eq("id", audit.id);
        await loadAudits();
      } else {
        await supabase.from("cro_audits").update({ portal_enabled: true }).eq("id", audit.id);
      }
      const url = `${window.location.origin}/portal/${token}`;
      await navigator.clipboard.writeText(url);
      setCopiedPortal(audit.id);
      setTimeout(() => setCopiedPortal(null), 3000);
      toast.success("Portal link copied!");
    } catch (e: any) { toast.error("Failed to create portal", { description: e.message }); }
    finally { setSharingPortal(null); }
  };

  const handleBatchGenerateMockups = async (audit: CroAudit) => {
    const recsWithoutMockup = audit.recommendations.filter((r) => !r.mockup_url && r.mockup_prompt);
    if (recsWithoutMockup.length === 0) { toast.info("All recommendations already have mockups!"); return; }
    setBatchGenerating(true);
    const toastId = "batch-mockups";
    let completed = 0;
    toast.loading(`Generating ${recsWithoutMockup.length} mockups...`, { id: toastId, description: `0/${recsWithoutMockup.length}` });
    for (const rec of recsWithoutMockup) {
      try {
        setGeneratingMockups((prev) => new Set(prev).add(rec.id));
        const resp = await fetch(GENERATE_MOCKUP_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
          body: JSON.stringify({ auditId: audit.id, recommendationId: rec.id, mockupPrompt: rec.mockup_prompt }),
        });
        if (resp.ok) {
          const result = await resp.json();
          const updatedRecs = (viewingAudit?.recommendations ?? audit.recommendations).map((r) =>
            r.id === rec.id ? { ...r, mockup_url: result.mockupUrl, mockup_variants: result.variants || [result.mockupUrl] } : r
          );
          const updatedAudit = { ...(viewingAudit ?? audit), recommendations: updatedRecs };
          setViewingAudit(updatedAudit);
          setAudits((prev) => prev.map((a) => (a.id === audit.id ? updatedAudit : a)));
        }
        completed++;
        toast.loading(`Generating mockups...`, { id: toastId, description: `${completed}/${recsWithoutMockup.length}` });
      } catch { completed++; }
      finally { setGeneratingMockups((prev) => { const next = new Set(prev); next.delete(rec.id); return next; }); }
    }
    setBatchGenerating(false);
    toast.success(`${completed} mockups generated!`, { id: toastId });
  };

  const handleAcceptAndGenerateCode = async (audit: CroAudit, rec: Recommendation) => {
    setGeneratingCode((prev) => new Set(prev).add(rec.id));
    const toastId = `code-${rec.id}`;
    toast.loading("Creating pipeline project & generating Shopify code...", { id: toastId });
    try {
      // Create pipeline project
      const { data: project, error } = await supabase.from("pipeline_projects").insert({
        client: audit.client_name || audit.shop_url,
        page: `[Rec #${rec.id}] ${rec.section}`,
        stages: [
          { name: "Figma Pull", status: "done" },
          { name: "Section Split", status: "done" },
          { name: "Code Gen", status: "active" },
          { name: "QA", status: "pending" },
          { name: "Refinement", status: "pending" },
        ],
        last_update: "Accepted from audit — generating code",
      }).select().single();
      if (error) throw error;

      // Trigger code generation
      const resp = await fetch(GENERATE_CODE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ pipeline_project_id: project.id }),
      });
      if (!resp.ok) { const err = await resp.json().catch(() => ({ error: "Code gen failed" })); throw new Error(err.error); }
      toast.success(`Shopify code generated for "${rec.section}"!`, { id: toastId, description: "Check the Dev Pipeline" });
    } catch (e: any) { toast.error("Code generation failed", { id: toastId, description: e.message }); }
    finally { setGeneratingCode((prev) => { const next = new Set(prev); next.delete(rec.id); return next; }); }
  };

  const completedAudits = audits.filter((a) => a.status === "completed");
  const totalRecs = completedAudits.reduce((sum, a) => sum + a.recommendations.length, 0);
  const activeRec = viewingAudit?.recommendations.find((r) => r.id === activeRecId) || null;
  const auditScore = viewingAudit ? (scores || []).find((s) => s.cro_audit_id === viewingAudit.id) : null;

  // ═══════════════════════════════════════════════════════════
  // FULL-PAGE AUDIT VIEWER
  // ═══════════════════════════════════════════════════════════
  if (viewingAudit) {
    return (
      <DashboardLayout>
        {/* Fullscreen image overlay */}
        {fullscreenImage && (
          <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 cursor-pointer" onClick={() => setFullscreenImage(null)}>
            <img src={fullscreenImage} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
            <button className="absolute top-6 right-6 text-white/70 hover:text-white"><X className="h-8 w-8" /></button>
          </div>
        )}

        <div className="pt-10 md:pt-0 animate-fade-in">
          {/* Top bar */}
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => { setViewingAudit(null); setActiveRecId(null); }} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" /> Back to Audits
            </button>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Quality:</span>
              <button onClick={() => setMockupQuality("draft")} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${mockupQuality === "draft" ? "bg-accent/20 text-accent border border-accent/30" : "bg-secondary text-muted-foreground border border-border"}`}>⚡ Draft</button>
              <button onClick={() => setMockupQuality("final")} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${mockupQuality === "final" ? "bg-primary/20 text-primary border border-primary/30" : "bg-secondary text-muted-foreground border border-border"}`}>💎 Final</button>
            </div>
          </div>

          {/* Audit Header — Big & Bold */}
          <div className="glow-card rounded-2xl bg-card border border-primary/10 p-6 mb-6">
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Screenshot */}
              {viewingAudit.screenshot_url && (
                <div className="relative group cursor-pointer shrink-0" onClick={() => setFullscreenImage(viewingAudit.screenshot_url!)}>
                  <img src={viewingAudit.screenshot_url} alt="Site" className="w-full lg:w-64 h-48 rounded-xl object-cover border border-border" />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                    <Maximize2 className="h-6 w-6 text-white" />
                  </div>
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h1 className="text-2xl lg:text-3xl font-bold text-cream">
                      {viewingAudit.client_name || new URL(viewingAudit.shop_url).hostname}
                    </h1>
                    <a href={viewingAudit.shop_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1 mt-1">
                      {viewingAudit.shop_url} <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <p className="text-sm text-muted-foreground mt-2">
                      {viewingAudit.recommendations.length} recommendations • {new Date(viewingAudit.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                    </p>
                  </div>

                  {/* Oddit Score */}
                  {auditScore && (
                    <div className="text-center shrink-0">
                      <div className={`text-4xl font-black ${auditScore.total_score >= 70 ? "text-accent" : auditScore.total_score >= 40 ? "text-yellow-400" : "text-destructive"}`}>
                        {auditScore.total_score}
                      </div>
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Oddit Score</p>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 mt-4">
                  {(() => {
                    const missing = viewingAudit.recommendations.filter((r) => !r.mockup_url && r.mockup_prompt).length;
                    return missing > 0 ? (
                      <button onClick={() => handleBatchGenerateMockups(viewingAudit)} disabled={batchGenerating}
                        className="flex items-center gap-2 rounded-lg bg-accent/10 border border-accent/30 px-4 py-2 text-xs font-bold text-accent hover:bg-accent/20 transition-colors disabled:opacity-50">
                        {batchGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
                        {batchGenerating ? "Generating..." : `Generate All Mockups (${missing})`}
                      </button>
                    ) : null;
                  })()}
                  {!auditScore && (
                    <button onClick={() => handleGenerateScore(viewingAudit)} disabled={generatingScore === viewingAudit.id}
                      className="flex items-center gap-2 rounded-lg bg-gold/10 border border-gold/30 px-4 py-2 text-xs font-bold text-gold hover:bg-gold/20 transition-colors disabled:opacity-50">
                      {generatingScore === viewingAudit.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
                      Generate Score
                    </button>
                  )}
                  <button onClick={() => handleSharePortal(viewingAudit)} disabled={sharingPortal === viewingAudit.id}
                    className="flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/30 px-4 py-2 text-xs font-bold text-primary hover:bg-primary/20 transition-colors disabled:opacity-50">
                    {sharingPortal === viewingAudit.id ? <Loader2 className="h-4 w-4 animate-spin" /> : copiedPortal === viewingAudit.id ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                    {copiedPortal === viewingAudit.id ? "Link Copied!" : "Share Portal"}
                  </button>
                </div>
              </div>

              {/* Radar Chart */}
              {auditScore && (
                <div className="w-full lg:w-56 h-48 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={SCORE_DIMS.map((d) => ({ dim: d.label, value: (auditScore as any)[d.key] }))}>
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis dataKey="dim" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                      <Radar dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} />
                      <Tooltip />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Severity + Difficulty Summary */}
            <div className="flex flex-wrap gap-4 mt-5 pt-5 border-t border-border">
              {(["high", "medium", "low"] as const).map((sev) => {
                const count = viewingAudit.recommendations.filter((r) => r.severity === sev).length;
                return (
                  <div key={sev} className="flex items-center gap-2">
                    <div className={`h-3 w-3 rounded-full ${severityStyles[sev].dot}`} />
                    <span className="text-sm text-muted-foreground">{count} {sev} priority</span>
                  </div>
                );
              })}
              <div className="w-px bg-border" />
              {(["quick_win", "moderate", "complex"] as const).map((diff) => {
                const count = viewingAudit.recommendations.filter((r) => r.difficulty === diff).length;
                if (count === 0) return null;
                const style = difficultyStyles[diff];
                const Icon = style.icon;
                return (
                  <div key={diff} className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{count} {style.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recommendations Grid */}
          <div className="space-y-4">
            {viewingAudit.recommendations
              .sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0))
              .map((rec) => {
                const isExpanded = activeRecId === rec.id;
                const sev = severityStyles[rec.severity];
                const isMockupLoading = generatingMockups.has(rec.id);
                const isCodeLoading = generatingCode.has(rec.id);
                const diff = rec.difficulty ? difficultyStyles[rec.difficulty] : null;
                const aida = rec.aida_stage ? aidaStyles[rec.aida_stage] : null;
                const beforeFocusPct = typeof rec.section_screenshot_focus_pct === "number"
                  ? Math.max(0, Math.min(100, rec.section_screenshot_focus_pct))
                  : typeof rec.scroll_percentage === "number"
                    ? Math.max(0, Math.min(100, rec.scroll_percentage))
                    : 50;
                const beforeObjectPosition = `50% ${beforeFocusPct}%`;

                return (
                  <div key={rec.id} className={`rounded-2xl border bg-card overflow-hidden transition-all ${isExpanded ? "border-primary/30 shadow-lg shadow-primary/5" : "border-border hover:border-primary/10"}`}>
                    {/* Header row */}
                    <button onClick={() => setActiveRecId(isExpanded ? null : rec.id)} className="w-full flex items-center gap-3 p-4 lg:p-5 text-left hover:bg-muted/30 transition-colors">
                      <div className={`flex items-center justify-center h-8 w-8 rounded-lg text-sm font-black shrink-0 ${sev.bg}`}>
                        {rec.id}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-bold text-cream truncate">{rec.section}</p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{rec.current_issue.slice(0, 100)}...</p>
                      </div>
                      <div className="hidden sm:flex items-center gap-2 shrink-0">
                        {diff && (
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${diff.color}`}>
                            <diff.icon className="h-3 w-3" /> {diff.label}
                          </span>
                        )}
                        {aida && (
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${aida.color}`}>
                            {aida.label}
                          </span>
                        )}
                        {typeof rec.priority_score === "number" && (
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold tabular-nums ${
                            rec.priority_score >= 80 ? "text-accent bg-accent/10 border-accent/30" :
                            rec.priority_score >= 50 ? "text-yellow-400 bg-yellow-400/10 border-yellow-400/30" :
                            "text-muted-foreground bg-muted/10 border-border"
                          }`}>
                            P{rec.priority_score}
                          </span>
                        )}
                        {rec.mockup_url && <Sparkles className="h-4 w-4 text-accent" />}
                      </div>
                      {isExpanded ? <ChevronUp className="h-5 w-5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />}
                    </button>

                    {isExpanded && (
                      <div className="px-4 lg:px-6 pb-6 space-y-6">
                        <div>
                          <h3 className="text-sm font-bold text-cream uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Eye className="h-4 w-4 text-primary" /> Visual Comparison
                          </h3>
                          {rec.section_screenshot_url && rec.mockup_url ? (
                            <BeforeAfterSlider
                              beforeSrc={rec.section_screenshot_url}
                              afterSrc={rec.mockup_variants && rec.mockup_variants.length > 1 ? rec.mockup_variants[selectedVariants[rec.id] ?? 0] : rec.mockup_url}
                              beforeLabel="Current"
                              afterLabel="AI Concept"
                              beforeObjectPosition={beforeObjectPosition}
                              className="max-h-[500px] rounded-xl overflow-hidden"
                            />
                          ) : (
                            <div className="grid gap-4 lg:grid-cols-2">
                              {/* Before */}
                              <div>
                                <p className="text-xs font-bold text-destructive uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                  <AlertTriangle className="h-3.5 w-3.5" /> Before — Current State
                                </p>
                                {rec.section_screenshot_url ? (
                                  <img src={rec.section_screenshot_url} alt="" style={{ objectPosition: beforeObjectPosition }} className="w-full rounded-xl border border-destructive/20 object-cover max-h-80 cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setFullscreenImage(rec.section_screenshot_url!)} />
                                ) : (
                                  <div className="w-full h-48 rounded-xl border border-dashed border-destructive/20 bg-destructive/5 flex items-center justify-center text-sm text-muted-foreground">No screenshot captured</div>
                                )}
                              </div>
                              {/* After */}
                              <div>
                                <p className="text-xs font-bold text-accent uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                  <Sparkles className="h-3.5 w-3.5" /> After — AI Concept
                                </p>
                                {rec.mockup_url ? (
                                  <div className="space-y-3">
                                    <img
                                      src={rec.mockup_variants && rec.mockup_variants.length > 1 ? rec.mockup_variants[selectedVariants[rec.id] ?? 0] : rec.mockup_url}
                                      alt="" className="w-full rounded-xl border border-accent/20 object-cover max-h-80 cursor-pointer hover:opacity-90 transition-opacity"
                                      onClick={() => setFullscreenImage(rec.mockup_variants && rec.mockup_variants.length > 1 ? rec.mockup_variants[selectedVariants[rec.id] ?? 0] : rec.mockup_url!)}
                                    />
                                  </div>
                                ) : (
                                  <button onClick={() => handleGenerateMockup(viewingAudit, rec, 2)} disabled={isMockupLoading}
                                    className="w-full h-48 rounded-xl border border-dashed border-accent/30 bg-accent/5 flex flex-col items-center justify-center gap-2 text-sm font-bold text-accent hover:bg-accent/10 transition-colors disabled:opacity-50">
                                    {isMockupLoading ? <><Loader2 className="h-5 w-5 animate-spin" /> Generating...</> : <><ImageIcon className="h-5 w-5" /> Generate AI Concept</>}
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Variant picker + rating + refinement */}
                          {rec.mockup_url && (
                            <div className="flex flex-wrap items-center gap-2 mt-3">
                              {rec.mockup_variants && rec.mockup_variants.length > 1 && (
                                <>
                                  <span className="text-[10px] text-muted-foreground font-semibold uppercase">Variants:</span>
                                  {rec.mockup_variants.map((vUrl, vi) => (
                                    <button key={vi} onClick={() => setSelectedVariants(prev => ({ ...prev, [rec.id]: vi }))}
                                      className={`h-12 w-12 rounded-lg border overflow-hidden transition-all ${(selectedVariants[rec.id] ?? 0) === vi ? "border-accent ring-2 ring-accent/50" : "border-border opacity-60 hover:opacity-100"}`}>
                                      <img src={vUrl} alt={`V${vi + 1}`} className="h-full w-full object-cover" />
                                    </button>
                                  ))}
                                </>
                              )}
                              <div className="flex-1" />
                              {/* Star Rating */}
                              <div className="flex items-center gap-0.5">
                                {[1, 2, 3, 4, 5].map((s) => (
                                  <button key={s} onClick={() => handleRateMockup(viewingAudit, rec, s)} className="p-0.5 hover:scale-110 transition-transform" title={s >= 4 ? "Star as reference" : `Rate ${s}/5`}>
                                    <Star className={`h-4 w-4 ${(rec.mockup_rating ?? 0) >= s ? "fill-gold text-gold" : "text-muted-foreground/30"}`} />
                                  </button>
                                ))}
                              </div>
                              <button onClick={() => handleGenerateMockup(viewingAudit, rec, 2)} disabled={isMockupLoading}
                                className="flex items-center gap-1.5 rounded-lg bg-secondary border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
                                <RefreshCw className="h-3.5 w-3.5" /> Regenerate
                              </button>
                              <button onClick={() => setShowRefinementInput(prev => { const n = new Set(prev); if (n.has(rec.id)) n.delete(rec.id); else n.add(rec.id); return n; })}
                                className="flex items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/20 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition-colors">
                                <Sparkles className="h-3.5 w-3.5" /> Refine
                              </button>
                            </div>
                          )}
                          {showRefinementInput.has(rec.id) && (
                            <div className="flex gap-2 mt-2">
                              <input type="text" value={refinementInputs[rec.id] || ""} onChange={(e) => setRefinementInputs(prev => ({ ...prev, [rec.id]: e.target.value }))}
                                placeholder="e.g. Make the CTA bigger, use darker background..." className="flex-1 rounded-lg border border-border bg-secondary px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                onKeyDown={(e) => { if (e.key === "Enter" && refinementInputs[rec.id]?.trim()) handleGenerateMockup(viewingAudit, rec, 1, refinementInputs[rec.id]); }} />
                              <button onClick={() => refinementInputs[rec.id]?.trim() && handleGenerateMockup(viewingAudit, rec, 1, refinementInputs[rec.id])} disabled={isMockupLoading || !refinementInputs[rec.id]?.trim()}
                                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50">
                                {isMockupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Apply
                              </button>
                            </div>
                          )}
                        </div>

                        {/* ═══ COPY: Before / After ═══ */}
                        {(rec.before_copy || rec.after_copy) && (
                          <div>
                            <h3 className="text-sm font-bold text-cream uppercase tracking-wider mb-3 flex items-center gap-2">
                              <FileText className="h-4 w-4 text-primary" /> Copy Comparison
                            </h3>
                            <div className="grid gap-4 lg:grid-cols-2">
                              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5">
                                <p className="text-[10px] font-bold text-destructive uppercase tracking-wider mb-2">Before</p>
                                <p className="text-sm text-foreground leading-relaxed font-medium">{rec.before_copy || "—"}</p>
                              </div>
                              <div className="rounded-xl border border-accent/20 bg-accent/5 p-5">
                                <p className="text-[10px] font-bold text-accent uppercase tracking-wider mb-2">After</p>
                                <p className="text-sm text-foreground leading-relaxed font-medium">{rec.after_copy || "—"}</p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* ═══ Issue & Recommendation ═══ */}
                        <div className="grid gap-4 lg:grid-cols-2">
                          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5">
                            <div className="flex items-center gap-2 mb-3">
                              <AlertTriangle className="h-4 w-4 text-destructive" />
                              <span className="text-xs font-bold text-destructive uppercase tracking-wider">Current Issue</span>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">{rec.current_issue}</p>
                          </div>
                          <div className="rounded-xl border border-accent/20 bg-accent/5 p-5">
                            <div className="flex items-center gap-2 mb-3">
                              <CheckCircle2 className="h-4 w-4 text-accent" />
                              <span className="text-xs font-bold text-accent uppercase tracking-wider">Recommended Change</span>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">{rec.recommended_change}</p>
                          </div>
                        </div>

                        {/* ═══ Impact & Revenue ═══ */}
                        <div className="grid gap-4 lg:grid-cols-2">
                          <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
                            <div className="flex items-center gap-2 mb-2">
                              <BarChart3 className="h-4 w-4 text-primary" />
                              <span className="text-xs font-bold text-primary uppercase tracking-wider">Expected Impact</span>
                            </div>
                            <p className="text-sm text-muted-foreground">{rec.expected_impact}</p>
                          </div>
                          <div className="rounded-xl border border-gold/20 bg-gold/5 p-5">
                            <div className="flex items-center gap-2 mb-2">
                              <TrendingUp className="h-4 w-4 text-gold" />
                              <span className="text-xs font-bold text-gold uppercase tracking-wider">Revenue Impact (est.)</span>
                            </div>
                            <p className="text-sm font-semibold text-gold">{rec.revenue_impact_estimate || "Not estimated"}</p>
                          </div>
                        </div>

                        {/* ═══ CRO Rationale ═══ */}
                        {rec.cro_rationale && (
                          <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-5">
                            <div className="flex items-center gap-2 mb-3">
                              <Lightbulb className="h-4 w-4 text-purple-400" />
                              <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">CRO Rationale</span>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{rec.cro_rationale}</p>
                          </div>
                        )}

                        {/* ═══ Competitor References ═══ */}
                        {rec.competitor_reference && (
                          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-5">
                            <div className="flex items-center gap-2 mb-3">
                              <Globe className="h-4 w-4 text-blue-400" />
                              <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">Competitor Reference</span>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">{rec.competitor_reference}</p>
                          </div>
                        )}

                        {/* ═══ Implementation Spec (Collapsible) ═══ */}
                        {rec.implementation_spec && (
                          <details className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 overflow-hidden">
                            <summary className="flex items-center gap-2 p-5 cursor-pointer hover:bg-cyan-500/10 transition-colors">
                              <Code2 className="h-4 w-4 text-cyan-400" />
                              <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Implementation Spec</span>
                            </summary>
                            <div className="px-5 pb-5">
                              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono">{rec.implementation_spec}</p>
                            </div>
                          </details>
                        )}

                        {/* ═══ Design Brief (Collapsible) ═══ */}
                        {rec.mockup_prompt && (
                          <details className="rounded-xl border border-border bg-muted/20 overflow-hidden">
                            <summary className="flex items-center gap-2 p-5 cursor-pointer hover:bg-muted/40 transition-colors">
                              <Sparkles className="h-4 w-4 text-muted-foreground" />
                              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Design Brief / Mockup Prompt</span>
                            </summary>
                            <div className="px-5 pb-5">
                              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{rec.mockup_prompt}</p>
                            </div>
                          </details>
                        )}

                        {/* ═══ ACTION BUTTONS ═══ */}
                        <div className="flex flex-wrap gap-3 pt-2 border-t border-border">
                          {!rec.mockup_url && (
                            <button onClick={() => handleGenerateMockup(viewingAudit, rec, 2)} disabled={isMockupLoading}
                              className="flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/20 px-5 py-3 text-sm font-bold text-primary hover:bg-primary/20 transition-colors disabled:opacity-50">
                              {isMockupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                              Generate Concept Mockups
                            </button>
                          )}
                          {rec.mockup_url && (
                            <button onClick={() => handleAcceptAndGenerateCode(viewingAudit, rec)} disabled={isCodeLoading}
                              className="flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-50">
                              {isCodeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                              Accept & Generate Shopify Code
                            </button>
                          )}
                          <button onClick={async () => {
                            try {
                              const { error } = await supabase.from("pipeline_projects").insert({
                                client: viewingAudit.client_name || viewingAudit.shop_url,
                                page: `[Rec #${rec.id}] ${rec.section}`,
                                stages: [
                                  { name: "Figma Pull", status: "pending" },
                                  { name: "Section Split", status: "pending" },
                                  { name: "Code Gen", status: "pending" },
                                  { name: "QA", status: "pending" },
                                  { name: "Refinement", status: "pending" },
                                ],
                                last_update: new Date().toISOString(),
                              });
                              if (error) throw error;
                              toast.success(`Rec #${rec.id} sent to Dev Pipeline`);
                            } catch (e: any) { toast.error("Failed", { description: e.message }); }
                          }} className="flex items-center gap-2 rounded-xl bg-secondary border border-border px-5 py-3 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
                            <ArrowRight className="h-4 w-4" /> Send to Pipeline
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // AUDIT LIST VIEW
  // ═══════════════════════════════════════════════════════════
  return (
    <DashboardLayout>
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-start justify-between gap-4 animate-fade-in pt-10 md:pt-0">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary animate-glow-pulse shrink-0">
            <FileText className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gradient">CRO Audit Reports</h1>
            <p className="text-[13px] text-muted-foreground">AI-powered conversion rate optimization audits</p>
          </div>
        </div>
        <button onClick={() => setShowNewAudit(true)} disabled={generating}
          className="flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-50 w-full sm:w-auto">
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          New Audit
        </button>
      </div>

      {/* New Audit Form */}
      {showNewAudit && (
        <div className="mb-6 glow-card rounded-xl bg-card p-6 border border-primary/20 animate-scale-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-cream uppercase tracking-wider">Generate CRO Audit</h3>
            <button onClick={() => setShowNewAudit(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
            Enter a shop URL and the AI will scrape the site, dismiss popups, analyze it for conversion opportunities,
            and generate 10 before/after recommendations with design concepts.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 mb-4">
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Shop URL</label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input type="url" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://example.com"
                  className="w-full rounded-lg border border-border bg-secondary pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  onKeyDown={(e) => e.key === "Enter" && handleNewAudit()} />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Client Name (optional)</label>
              <input type="text" value={newClientName} onChange={(e) => setNewClientName(e.target.value)} placeholder="e.g. Braxley Bands"
                className="w-full rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                onKeyDown={(e) => e.key === "Enter" && handleNewAudit()} />
            </div>
          </div>
          <button onClick={handleNewAudit} disabled={generating}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            <Sparkles className="h-4 w-4" /> Analyze Website
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-4 mb-6 sm:mb-8 stagger-children">
        {[
          { label: "Total Audits", value: audits.length.toString(), glow: "stat-glow-primary" },
          { label: "Completed", value: completedAudits.length.toString(), glow: "stat-glow-electric" },
          { label: "Recommendations", value: totalRecs.toString(), glow: "stat-glow-violet" },
          { label: "AI Model", value: "Gemini 3", glow: "stat-glow-gold" },
        ].map((s) => (
          <div key={s.label} className={`glow-card gradient-border rounded-xl bg-card p-4 sm:p-5 hover-scale ${s.glow}`}>
            <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider">{s.label}</p>
            <p className="mt-1 sm:mt-2 text-xl sm:text-2xl font-bold text-cream">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Audits List */}
      <div className="glow-card rounded-xl bg-card p-5">
        <div className="flex items-center gap-2 mb-5">
          <BarChart3 className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-bold text-cream uppercase tracking-wider">All Audits</h2>
        </div>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="animate-pulse rounded-lg bg-muted h-16" />)}</div>
        ) : audits.length === 0 ? (
          <div className="text-center py-12">
            <Globe className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-2">No audits yet</p>
            <button onClick={() => setShowNewAudit(true)} className="text-sm text-primary hover:underline">Generate your first CRO audit →</button>
          </div>
        ) : (
          <div className="space-y-2">
            {audits.map((audit) => {
              const Icon = statusIcon[audit.status] || Clock;
              const isActive = ["scraping", "analyzing", "generating", "screenshotting"].includes(audit.status);
              const score = (scores || []).find((s) => s.cro_audit_id === audit.id);
              return (
                <div key={audit.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 rounded-xl border border-border bg-secondary p-3 sm:p-4 hover:border-primary/20 transition-colors cursor-pointer"
                  onClick={() => audit.status === "completed" && setViewingAudit(audit)}>
                  <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                    {audit.screenshot_url ? (
                      <img src={audit.screenshot_url} alt="" className="h-12 w-20 rounded-lg object-cover border border-border shrink-0" />
                    ) : (
                      <div className="h-12 w-20 rounded-lg bg-muted flex items-center justify-center shrink-0"><Globe className="h-4 w-4 text-muted-foreground" /></div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-cream truncate">{audit.client_name || new URL(audit.shop_url).hostname}</p>
                      <p className="text-xs text-muted-foreground truncate">{audit.shop_url}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-[92px] sm:ml-0">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                      audit.status === "completed" ? "bg-accent/15 text-accent border-accent/30" : audit.status === "failed" ? "bg-destructive/15 text-destructive border-destructive/30" : "bg-primary/15 text-primary border-primary/30"
                    }`}>
                      <Icon className={`h-3 w-3 ${isActive ? "animate-spin" : ""}`} /> {audit.status}
                    </span>
                    <span className="text-xs text-muted-foreground">{audit.recommendations.length} recs</span>
                    {score && <span className="text-xs font-bold text-gold border border-gold/30 rounded-full px-2 py-0.5">{score.total_score}/100</span>}
                    {audit.status === "completed" && <Eye className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Reports;
