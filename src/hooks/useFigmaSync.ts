import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FigmaProject {
  id: string;
  project_id: string;
  project_name: string;
  team_id: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface FigmaFile {
  id: string;
  figma_file_key: string;
  name: string;
  design_type: string;
  client_name: string | null;
  thumbnail_url: string | null;
  figma_url: string | null;
  last_modified: string | null;
  project_id: string | null;
  project_name: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

export const DESIGN_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  free_trial: { label: "Free Trial", color: "text-blue-400 bg-blue-400/10 border-blue-400/30" },
  oddit_report: { label: "Oddit Report", color: "text-primary bg-primary/10 border-primary/30" },
  landing_page: { label: "Landing Page", color: "text-accent bg-accent/10 border-accent/30" },
  new_site_design: { label: "New Site Design", color: "text-purple-400 bg-purple-400/10 border-purple-400/30" },
  other: { label: "Other", color: "text-muted-foreground bg-muted/20 border-border" },
};

export function useFigmaProjects() {
  return useQuery({
    queryKey: ["figma-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("figma_projects")
        .select("*")
        .order("created_at");
      if (error) throw error;
      return data as FigmaProject[];
    },
  });
}

export function useFigmaFiles() {
  return useQuery({
    queryKey: ["figma-files"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("figma_files")
        .select("*")
        .order("last_modified", { ascending: false });
      if (error) throw error;
      return data as FigmaFile[];
    },
  });
}

export function useAddFigmaProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ project_id, project_name }: { project_id: string; project_name: string }) => {
      const { error } = await supabase
        .from("figma_projects")
        .insert({ project_id, project_name });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["figma-projects"] }),
  });
}

export function useDeleteFigmaProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("figma_projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["figma-projects"] }),
  });
}

export function useTriggerFigmaSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("figma-sync");
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["figma-files"] });
      qc.invalidateQueries({ queryKey: ["figma-projects"] });
    },
  });
}
