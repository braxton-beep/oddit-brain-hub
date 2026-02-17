import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import {
  useIntegrationCredentials,
  useUpsertCredential,
  useDeleteCredential,
} from "@/hooks/useIntegrationCredentials";
import {
  Settings as SettingsIcon,
  Key,
  Shield,
  CheckCircle2,
  AlertCircle,
  Save,
  Trash2,
  Eye,
  EyeOff,
  LogOut,
  ExternalLink,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface IntegrationItem {
  id: string;
  label: string;
  placeholder: string;
  description: string;
  setupUrl: string;
  setupLabel: string;
  category: string;
}

const INTEGRATIONS: IntegrationItem[] = [
  // AI & Core
  { id: "openai", label: "OpenAI", placeholder: "sk-...", description: "Powers the Brain's AI audits, reports, and insights.", setupUrl: "https://platform.openai.com/api-keys", setupLabel: "Get key from OpenAI", category: "ai" },
  // Communication
  { id: "slack", label: "Slack Bot Token", placeholder: "xoxb-...", description: "Enables the Slack Agent to read channels and post updates.", setupUrl: "https://api.slack.com/apps", setupLabel: "Create a Slack App", category: "communication" },
  { id: "gmail", label: "Gmail API Key", placeholder: "AIza...", description: "Index client emails so the Brain can surface context from conversations.", setupUrl: "https://console.cloud.google.com/apis/credentials", setupLabel: "Google Cloud Console", category: "communication" },
  // Storage & Docs
  { id: "google-drive", label: "Google Drive", placeholder: "AIza...", description: "Connect docs, sheets, and slides. Brain indexes content automatically.", setupUrl: "https://console.cloud.google.com/apis/credentials", setupLabel: "Google Cloud Console", category: "storage" },
  { id: "notion", label: "Notion", placeholder: "ntn_...", description: "Sync pages, databases, and wikis for the Brain to use as context.", setupUrl: "https://www.notion.so/my-integrations", setupLabel: "Notion Integrations", category: "storage" },
  // Meetings
  { id: "fireflies", label: "Fireflies.ai", placeholder: "ff-...", description: "Auto-import meeting transcripts so the Brain learns from every call.", setupUrl: "https://app.fireflies.ai/integrations", setupLabel: "Fireflies Settings", category: "meetings" },
  { id: "loom", label: "Loom", placeholder: "loom_...", description: "Import video transcripts from async updates for Brain indexing.", setupUrl: "https://www.loom.com/account", setupLabel: "Loom Account", category: "meetings" },
  // Design
  { id: "figma", label: "Figma", placeholder: "figd_...", description: "Connect design files for the dev pipeline and audit references.", setupUrl: "https://www.figma.com/developers/api#access-tokens", setupLabel: "Figma Tokens", category: "design" },
  // Analytics
  { id: "google-analytics", label: "Google Analytics", placeholder: "AIza...", description: "Import traffic and conversion data for data-backed CRO insights.", setupUrl: "https://console.cloud.google.com/apis/credentials", setupLabel: "Google Cloud Console", category: "analytics" },
  { id: "shopify", label: "Shopify", placeholder: "shpat_...", description: "Connect client stores for real-time performance and A/B test data.", setupUrl: "https://partners.shopify.com", setupLabel: "Shopify Partners", category: "analytics" },
  { id: "hubspot", label: "HubSpot", placeholder: "pat-...", description: "Import CRM data, deals, and pipelines for sales intelligence.", setupUrl: "https://developers.hubspot.com/docs/api/private-apps", setupLabel: "HubSpot Developer", category: "analytics" },
  // Development
  { id: "github", label: "GitHub", placeholder: "ghp_...", description: "Connect repos so the Brain tracks commits, PRs, and pipeline status.", setupUrl: "https://github.com/settings/tokens", setupLabel: "GitHub Tokens", category: "development" },
  { id: "linear", label: "Linear", placeholder: "lin_api_...", description: "Sync issues and project boards for development progress tracking.", setupUrl: "https://linear.app/settings/api", setupLabel: "Linear API Settings", category: "development" },
];

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "ai", label: "🤖 AI & Core" },
  { id: "communication", label: "💬 Communication" },
  { id: "storage", label: "📁 Storage & Docs" },
  { id: "meetings", label: "🎥 Meetings" },
  { id: "design", label: "🎨 Design" },
  { id: "analytics", label: "📊 Analytics" },
  { id: "development", label: "🐙 Development" },
];

