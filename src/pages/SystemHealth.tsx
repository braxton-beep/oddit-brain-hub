import { DashboardLayout } from "@/components/DashboardLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Database, FileText, Brain, Target, Image, FolderOpen, BarChart3,
  CheckCircle2, Users, MessageSquare, TrendingUp, Activity,
} from "lucide-react";
import { format } from "date-fns";

interface StatBlock {
  label: string;
  value: number | string;
  icon: typeof Database;
  color: string;
  sub?: string;
}

function useSystemStats() {
  return useQuery({
    queryKey: ["system-health-stats"],
    queryFn: async () => {
      const [
        { count: figmaTotal },
        { count: figmaWithDNA },
        { count: transcriptsTotal },
        { count: transcriptsEmbedded },
        { count: auditsCompleted },
        { count: auditsTotal },
        { count: recPatterns },
        { count: odditScores },
        { count: clientsTotal },
        { count: compIntel },
        { count: wireframeBriefs },
        { count: setupRuns },
        { count: driveFiles },
        { data: recentActivity },
      ] = await Promise.all([
        supabase.from("figma_files").select("*", { count: "exact", head: true }),
        supabase.from("figma_files").select("*", { count: "exact", head: true }).neq("design_data", "{}"),
        supabase.from("fireflies_transcripts").select("*", { count: "exact", head: true }),
        supabase.from("fireflies_transcripts").select("*", { count: "exact", head: true }).not("embedding", "is", null),
        supabase.from("cro_audits").select("*", { count: "exact", head: true }).eq("status", "completed"),
        supabase.from("cro_audits").select("*", { count: "exact", head: true }),
        supabase.from("recommendation_insights").select("*", { count: "exact", head: true }),
        supabase.from("oddit_scores").select("*", { count: "exact", head: true }),
        supabase.from("clients").select("*", { count: "exact", head: true }),
        supabase.from("competitive_intel").select("*", { count: "exact", head: true }),
        supabase.from("wireframe_briefs").select("*", { count: "exact", head: true }),
        supabase.from("setup_runs").select("*", { count: "exact", head: true }),
        supabase.from("google_drive_files").select("*", { count: "exact", head: true }),
        supabase.from("activity_log").select("workflow_name, status, created_at").order("created_at", { ascending: false }).limit(12),
      ]);

      // Effectiveness leaders
      const { data: topRecs } = await supabase
        .from("recommendation_insights")
        .select("recommendation_text, category, effectiveness_score, converted_count, implemented_count, frequency_count")
        .order("effectiveness_score", { ascending: false })
        .limit(5);

      return {
        figmaTotal: figmaTotal ?? 0,
        figmaWithDNA: figmaWithDNA ?? 0,
        transcriptsTotal: transcriptsTotal ?? 0,
        transcriptsEmbedded: transcriptsEmbedded ?? 0,
        auditsCompleted: auditsCompleted ?? 0,
        auditsTotal: auditsTotal ?? 0,
        recPatterns: recPatterns ?? 0,
        odditScores: odditScores ?? 0,
        clientsTotal: clientsTotal ?? 0,
        compIntel: compIntel ?? 0,
        wireframeBriefs: wireframeBriefs ?? 0,
        setupRuns: setupRuns ?? 0,
        driveFiles: driveFiles ?? 0,
        recentActivity: recentActivity ?? [],
        topRecs: topRecs ?? [],
      };
    },
    refetchInterval: 30_000,
  });
}

function StatTile({ stat, loading }: { stat: StatBlock; loading: boolean }) {
  const Icon = stat.icon;
  return (
    <div className="group rounded-2xl border border-border/60 bg-card/60 p-5 transition-all duration-200 hover:border-primary/25 hover:shadow-md hover:translate-y-[-2px]">
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3 w-28" />
        </div>
      ) : (
        <>
          <Icon className={`h-4 w-4 ${stat.color} mb-3`} />
          <p className="text-3xl font-extrabold text-foreground tabular-nums leading-none">{stat.value}</p>
          <p className="text-xs text-muted-foreground mt-2 font-medium">{stat.label}</p>
          {stat.sub && <p className="text-[11px] text-muted-foreground/70 mt-0.5">{stat.sub}</p>}
        </>
      )}
    </div>
  );
}

