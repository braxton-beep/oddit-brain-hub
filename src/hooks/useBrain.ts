import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const useBrainStatus  = () => useQuery({ queryKey: ["brain-status"],  queryFn: api.getStatus,  refetchInterval: 30000 });
export const useBrainHealth  = () => useQuery({ queryKey: ["brain-health"],  queryFn: api.getHealth,  refetchInterval: 10000 });
export const useTools        = () => useQuery({ queryKey: ["brain-tools"],   queryFn: api.getTools,   refetchInterval: 30000 });
export const useWorkflows    = () => useQuery({ queryKey: ["brain-workflows"], queryFn: api.getWorkflows, refetchInterval: 15000 });
export const useAgents       = () => useQuery({ queryKey: ["brain-agents"],  queryFn: api.getAgents,  refetchInterval: 30000 });
export const useProjects     = () => useQuery({ queryKey: ["brain-projects"], queryFn: api.getProjects, refetchInterval: 15000 });
export const useStats        = () => useQuery({ queryKey: ["brain-stats"],   queryFn: api.getStats,   refetchInterval: 10000 });

export const useRunWorkflow = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workflowId: string) => api.runWorkflow(workflowId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brain-workflows"] });
      qc.invalidateQueries({ queryKey: ["brain-stats"] });
    },
  });
};
