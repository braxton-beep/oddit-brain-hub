import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BrainPrompt {
  id: string;
  label: string;
  prompt: string;
  sort_order: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export function useBrainPrompts() {
  return useQuery({
    queryKey: ["brain-prompts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brain_prompts")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as BrainPrompt[];
    },
  });
}

export function useAddBrainPrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ label, prompt }: { label: string; prompt: string }) => {
      const { data: existing } = await supabase
        .from("brain_prompts")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .single();
      const sort_order = (existing?.sort_order ?? -1) + 1;
      const { error } = await supabase.from("brain_prompts").insert({ label, prompt, sort_order });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brain-prompts"] }),
  });
}

export function useUpdateBrainPrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, label, prompt, enabled }: { id: string; label?: string; prompt?: string; enabled?: boolean }) => {
      const { error } = await supabase.from("brain_prompts").update({ label, prompt, enabled }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brain-prompts"] }),
  });
}

export function useDeleteBrainPrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("brain_prompts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brain-prompts"] }),
  });
}
