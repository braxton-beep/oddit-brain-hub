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
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

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

const BenchmarkRow = ({ b }: { b: KpiBenchmark }) => {
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
          <div className="grid grid-cols-3 gap-4 mt-4">
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
          </div>
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

  const industries = ["all", ...Array.from(new Set((benchmarks || []).map((b) => b.industry).filter(Boolean)))];

  const filtered = (benchmarks || []).filter((b) => {
    const matchSearch =
      !search ||
      b.metric_name.toLowerCase().includes(search.toLowerCase()) ||
      b.industry.toLowerCase().includes(search.toLowerCase());
    const matchIndustry = industryFilter === "all" || b.industry === industryFilter;
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
              <h1 className="text-2xl font-bold text-cream">Benchmark Explorer</h1>
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
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
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
            <BenchmarkRow key={b.id} b={b} />
          ))}
        </div>
      )}
    </DashboardLayout>
  );
};

export default BenchmarkExplorer;
