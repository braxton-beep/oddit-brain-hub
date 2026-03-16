import { DashboardLayout } from "@/components/DashboardLayout";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Target, RefreshCw, CheckCircle2, XCircle, Send, ExternalLink,
  Clock, Loader2, Filter, Sparkles, AlertTriangle, Eye, Copy,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const CATEGORY_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  cro_pain: { label: "CRO Pain", emoji: "😫", color: "bg-red-500/10 text-red-400 border-red-500/20" },
  store_launch: { label: "Store Launch", emoji: "🚀", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  feedback_request: { label: "Feedback Request", emoji: "🔍", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  competitor_mention: { label: "Competitor", emoji: "⚔️", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  other: { label: "Other", emoji: "📝", color: "bg-muted text-muted-foreground border-border" },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  approved: { label: "Approved", color: "bg-green-500/10 text-green-400 border-green-500/20" },
  replied: { label: "Replied", color: "bg-primary/10 text-primary border-primary/20" },
  skipped: { label: "Skipped", color: "bg-muted text-muted-foreground border-border" },
  failed: { label: "Failed", color: "bg-red-500/10 text-red-400 border-red-500/20" },
};

const PLATFORM_LABELS: Record<string, { emoji: string; label: string }> = {
  x: { emoji: "𝕏", label: "X" },
  threads: { emoji: "🧵", label: "Threads" },
  reddit: { emoji: "🤖", label: "Reddit" },
};

function useLeadOpportunities(status?: string, platform?: string) {
  return useQuery({
    queryKey: ["lead-opportunities", status, platform],
    queryFn: async () => {
      let q = supabase
        .from("lead_gen_opportunities")
        .select("*")
        .order("relevance_score", { ascending: false })
        .limit(100);
      if (status && status !== "all") {
        q = q.eq("status", status);
      }
      if (platform && platform !== "all") {
        q = q.eq("platform", platform);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });
}

function useLeadStats() {
  return useQuery({
    queryKey: ["lead-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_gen_opportunities")
        .select("status, platform, category");
      if (error) throw error;
      const total = data?.length ?? 0;
      const pending = data?.filter((d) => d.status === "pending").length ?? 0;
      const replied = data?.filter((d) => d.status === "replied").length ?? 0;
      const skipped = data?.filter((d) => d.status === "skipped").length ?? 0;
      const byPlatform = { x: 0, threads: 0, reddit: 0 };
      const byCategory: Record<string, number> = {};
      for (const d of data ?? []) {
        if (d.platform === "x") byPlatform.x++;
        else if (d.platform === "reddit") byPlatform.reddit++;
        else byPlatform.threads++;
        byCategory[d.category] = (byCategory[d.category] ?? 0) + 1;
      }
      return { total, pending, replied, skipped, byPlatform, byCategory };
    },
  });
}

function useScanLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("scan-leads");
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["lead-opportunities"] });
      qc.invalidateQueries({ queryKey: ["lead-stats"] });
      const count = data?.new_opportunities ?? 0;
      const platforms = data?.platforms ?? {};
      const details = [
        platforms.reddit ? `${platforms.reddit} Reddit` : null,
        platforms.threads ? `${platforms.threads} Threads` : null,
        platforms.x ? `${platforms.x} X` : null,
      ].filter(Boolean).join(", ");
      toast.success(
        count > 0
          ? `Found ${count} new opportunities${details ? ` (${details})` : ""}`
          : `Scanned ${data?.scanned ?? 0} posts — no new opportunities`
      );
    },
    onError: (e) => toast.error(`Scan failed: ${e.message}`),
  });
}

function useReplyLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { opportunity_id: string; reply_text?: string; action: string }) => {
      const { data, error } = await supabase.functions.invoke("reply-lead", { body: params });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["lead-opportunities"] });
      qc.invalidateQueries({ queryKey: ["lead-stats"] });
      if (data?.action === "replied") {
        toast.success("Reply posted successfully!");
      } else if (data?.action === "skipped") {
        toast.info("Opportunity skipped");
      } else {
        toast.success(data?.message || "Action completed");
      }
    },
    onError: (e) => toast.error(`Action failed: ${e.message}`),
  });
}

