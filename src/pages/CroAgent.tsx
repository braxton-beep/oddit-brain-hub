import { DashboardLayout } from "@/components/DashboardLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Clock, ArrowDownRight } from "lucide-react";
import { format } from "date-fns";
import { useMemo } from "react";

// ── Hooks ──────────────────────────────────────────

function useScoreTrends() {
  return useQuery({
    queryKey: ["cro-agent-score-trends"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("oddit_scores")
        .select("client_name, total_score, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useRegressions() {
  return useQuery({
    queryKey: ["cro-agent-regressions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("oddit_scores")
        .select("client_name, total_score, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;

      // Group by client, find score drops
      const byClient: Record<string, { total_score: number; created_at: string }[]> = {};
      for (const row of data ?? []) {
        const key = row.client_name.toLowerCase().trim();
        if (!byClient[key]) byClient[key] = [];
        byClient[key].push(row);
      }

      const regressions: { client: string; from: number; to: number; date: string; drop: number }[] = [];
      for (const [client, scores] of Object.entries(byClient)) {
        if (scores.length < 2) continue;
        for (let i = 1; i < scores.length; i++) {
          const drop = scores[i - 1].total_score - scores[i].total_score;
          if (drop >= 5) {
            regressions.push({
              client,
              from: scores[i - 1].total_score,
              to: scores[i].total_score,
              date: scores[i].created_at,
              drop,
            });
          }
        }
      }
      return regressions.sort((a, b) => b.drop - a.drop);
    },
  });
}

function useImplementationProgress() {
  return useQuery({
    queryKey: ["cro-agent-impl-progress"],
    queryFn: async () => {
      const [{ data: audits }, { data: impls }] = await Promise.all([
        supabase.from("cro_audits").select("id, client_name, recommendations").eq("status", "completed"),
        supabase.from("client_implementations").select("audit_id, status"),
      ]);

      const auditMap: Record<string, { client: string; totalRecs: number; auditIds: string[] }> = {};
      for (const a of audits ?? []) {
        const key = a.client_name.toLowerCase().trim();
        const recs = Array.isArray(a.recommendations) ? a.recommendations.length : 0;
        if (!auditMap[key]) auditMap[key] = { client: a.client_name, totalRecs: recs, auditIds: [a.id] };
        else { auditMap[key].totalRecs += recs; auditMap[key].auditIds.push(a.id); }
      }

      const implByAudit: Record<string, { done: number; pending: number; inProgress: number }> = {};
      for (const impl of impls ?? []) {
        if (!implByAudit[impl.audit_id]) implByAudit[impl.audit_id] = { done: 0, pending: 0, inProgress: 0 };
        if (impl.status === "done" || impl.status === "completed") implByAudit[impl.audit_id].done++;
        else if (impl.status === "in_progress") implByAudit[impl.audit_id].inProgress++;
        else implByAudit[impl.audit_id].pending++;
      }

      return Object.entries(auditMap).map(([, v]) => {
        let done = 0, pending = 0, inProgress = 0;
        for (const aid of v.auditIds) {
          const c = implByAudit[aid];
          if (c) { done += c.done; pending += c.pending; inProgress += c.inProgress; }
        }
        const total = done + pending + inProgress;
        const rate = total > 0 ? Math.round((done / total) * 100) : (v.totalRecs > 0 ? 0 : null);
        return { client: v.client, done, pending, inProgress, total, totalRecs: v.totalRecs, rate };
      }).sort((a, b) => (a.rate ?? -1) - (b.rate ?? -1));
    },
  });
}

// ── Components ─────────────────────────────────────

function ScoreTrendsChart({ data }: { data: { client_name: string; total_score: number; created_at: string }[] }) {
  const chartData = useMemo(() => {
    const byDate: Record<string, Record<string, number>> = {};
    const clients = new Set<string>();
    for (const row of data) {
      const date = format(new Date(row.created_at), "MMM d");
      const client = row.client_name;
      clients.add(client);
      if (!byDate[date]) byDate[date] = {};
      byDate[date][client] = row.total_score;
    }
    return { points: Object.entries(byDate).map(([date, scores]) => ({ date, ...scores })), clients: Array.from(clients) };
  }, [data]);

  const colors = ["hsl(var(--primary))", "hsl(var(--gold))", "hsl(var(--electric))", "hsl(var(--violet))", "#34d399", "#f97316", "#06b6d4"];

  if (chartData.points.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No score data yet. Run audits to start tracking trends.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData.points}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
        <ReferenceLine y={70} stroke="hsl(var(--primary))" strokeDasharray="5 5" label={{ value: "Good", fill: "hsl(var(--primary))", fontSize: 10 }} />
        {chartData.clients.map((client, i) => (
          <Line key={client} type="monotone" dataKey={client} stroke={colors[i % colors.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function RegressionAlerts({ regressions }: { regressions: { client: string; from: number; to: number; date: string; drop: number }[] }) {
  if (regressions.length === 0) {
    return (
      <div className="flex items-center gap-3 py-6 justify-center text-sm text-muted-foreground">
        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
        No score regressions detected. All clients trending stable or improving.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {regressions.slice(0, 8).map((r, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-border/50 bg-destructive/5 px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium capitalize truncate">{r.client}</p>
            <p className="text-xs text-muted-foreground">{format(new Date(r.date), "MMM d, yyyy")}</p>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">{r.from}</span>
            <ArrowDownRight className="h-3.5 w-3.5 text-destructive" />
            <span className="font-bold text-destructive">{r.to}</span>
          </div>
          <Badge variant="destructive" className="text-[10px]">-{r.drop}</Badge>
        </div>
      ))}
    </div>
  );
}

function ImplementationTracker({ data }: { data: { client: string; done: number; pending: number; inProgress: number; total: number; totalRecs: number; rate: number | null }[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No implementation data. Push audit recommendations to the pipeline to start tracking.</p>;
  }

  return (
    <div className="space-y-3">
      {data.map((row) => (
        <div key={row.client} className="rounded-lg border border-border/50 bg-card/50 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium capitalize">{row.client}</p>
            <div className="flex items-center gap-2">
              {row.rate !== null && row.rate >= 60 && <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
              {row.rate !== null && row.rate < 30 && <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
              <span className="text-xs text-muted-foreground">
                {row.rate !== null ? `${row.rate}%` : "N/A"} implemented
              </span>
            </div>
          </div>
          <Progress value={row.rate ?? 0} className="h-2 mb-2" />
          <div className="flex gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> {row.done} done</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-gold" /> {row.inProgress} in progress</span>
            <span>{row.pending} pending</span>
            <span className="ml-auto">{row.totalRecs} total recs</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Page ────────────────────────────────────────────

export default function CroAgent() {
  const { data: scores = [] } = useScoreTrends();
  const { data: regressions = [] } = useRegressions();
  const { data: implProgress = [] } = useImplementationProgress();

  // Summary stats
  const totalClients = new Set(scores.map((s) => s.client_name.toLowerCase().trim())).size;
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, s) => a + s.total_score, 0) / scores.length) : 0;
  const regressionsCount = regressions.length;

  const stats = [
    { label: "Tracked Clients", value: totalClients, glow: "stat-glow-primary" },
    { label: "Avg Oddit Score", value: avgScore, glow: "stat-glow-electric" },
    { label: "Regressions", value: regressionsCount, glow: regressionsCount > 0 ? "stat-glow-gold" : "stat-glow-violet" },
    { label: "Impl. Tracked", value: implProgress.length, glow: "stat-glow-primary" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 md:p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-gradient-vivid">CRO Agent</h1>
          <p className="text-sm text-muted-foreground mt-1">Continuous monitoring · Regression flagging · Implementation tracking</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 stagger-children">
          {stats.map((s) => (
            <div key={s.label} className={`glow-card gradient-border rounded-xl bg-card p-5 hover-scale ${s.glow}`}>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{s.label}</p>
              <p className="mt-2 text-2xl font-bold text-cream">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Score Trends */}
        <Card className="glow-card p-5">
          <h2 className="text-base font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Score Trends Over Time
          </h2>
          <ScoreTrendsChart data={scores} />
        </Card>

        {/* Two-column: Regressions + Implementation */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="glow-card p-5">
            <h2 className="text-base font-bold mb-4 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Regression Alerts
            </h2>
            <RegressionAlerts regressions={regressions} />
          </Card>

          <Card className="glow-card p-5">
            <h2 className="text-base font-bold mb-4 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Implementation Tracker
            </h2>
            <ImplementationTracker data={implProgress} />
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