const SettingsPage = () => {
  const { session, signOut } = useAuth();
  const { data: credentials, isLoading } = useIntegrationCredentials();
  const upsert = useUpsertCredential();
  const remove = useDeleteCredential();

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [activeCategory, setActiveCategory] = useState("all");

  const credMap = new Map(credentials?.map((c) => [c.integration_id, c]) ?? []);
  const connectedCount = INTEGRATIONS.filter((i) => credMap.has(i.id)).length;

  const filtered = activeCategory === "all"
    ? INTEGRATIONS
    : INTEGRATIONS.filter((i) => i.category === activeCategory);

  const handleSave = async (integrationId: string) => {
    const value = drafts[integrationId]?.trim();
    if (!value) { toast.error("Please enter an API key"); return; }
    if (value.length < 5) { toast.error("API key seems too short"); return; }
    try {
      await upsert.mutateAsync({ integration_id: integrationId, api_key: value });
      toast.success(`${integrationId} key saved`);
      setDrafts((d) => ({ ...d, [integrationId]: "" }));
    } catch {
      toast.error("Failed to save key");
    }
  };

  const handleDelete = async (integrationId: string) => {
    try {
      await remove.mutateAsync(integrationId);
      toast.success(`${integrationId} key removed`);
    } catch {
      toast.error("Failed to remove key");
    }
  };

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary animate-glow-pulse">
            <SettingsIcon className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-cream">Settings</h1>
            <p className="text-[13px] text-muted-foreground">
              Signed in as {session?.user?.email}
            </p>
          </div>
        </div>
        <button
          onClick={() => signOut()}
          className="flex items-center gap-2 rounded-lg bg-secondary border border-border px-4 py-2.5 text-sm font-bold text-foreground hover:border-destructive/30 hover:text-destructive transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>

      {/* Welcome / Progress Banner */}
      <div className="glow-card-violet rounded-xl bg-card p-6 mb-8">
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet/20">
            <Sparkles className="h-6 w-6 text-violet" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-cream mb-1">
              {connectedCount === 0
                ? "Welcome! Let's connect your tools 👋"
                : connectedCount < 3
                  ? "Great start! Keep connecting tools 🚀"
                  : "Looking good! Your Brain is getting smarter 🧠"}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              Each API key you add lets the Brain access that tool's data — messages, docs, meetings, code, and more. 
              The more you connect, the smarter it gets. <strong className="text-foreground">Your keys are encrypted and never shared.</strong>
            </p>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet to-electric transition-all duration-500"
                  style={{ width: `${Math.round((connectedCount / INTEGRATIONS.length) * 100)}%` }}
                />
              </div>
              <span className="text-xs font-bold text-muted-foreground whitespace-nowrap">
                {connectedCount} / {INTEGRATIONS.length} connected
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="rounded-xl border border-border bg-card p-5 mb-6 flex items-start gap-4">
        <Shield className="h-5 w-5 text-accent shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-cream mb-1">How to add an integration</p>
          <ol className="text-xs text-muted-foreground leading-relaxed space-y-1 list-decimal list-inside">
            <li>Click the <strong className="text-foreground">"Get key"</strong> link next to any integration to open its settings page</li>
            <li>Copy your API key or token from that service</li>
            <li>Paste it into the field here and click <strong className="text-foreground">Save</strong></li>
            <li>Done! The Brain and Integrations page will show it as connected ✅</li>
          </ol>
        </div>
      </div>

      {/* Category Filters */}
      <div className="flex gap-1.5 flex-wrap mb-6">
        {CATEGORIES.map((cat) => (
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

      {/* Integration Cards */}
      <div className="space-y-3">
        {isLoading ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl shimmer-bg" />
          ))
        ) : (
          filtered.map((integration) => {
            const existing = credMap.get(integration.id);
            const isSet = !!existing;
            const draft = drafts[integration.id] ?? "";
            const isVisible = visible[integration.id];

            return (
              <div
                key={integration.id}
                className={`rounded-xl bg-card border p-5 transition-all ${
                  isSet ? "border-accent/20" : "border-border"
                }`}
              >
                {/* Top row: name + status + setup link */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    {isSet ? (
                      <CheckCircle2 className="h-4 w-4 text-accent shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-warning shrink-0" />
                    )}
                    <span className="text-sm font-bold text-cream">{integration.label}</span>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                        isSet
                          ? "bg-accent/15 text-accent border-accent/30"
                          : "bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30"
                      }`}
                    >
                      {isSet ? "Connected" : "Not set"}
                    </span>
                  </div>
                  <a
                    href={integration.setupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors shrink-0"
                  >
                    {integration.setupLabel}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                {/* Description */}
                <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                  {integration.description}
                </p>

                {/* Input row */}
                <div className="flex items-center gap-2">
                  <input
                    type={isVisible ? "text" : "password"}
                    value={draft || (isSet ? "••••••••••••" : "")}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [integration.id]: e.target.value }))
                    }
                    onFocus={() => {
                      if (isSet && !draft) {
                        setDrafts((d) => ({ ...d, [integration.id]: "" }));
                      }
                    }}
                    placeholder={isSet ? "Paste new key to update" : `Paste your key here (${integration.placeholder})`}
                    className="flex-1 rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  />
                  <button
                    onClick={() =>
                      setVisible((v) => ({ ...v, [integration.id]: !v[integration.id] }))
                    }
                    className="p-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    title={isVisible ? "Hide key" : "Show key"}
                  >
                    {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => handleSave(integration.id)}
                    disabled={!draft.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-xs font-bold text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-30"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save
                  </button>
                  {isSet && (
                    <button
                      onClick={() => handleDelete(integration.id)}
                      className="p-2.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Remove key"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </DashboardLayout>
  );
};

export default SettingsPage;
