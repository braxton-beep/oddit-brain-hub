import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ── Projects ──────────────────────────────────────────
export interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  priority: string;
  owner: string;
  progress: number;
  created_at: string;
  updated_at: string;
}

export const useProjects = () =>
  useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Project[];
    },
  });

export const useCreateProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (project: Partial<Project>) => {
      const { data, error } = await supabase
        .from("projects")
        .insert([project as any])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
};

export const useUpdateProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Project> & { id: string }) => {
      const { error } = await supabase
        .from("projects")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
};

export const useDeleteProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
};

// ── Workflows ──────────────────────────────────────────
export interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export const useWorkflows = () =>
  useQuery({
    queryKey: ["workflows"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflows")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Workflow[];
    },
  });

export const useCreateWorkflow = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (wf: Partial<Workflow>) => {
      const { data, error } = await supabase
        .from("workflows")
        .insert([wf as any])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflows"] }),
  });
};

export const useUpdateWorkflow = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Workflow> & { id: string }) => {
      const { error } = await supabase
        .from("workflows")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflows"] }),
  });
};

// ── Knowledge Sources ──────────────────────────────────
export interface KnowledgeSource {
  id: string;
  name: string;
  icon: string;
  item_count: number;
  status: string;
  source_type: string;
  integration_id: string | null;
  created_at: string;
  updated_at: string;
}

export const useKnowledgeSources = () =>
  useQuery({
    queryKey: ["knowledge-sources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_sources")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as KnowledgeSource[];
    },
  });

// ── Activity Log ──────────────────────────────────────
export interface ActivityEntry {
  id: string;
  workflow_name: string;
  status: string;
  created_at: string;
}

export const useActivityLog = () =>
  useQuery({
    queryKey: ["activity-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as ActivityEntry[];
    },
  });

// ── Dashboard Stats (computed) ──────────────────────────
export const useDashboardStats = () =>
  useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [{ count: workflowCount }, { count: projectCount }, { data: activity }] = await Promise.all([
        supabase.from("workflows").select("*", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("projects").select("*", { count: "exact", head: true }),
        supabase.from("activity_log").select("*").gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
      ]);

      const { data: credentials } = await supabase
        .from("integration_credentials")
        .select("*", { count: "exact", head: true });

      return {
        tools_connected: credentials?.length ?? 0,
        workflows_active: workflowCount ?? 0,
        executions_today: activity?.length ?? 0,
      };
    },
  });
