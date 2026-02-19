import { DashboardLayout } from "@/components/DashboardLayout";
import {
  FileText,
  Eye,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  Loader2,
  BarChart3,
  X,
  Globe,
  Sparkles,
  ImageIcon,
  ArrowRight,
  ExternalLink,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Target,
  Share2,
  Copy,
  Check,
  Zap,
  RefreshCw,
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip } from "recharts";

const GENERATE_AUDIT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-cro-audit`;
const GENERATE_MOCKUP_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-audit-mockup`;
const GENERATE_SCORE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-oddit-score`;
const SCAN_RECS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-recommendations`;


interface Recommendation {
  id: number;
  section: string;
  severity: "high" | "medium" | "low";
  current_issue: string;
  recommended_change: string;
  expected_impact: string;
  mockup_prompt: string;
  mockup_url?: string;
  section_screenshot_url?: string;
  scroll_percentage?: number;
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

interface ReportDraft {
  id: string;
  client_name: string;
  status: string;
  progress: number;
  sections: Record<string, any>;
  created_at: string;
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
  medium: { bg: "bg-warning/15 text-warning border-warning/30", dot: "bg-warning" },
  low: { bg: "bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30", dot: "bg-muted-foreground" },
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
  const [generatingMockups, setGeneratingMockups] = useState<Set<number>>(new Set());
  const [expandedRecs, setExpandedRecs] = useState<Set<number>>(new Set());
  const [generatingScore, setGeneratingScore] = useState<string | null>(null);
  const [sharingPortal, setSharingPortal] = useState<string | null>(null);
  const [copiedPortal, setCopiedPortal] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: scores } = useQuery({
    queryKey: ["oddit-scores"],
    queryFn: async () => {
      const { data } = await supabase.from("oddit_scores").select("*").order("created_at", { ascending: false });
      return (data || []) as OdditScore[];
    },
  });

  const { data: drafts } = useQuery({
    queryKey: ["report-drafts"],
    queryFn: async () => {
      const { data } = await supabase.from("report_drafts").select("*").order("created_at", { ascending: false }).limit(10);
      return (data || []) as ReportDraft[];
    },
  });


  // Load audits from DB
  useEffect(() => {
    loadAudits();
  }, []);

