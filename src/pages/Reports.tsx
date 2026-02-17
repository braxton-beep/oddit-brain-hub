import { DashboardLayout } from "@/components/DashboardLayout";
import {
  FileText,
  Download,
  Eye,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  Loader2,
  BarChart3,
} from "lucide-react";
import { useState } from "react";

type ReportStatus = "completed" | "generating" | "draft" | "failed";

interface Report {
  id: string;
  client: string;
  type: string;
  status: ReportStatus;
  date: string;
  pages: number;
}

const reports: Report[] = [
  { id: "1", client: "Braxley Bands", type: "Full CRO Audit", status: "completed", date: "Feb 15, 2026", pages: 42 },
  { id: "2", client: "TechFlow", type: "Homepage Audit", status: "completed", date: "Feb 14, 2026", pages: 18 },
  { id: "3", client: "NovaPay", type: "Checkout Optimization", status: "generating", date: "Feb 17, 2026", pages: 0 },
  { id: "4", client: "GreenLeaf Co", type: "Full CRO Audit", status: "draft", date: "Feb 16, 2026", pages: 35 },
  { id: "5", client: "UrbanFit", type: "Mobile UX Audit", status: "completed", date: "Feb 12, 2026", pages: 24 },
  { id: "6", client: "Pawsome", type: "A/B Test Results", status: "failed", date: "Feb 10, 2026", pages: 0 },
];

const templates = [
  { name: "Full CRO Audit", description: "Complete conversion rate optimization analysis", uses: 847 },
  { name: "Homepage Audit", description: "Above-the-fold and hero section analysis", uses: 312 },
  { name: "Checkout Optimization", description: "Cart and checkout flow teardown", uses: 198 },
  { name: "Mobile UX Audit", description: "Mobile-first design and usability review", uses: 156 },
  { name: "A/B Test Roadmap", description: "Prioritized testing recommendations", uses: 94 },
];

const statusStyles: Record<ReportStatus, { bg: string; icon: typeof CheckCircle2 }> = {
  completed: { bg: "text-accent", icon: CheckCircle2 },
  generating: { bg: "text-primary", icon: Loader2 },
  draft: { bg: "text-warning", icon: Clock },
  failed: { bg: "text-destructive", icon: AlertCircle },
};

const Reports = () => {
  const [filter, setFilter] = useState<"all" | ReportStatus>("all");
  const filtered = filter === "all" ? reports : reports.filter((r) => r.status === filter);

  return (
    <DashboardLayout>
      <div className="mb-8 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <FileText className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-cream">Reports</h1>
            <p className="text-[13px] text-muted-foreground">Automated audit report generation & management</p>
          </div>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground hover:opacity-90 transition-opacity">
          <Plus className="h-4 w-4" />
          New Report
        </button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4 mb-8">
        {[
          { label: "Total Reports", value: "1,243" },
          { label: "This Month", value: "34" },
          { label: "Auto-Generated", value: "89%" },
          { label: "Avg. Pages", value: "28" },
        ].map((s) => (
          <div key={s.label} className="glow-card rounded-xl bg-card p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{s.label}</p>
            <p className="mt-2 text-2xl font-bold text-cream">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Reports Table */}
        <div className="lg:col-span-2 glow-card rounded-xl bg-card p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-bold text-cream uppercase tracking-wider">All Reports</h2>
            <div className="flex gap-1.5">
              {(["all", "completed", "generating", "draft", "failed"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                    filter === f ? "bg-primary/15 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {filtered.map((r) => {
              const st = statusStyles[r.status];
              const Icon = st.icon;
              return (
                <div key={r.id} className="flex items-center gap-4 rounded-lg border border-border bg-secondary p-4 hover:border-primary/20 transition-colors">
                  <Icon className={`h-4 w-4 shrink-0 ${st.bg} ${r.status === "generating" ? "animate-spin" : ""}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-cream">{r.client}</p>
                    <p className="text-xs text-muted-foreground">{r.type} • {r.date}</p>
                  </div>
                  {r.pages > 0 && (
                    <span className="text-xs text-muted-foreground">{r.pages} pages</span>
                  )}
                  <div className="flex gap-1.5">
                    {r.status === "completed" && (
                      <>
                        <button className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary border border-border hover:border-primary/30 transition-colors">
                          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                        <button className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary border border-border hover:border-primary/30 transition-colors">
                          <Download className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Templates */}
        <div className="glow-card rounded-xl bg-card p-5">
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Templates</h2>
          </div>
          <div className="space-y-2.5">
            {templates.map((t) => (
              <div key={t.name} className="rounded-lg border border-border bg-secondary p-3.5 hover:border-primary/20 transition-colors cursor-pointer">
                <p className="text-sm font-bold text-cream mb-1">{t.name}</p>
                <p className="text-xs text-muted-foreground mb-2">{t.description}</p>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{t.uses} reports generated</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Reports;