function OpportunityCard({ opp, onAction }: { opp: any; onAction: (id: string, action: string, text?: string) => void }) {
  const [editedReply, setEditedReply] = useState(opp.draft_reply);
  const [expanded, setExpanded] = useState(false);
  const cat = CATEGORY_LABELS[opp.category] ?? CATEGORY_LABELS.other;
  const stat = STATUS_LABELS[opp.status] ?? STATUS_LABELS.pending;
  const plat = PLATFORM_LABELS[opp.platform] ?? PLATFORM_LABELS.threads;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(editedReply);
      toast.success("Reply copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <Card className="p-4 bg-card border-border hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Badge variant="outline" className={cat.color}>
              {cat.emoji} {cat.label}
            </Badge>
            <Badge variant="outline" className={stat.color}>
              {stat.label}
            </Badge>
            <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
              {plat.emoji} {plat.label}
            </Badge>
            <span className="text-xs text-muted-foreground">Score: {opp.relevance_score}</span>
            {opp.post_date && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(opp.post_date).toLocaleDateString()}
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-foreground mb-1">{opp.post_author}</p>
          <p className="text-sm text-muted-foreground line-clamp-3">{opp.post_text}</p>
        </div>
        <a
          href={opp.post_url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {opp.status === "pending" && (
        <div className="mt-3 space-y-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Eye className="w-3 h-3" />
            {expanded ? "Hide" : "View"} draft reply
          </button>
          {expanded && (
            <>
              <Textarea
                value={editedReply}
                onChange={(e) => setEditedReply(e.target.value)}
                className="text-sm min-h-[80px] bg-background"
                placeholder="Draft reply..."
              />
              <div className="flex gap-2">
                {opp.platform === "x" ? (
                  <Button
                    size="sm"
                    onClick={() => onAction(opp.id, "approve", editedReply)}
                    className="gap-1"
                  >
                    <Send className="w-3 h-3" />
                    Post Reply
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleCopy}
                    className="gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    Copy Reply
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onAction(opp.id, "approve", editedReply)}
                  className="gap-1"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onAction(opp.id, "skip")}
                  className="gap-1 text-muted-foreground"
                >
                  <XCircle className="w-3 h-3" />
                  Skip
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {(opp.status === "approved" || opp.status === "replied") && opp.draft_reply && (
        <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-border">
          <p className="text-xs text-muted-foreground mb-1 font-medium">
            {opp.status === "replied" ? "✅ Reply sent" : "📋 Approved reply"}
          </p>
          <p className="text-sm text-foreground">{opp.draft_reply}</p>
          {opp.replied_at && (
            <p className="mt-1 text-xs text-muted-foreground">
              {new Date(opp.replied_at).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

export default function LeadGen() {
  const [statusFilter, setStatusFilter] = useState("pending");
  const [platformFilter, setPlatformFilter] = useState("all");
  const { data: opps, isLoading } = useLeadOpportunities(statusFilter, platformFilter);
  const { data: stats } = useLeadStats();
  const scanMutation = useScanLeads();
  const replyMutation = useReplyLead();

  const handleAction = (id: string, action: string, text?: string) => {
    replyMutation.mutate({
      opportunity_id: id,
      action: action === "approve" ? "reply" : "skip",
      reply_text: text,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Target className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Lead Scout</h1>
              <p className="text-sm text-muted-foreground">
                AI scans Reddit, Threads & X for CRO leads · drafts replies for your approval
              </p>
            </div>
          </div>
          <Button
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
            className="gap-2"
          >
            {scanMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {scanMutation.isPending ? "Scanning..." : "Scan Now"}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="p-4 bg-card border-border">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Found</p>
            <p className="text-2xl font-bold text-foreground">{stats?.total ?? 0}</p>
          </Card>
          <Card className="p-4 bg-card border-border">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Pending</p>
            <p className="text-2xl font-bold text-amber-400">{stats?.pending ?? 0}</p>
          </Card>
          <Card className="p-4 bg-card border-border">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Replied</p>
            <p className="text-2xl font-bold text-green-400">{stats?.replied ?? 0}</p>
          </Card>
          <Card className="p-4 bg-card border-border">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Skipped</p>
            <p className="text-2xl font-bold text-muted-foreground">{stats?.skipped ?? 0}</p>
          </Card>
          <Card className="p-4 bg-card border-border">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">By Platform</p>
            <div className="flex gap-3 text-sm text-foreground mt-1">
              <span>🤖 {stats?.byPlatform?.reddit ?? 0}</span>
              <span>🧵 {stats?.byPlatform?.threads ?? 0}</span>
              <span>𝕏 {stats?.byPlatform?.x ?? 0}</span>
            </div>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Tabs value={statusFilter} onValueChange={setStatusFilter} className="flex-1">
            <TabsList className="bg-muted">
              <TabsTrigger value="pending">⏳ Pending</TabsTrigger>
              <TabsTrigger value="all">📋 All</TabsTrigger>
              <TabsTrigger value="replied">✅ Replied</TabsTrigger>
              <TabsTrigger value="skipped">⏭️ Skipped</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs value={platformFilter} onValueChange={setPlatformFilter}>
            <TabsList className="bg-muted">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="reddit">🤖 Reddit</TabsTrigger>
              <TabsTrigger value="threads">🧵 Threads</TabsTrigger>
              <TabsTrigger value="x">𝕏 X</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (opps?.length ?? 0) === 0 ? (
          <Card className="p-12 text-center bg-card border-border">
            <Target className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-foreground mb-1">No opportunities yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Hit "Scan Now" to search Reddit, Threads & X for potential CRO leads
            </p>
            <Button onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending}>
              <Sparkles className="w-4 h-4 mr-2" />
              Run First Scan
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {opps?.map((opp) => (
              <OpportunityCard key={opp.id} opp={opp} onAction={handleAction} />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
