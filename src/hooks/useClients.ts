import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Client {
  id: string;
  name: string;
  shopify_url: string;
  industry: string;
  vertical: string;
  revenue_tier: string;
  project_status: string;
  contact_name: string;
  contact_email: string;
  notes: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export type ClientInsert = Omit<Client, "id" | "created_at" | "updated_at">;

export const INDUSTRIES = [
  "Apparel & Fashion",
  "Beauty & Skincare",
  "Health & Wellness",
  "Food & Beverage",
  "Home & Lifestyle",
  "Sports & Outdoors",
  "Electronics & Tech",
  "Pets",
  "Baby & Kids",
  "Jewelry & Accessories",
  "Supplements & Nutrition",
  "CBD & Wellness",
  "Automotive",
  "Other",
];

export const PROJECT_STATUSES = ["Active", "In Progress", "On Hold", "Completed", "Churned"];

export const REVENUE_TIERS = [
  "< $1M",
  "$1M – $5M",
  "$5M – $10M",
  "$10M – $25M",
  "$25M – $50M",
  "$50M+",
];

export const STATUS_COLORS: Record<string, string> = {
  Active: "text-accent bg-accent/10 border-accent/30",
  "In Progress": "text-blue-400 bg-blue-400/10 border-blue-400/30",
  "On Hold": "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  Completed: "text-purple-400 bg-purple-400/10 border-purple-400/30",
  Churned: "text-muted-foreground bg-muted/20 border-border",
};

export function useClients() {
  return useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Client[];
    },
  });
}

export function useAddClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (client: ClientInsert) => {
      const { error } = await supabase.from("clients").insert(client);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Client> & { id: string }) => {
      const { error } = await supabase.from("clients").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export function useDeleteClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}
