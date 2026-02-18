import { DashboardLayout } from "@/components/DashboardLayout";
import { CheckCircle2, Link2, Brain, AlertCircle } from "lucide-react";
import { useIntegrationCredentials } from "@/hooks/useIntegrationCredentials";

const INTEGRATIONS = [
  {
    id: "openai",
    name: "OpenAI",
    emoji: "🤖",
    description: "Powers AI audits, reports, and the Brain's insights.",
    credentialIds: ["openai"],
  },
  {
    id: "slack",
    name: "Slack",
    emoji: "💬",
    description: "Slack Agent reads channels and posts weekly digests.",
    credentialIds: ["slack"],
  },
  {
    id: "google-drive",
    name: "Google Drive",
    emoji: "📁",
    description: "Docs, sheets, and slides are indexed automatically.",
    credentialIds: ["google-drive"],
  },
  {
    id: "fireflies",
    name: "Fireflies.ai",
    emoji: "🎙️",
    description: "Meeting transcripts are auto-imported for Brain context.",
    credentialIds: ["fireflies"],
  },
  {
    id: "figma",
    name: "Figma",
    emoji: "🎨",
    description: "Design files power the dev pipeline and audit references.",
    credentialIds: ["figma"],
  },
  {
    id: "asana",
    name: "Asana",
    emoji: "✅",
    description: "Report setup automation: cards, Figma links, and task flow.",
    credentialIds: ["asana"],
  },
  {
    id: "twitter",
    name: "X / Twitter",
    emoji: "𝕏",
    description: "Connect @itsOddit to sync tweets and power the AI Tweet Crafter.",
    credentialIds: ["twitter-consumer-key", "twitter-consumer-secret", "twitter-access-token", "twitter-access-secret"],
  },
];

const Integrations = () => {
  const { data: credentials, isLoading } = useIntegrationCredentials();
  const connectedIds = new Set((credentials ?? []).map((c) => c.integration_id));

  const connectedCount = INTEGRATIONS.filter((i) =>
    i.credentialIds.some((cid) => connectedIds.has(cid))
  ).length;

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary animate-glow-pulse">
            <Link2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-cream">Integrations</h1>
            <p className="text-[13px] text-muted-foreground">
              {isLoading ? "Checking connections…" : `${connectedCount} of ${INTEGRATIONS.length} connected`}
            </p>
          </div>
        </div>
      </div>

      {/* Integration Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {INTEGRATIONS.map((integration) => {
          const isConnected = integration.credentialIds.some((cid) => connectedIds.has(cid));

          return (
            <div
              key={integration.id}
              className={`rounded-xl bg-card p-5 border transition-all ${
                isConnected ? "border-accent/20" : "border-border"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{integration.emoji}</span>
                  <div>
                    <h3 className="text-sm font-bold text-cream">{integration.name}</h3>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider mt-1 ${
                        isLoading
                          ? "bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20"
                          : isConnected
                          ? "bg-accent/15 text-accent border-accent/30"
                          : "bg-warning/10 text-warning border-warning/30"
                      }`}
                    >
                      {isLoading ? (
                        "Checking…"
                      ) : isConnected ? (
                        <><CheckCircle2 className="h-2.5 w-2.5" /> Connected</>
                      ) : (
                        <><AlertCircle className="h-2.5 w-2.5" /> Not configured</>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                {integration.description}
              </p>

              <a
                href="/settings"
                className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition-all ${
                  isConnected
                    ? "bg-secondary border border-border text-muted-foreground hover:text-foreground"
                    : "bg-accent text-accent-foreground hover:opacity-90"
                }`}
              >
                <Link2 className="h-3.5 w-3.5" />
                {isConnected ? "Manage in Settings" : "Configure in Settings"}
              </a>
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <div className="mt-8 rounded-xl border border-border bg-card p-5 flex items-start gap-4">
        <Brain className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-cream mb-1">How it works</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            All credentials are managed in Settings. Once saved, they're encrypted and protected with row-level security — the Brain and automations use them automatically.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Integrations;
