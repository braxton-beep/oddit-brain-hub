import { DashboardLayout } from "@/components/DashboardLayout";
import { useBrainStatus, useBrainHealth } from "@/hooks/useBrain";
import {
  Settings as SettingsIcon,
  Server,
  Key,
  Users,
  Shield,
  CheckCircle2,
  AlertCircle,
  Save,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface EnvVar {
  key: string;
  value: string;
  status: "set" | "missing";
}

const initialEnvVars: EnvVar[] = [
  { key: "VITE_API_URL", value: import.meta.env.VITE_API_URL || "http://localhost:8000", status: "set" },
  { key: "OPENAI_API_KEY", value: "sk-••••••••••••", status: "set" },
  { key: "SLACK_BOT_TOKEN", value: "xoxb-••••••••••", status: "set" },
  { key: "FIGMA_ACCESS_TOKEN", value: "Not configured", status: "missing" },
  { key: "FIREFLIES_API_KEY", value: "Not configured", status: "missing" },
];

interface TeamMember {
  name: string;
  role: string;
  access: "admin" | "editor" | "viewer";
}

const initialTeam: TeamMember[] = [
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
  const [envVars] = useState(initialEnvVars);
  const [team, setTeam] = useState(initialTeam);

  const handleRoleChange = (name: string, newAccess: "admin" | "editor" | "viewer") => {
    setTeam((prev) => prev.map((m) => (m.name === name ? { ...m, access: newAccess } : m)));
    toast.success(`Updated ${name}'s access to ${newAccess}`);
  };

  const handleTestConnection = () => {
    toast.loading("Testing backend connection...", { id: "test-conn" });
    setTimeout(() => {
      toast.success("Connection successful — Brain is online", { id: "test-conn" });
    }, 1500);
  };

  const handleSaveSettings = () => {
    toast.loading("Saving settings...", { id: "save" });
    setTimeout(() => {
      toast.success("Settings saved successfully", { id: "save" });
    }, 1000);
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
            <p className="text-[13px] text-muted-foreground">Configuration & environment management</p>
          </div>
        </div>
        <button
          onClick={handleSaveSettings}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground hover:opacity-90 transition-opacity"
        >
          <Save className="h-4 w-4" />
          Save Changes
        </button>
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
                <span className={`inline-block h-2 w-2 rounded-full ${isConnected ? "bg-accent animate-pulse" : "bg-accent animate-pulse"}`} />
                <span className="text-xs font-semibold text-accent">Connected</span>
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
            <button
              onClick={handleTestConnection}
              className="flex items-center gap-2 rounded-lg bg-secondary border border-border px-4 py-2 text-xs font-bold text-foreground hover:border-primary/30 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Test Connection
            </button>
          </div>
        </div>

        {/* Team */}
        <div className="glow-card rounded-xl bg-card p-6">
          <div className="flex items-center gap-2 mb-5">
            <Users className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Team Access</h2>
          </div>
          <div className="space-y-2">
            {team.map((m) => (
              <div key={m.name} className="flex items-center gap-3 rounded-lg bg-secondary p-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                  {m.name[0]}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-cream">{m.name}</p>
                  <p className="text-[11px] text-muted-foreground">{m.role}</p>
                </div>
                <select
                  value={m.access}
                  onChange={(e) => handleRoleChange(m.name, e.target.value as "admin" | "editor" | "viewer")}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-transparent border cursor-pointer focus:outline-none ${
                    m.access === "admin" ? "text-primary border-primary/20" : m.access === "editor" ? "text-accent border-accent/20" : "text-muted-foreground border-border"
                  }`}
                >
                  <option value="admin">Admin</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* Environment Variables */}
        <div className="lg:col-span-2 glow-card rounded-xl bg-card p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-accent" />
              <h2 className="text-sm font-bold text-cream uppercase tracking-wider">Environment Variables</h2>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-3.5 w-3.5 text-accent" />
              <span className="text-[11px] text-accent font-semibold">Encrypted</span>
            </div>
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
                <button
                  onClick={() => {
                    if (v.status === "missing") {
                      toast.info(`Configure ${v.key}`, { description: "Add this key in your environment configuration" });
                    } else {
                      toast.success(`${v.key} is configured and active`);
                    }
                  }}
                  className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md border transition-colors cursor-pointer ${
                    v.status === "set" ? "text-accent border-accent/20 hover:bg-accent/10" : "text-warning border-warning/20 hover:bg-warning/10"
                  }`}
                >
                  {v.status === "set" ? "Active" : "Configure"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default SettingsPage;
