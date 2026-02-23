import { DashboardLayout } from "@/components/DashboardLayout";
import {
  useIntegrationCredentials,
  useAddCredential,
  useDeleteCredential,
  type IntegrationCredential,
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
  ExternalLink,
  Sparkles,
  ArrowRight,
  Cpu,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// ── AI Model Config ──────────────────────────────────────────────────────────
const AI_MODELS = [
  { value: "gemini-3", label: "Gemini 3" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "claude", label: "Claude" },
];

const AI_TASKS = [
  { id: "cro_audits", label: "CRO Audits" },
  { id: "report_drafts", label: "Report Drafts" },
  { id: "transcript_qa", label: "Transcript Q&A" },
  { id: "tweet_linkedin", label: "Tweet / LinkedIn Generation" },
];

function AIModelConfig() {
  const [models, setModels] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem("ai_model_config") ?? "{}");
    } catch {
      return {};
    }
  });

  const update = (taskId: string, model: string) => {
    const next = { ...models, [taskId]: model };
    setModels(next);
    localStorage.setItem("ai_model_config", JSON.stringify(next));
    toast.success(`Model updated for ${AI_TASKS.find((t) => t.id === taskId)?.label}`);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 mb-8">
      <div className="flex items-center gap-3 mb-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
          <Cpu className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">AI Model Configuration</p>
          <p className="text-xs text-muted-foreground">Choose which model powers each task</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {AI_TASKS.map((task) => {
          const selected = models[task.id] || "gemini-3";
          return (
            <div key={task.id} className="rounded-lg border border-border bg-secondary p-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-foreground">{task.label}</label>
                <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 border border-accent/30 px-2 py-0.5 text-[10px] font-bold text-accent">
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  {AI_MODELS.find((m) => m.value === selected)?.label}
                </span>
              </div>
              <select
                value={selected}
                onChange={(e) => update(task.id, e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              >
                {AI_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Integrations ─────────────────────────────────────────────────────────────
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
  { id: "openai", label: "OpenAI", placeholder: "sk-...", description: "Powers the Brain's AI audits, reports, and insights.", setupUrl: "https://platform.openai.com/api-keys", setupLabel: "Get key from OpenAI", category: "ai" },
  { id: "twitter-consumer-key", label: "Twitter/X — Consumer Key", placeholder: "...", description: "OAuth Consumer Key for the Twitter/X API.", setupUrl: "https://developer.x.com/en/portal/dashboard", setupLabel: "X Developer Portal", category: "social" },
  { id: "twitter-consumer-secret", label: "Twitter/X — Consumer Secret", placeholder: "...", description: "OAuth Consumer Secret. Keep this confidential.", setupUrl: "https://developer.x.com/en/portal/dashboard", setupLabel: "X Developer Portal", category: "social" },
  { id: "twitter-access-token", label: "Twitter/X — Access Token", placeholder: "...", description: "Access Token for the authenticated Twitter/X account.", setupUrl: "https://developer.x.com/en/portal/dashboard", setupLabel: "X Developer Portal", category: "social" },
  { id: "twitter-access-secret", label: "Twitter/X — Access Token Secret", placeholder: "...", description: "Access Token Secret. Pairs with your Access Token.", setupUrl: "https://developer.x.com/en/portal/dashboard", setupLabel: "X Developer Portal", category: "social" },
  { id: "slack", label: "Slack Bot Token", placeholder: "xoxb-...", description: "Enables the Slack Agent to read channels and post updates.", setupUrl: "https://api.slack.com/apps", setupLabel: "Create a Slack App", category: "communication" },
  { id: "google-drive", label: "Google Drive", placeholder: "AIza...", description: "Connect docs, sheets, and slides.", setupUrl: "https://console.cloud.google.com/apis/credentials", setupLabel: "Google Cloud Console", category: "storage" },
  { id: "fireflies", label: "Fireflies.ai", placeholder: "ff-...", description: "Auto-import meeting transcripts.", setupUrl: "https://app.fireflies.ai/integrations", setupLabel: "Fireflies Settings", category: "meetings" },
  { id: "figma", label: "Figma", placeholder: "figd_...", description: "Connect design files for the dev pipeline.", setupUrl: "https://www.figma.com/developers/api#access-tokens", setupLabel: "Figma Tokens", category: "design" },
  { id: "asana", label: "Asana", placeholder: "1/...", description: "Automate report fulfillment.", setupUrl: "https://app.asana.com/0/my-apps", setupLabel: "Asana My Apps", category: "development" },
];

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "ai", label: "🤖 AI & Core" },
  { id: "social", label: "🐦 Social" },
  { id: "communication", label: "💬 Communication" },
  { id: "storage", label: "📁 Storage & Docs" },
  { id: "meetings", label: "🎥 Meetings" },
  { id: "design", label: "🎨 Design" },
  { id: "development", label: "🐙 Development" },
];

const SettingsPage = () => {
  const { data: credentials, isLoading } = useIntegrationCredentials();
  const addCred = useAddCredential();
  const remove = useDeleteCredential();

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [activeCategory, setActiveCategory] = useState("all");

  const credsByIntegration = new Map<string, IntegrationCredential[]>();
  credentials?.forEach((c) => {
    const list = credsByIntegration.get(c.integration_id) ?? [];
    list.push(c);
    credsByIntegration.set(c.integration_id, list);
  });
  const connectedCount = INTEGRATIONS.filter((i) => credsByIntegration.has(i.id)).length;

  const filtered = activeCategory === "all"
    ? INTEGRATIONS
    : INTEGRATIONS.filter((i) => i.category === activeCategory);

  const handleSave = async (integrationId: string) => {
    const value = drafts[integrationId]?.trim();
    if (!value) { toast.error("Please enter an API key"); return; }
    if (value.length < 5) { toast.error("API key seems too short"); return; }
    try {
      await addCred.mutateAsync({ integration_id: integrationId, api_key: value });
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
              Manage your integration API keys
            </p>
          </div>
        </div>
      </div>

      {/* AI Model Configuration */}
      <AIModelConfig />

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
            const existingKeys = credsByIntegration.get(integration.id) ?? [];
            const isSet = existingKeys.length > 0;
            const draft = drafts[integration.id] ?? "";
            const isVisible = visible[integration.id];

            return (
              <div
                key={integration.id}
                className={`rounded-xl bg-card border p-5 transition-all ${
                  isSet ? "border-accent/20" : "border-border"
                }`}
              >
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
                      {isSet ? `${existingKeys.length} key${existingKeys.length > 1 ? "s" : ""}` : "Not set"}
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

                <p className="text-xs text-muted-foreground leading-relaxed mb-3">{integration.description}</p>

                {existingKeys.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {existingKeys.map((cred) => (
                      <div key={cred.id} className="flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-2">
                        <Key className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="flex-1 text-xs font-mono text-muted-foreground truncate">
                          ••••••••{cred.api_key.slice(-4)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(cred.created_at).toLocaleDateString()}
                        </span>
                        <button
                          onClick={() => handleDelete(cred.id)}
                          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Remove this key"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type={isVisible ? "text" : "password"}
                    value={draft}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [integration.id]: e.target.value }))
                    }
                    placeholder={`Paste ${isSet ? "another" : "your"} key here (${integration.placeholder})`}
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
                    {isSet ? "Add" : "Save"}
                  </button>
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