export default function SystemHealth() {
  const { data, isLoading } = useSystemStats();
  const d = data;

  const stats: StatBlock[] = d ? [
    { label: "Figma Files Indexed", value: d.figmaTotal, icon: Image, color: "text-primary", sub: `${d.figmaWithDNA} with Design DNA` },
    { label: "Transcripts Ingested", value: d.transcriptsTotal, icon: FileText, color: "text-electric", sub: `${d.transcriptsEmbedded} vector-embedded` },
    { label: "CRO Audits Completed", value: d.auditsCompleted, icon: CheckCircle2, color: "text-emerald-500", sub: `${d.auditsTotal} total runs` },
    { label: "Oddit Scores Generated", value: d.odditScores, icon: BarChart3, color: "text-gold" },
    { label: "Recommendation Patterns", value: d.recPatterns, icon: Target, color: "text-violet", sub: "Effectiveness-tracked" },
    { label: "Clients Tracked", value: d.clientsTotal, icon: Users, color: "text-primary" },
    { label: "Competitive Intel Reports", value: d.compIntel, icon: TrendingUp, color: "text-electric" },
    { label: "Wireframe Briefs", value: d.wireframeBriefs, icon: Brain, color: "text-violet" },
    { label: "Setup Automations", value: d.setupRuns, icon: Activity, color: "text-gold" },
    { label: "Google Drive Files", value: d.driveFiles, icon: FolderOpen, color: "text-emerald-500" },
  ] : Array(10).fill({ label: "", value: 0, icon: Database, color: "" });

  const pctDNA = d && d.figmaTotal > 0 ? Math.round((d.figmaWithDNA / d.figmaTotal) * 100) : 0;
  const pctEmbed = d && d.transcriptsTotal > 0 ? Math.round((d.transcriptsEmbedded / d.transcriptsTotal) * 100) : 0;

  return (
    <DashboardLayout>
      <div className="space-y-8 p-4 md:p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">System Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time view of indexed data, AI processing coverage, and recommendation effectiveness.
          </p>
        </div>

        {/* Coverage bars */}
        {d && (
          <div className="grid md:grid-cols-2 gap-4">
            <CoverageBar label="Design DNA Coverage" value={pctDNA} detail={`${d.figmaWithDNA} / ${d.figmaTotal} files profiled`} color="bg-primary" />
            <CoverageBar label="Transcript Embedding Coverage" value={pctEmbed} detail={`${d.transcriptsEmbedded} / ${d.transcriptsTotal} embedded`} color="bg-electric" />
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {stats.map((s, i) => (
            <StatTile key={i} stat={s} loading={isLoading} />
          ))}
        </div>

        {/* Bottom panels */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Top recommendation patterns */}
          <Card className="p-5">
            <h2 className="text-sm font-bold mb-4 flex items-center gap-2">
              <Target className="h-4 w-4 text-violet" />
              Top Recommendation Patterns
            </h2>
            {isLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : d?.topRecs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No recommendation patterns tracked yet.</p>
            ) : (
              <div className="space-y-2">
                {d?.topRecs.map((r, i) => (
                  <div key={i} className="rounded-lg border border-border/50 bg-card/50 px-4 py-3 flex items-start gap-3">
                    <span className="text-xs font-bold text-muted-foreground/60 mt-0.5 tabular-nums w-4">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug line-clamp-2">{r.recommendation_text}</p>
                      <div className="flex gap-3 mt-1.5 text-[11px] text-muted-foreground">
                        <span className="capitalize">{r.category}</span>
                        <span>×{r.frequency_count} seen</span>
                        <span className="text-emerald-500">{r.converted_count} converted</span>
                        <span>Score: {Number(r.effectiveness_score).toFixed(1)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Recent activity */}
          <Card className="p-5">
            <h2 className="text-sm font-bold mb-4 flex items-center gap-2">
              <Activity className="h-4 w-4 text-electric" />
              Recent Activity
            </h2>
            {isLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : d?.recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No activity yet.</p>
            ) : (
              <div className="space-y-1.5">
                {d?.recentActivity.map((a: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted/30 transition-colors">
                    <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${a.status === "completed" ? "bg-emerald-500" : a.status === "failed" ? "bg-destructive" : "bg-gold"}`} />
                    <span className="flex-1 truncate text-muted-foreground">{a.workflow_name}</span>
                    <span className="text-[11px] text-muted-foreground/60 tabular-nums shrink-0">
                      {format(new Date(a.created_at), "MMM d, HH:mm")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

function CoverageBar({ label, value, detail, color }: { label: string; value: number; detail: string; color: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-sm font-bold tabular-nums">{value}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${value}%` }} />
      </div>
      <p className="text-[11px] text-muted-foreground mt-1.5">{detail}</p>
    </div>
  );
}
