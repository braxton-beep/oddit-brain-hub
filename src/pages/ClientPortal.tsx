import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CheckCircle2,
  Clock,
  XCircle,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  BarChart3,
  ExternalLink,
  ImageIcon,
  Globe,
} from "lucide-react";
import { toast } from "sonner";

interface Recommendation {
  id: number;
  section: string;
  severity: "high" | "medium" | "low";
  current_issue: string;
  recommended_change: string;
  expected_impact: string;
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
  portal_token: string | null;
  portal_enabled: boolean;
}

interface Implementation {
  recommendation_id: number;
  status: "pending" | "in-progress" | "done" | "skipped";
  notes: string;
}

const statusConfig = {
  pending: { label: "Pending", icon: Clock, color: "text-muted-foreground", bg: "bg-muted/30 border-muted-foreground/20" },
  "in-progress": { label: "In Progress", icon: Clock, color: "text-primary", bg: "bg-primary/10 border-primary/30" },
  done: { label: "Done", icon: CheckCircle2, color: "text-accent", bg: "bg-accent/10 border-accent/30" },
  skipped: { label: "Skipped", icon: XCircle, color: "text-muted-foreground", bg: "bg-muted/20 border-muted-foreground/10" },
};

const severityDot: Record<string, string> = {
  high: "bg-destructive",
  medium: "bg-warning",
  low: "bg-muted-foreground",
};

