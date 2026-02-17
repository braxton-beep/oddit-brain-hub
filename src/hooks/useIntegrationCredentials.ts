import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface IntegrationCredential {
  id: string;
  integration_id: string;
  api_key: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useIntegrationCredentials() {
  return useQuery({
    queryKey: ["integration-credentials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integration_credentials")
        .select("*")
        .order("integration_id");
      if (error) throw error;
      return data as IntegrationCredential[];
    },
  });
}

export function useAddCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ integration_id, api_key }: { integration_id: string; api_key: string }) => {
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user?.id ?? null;

      const { error } = await supabase
        .from("integration_credentials")
        .insert({ integration_id, api_key, created_by: userId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integration-credentials"] }),
  });
}

export function useDeleteCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("integration_credentials")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integration-credentials"] }),
  });
}
