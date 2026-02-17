import { DashboardLayout } from "@/components/DashboardLayout";
import { useBrainStatus, useBrainHealth } from "@/hooks/useBrain";
import {
  Settings as SettingsIcon,
  Server,
  Key,
  Bell,
  Users,
  Shield,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";

const envVars = [
  { key: "VITE_API_URL", value: import.meta.env.VITE_API_URL || "http://localhost:8000", status: "set" },
  { key: "OPENAI_API_KEY", value: "sk-••••••••••••", status: "set" },
  { key: "SLACK_BOT_TOKEN", value: "xoxb-••••••••••", status: "set" },
  { key: "FIGMA_ACCESS_TOKEN", value: "Not configured", status: "missing" },
  { key: "FIREFLIES_API_KEY", value: "Not configured", status: "missing" },
];

const teamMembers = [
  { name: "Braxton", role: "AI Strategy Lead", access: "admin" },
  { name: "Ryan", role: "Dev Pipeline Lead", access: "admin" },
  { name: "Taylor", role: "Operations", access: "editor" },
  { name: "Shaun", role: "Founder", access: "admin" },
  { name: "Cam", role: "Founder", access: "admin" },
];

const SettingsPage = () => {
  const { data: brainStatus } = useBrainStatus();
  const { data: health } = useBrainHealth();
  const isConnected = !!health && health.status === "ok";

  return (
    <DashboardLayout>
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <SettingsIcon className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-cream">Settings</h1>
            <p className="text-[13px] text-muted-foreground">Configuration & environment management</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Backend Connection */}
        <div className="glow-card rounded-xl bg-card p-6">
          <div className="flex items-center gap-2 mb-5">
            <Server className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Backend Connection</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-secondary p-4">
              <div>
                <p className="text-sm font-bold text-cream">FastAPI Server</p>
                <p className="text-xs text-muted-foreground mt-0.5">{import.meta.env.VITE_API_URL || "http://localhost:8000"}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-block h-2 w-2 rounded-full ${isConnected ? "bg-accent animate-pulse" : "bg-destructive"}`} />
                <span className={`text-xs font-semibold ${isConnected ? "text-accent" : "text-destructive"}`}>
                  {isConnected ? "Connected" : "Disconnected"}
                </span>
              </div>
            </div>
            {brainStatus && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-secondary p-3">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Name</p>
                  <p className="text-sm font-bold text-cream mt-1">{brainStatus.name}</p>
                </div>
                <div className="rounded-lg bg-secondary p-3">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Version</p>
                  <p className="text-sm font-bold text-cream mt-1">v{brainStatus.version}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Team */}
        <div className="glow-card rounded-xl bg-card p-6">
          <div className="flex items-center gap-2 mb-5">
            <Users className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Team Access</h2>
          </div>
          <div className="space-y-2">
            {teamMembers.map((m) => (
              <div key={m.name} className="flex items-center gap-3 rounded-lg bg-secondary p-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                  {m.name[0]}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-cream">{m.name}</p>
                  <p className="text-[11px] text-muted-foreground">{m.role}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                  m.access === "admin" ? "bg-primary/10 text-primary border border-primary/20" : "bg-accent/10 text-accent border border-accent/20"
                }`}>
                  {m.access}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Environment Variables */}
        <div className="lg:col-span-2 glow-card rounded-xl bg-card p-6">
          <div className="flex items-center gap-2 mb-5">
            <Key className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Environment Variables</h2>
          </div>
          <div className="space-y-2">
            {envVars.map((v) => (
              <div key={v.key} className="flex items-center gap-4 rounded-lg bg-secondary p-4">
                {v.status === "set" ? (
                  <CheckCircle2 className="h-4 w-4 text-accent shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-warning shrink-0" />
                )}
                <code className="text-sm font-mono text-primary font-medium">{v.key}</code>
                <span className="flex-1 text-sm text-muted-foreground font-mono truncate">{v.value}</span>
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${v.status === "set" ? "text-accent" : "text-warning"}`}>
                  {v.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default SettingsPage;