  const loadAudits = async () => {
    const { data, error } = await supabase
      .from("cro_audits")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setAudits(data.map((d: any) => ({
        ...d,
        recommendations: (d.recommendations || []) as unknown as Recommendation[],
      })));
    }
    setLoading(false);
  };

  const handleNewAudit = async () => {
    if (!newUrl.trim()) {
      toast.error("Enter a shop URL");
      return;
    }

    setGenerating(true);
    setShowNewAudit(false);
    const toastId = `audit-${Date.now()}`;
    toast.loading("Scraping website & analyzing with AI...", {
      id: toastId,
      description: "This takes 30-60 seconds",
    });

    try {
      const resp = await fetch(GENERATE_AUDIT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ url: newUrl, clientName: newClientName }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `Error ${resp.status}`);
      }

      const result = await resp.json();
      toast.success(`Audit complete! ${result.recommendations?.length || 0} recommendations found`, {
        id: toastId,
      });

      setNewUrl("");
      setNewClientName("");
      await loadAudits();

      // Auto-open the newly created audit
      if (result.auditId) {
        const { data: newAudit } = await supabase
          .from("cro_audits")
          .select("*")
          .eq("id", result.auditId)
          .single();
        if (newAudit) {
          setViewingAudit({
            ...newAudit,
            recommendations: (newAudit.recommendations || []) as unknown as Recommendation[],
          });
        }
      }
    } catch (e: any) {
      toast.error("Audit failed", { id: toastId, description: e.message });
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateMockup = async (audit: CroAudit, rec: Recommendation) => {
    setGeneratingMockups((prev) => new Set(prev).add(rec.id));
    const toastId = `mockup-${rec.id}`;
    toast.loading(`Generating mockup for "${rec.section}"...`, { id: toastId });

    try {
      const resp = await fetch(GENERATE_MOCKUP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          auditId: audit.id,
          recommendationId: rec.id,
          mockupPrompt: rec.mockup_prompt,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `Error ${resp.status}`);
      }

      const result = await resp.json();
      toast.success(`Mockup generated!`, { id: toastId });

      // Update local state
      const updatedRecs = audit.recommendations.map((r) =>
        r.id === rec.id ? { ...r, mockup_url: result.mockupUrl } : r
      );
      const updatedAudit = { ...audit, recommendations: updatedRecs };
      setViewingAudit(updatedAudit);
      setAudits((prev) => prev.map((a) => (a.id === audit.id ? updatedAudit : a)));
    } catch (e: any) {
      toast.error("Mockup generation failed", { id: toastId, description: e.message });
    } finally {
      setGeneratingMockups((prev) => {
        const next = new Set(prev);
        next.delete(rec.id);
        return next;
      });
    }
  };

  const handleGenerateOdditScore = async (audit: CroAudit) => {
    setGeneratingScore(audit.id);
    const toastId = `score-${audit.id}`;
    toast.loading("Generating Oddit Score...", { id: toastId, description: "Scoring 8 dimensions with Gemini" });
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
    } catch (e: any) {
      toast.error("Score generation failed", { id: toastId, description: e.message });
    } finally {
      setGeneratingScore(null);
    }
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
      toast.success("Portal link copied!", { description: "Share this link with your client." });
    } catch (e: any) {
      toast.error("Failed to create portal", { description: e.message });
    } finally {
      setSharingPortal(null);
    }
  };

  const toggleRec = (id: number) => {
    setExpandedRecs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const completedAudits = audits.filter((a) => a.status === "completed");
  const totalRecs = completedAudits.reduce((sum, a) => sum + a.recommendations.length, 0);
  const liveDrafts = (drafts || []).filter((d) => d.status !== "dismissed");


  return (
    <DashboardLayout>
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-start justify-between gap-4 animate-fade-in pt-10 md:pt-0">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary animate-glow-pulse shrink-0">
            <FileText className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-cream">CRO Audit Reports</h1>
            <p className="text-[13px] text-muted-foreground">
              AI-powered conversion rate optimization audits
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowNewAudit(true)}
          disabled={generating}
          className="flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-50 w-full sm:w-auto"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          New Audit
        </button>
      </div>

      {/* New Audit Modal */}
      {showNewAudit && (
        <div className="mb-6 glow-card rounded-xl bg-card p-6 border border-primary/20 animate-scale-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-cream uppercase tracking-wider">Generate CRO Audit</h3>
            <button onClick={() => setShowNewAudit(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
            Enter a shop URL and the AI will scrape the site, analyze it for conversion opportunities,
            and generate 10 before/after recommendations with mockup concepts.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 mb-4">
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Shop URL</label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full rounded-lg border border-border bg-secondary pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Client Name (optional)</label>
              <input
                type="text"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="e.g. Braxley Bands"
                className="w-full rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              />
            </div>
          </div>
          <button
            onClick={handleNewAudit}
            disabled={generating}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            Analyze Website
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-4 mb-6 sm:mb-8">
        {[
          { label: "Total Audits", value: audits.length.toString() },
          { label: "Completed", value: completedAudits.length.toString() },
          { label: "Recommendations", value: totalRecs.toString() },
          { label: "AI Model", value: "Gemini 3" },
        ].map((s) => (
          <div key={s.label} className="glow-card rounded-xl bg-card p-4 sm:p-5">
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
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-lg bg-muted h-16" />
            ))}
          </div>
        ) : audits.length === 0 ? (
          <div className="text-center py-12">
            <Globe className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-2">No audits yet</p>
            <button
              onClick={() => setShowNewAudit(true)}
              className="text-sm text-primary hover:underline"
            >
              Generate your first CRO audit →
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {audits.map((audit) => {
              const Icon = statusIcon[audit.status] || Clock;
              const isActive = ["scraping", "analyzing", "generating"].includes(audit.status);
              return (
                <div
                  key={audit.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 rounded-lg border border-border bg-secondary p-3 sm:p-4 hover:border-primary/20 transition-colors cursor-pointer"
                  onClick={() => audit.status === "completed" && setViewingAudit(audit)}
                >
                  <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                    {audit.screenshot_url ? (
                      <img
                        src={audit.screenshot_url}
                        alt=""
                        className="h-10 w-16 rounded-md object-cover border border-border shrink-0"
                      />
                    ) : (
                      <div className="h-10 w-16 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-cream truncate">
                        {audit.client_name || new URL(audit.shop_url).hostname}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{audit.shop_url}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pl-0 sm:pl-0 ml-[76px] sm:ml-0">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                        audit.status === "completed"
                          ? "bg-accent/15 text-accent border-accent/30"
                          : audit.status === "failed"
                          ? "bg-destructive/15 text-destructive border-destructive/30"
                          : "bg-primary/15 text-primary border-primary/30"
                      }`}
                    >
                      <Icon className={`h-3 w-3 ${isActive ? "animate-spin" : ""}`} />
                      {audit.status}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {audit.recommendations.length} recs
                    </span>
                    {audit.status === "completed" && (() => {
                      const auditScore = (scores || []).find((s) => s.cro_audit_id === audit.id);
                      return auditScore ? (
                        <span className="text-xs font-bold text-gold border border-gold/30 rounded-full px-2 py-0.5">
                          {auditScore.total_score}/100
                        </span>
                      ) : null;
                    })()}
                    {audit.status === "completed" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleGenerateOdditScore(audit); }}
                        disabled={generatingScore === audit.id}
                        title="Generate Oddit Score"
                        className="flex items-center gap-1 rounded-lg bg-gold/10 border border-gold/30 px-2 py-1 text-[10px] font-bold text-gold hover:bg-gold/20 transition-colors disabled:opacity-50"
                      >
                        {generatingScore === audit.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Target className="h-3 w-3" />}
                        Score
                      </button>
                    )}
                    {audit.status === "completed" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSharePortal(audit); }}
                        disabled={sharingPortal === audit.id}
                        title="Share Client Portal"
                        className="flex items-center gap-1 rounded-lg bg-primary/10 border border-primary/30 px-2 py-1 text-[10px] font-bold text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                      >
                        {sharingPortal === audit.id ? <Loader2 className="h-3 w-3 animate-spin" /> : copiedPortal === audit.id ? <Check className="h-3 w-3" /> : <Share2 className="h-3 w-3" />}
                        {copiedPortal === audit.id ? "Copied!" : "Portal"}
                      </button>
                    )}
                    {audit.status === "completed" && (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}

                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Live Drafts */}
      {liveDrafts.length > 0 && (
        <div className="glow-card glow-card-electric rounded-xl bg-card p-5 mt-6">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-4 w-4 text-electric" />
            <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Live Drafts</h2>
            <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-electric/20 text-[10px] font-bold text-electric">{liveDrafts.length}</span>
          </div>
          <div className="space-y-2">
            {liveDrafts.map((draft) => (
              <div key={draft.id} className="flex items-center gap-4 rounded-xl border border-border bg-secondary px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-cream">{draft.client_name}</p>
                  <p className="text-[11px] text-muted-foreground">{new Date(draft.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-electric transition-all" style={{ width: `${draft.progress}%` }} />
                    </div>
                    <span className="text-xs font-bold text-electric">{draft.progress}%</span>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider rounded-full border px-2 py-0.5 ${draft.status === "ready" ? "text-accent border-accent/30 bg-accent/10" : "text-primary border-primary/30 bg-primary/10"}`}>
                    {draft.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audit Viewer Modal */}
      {viewingAudit && (

        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
          <div className="relative w-full sm:max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-card border border-border p-4 sm:p-6 md:p-8 shadow-2xl">
            <button
              onClick={() => {
                setViewingAudit(null);
                setExpandedRecs(new Set());
              }}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground z-10"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4 mb-6">
              {viewingAudit.screenshot_url && (
                <img
                  src={viewingAudit.screenshot_url}
                  alt="Site screenshot"
                  className="w-full sm:w-40 h-32 sm:h-24 rounded-lg object-cover border border-border shrink-0"
                />
              )}
              <div className="min-w-0 w-full">
                <h2 className="text-lg sm:text-xl font-bold text-cream">
                  {viewingAudit.client_name || new URL(viewingAudit.shop_url).hostname}
                </h2>
                <a
                  href={viewingAudit.shop_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1 mt-1 truncate"
                >
                  <span className="truncate">{viewingAudit.shop_url}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
                <p className="text-xs text-muted-foreground mt-1">
                  {viewingAudit.recommendations.length} recommendations •{" "}
                  {new Date(viewingAudit.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>

            {/* Severity Summary */}
            <div className="flex flex-wrap gap-3 mb-6">
              {(["high", "medium", "low"] as const).map((sev) => {
                const count = viewingAudit.recommendations.filter((r) => r.severity === sev).length;
                return (
                  <div key={sev} className="flex items-center gap-2">
                    <div className={`h-2.5 w-2.5 rounded-full ${severityStyles[sev].dot}`} />
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">
                      {count} {sev}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Recommendations */}
            <div className="space-y-3">
              {viewingAudit.recommendations.map((rec) => {
                const expanded = expandedRecs.has(rec.id);
                const sev = severityStyles[rec.severity];
                const isMockupLoading = generatingMockups.has(rec.id);

                return (
                  <div key={rec.id} className="rounded-xl border border-border bg-secondary overflow-hidden">
                    {/* Collapsed header */}
                    <button
                      onClick={() => toggleRec(rec.id)}
                      className="w-full flex items-center gap-2 sm:gap-3 p-3 sm:p-4 text-left hover:bg-muted/50 transition-colors"
                    >
                      <span className="text-sm font-bold text-muted-foreground w-6 shrink-0">#{rec.id}</span>
                      <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${sev.dot}`} />
                      <span className="text-sm font-bold text-cream flex-1 truncate">{rec.section}</span>
                      <span className={`hidden sm:inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${sev.bg}`}>
                        {rec.severity}
                      </span>
                      {rec.section_screenshot_url && <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />}
                      {rec.mockup_url && <Sparkles className="h-4 w-4 text-accent shrink-0" />}
                      {expanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                    </button>

                    {/* Expanded content */}
                    {expanded && (
                      <div className="px-3 sm:px-4 pb-4 pt-0 space-y-3 sm:space-y-4">

                        {/* Before / After screenshots row */}
                        {(rec.section_screenshot_url || rec.mockup_url) && (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {/* Before: section screenshot */}
                            <div>
                              <p className="text-[10px] font-bold text-destructive uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                <AlertTriangle className="h-3 w-3" /> Before — Current State
                              </p>
                              {rec.section_screenshot_url ? (
                                <img
                                  src={rec.section_screenshot_url}
                                  alt={`Current state of ${rec.section}`}
                                  className="w-full rounded-lg border border-destructive/20 object-cover max-h-52"
                                />
                              ) : (
                                <div className="w-full h-32 rounded-lg border border-destructive/20 bg-destructive/5 flex items-center justify-center text-[11px] text-muted-foreground">
                                  Screenshot not available
                                </div>
                              )}
                            </div>
                            {/* After: AI mockup */}
                            <div>
                              <p className="text-[10px] font-bold text-accent uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                <Sparkles className="h-3 w-3" /> After — AI Concept
                              </p>
                              {rec.mockup_url ? (
                                <img
                                  src={rec.mockup_url}
                                  alt={`Mockup for ${rec.section}`}
                                  className="w-full rounded-lg border border-accent/20 object-cover max-h-52"
                                />
                              ) : (
                                <button
                                  onClick={() => handleGenerateMockup(viewingAudit, rec)}
                                  disabled={isMockupLoading}
                                  className="w-full h-32 rounded-lg border border-dashed border-accent/30 bg-accent/5 flex flex-col items-center justify-center gap-2 text-xs font-bold text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
                                >
                                  {isMockupLoading ? (
                                    <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
                                  ) : (
                                    <><ImageIcon className="h-4 w-4" /> Generate AI Concept</>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
                          {/* Before */}
                          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 sm:p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                              <span className="text-[11px] font-bold text-destructive uppercase tracking-wider">
                                Current Issue
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {rec.current_issue}
                            </p>
                          </div>

                          {/* After */}
                          <div className="rounded-lg border border-accent/20 bg-accent/5 p-3 sm:p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <CheckCircle2 className="h-3.5 w-3.5 text-accent shrink-0" />
                              <span className="text-[11px] font-bold text-accent uppercase tracking-wider">
                                Recommended Change
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {rec.recommended_change}
                            </p>
                          </div>
                        </div>

                        {/* Impact */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 sm:px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <BarChart3 className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span className="text-xs text-primary font-semibold">Expected Impact:</span>
                          </div>
                          <span className="text-xs text-muted-foreground">{rec.expected_impact}</span>
                        </div>

                        {/* If no screenshots at all, show standalone mockup section */}
                        {!rec.section_screenshot_url && !rec.mockup_url && (
                          <button
                            onClick={() => handleGenerateMockup(viewingAudit, rec)}
                            disabled={isMockupLoading}
                            className="flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-4 py-2.5 text-xs font-bold text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                          >
                            {isMockupLoading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ImageIcon className="h-3.5 w-3.5" />
                            )}
                            {isMockupLoading ? "Generating mockup..." : "Generate Concept Mockup"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default Reports;