const ClientPortal = () => {
  const { token } = useParams<{ token: string }>();
  const [audit, setAudit] = useState<CroAudit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [implementations, setImplementations] = useState<Record<number, Implementation>>({});
  const [expandedRecs, setExpandedRecs] = useState<Set<number>>(new Set());
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    loadPortal();
  }, [token]);

  const loadPortal = async () => {
    const { data: auditData, error: auditError } = await supabase
      .from("cro_audits")
      .select("*")
      .eq("portal_token", token)
      .eq("portal_enabled", true)
      .single();

    if (auditError || !auditData) {
      setError("This portal link is invalid or has been disabled.");
      setLoading(false);
      return;
    }

    const audit: CroAudit = {
      ...auditData,
      recommendations: (auditData.recommendations || []) as unknown as Recommendation[],
    };
    setAudit(audit);

    // Load implementations
    const { data: implData } = await supabase
      .from("client_implementations")
      .select("*")
      .eq("audit_id", auditData.id);

    if (implData) {
      const implMap: Record<number, Implementation> = {};
      for (const impl of implData) {
        implMap[impl.recommendation_id] = {
          recommendation_id: impl.recommendation_id,
          status: impl.status as Implementation["status"],
          notes: impl.notes || "",
        };
      }
      setImplementations(implMap);
    }

    setLoading(false);
  };

  const handleStatusChange = async (recId: number, newStatus: Implementation["status"]) => {
    if (!audit) return;
    setSavingId(recId);

    const existing = implementations[recId];

    if (existing) {
      await supabase
        .from("client_implementations")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("audit_id", audit.id)
        .eq("recommendation_id", recId);
    } else {
      await supabase.from("client_implementations").insert({
        audit_id: audit.id,
        recommendation_id: recId,
        status: newStatus,
      });
    }

    setImplementations((prev) => ({
      ...prev,
      [recId]: { recommendation_id: recId, status: newStatus, notes: prev[recId]?.notes || "" },
    }));

    setSavingId(null);
    toast.success(`Marked as ${statusConfig[newStatus].label}`);
  };

  const toggleRec = (id: number) => {
    setExpandedRecs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary animate-glow-pulse flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-primary-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">Loading your portal...</p>
        </div>
      </div>
    );
  }

  if (error || !audit) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h1 className="text-xl font-bold text-cream mb-2">Portal Not Found</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  const doneCount = Object.values(implementations).filter((i) => i.status === "done").length;
  const inProgressCount = Object.values(implementations).filter((i) => i.status === "in-progress").length;
  const totalRecs = audit.recommendations.length;
  const completionPct = totalRecs > 0 ? Math.round((doneCount / totalRecs) * 100) : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Portal header */}
      <div className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <BarChart3 className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm font-bold text-cream">{audit.client_name || "Your Oddit Audit"}</p>
              <p className="text-[11px] text-muted-foreground">CRO Audit Report</p>
            </div>
          </div>
          <a
            href={audit.shop_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <Globe className="h-3.5 w-3.5" />
            {(() => { try { return new URL(audit.shop_url).hostname; } catch { return audit.shop_url; } })()}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Summary hero */}
        <div className="glow-card rounded-2xl bg-card p-6 border border-border">
          <div className="flex flex-col sm:flex-row gap-5">
            {audit.screenshot_url && (
              <img
                src={audit.screenshot_url}
                alt="Site screenshot"
                className="w-full sm:w-36 h-28 rounded-xl object-cover border border-border shrink-0"
              />
            )}
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-cream mb-1">
                {audit.client_name || (() => { try { return new URL(audit.shop_url).hostname; } catch { return audit.shop_url; } })()}
              </h1>
              <p className="text-xs text-muted-foreground mb-4">
                Audit completed {new Date(audit.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </p>

              {/* Progress */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-cream">Implementation Progress</span>
                  <span className="text-xs font-bold text-accent">{completionPct}%</span>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-500"
                    style={{ width: `${completionPct}%` }}
                  />
                </div>
              </div>

              <div className="flex gap-4 text-xs text-muted-foreground">
                <span className="text-accent font-semibold">{doneCount} Done</span>
                <span className="text-primary font-semibold">{inProgressCount} In Progress</span>
                <span>{totalRecs - doneCount - inProgressCount} Remaining</span>
              </div>
            </div>
          </div>
        </div>

        {/* Severity summary */}
        <div className="grid grid-cols-3 gap-3">
          {(["high", "medium", "low"] as const).map((sev) => {
            const count = audit.recommendations.filter((r) => r.severity === sev).length;
            return (
              <div key={sev} className="rounded-xl bg-card border border-border p-4 text-center">
                <div className={`h-3 w-3 rounded-full ${severityDot[sev]} mx-auto mb-2`} />
                <p className="text-xl font-bold text-cream">{count}</p>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{sev} priority</p>
              </div>
            );
          })}
        </div>

        {/* Recommendations checklist */}
        <div>
          <h2 className="text-sm font-bold text-cream uppercase tracking-wider mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-accent" />
            Recommendations Checklist
          </h2>
          <div className="space-y-3">
            {audit.recommendations.map((rec) => {
              const impl = implementations[rec.id] || { status: "pending" as const, notes: "" };
              const cfg = statusConfig[impl.status];
              const expanded = expandedRecs.has(rec.id);

              return (
                <div key={rec.id} className={`rounded-xl border overflow-hidden transition-colors ${cfg.bg}`}>
                  <div className="flex items-center gap-3 p-4">
                    <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${severityDot[rec.severity]}`} />
                    <button
                      onClick={() => toggleRec(rec.id)}
                      className="flex-1 text-left"
                    >
                      <span className="text-sm font-semibold text-cream">{rec.section}</span>
                    </button>

                    {/* Status selector */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {(["pending", "in-progress", "done", "skipped"] as const).map((s) => {
                        const c = statusConfig[s];
                        return (
                          <button
                            key={s}
                            onClick={() => handleStatusChange(rec.id, s)}
                            disabled={savingId === rec.id}
                            title={c.label}
                            className={`text-[10px] font-bold rounded-full px-2.5 py-1 border transition-colors ${impl.status === s ? `${c.bg} ${c.color}` : "border-border text-muted-foreground hover:border-primary/40"}`}
                          >
                            {c.label}
                          </button>
                        );
                      })}
                    </div>

                    <button onClick={() => toggleRec(rec.id)} className="text-muted-foreground ml-1">
                      {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>

                  {expanded && (
                    <div className="px-4 pb-4 space-y-3 border-t border-border/50">
                      <div className="grid sm:grid-cols-2 gap-3 mt-3">
                        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <AlertTriangle className="h-3 w-3 text-destructive" />
                            <span className="text-[10px] font-bold text-destructive uppercase tracking-wider">Current Issue</span>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{rec.current_issue}</p>
                        </div>
                        <div className="rounded-lg border border-accent/20 bg-accent/5 p-3">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <CheckCircle2 className="h-3 w-3 text-accent" />
                            <span className="text-[10px] font-bold text-accent uppercase tracking-wider">Recommended Change</span>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{rec.recommended_change}</p>
                        </div>
                      </div>
                      <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2.5">
                        <span className="text-xs text-primary font-semibold">Expected Impact: </span>
                        <span className="text-xs text-muted-foreground">{rec.expected_impact}</span>
                      </div>
                      {rec.mockup_url && (
                        <img src={rec.mockup_url} alt={`Mockup for ${rec.section}`} className="w-full rounded-lg border border-border" />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border mt-16 py-8 text-center">
        <p className="text-xs text-muted-foreground">
          Powered by <span className="text-cream font-semibold">Oddit Brain</span> — CRO Audit Report
        </p>
      </div>
    </div>
  );
};

export default ClientPortal;
