import { DashboardLayout } from "@/components/DashboardLayout";
import { CheckCircle2, Link2, Brain } from "lucide-react";
import { useIntegrationCredentials } from "@/hooks/useIntegrationCredentials";

const TWITTER_INTEGRATION = {
  id: "twitter",
  name: "X / Twitter",
  emoji: "𝕏",
  description: "Connect the @itsOddit account to sync tweets, analyze brand voice, and power the AI Tweet Crafter.",
};

const Integrations = () => {
  const { data: credentials, isLoading } = useIntegrationCredentials();
  const connectedIds = new Set((credentials ?? []).map((c) => c.integration_id));
  const isConnected = connectedIds.has(TWITTER_INTEGRATION.id);

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
              The one remaining integration to configure
            </p>
          </div>
        </div>
      </div>

      {/* Single Twitter card */}
      <div className="max-w-sm">
        <div
          className={`glow-card rounded-xl bg-card p-5 transition-all ${
            isConnected ? "border border-accent/10" : ""
          }`}
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold">{TWITTER_INTEGRATION.emoji}</span>
              <div>
                <h3 className="text-sm font-bold text-cream">{TWITTER_INTEGRATION.name}</h3>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider mt-1 ${
                    isLoading
                      ? "bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20"
                      : isConnected
                      ? "bg-accent/15 text-accent border-accent/30"
                      : "bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30"
                  }`}
                >
                  {isLoading ? "Checking…" : isConnected ? "Connected" : "Not configured"}
                </span>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed mb-4">
            {TWITTER_INTEGRATION.description}
          </p>

          {isConnected && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-4 border-t border-border pt-3">
              <CheckCircle2 className="h-3 w-3 text-accent" />
              <span>API key configured</span>
            </div>
          )}

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
      </div>

      {/* Footer note */}
      <div className="mt-10 max-w-sm rounded-xl border border-border bg-card p-5 flex items-start gap-4">
        <Brain className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-cream mb-1">How it works</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Add your X/Twitter API keys in Settings to enable tweet syncing and the AI Tweet Crafter. All credentials are encrypted and protected with row-level security.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Integrations;
