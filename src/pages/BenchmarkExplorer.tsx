import { DashboardLayout } from "@/components/DashboardLayout";
import {
  Target,
  Search,
  Filter,
  TrendingUp,
  RefreshCw,
  Loader2,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Plus,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const EXTRACT_KPI_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-kpis`;

interface KpiBenchmark {
  id: string;
  metric_name: string;
  industry: string;
  revenue_tier: string;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  unit: string;
  source_count: number;
  created_at: string;
}

const TIER_ORDER = ["<1M", "1M-10M", "10M-50M", "50M+", "Unknown"];

const BenchmarkRow = ({ b, clientValue }: { b: KpiBenchmark; clientValue?: number | null }) => {
  const [expanded, setExpanded] = useState(false);
  const fmt = (v: number | null) => (v == null ? "—" : `${v}${b.unit}`);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-secondary/50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-cream">{b.metric_name}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border border-border rounded-full px-2 py-0.5">
              {b.industry}
            </span>
            {b.revenue_tier && b.revenue_tier !== "Unknown" && (
              <span className="text-[10px] font-semibold text-gold border border-gold/30 rounded-full px-2 py-0.5">
                {b.revenue_tier}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-6 text-right shrink-0">
          {clientValue != null && (
            <div className="text-center hidden sm:block">
              <p className="text-[10px] text-primary uppercase tracking-wider">Client</p>
              <p className="text-sm font-bold text-primary">{clientValue}{b.unit}</p>
            </div>
          )}
          <div className="text-center hidden sm:block">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">P50</p>
            <p className="text-sm font-bold text-cream">{fmt(b.p50)}</p>
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-4 border-t border-border">
          <div className={`grid gap-4 mt-4 ${clientValue != null ? "grid-cols-4" : "grid-cols-3"}`}>
            {[
              { label: "P25 (Good)", value: fmt(b.p25), color: "text-muted-foreground" },
              { label: "P50 (Median)", value: fmt(b.p50), color: "text-cream" },
              { label: "P75 (Great)", value: fmt(b.p75), color: "text-accent" },
            ].map((stat) => (
              <div key={stat.label} className="text-center rounded-lg bg-secondary border border-border p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{stat.label}</p>
                <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
            {clientValue != null && (
              <div className="text-center rounded-lg bg-primary/10 border border-primary/30 p-3">
                <p className="text-[10px] text-primary uppercase tracking-wider mb-1">Client</p>
                <p className="text-lg font-bold text-primary">{clientValue}{b.unit}</p>
              </div>
            )}
          </div>
          {/* Visual bar comparing client vs benchmarks */}
          {clientValue != null && b.p25 != null && b.p75 != null && (
            <div className="mt-3 rounded-lg bg-secondary border border-border p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Client vs Benchmarks</p>
              <div className="relative h-4 rounded-full bg-muted overflow-hidden">
                {/* P25-P75 range */}
                <div
                  className="absolute h-full bg-accent/20 rounded-full"
                  style={{
                    left: `${Math.max(0, Math.min(100, (b.p25! / (b.p75! * 1.3)) * 100))}%`,
                    width: `${Math.max(5, ((b.p75! - b.p25!) / (b.p75! * 1.3)) * 100)}%`,
                  }}
                />
                {/* P50 marker */}
                {b.p50 != null && (
                  <div
                    className="absolute h-full w-0.5 bg-cream/50"
                    style={{ left: `${Math.max(0, Math.min(100, (b.p50! / (b.p75! * 1.3)) * 100))}%` }}
                  />
                )}
                {/* Client marker */}
                <div
                  className="absolute h-full w-1 bg-primary rounded-full"
                  style={{ left: `${Math.max(0, Math.min(100, (clientValue / (b.p75! * 1.3)) * 100))}%` }}
                />
              </div>
              <div className="flex justify-between mt-1 text-[9px] text-muted-foreground">
                <span>P25: {fmt(b.p25)}</span>
                <span>P50: {fmt(b.p50)}</span>
                <span>P75: {fmt(b.p75)}</span>
              </div>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground mt-3">
            Based on {b.source_count} source{b.source_count !== 1 ? "s" : ""} •{" "}
            {new Date(b.created_at).toLocaleDateString()}
          </p>
        </div>
      )}
    </div>
  );
};

const BenchmarkExplorer = () => {
  const [search, setSearch] = useState("");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [isExtracting, setIsExtracting] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [compareClient, setCompareClient] = useState<string | null>(null);
  const [newBenchmark, setNewBenchmark] = useState({
    metric_name: "",
    industry: "",
    revenue_tier: "",
    p25: "",
    p50: "",
    p75: "",
    unit: "%",
  });
  const queryClient = useQueryClient();

  const { data: benchmarks, isLoading, refetch } = useQuery({
    queryKey: ["kpi-benchmarks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpi_benchmarks")
        .select("*")
        .order("metric_name");
      if (error) throw error;
      return data as KpiBenchmark[];
    },
  });

  const { data: clients } = useQuery({
    queryKey: ["clients-for-compare"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("name, industry, revenue_tier").order("name");
      if (error) throw error;
      return data as { name: string; industry: string; revenue_tier: string }[];
    },
  });

  const { data: odditScores } = useQuery({
    queryKey: ["oddit-scores-compare"],
    enabled: !!compareClient,
    queryFn: async () => {
      const { data, error } = await supabase.from("oddit_scores").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const industries = ["all", ...Array.from(new Set((benchmarks || []).map((b) => b.industry).filter(Boolean)))];

  const selectedClient = compareClient ? (clients || []).find((c) => c.name === compareClient) : null;

  const filtered = (benchmarks || []).filter((b) => {
    const matchSearch =
      !search ||
      b.metric_name.toLowerCase().includes(search.toLowerCase()) ||
      b.industry.toLowerCase().includes(search.toLowerCase());
    const matchIndustry = industryFilter === "all" || b.industry === industryFilter;
    // If comparing a client, optionally filter to their industry
    return matchSearch && matchIndustry;
  });

  const handleExtract = async () => {
    setIsExtracting(true);
    try {
      const resp = await fetch(EXTRACT_KPI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Extraction failed");
      toast.success(`Extracted ${data.benchmarks?.length || 0} benchmarks from ${data.total_transcripts} transcripts`);
      refetch();
    } catch (e: any) {
      toast.error("Extraction failed", { description: e.message });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleAddBenchmark = async () => {
    if (!newBenchmark.metric_name.trim() || !newBenchmark.industry.trim()) {
      toast.error("Metric name and industry are required");
      return;
    }
    try {
      const { error } = await supabase.from("kpi_benchmarks").insert({
        metric_name: newBenchmark.metric_name,
        industry: newBenchmark.industry,
        revenue_tier: newBenchmark.revenue_tier || "Unknown",
        p25: newBenchmark.p25 ? parseFloat(newBenchmark.p25) : null,
        p50: newBenchmark.p50 ? parseFloat(newBenchmark.p50) : null,
        p75: newBenchmark.p75 ? parseFloat(newBenchmark.p75) : null,
        unit: newBenchmark.unit || "%",
        source_count: 1,
      });
      if (error) throw error;
      toast.success("Benchmark added");
      setShowAddForm(false);
      setNewBenchmark({ metric_name: "", industry: "", revenue_tier: "", p25: "", p50: "", p75: "", unit: "%" });
      refetch();
    } catch (e: any) {
      toast.error("Failed to add benchmark", { description: e.message });
    }
  };

  // Get a simple "client value" for a benchmark metric (mock: use oddit score dimensions if available)
  const getClientValue = (b: KpiBenchmark): number | null => {
    if (!compareClient || !odditScores) return null;
    const clientScore = odditScores.find((s: any) => s.client_name?.toLowerCase() === compareClient.toLowerCase());
    if (!clientScore) return null;
    const metricLower = b.metric_name.toLowerCase();
    if (metricLower.includes("conversion")) return clientScore.funnel_logic;
    if (metricLower.includes("bounce")) return clientScore.speed_perception;
    if (metricLower.includes("aov") || metricLower.includes("order value")) return clientScore.copy_strength;
    return null;
  };

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mb-6 animate-fade-in">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary animate-glow-pulse">
            <BarChart3 className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gradient-warm">Benchmark Explorer</h1>
              <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-bold tracking-widest text-gold uppercase">
                KPI DB
              </span>
            </div>
            <p className="text-[13px] text-muted-foreground">
              KPI benchmarks extracted from client transcripts — P25/P50/P75 by industry & revenue tier.
            </p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search metrics or industry..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-card pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <select
            value={industryFilter}
            onChange={(e) => setIndustryFilter(e.target.value)}
            className="rounded-lg border border-border bg-card pl-10 pr-8 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all appearance-none"
          >
            {industries.map((ind) => (
              <option key={ind} value={ind}>
                {ind === "all" ? "All Industries" : ind}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={handleExtract}
          disabled={isExtracting}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
        >
          {isExtracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {isExtracting ? "Extracting..." : "Extract from Transcripts"}
        </button>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2 mb-6">
        {/* Compare Client */}
        <div className="relative">
          <select
            value={compareClient || ""}
            onChange={(e) => setCompareClient(e.target.value || null)}
            className="rounded-lg border border-border bg-card pl-3 pr-8 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 appearance-none"
          >
            <option value="">
              {compareClient ? "Clear comparison" : "Compare Client..."}
            </option>
            {(clients || []).map((c) => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
          <Users className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>

        {compareClient && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Users className="h-3 w-3" />
            Comparing: {compareClient}
            {selectedClient?.industry && <span className="text-muted-foreground">({selectedClient.industry})</span>}
            <button onClick={() => setCompareClient(null)} className="ml-1 hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </span>
        )}

        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-bold text-foreground hover:bg-secondary transition-colors"
        >
          <Plus className="h-4 w-4" /> Add Benchmark
        </button>
      </div>

      {/* Add Benchmark Form */}
      {showAddForm && (
        <div className="mb-6 rounded-xl border border-primary/20 bg-card p-5 animate-scale-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-cream uppercase tracking-wider">Add Benchmark Manually</h3>
            <button onClick={() => setShowAddForm(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 mb-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Metric Name *</label>
              <input
                value={newBenchmark.metric_name}
                onChange={(e) => setNewBenchmark((b) => ({ ...b, metric_name: e.target.value }))}
                placeholder="e.g. Conversion Rate"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Industry *</label>
              <input
                value={newBenchmark.industry}
                onChange={(e) => setNewBenchmark((b) => ({ ...b, industry: e.target.value }))}
                placeholder="e.g. Health & Wellness"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Revenue Tier</label>
              <input
                value={newBenchmark.revenue_tier}
                onChange={(e) => setNewBenchmark((b) => ({ ...b, revenue_tier: e.target.value }))}
                placeholder="e.g. 1M-10M"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>
          <div className="grid gap-3 grid-cols-4 mb-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">P25</label>
              <input
                type="number"
                step="0.1"
                value={newBenchmark.p25}
                onChange={(e) => setNewBenchmark((b) => ({ ...b, p25: e.target.value }))}
                placeholder="0"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">P50</label>
              <input
                type="number"
                step="0.1"
                value={newBenchmark.p50}
                onChange={(e) => setNewBenchmark((b) => ({ ...b, p50: e.target.value }))}
                placeholder="0"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">P75</label>
              <input
                type="number"
                step="0.1"
                value={newBenchmark.p75}
                onChange={(e) => setNewBenchmark((b) => ({ ...b, p75: e.target.value }))}
                placeholder="0"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Unit</label>
              <select
                value={newBenchmark.unit}
                onChange={(e) => setNewBenchmark((b) => ({ ...b, unit: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="%">%</option>
                <option value="$">$</option>
                <option value="s">s</option>
                <option value="x">x</option>
                <option value="">none</option>
              </select>
            </div>
          </div>
          <button
            onClick={handleAddBenchmark}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" /> Save Benchmark
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Total Benchmarks", value: benchmarks?.length || 0, color: "text-cream" },
          { label: "Industries", value: industries.length - 1, color: "text-gold" },
          { label: "Showing", value: filtered.length, color: "text-accent" },
        ].map((s) => (
          <div key={s.label} className="glow-card rounded-xl bg-card p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Benchmarks */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl bg-muted h-16" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary border border-border">
            <Target className="h-8 w-8 opacity-30" />
          </div>
          <div>
            <p className="text-sm font-medium text-cream/60 mb-1">
              {benchmarks?.length ? "No benchmarks match your filters" : "No benchmarks yet"}
            </p>
            <p className="text-xs text-muted-foreground max-w-xs">
              {benchmarks?.length
                ? "Try broadening your search or changing the industry filter."
                : "Click 'Extract from Transcripts' to scan your meeting data for KPI mentions."}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((b) => (
            <BenchmarkRow key={b.id} b={b} clientValue={getClientValue(b)} />
          ))}
        </div>
      )}
    </DashboardLayout>
  );
};

export default BenchmarkExplorer;
