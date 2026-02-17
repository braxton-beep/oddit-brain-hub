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
  X,
} from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

const GENERATE_REPORT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-report`;

type ReportStatus = "completed" | "generating" | "draft" | "failed";

interface Report {
  id: string;
  client: string;
  type: string;
  status: ReportStatus;
  date: string;
  pages: number;
  content?: string;
}

const initialReports: Report[] = [
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
  const [reports, setReports] = useState(initialReports);
  const [viewingReport, setViewingReport] = useState<Report | null>(null);
  const [showNewReport, setShowNewReport] = useState(false);
  const [newClient, setNewClient] = useState("");
  const [newTemplate, setNewTemplate] = useState(templates[0].name);

  const filtered = filter === "all" ? reports : reports.filter((r) => r.status === filter);

  const handleNewReport = async () => {
    if (!newClient.trim()) {
      toast.error("Enter a client name");
      return;
    }
    const id = `new-${Date.now()}`;
    const newReport: Report = {
      id,
      client: newClient,
      type: newTemplate,
      status: "generating",
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      pages: 0,
      content: "",
    };
    setReports((prev) => [newReport, ...prev]);
    setShowNewReport(false);
    const clientName = newClient;
    const templateName = newTemplate;
    setNewClient("");
    toast.loading(`Generating "${templateName}" for ${clientName}...`, { id });

    try {
      const resp = await fetch(GENERATE_REPORT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ client: clientName, template: templateName }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `Error ${resp.status}`);
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let fullContent = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              fullContent += content;
              const captured = fullContent;
              setReports((prev) =>
                prev.map((r) => (r.id === id ? { ...r, content: captured } : r))
              );
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      const wordCount = fullContent.split(/\s+/).length;
      const estimatedPages = Math.max(1, Math.round(wordCount / 250));
      setReports((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: "completed" as ReportStatus, pages: estimatedPages, content: fullContent } : r))
      );
      toast.success(`Report for ${clientName} is ready!`, { id, description: `${templateName} completed` });
    } catch (e: any) {
      setReports((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: "failed" as ReportStatus, content: `Error: ${e.message}` } : r))
      );
      toast.error(`Failed to generate report`, { id, description: e.message });
    }
  };

  const handleView = (report: Report) => {
    setViewingReport(report);
  };

  const handleDownload = (report: Report) => {
    toast.success(`Downloading: ${report.client} — ${report.type}`, { description: `${report.pages}-page PDF export started` });
  };

  const handleRetry = (report: Report) => {
    setReports((prev) =>
      prev.map((r) => (r.id === report.id ? { ...r, status: "generating" as ReportStatus } : r))
    );
    toast.loading(`Retrying "${report.type}" for ${report.client}...`, { id: report.id });
    setTimeout(() => {
      setReports((prev) =>
        prev.map((r) => (r.id === report.id ? { ...r, status: "completed" as ReportStatus, pages: Math.floor(Math.random() * 30) + 15 } : r))
      );
      toast.success(`Report for ${report.client} is ready!`, { id: report.id });
    }, 3000);
  };

  return (
    <DashboardLayout>
      <div className="mb-8 flex items-start justify-between animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary animate-glow-pulse">
            <FileText className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-cream">Reports</h1>
            <p className="text-[13px] text-muted-foreground">Automated audit report generation & management</p>
          </div>
        </div>
        <button
          onClick={() => setShowNewReport(true)}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          New Report
        </button>
      </div>

      {/* New Report Modal */}
      {showNewReport && (
        <div className="mb-6 glow-card rounded-xl bg-card p-6 border border-primary/20">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-cream uppercase tracking-wider">Generate New Report</h3>
            <button onClick={() => setShowNewReport(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 mb-4">
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Client Name</label>
              <input
                type="text"
                value={newClient}
                onChange={(e) => setNewClient(e.target.value)}
                placeholder="e.g. Braxley Bands"
                className="w-full rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Template</label>
              <select
                value={newTemplate}
                onChange={(e) => setNewTemplate(e.target.value)}
                className="w-full rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              >
                {templates.map((t) => (
                  <option key={t.name} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={handleNewReport}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Loader2 className="h-4 w-4" />
            Generate Report
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4 mb-8">
        {[
          { label: "Total Reports", value: reports.length.toString() },
          { label: "Completed", value: reports.filter((r) => r.status === "completed").length.toString() },
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
                        <button onClick={() => handleView(r)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary border border-border hover:border-primary/30 transition-colors" title="View">
                          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                        <button onClick={() => handleDownload(r)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary border border-border hover:border-primary/30 transition-colors" title="Download">
                          <Download className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </>
                    )}
                    {r.status === "failed" && (
                      <button onClick={() => handleRetry(r)} className="flex items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/20 px-3 py-1.5 text-[11px] font-bold text-primary hover:opacity-90 transition-opacity">
                        Retry
                      </button>
                    )}
                    {r.status === "draft" && (
                      <button onClick={() => {
                        setReports((prev) => prev.map((rep) => rep.id === r.id ? { ...rep, status: "generating" as ReportStatus } : rep));
                        toast.loading(`Finalizing "${r.type}" for ${r.client}...`, { id: r.id });
                        setTimeout(() => {
                          setReports((prev) => prev.map((rep) => rep.id === r.id ? { ...rep, status: "completed" as ReportStatus } : rep));
                          toast.success(`${r.client} report finalized!`, { id: r.id });
                        }, 3000);
                      }} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[11px] font-bold text-accent-foreground hover:opacity-90 transition-opacity">
                        Finalize
                      </button>
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
              <div key={t.name} className="rounded-lg border border-border bg-secondary p-3.5 hover:border-primary/20 transition-colors cursor-pointer"
                onClick={() => {
                  setNewTemplate(t.name);
                  setShowNewReport(true);
                  toast.info(`Selected template: ${t.name}`);
                }}
              >
                <p className="text-sm font-bold text-cream mb-1">{t.name}</p>
                <p className="text-xs text-muted-foreground mb-2">{t.description}</p>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{t.uses} reports generated</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Report Viewer Modal */}
      {viewingReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-3xl max-h-[80vh] overflow-y-auto rounded-2xl bg-card border border-border p-8 shadow-2xl">
            <button
              onClick={() => setViewingReport(null)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="mb-6">
              <h2 className="text-xl font-bold text-cream">{viewingReport.client} — {viewingReport.type}</h2>
              <p className="text-xs text-muted-foreground mt-1">{viewingReport.date} • {viewingReport.pages} pages</p>
            </div>
            {viewingReport.content ? (
              <div className="prose prose-sm prose-invert max-w-none text-foreground">
                <ReactMarkdown>{viewingReport.content}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No content available for this report. Generate a new report to see AI-powered content.</p>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default Reports;
