import { DashboardLayout } from "@/components/DashboardLayout";
import {
  CheckCircle2,
  ExternalLink,
  Link2,
  Unlink,
  Search,
  Brain,
  RefreshCw,
  Shield,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type ConnectionStatus = "connected" | "disconnected" | "syncing";

interface Integration {
  id: string;
  name: string;
  emoji: string;
  description: string;
  category: "communication" | "storage" | "meetings" | "design" | "analytics" | "development";
  status: ConnectionStatus;
  lastSync?: string;
  itemsSynced?: number;
  connectedBy?: string;
}

const initialIntegrations: Integration[] = [
  { id: "slack", name: "Slack", emoji: "💬", description: "Import messages, channels, and conversations for the Brain to learn from team context.", category: "communication", status: "connected", lastSync: "2m ago", itemsSynced: 3420, connectedBy: "Taylor" },
  { id: "google-drive", name: "Google Drive", emoji: "📁", description: "Connect docs, sheets, and presentations. Brain indexes content for instant retrieval.", category: "storage", status: "disconnected" },
  { id: "fireflies", name: "Fireflies.ai", emoji: "🔥", description: "Auto-import meeting transcripts and summaries. Brain learns from every client call.", category: "meetings", status: "connected", lastSync: "1h ago", itemsSynced: 87, connectedBy: "Shaun" },
  { id: "notion", name: "Notion", emoji: "📝", description: "Sync pages, databases, and wikis. Brain uses your knowledge base as context.", category: "storage", status: "disconnected" },
  { id: "figma", name: "Figma", emoji: "🎨", description: "Connect design files for the dev pipeline. Brain references designs in audits.", category: "design", status: "disconnected" },
  { id: "google-analytics", name: "Google Analytics", emoji: "📊", description: "Import traffic and conversion data. Brain provides data-backed CRO insights.", category: "analytics", status: "disconnected" },
  { id: "shopify", name: "Shopify", emoji: "🛒", description: "Connect client stores for real-time performance data and A/B test results.", category: "analytics", status: "connected", lastSync: "15m ago", itemsSynced: 156, connectedBy: "Ryan" },
  { id: "gmail", name: "Gmail", emoji: "📧", description: "Index client emails and threads. Brain surfaces relevant context from conversations.", category: "communication", status: "disconnected" },
  { id: "loom", name: "Loom", emoji: "🎥", description: "Import video transcripts from async updates. Brain summarizes and indexes.", category: "meetings", status: "disconnected" },
  { id: "github", name: "GitHub", emoji: "🐙", description: "Connect repos for code context. Brain tracks commits, PRs, and pipeline status.", category: "development", status: "connected", lastSync: "5m ago", itemsSynced: 842, connectedBy: "Ryan" },
  { id: "linear", name: "Linear", emoji: "🔷", description: "Sync issues and project boards. Brain tracks development progress across teams.", category: "development", status: "disconnected" },
  { id: "hubspot", name: "HubSpot", emoji: "🟠", description: "Import CRM data, deals, and client pipelines. Brain enhances sales intelligence.", category: "analytics", status: "disconnected" },
];

const categories = [
  { id: "all", label: "All" },
  { id: "communication", label: "Communication" },
  { id: "storage", label: "Storage & Docs" },
  { id: "meetings", label: "Meetings" },
  { id: "design", label: "Design" },
  { id: "analytics", label: "Analytics" },
  { id: "development", label: "Development" },
];

const statusStyles: Record<ConnectionStatus, string> = {
  connected: "bg-accent/15 text-accent border-accent/30",
  disconnected: "bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30",
  syncing: "bg-primary/15 text-primary border-primary/30",
};

const Integrations = () => {
  const [integrations, setIntegrations] = useState(initialIntegrations);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const filtered = integrations.filter((i) => {
    const matchesSearch = i.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === "all" || i.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const connectedCount = integrations.filter((i) => i.status === "connected").length;
  const totalItems = integrations.filter((i) => i.status === "connected").reduce((sum, i) => sum + (i.itemsSynced ?? 0), 0);

  const handleToggle = (id: string) => {
    const integration = integrations.find((i) => i.id === id);
    if (!integration) return;

    if (integration.status === "connected") {
      setIntegrations((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: "disconnected" as ConnectionStatus, lastSync: undefined, itemsSynced: undefined, connectedBy: undefined } : i))
      );
      toast.success(`${integration.name} disconnected`, { description: "Data sync has been paused" });
    } else if (integration.status === "disconnected") {
      setIntegrations((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: "syncing" as ConnectionStatus, lastSync: "Just now", itemsSynced: 0, connectedBy: "You" } : i))
      );
      toast.loading(`Connecting ${integration.name}...`, { id: `sync-${id}`, description: "Authenticating and starting initial sync" });

      setTimeout(() => {
        setIntegrations((prev) =>
          prev.map((i) => (i.id === id ? { ...i, status: "connected" as ConnectionStatus, itemsSynced: Math.floor(Math.random() * 500) + 50 } : i))
        );
        toast.success(`${integration.name} connected!`, { id: `sync-${id}`, description: "Brain is now indexing data from this source" });
      }, 2500);
    }
  };

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <Link2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-cream">Integrations</h1>
            <p className="text-[13px] text-muted-foreground">
              Connect your tools so the Brain learns in real time
            </p>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <div className="glow-card rounded-xl bg-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Connected Tools</p>
          <p className="mt-2 text-2xl font-bold text-cream">{connectedCount} <span className="text-sm font-normal text-muted-foreground">/ {integrations.length}</span></p>
        </div>
        <div className="glow-card rounded-xl bg-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Items Indexed</p>
          <p className="mt-2 text-2xl font-bold text-cream">{totalItems.toLocaleString()}</p>
        </div>
        <div className="glow-card rounded-xl bg-card p-5">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-3.5 w-3.5 text-accent" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Data Status</p>
          </div>
          <p className="text-sm font-bold text-accent">Encrypted & Secure</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">All connections use OAuth 2.0</p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search integrations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-border bg-card pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                activeCategory === cat.id
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground bg-card border border-border"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Integration Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((integration) => (
          <div
            key={integration.id}
            className={`glow-card rounded-xl bg-card p-5 transition-all ${
              integration.status === "connected" ? "border border-accent/10" : ""
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{integration.emoji}</span>
                <div>
                  <h3 className="text-sm font-bold text-cream">{integration.name}</h3>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider mt-1 ${
                      statusStyles[integration.status]
                    }`}
                  >
                    {integration.status === "syncing" && (
                      <RefreshCw className="h-2.5 w-2.5 mr-1 animate-spin" />
                    )}
                    {integration.status}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
              {integration.description}
            </p>

            {integration.status === "connected" && (
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-4 border-t border-border pt-3">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-accent" />
                  {integration.itemsSynced?.toLocaleString()} items
                </span>
                <span>•</span>
                <span>Synced {integration.lastSync}</span>
                <span>•</span>
                <span>by {integration.connectedBy}</span>
              </div>
            )}

            <button
              onClick={() => handleToggle(integration.id)}
              disabled={integration.status === "syncing"}
              className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition-all disabled:opacity-50 ${
                integration.status === "connected"
                  ? "bg-secondary border border-border text-muted-foreground hover:text-destructive hover:border-destructive/30"
                  : integration.status === "syncing"
                  ? "bg-primary/10 text-primary border border-primary/30"
                  : "bg-accent text-accent-foreground hover:opacity-90"
              }`}
            >
              {integration.status === "connected" ? (
                <>
                  <Unlink className="h-3.5 w-3.5" />
                  Disconnect
                </>
              ) : integration.status === "syncing" ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <Link2 className="h-3.5 w-3.5" />
                  Connect to Brain
                </>
              )}
            </button>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">No integrations match your search.</p>
        </div>
      )}

      {/* Footer note */}
      <div className="mt-10 rounded-xl border border-border bg-card p-5 flex items-start gap-4">
        <Brain className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-cream mb-1">How integrations work</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            When you connect a tool, the Brain begins indexing its content in real time. Data is encrypted,
            processed through our AI pipeline, and made available for queries, reports, and automations.
            The more sources you connect, the smarter the Brain becomes — enabling better CRO insights,
            faster report generation, and more accurate recommendations.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Integrations;
