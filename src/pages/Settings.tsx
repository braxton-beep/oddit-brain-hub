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
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const INTEGRATIONS = [
  { id: "openai", label: "OpenAI API Key", placeholder: "sk-..." },
  { id: "slack", label: "Slack Bot Token", placeholder: "xoxb-..." },
  { id: "figma", label: "Figma Access Token", placeholder: "figd_..." },
  { id: "fireflies", label: "Fireflies API Key", placeholder: "ff-..." },
  { id: "google-drive", label: "Google Drive API Key", placeholder: "AIza..." },
  { id: "notion", label: "Notion Integration Token", placeholder: "ntn_..." },
  { id: "github", label: "GitHub Personal Token", placeholder: "ghp_..." },
  { id: "shopify", label: "Shopify Access Token", placeholder: "shpat_..." },
  { id: "hubspot", label: "HubSpot API Key", placeholder: "pat-..." },
  { id: "linear", label: "Linear API Key", placeholder: "lin_api_..." },
  { id: "google-analytics", label: "Google Analytics Key", placeholder: "AIza..." },
];

const SettingsPage = () => {
  const { session, signOut } = useAuth();
  const { data: credentials, isLoading } = useIntegrationCredentials();
  const upsert = useUpsertCredential();
  const remove = useDeleteCredential();

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});

  const credMap = new Map(credentials?.map((c) => [c.integration_id, c]) ?? []);

  const handleSave = async (integrationId: string) => {
    const value = drafts[integrationId]?.trim();
    if (!value) {
      toast.error("Please enter an API key");
      return;
    }
    if (value.length < 5) {
      toast.error("API key seems too short");
      return;
    }
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

      {/* API Keys Section */}
      <div className="glow-card rounded-xl bg-card p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-bold text-cream uppercase tracking-wider">
              Integration API Keys
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 text-accent" />
            <span className="text-[11px] text-accent font-semibold">Stored securely</span>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-lg shimmer-bg" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {INTEGRATIONS.map((integration) => {
              const existing = credMap.get(integration.id);
              const isSet = !!existing;
              const draft = drafts[integration.id] ?? "";
              const isVisible = visible[integration.id];

              return (
                <div
                  key={integration.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg bg-secondary p-4"
                >
                  <div className="flex items-center gap-3 sm:w-52 shrink-0">
                    {isSet ? (
                      <CheckCircle2 className="h-4 w-4 text-accent shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-warning shrink-0" />
                    )}
                    <span className="text-sm font-medium text-cream">{integration.label}</span>
                  </div>

                  <div className="flex flex-1 items-center gap-2">
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
                      placeholder={isSet ? "Enter new key to update" : integration.placeholder}
                      className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                    />
                    <button
                      onClick={() =>
                        setVisible((v) => ({ ...v, [integration.id]: !v[integration.id] }))
                      }
                      className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => handleSave(integration.id)}
                      disabled={!draft.trim()}
                      className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-bold text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-30"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save
                    </button>
                    {isSet && (
                      <button
                        onClick={() => handleDelete(integration.id)}
                        className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default SettingsPage;
