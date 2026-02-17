const API_BASE = "http://localhost:8000";

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface DashboardMetrics {
  active_agents: number;
  active_agents_change: string;
  audits_completed: number;
  audits_completed_change: string;
  avg_conversion_lift: string;
  avg_conversion_lift_change: string;
  automations_running: number;
  automations_running_change: string;
}

export interface ActivityItem {
  id: string;
  type: "success" | "warning" | "neutral";
  text: string;
  time: string;
}

export interface SystemStatus {
  backend: "connected" | "disconnected";
  ai_engine: "operational" | "degraded" | "down";
  queue_pending: number;
}

export const api = {
  getMetrics: () => apiFetch<DashboardMetrics>("/api/dashboard/metrics"),
  getActivity: () => apiFetch<ActivityItem[]>("/api/dashboard/activity"),
  getSystemStatus: () => apiFetch<SystemStatus>("/api/dashboard/status"),
};
