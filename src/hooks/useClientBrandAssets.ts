import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BrandAsset {
  id: string;
  client_id: string;
  file_name: string;
  file_url: string;
  asset_type: string;
  storage_path: string;
  created_at: string;
  updated_at: string;
}

export const ASSET_TYPES = ["logo", "product", "lifestyle", "icon", "pattern", "other"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  logo: { label: "Logo", icon: "🏷️" },
  product: { label: "Product", icon: "📦" },
  lifestyle: { label: "Lifestyle", icon: "🌄" },
  icon: { label: "Icon", icon: "✨" },
  pattern: { label: "Pattern", icon: "🔲" },
  other: { label: "Other", icon: "📎" },
};

export function useClientBrandAssets(clientId: string | null) {
  return useQuery({
    queryKey: ["brand-assets", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_brand_assets")
        .select("*")
        .eq("client_id", clientId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as BrandAsset[];
    },
  });
}

export function useUploadBrandAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      clientId,
      file,
      assetType,
    }: {
      clientId: string;
      file: File;
      assetType: AssetType;
    }) => {
      const ext = file.name.split(".").pop() || "png";
      const storagePath = `${clientId}/${Date.now()}-${file.name}`;

      const { error: uploadErr } = await supabase.storage
        .from("brand-assets")
        .upload(storagePath, file, { contentType: file.type, upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage
        .from("brand-assets")
        .getPublicUrl(storagePath);

      const { error: insertErr } = await supabase
        .from("client_brand_assets")
        .insert({
          client_id: clientId,
          file_name: file.name,
          file_url: urlData.publicUrl,
          asset_type: assetType,
          storage_path: storagePath,
        });
      if (insertErr) throw insertErr;

      return urlData.publicUrl;
    },
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: ["brand-assets", vars.clientId] }),
  });
}

export function useDeleteBrandAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, storagePath, clientId }: { id: string; storagePath: string; clientId: string }) => {
      await supabase.storage.from("brand-assets").remove([storagePath]);
      const { error } = await supabase.from("client_brand_assets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: ["brand-assets", vars.clientId] }),
  });
}
