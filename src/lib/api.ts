const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json();
}

// ── Types ──────────────────────────────────────────────

export interface BrainStatus {
  name: string;
  version: string;
  status: string;
  connected_tools: number;
}

export interface BrainHealth {
  status: string;
  timestamp: string;
}

export interface Tool {
  name: string;
  display: string;
  emoji: string;
}

export interface ToolsResponse {
  available: Tool[];
  connected: string[];
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: number;
  status: string;
}

export interface Agent {
  type: string;
  name: string;
  description: string;
  capabilities: string[];
}

export interface Project {
  id: string;
  name: string;
  status: string;
  priority: string;
  owner: string;
  description: string;
  progress: number;
}

export interface RecentActivity {
  workflow: string;
  timestamp: string;
  status: string;
}

export interface BrainStats {
  tools_connected: number;
  workflows_active: number;
  executions_today: number;
  recent_activity: RecentActivity[];
}

// ── API ────────────────────────────────────────────────

export const api = {
  getStatus:    () => get<BrainStatus>("/brain/status"),
  getHealth:    () => get<BrainHealth>("/brain/health"),
  getTools:     () => get<ToolsResponse>("/brain/tools"),
  getWorkflows: () => get<Workflow[]>("/brain/workflows"),
  runWorkflow:  (workflow_id: string) => post<unknown>("/brain/workflows/run", { workflow_id }),
  getAgents:    () => get<Agent[]>("/brain/agents"),
  getProjects:  () => get<Project[]>("/brain/projects"),
  getStats:     () => get<BrainStats>("/brain/stats"),
};
