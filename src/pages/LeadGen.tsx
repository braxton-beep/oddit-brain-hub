import { DashboardLayout } from "@/components/DashboardLayout";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Target, RefreshCw, CheckCircle2, XCircle, Send, ExternalLink,
  Clock, Loader2, Filter, Sparkles, AlertTriangle, Eye,
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

function useLeadOpportunities(status?: string) {
  return useQuery({
    queryKey: ["lead-opportunities", status],
    queryFn: async () => {
      let q = supabase
        .from("lead_gen_opportunities")
        .select("*")
        .order("relevance_score", { ascending: false })
        .limit(100);
      if (status && status !== "all") {
        q = q.eq("status", status);
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
      const byPlatform = { x: 0, threads: 0, reddit: 0 };
      for (const d of data ?? []) {
        if (d.platform === "x") byPlatform.x++;
        else if (d.platform === "reddit") byPlatform.reddit++;
        else byPlatform.threads++;
      }
      return { total, pending, replied, byPlatform };
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
      toast.success(`Found ${data?.new_opportunities ?? 0} new opportunities`);
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
              {opp.platform === "x" ? "𝕏" : opp.platform === "reddit" ? "🤖" : "🧵"} {opp.platform}
            </Badge>
            <span className="text-xs text-muted-foreground">Score: {opp.relevance_score}</span>
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
                <Button
                  size="sm"
                  onClick={() => onAction(opp.id, "approve", editedReply)}
                  className="gap-1"
                >
                  <Send className="w-3 h-3" />
                  {opp.platform === "x" ? "Post Reply" : "Approve"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onAction(opp.id, "skip")}
                  className="gap-1"
                >
                  <XCircle className="w-3 h-3" />
                  Skip
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {opp.status === "replied" && opp.replied_at && (
        <p className="mt-2 text-xs text-green-400 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          Replied {new Date(opp.replied_at).toLocaleDateString()}
        </p>
      )}
    </Card>
  );
}

export default function LeadGen() {
  const [statusFilter, setStatusFilter] = useState("pending");
  const { data: opps, isLoading } = useLeadOpportunities(statusFilter);
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
                AI scans X & Threads for CRO leads, drafts replies for your approval
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4 bg-card border-border">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Found</p>
            <p className="text-2xl font-bold text-foreground">{stats?.total ?? 0}</p>
          </Card>
          <Card className="p-4 bg-card border-border">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Pending Review</p>
            <p className="text-2xl font-bold text-amber-400">{stats?.pending ?? 0}</p>
          </Card>
          <Card className="p-4 bg-card border-border">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Replied</p>
            <p className="text-2xl font-bold text-green-400">{stats?.replied ?? 0}</p>
          </Card>
          <Card className="p-4 bg-card border-border">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">By Platform</p>
            <p className="text-sm text-foreground">
              𝕏 {stats?.byPlatform?.x ?? 0} · 🧵 {stats?.byPlatform?.threads ?? 0}
            </p>
          </Card>
        </div>

        {/* Filter tabs */}
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList className="bg-muted">
            <TabsTrigger value="pending">⏳ Pending</TabsTrigger>
            <TabsTrigger value="all">📋 All</TabsTrigger>
            <TabsTrigger value="replied">✅ Replied</TabsTrigger>
            <TabsTrigger value="skipped">⏭️ Skipped</TabsTrigger>
          </TabsList>
        </Tabs>

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
              Hit "Scan Now" to search X and Threads for potential leads
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
