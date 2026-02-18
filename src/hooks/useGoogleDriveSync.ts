import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DriveFolder {
  id: string;
  folder_id: string;
  folder_name: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface DriveFile {
  id: string;
  drive_file_id: string;
  name: string;
  mime_type: string;
  doc_type: string;
  client_name: string | null;
  folder_id: string | null;
  folder_name: string | null;
  drive_url: string | null;
  thumbnail_url: string | null;
  last_modified: string | null;
  tags: string[] | null;
  raw_metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export const DOC_TYPES = [
  "cro_audit",
  "free_trial",
  "client_report",
  "template",
  "meeting_notes",
  "strategy_doc",
  "other",
] as const;

export type DocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  cro_audit:     { label: "CRO Audit",      color: "text-primary bg-primary/10 border-primary/30",          icon: "🔍" },
  free_trial:    { label: "Free Trial",      color: "text-blue-400 bg-blue-400/10 border-blue-400/30",        icon: "🎁" },
  client_report: { label: "Client Report",   color: "text-accent bg-accent/10 border-accent/30",              icon: "📊" },
  template:      { label: "Template",        color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",  icon: "📋" },
  meeting_notes: { label: "Meeting Notes",   color: "text-green-400 bg-green-400/10 border-green-400/30",     icon: "🗒️" },
  strategy_doc:  { label: "Strategy Doc",    color: "text-purple-400 bg-purple-400/10 border-purple-400/30",  icon: "🎯" },
  other:         { label: "Other",           color: "text-muted-foreground bg-muted/20 border-border",        icon: "📄" },
};

export const MIME_LABELS: Record<string, string> = {
  "application/vnd.google-apps.document":     "Doc",
  "application/vnd.google-apps.spreadsheet":  "Sheet",
  "application/vnd.google-apps.presentation": "Slides",
  "application/pdf":                           "PDF",
};

export function useDriveFolders() {
  return useQuery({
    queryKey: ["drive-folders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("google_drive_folders")
        .select("*")
        .order("created_at");
      if (error) throw error;
      return data as DriveFolder[];
    },
  });
}

export function useDriveFiles() {
  return useQuery({
    queryKey: ["drive-files"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("google_drive_files")
        .select("*")
        .order("last_modified", { ascending: false });
      if (error) throw error;
      return data as DriveFile[];
    },
  });
}

export function useAddDriveFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ folder_id, folder_name }: { folder_id: string; folder_name: string }) => {
      const { error } = await supabase
        .from("google_drive_folders")
        .insert({ folder_id, folder_name });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["drive-folders"] }),
  });
}

export function useDeleteDriveFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("google_drive_folders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["drive-folders"] }),
  });
}

export function useToggleDriveFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("google_drive_folders").update({ enabled }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["drive-folders"] }),
  });
}

export function useUpdateDriveFileType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, doc_type }: { id: string; doc_type: string }) => {
      const { data: existing } = await supabase
        .from("google_drive_files")
        .select("raw_metadata")
        .eq("id", id)
        .single();
      const metadata = {
        ...(existing?.raw_metadata as Record<string, unknown> ?? {}),
        manual_type_override: true,
      };
      const { error } = await supabase
        .from("google_drive_files")
        .update({ doc_type, raw_metadata: metadata })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["drive-files"] }),
  });
}

export function useTriggerDriveSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("google-drive-sync");
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drive-files"] });
      qc.invalidateQueries({ queryKey: ["drive-folders"] });
    },
  });
}
