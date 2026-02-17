import type { BrainStatus, BrainHealth, ToolsResponse, Workflow, Agent, Project, BrainStats } from "./api";

export const mockBrainStatus: BrainStatus = {
  name: "Oddit Brain",
  version: "2.4.1",
  status: "running",
  connected_tools: 8,
};

export const mockBrainHealth: BrainHealth = {
  status: "ok",
  timestamp: new Date().toISOString(),
};

export const mockTools: ToolsResponse = {
  available: [
    { name: "slack", display: "Slack", emoji: "💬" },
    { name: "google-drive", display: "Google Drive", emoji: "📁" },
    { name: "fireflies", display: "Fireflies.ai", emoji: "🔥" },
    { name: "notion", display: "Notion", emoji: "📝" },
    { name: "figma", display: "Figma", emoji: "🎨" },
    { name: "shopify", display: "Shopify", emoji: "🛒" },
    { name: "github", display: "GitHub", emoji: "🐙" },
    { name: "google-analytics", display: "Google Analytics", emoji: "📊" },
  ],
  connected: ["slack", "fireflies", "shopify", "github"],
};

export const mockWorkflows: Workflow[] = [
  { id: "wf-1", name: "Full CRO Audit", description: "End-to-end conversion rate optimization analysis for client stores", steps: 8, status: "active" },
  { id: "wf-2", name: "Weekly Report Gen", description: "Auto-generate weekly performance reports for all active clients", steps: 5, status: "active" },
  { id: "wf-3", name: "Client Onboarding", description: "Automated data collection and baseline analysis for new clients", steps: 6, status: "idle" },
  { id: "wf-4", name: "A/B Test Monitor", description: "Track running experiments and alert on statistical significance", steps: 4, status: "running" },
];

export const mockAgents: Agent[] = [
  { type: "analyst", name: "CRO Analyst", description: "Analyzes conversion funnels and identifies optimization opportunities", capabilities: ["funnel-analysis", "heatmap-review", "competitor-audit"] },
  { type: "writer", name: "Report Writer", description: "Generates detailed audit reports with actionable recommendations", capabilities: ["report-gen", "data-viz", "copywriting"] },
  { type: "monitor", name: "Performance Monitor", description: "Tracks KPIs in real-time and alerts on anomalies", capabilities: ["kpi-tracking", "alerting", "trend-detection"] },
];

export const mockProjects: Project[] = [
  { id: "p-1", name: "Braxley Bands", status: "in-progress", priority: "high", owner: "Braxton", description: "Full homepage redesign with CRO-optimized layout and hero section testing", progress: 72 },
  { id: "p-2", name: "TechFlow", status: "in-progress", priority: "high", owner: "Ryan", description: "Product page optimization with enhanced social proof and checkout flow", progress: 45 },
  { id: "p-3", name: "NovaPay", status: "active", priority: "medium", owner: "Taylor", description: "Checkout funnel optimization targeting cart abandonment reduction", progress: 28 },
  { id: "p-4", name: "GreenLeaf Co", status: "up-next", priority: "medium", owner: "Shaun", description: "Landing page audit and mobile-first redesign strategy", progress: 10 },
];

export const mockStats: BrainStats = {
  tools_connected: 8,
  workflows_active: 4,
  executions_today: 23,
  recent_activity: [
    { workflow: "Full CRO Audit — Braxley Bands", timestamp: "2 min ago", status: "completed" },
    { workflow: "Weekly Report Gen — All Clients", timestamp: "15 min ago", status: "completed" },
    { workflow: "A/B Test Monitor — TechFlow", timestamp: "32 min ago", status: "running" },
    { workflow: "Client Onboarding — NovaPay", timestamp: "1h ago", status: "completed" },
    { workflow: "Full CRO Audit — UrbanFit", timestamp: "2h ago", status: "failed" },
  ],
};
