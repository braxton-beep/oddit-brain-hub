import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  mockBrainStatus,
  mockBrainHealth,
  mockTools,
  mockWorkflows,
  mockAgents,
  mockProjects,
  mockStats,
} from "@/lib/mockData";

// Wrap API calls to fall back to mock data when backend is unreachable
function withFallback<T>(apiFn: () => Promise<T>, fallback: T) {
  return async (): Promise<T> => {
    try {
      return await apiFn();
    } catch {
      return fallback;
    }
  };
}

export const useBrainStatus = () =>
  useQuery({ queryKey: ["brain-status"], queryFn: withFallback(api.getStatus, mockBrainStatus), refetchInterval: 30000 });

export const useBrainHealth = () =>
  useQuery({ queryKey: ["brain-health"], queryFn: withFallback(api.getHealth, mockBrainHealth), refetchInterval: 10000 });

export const useTools = () =>
  useQuery({ queryKey: ["brain-tools"], queryFn: withFallback(api.getTools, mockTools), refetchInterval: 30000 });

export const useWorkflows = () =>
  useQuery({ queryKey: ["brain-workflows"], queryFn: withFallback(api.getWorkflows, mockWorkflows), refetchInterval: 15000 });

export const useAgents = () =>
  useQuery({ queryKey: ["brain-agents"], queryFn: withFallback(api.getAgents, mockAgents), refetchInterval: 30000 });

export const useProjects = () =>
  useQuery({ queryKey: ["brain-projects"], queryFn: withFallback(api.getProjects, mockProjects), refetchInterval: 15000 });

export const useStats = () =>
  useQuery({ queryKey: ["brain-stats"], queryFn: withFallback(api.getStats, mockStats), refetchInterval: 10000 });

export const useRunWorkflow = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (workflowId: string) => {
      try {
        return await api.runWorkflow(workflowId);
      } catch {
        // Simulate success for demo
        await new Promise((r) => setTimeout(r, 1200));
        return { status: "started", workflow_id: workflowId };
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brain-workflows"] });
      qc.invalidateQueries({ queryKey: ["brain-stats"] });
    },
  });
};
