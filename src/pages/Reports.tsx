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
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const GENERATE_AUDIT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-cro-audit`;
const GENERATE_MOCKUP_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-audit-mockup`;

interface Recommendation {
  id: number;
  section: string;
  severity: "high" | "medium" | "low";
  current_issue: string;
  recommended_change: string;
  expected_impact: string;
  mockup_prompt: string;
  mockup_url?: string;
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

  return (
    <DashboardLayout>
      <div className="mb-8 flex items-start justify-between animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary animate-glow-pulse">
            <FileText className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-cream">CRO Audit Reports</h1>
            <p className="text-[13px] text-muted-foreground">
              AI-powered conversion rate optimization audits with mockup concepts
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowNewAudit(true)}
          disabled={generating}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
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
      <div className="grid gap-4 sm:grid-cols-4 mb-8">
        {[
          { label: "Total Audits", value: audits.length.toString() },
          { label: "Completed", value: completedAudits.length.toString() },
          { label: "Recommendations", value: totalRecs.toString() },
          { label: "AI Model", value: "Gemini 3" },
        ].map((s) => (
          <div key={s.label} className="glow-card rounded-xl bg-card p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{s.label}</p>
            <p className="mt-2 text-2xl font-bold text-cream">{s.value}</p>
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
                  className="flex items-center gap-4 rounded-lg border border-border bg-secondary p-4 hover:border-primary/20 transition-colors cursor-pointer"
                  onClick={() => audit.status === "completed" && setViewingAudit(audit)}
                >
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
                  {audit.status === "completed" && (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Audit Viewer Modal */}
      {viewingAudit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-card border border-border p-6 sm:p-8 shadow-2xl">
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
            <div className="flex items-start gap-4 mb-6">
              {viewingAudit.screenshot_url && (
                <img
                  src={viewingAudit.screenshot_url}
                  alt="Site screenshot"
                  className="w-40 h-24 rounded-lg object-cover border border-border shrink-0 hidden sm:block"
                />
              )}
              <div>
                <h2 className="text-xl font-bold text-cream">
                  {viewingAudit.client_name || new URL(viewingAudit.shop_url).hostname}
                </h2>
                <a
                  href={viewingAudit.shop_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1 mt-1"
                >
                  {viewingAudit.shop_url}
                  <ExternalLink className="h-3 w-3" />
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
            <div className="flex gap-3 mb-6">
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
                      className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/50 transition-colors"
                    >
                      <span className="text-sm font-bold text-muted-foreground w-6">#{rec.id}</span>
                      <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${sev.dot}`} />
                      <span className="text-sm font-bold text-cream flex-1">{rec.section}</span>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${sev.bg}`}>
                        {rec.severity}
                      </span>
                      {rec.mockup_url && <ImageIcon className="h-4 w-4 text-accent" />}
                      {expanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>

                    {/* Expanded content */}
                    {expanded && (
                      <div className="px-4 pb-4 pt-0 space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          {/* Before */}
                          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                              <span className="text-[11px] font-bold text-destructive uppercase tracking-wider">
                                Current Issue
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {rec.current_issue}
                            </p>
                          </div>

                          {/* After */}
                          <div className="rounded-lg border border-accent/20 bg-accent/5 p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
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
                        <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-4 py-2.5">
                          <BarChart3 className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="text-xs text-primary font-semibold">Expected Impact:</span>
                          <span className="text-xs text-muted-foreground">{rec.expected_impact}</span>
                        </div>

                        {/* Mockup */}
                        {rec.mockup_url ? (
                          <div>
                            <p className="text-[11px] font-bold text-cream uppercase tracking-wider mb-2">
                              AI-Generated Concept Mockup
                            </p>
                            <img
                              src={rec.mockup_url}
                              alt={`Mockup for ${rec.section}`}
                              className="w-full rounded-lg border border-border"
                            />
                          </div>
                        ) : (
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
