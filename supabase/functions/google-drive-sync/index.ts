import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";

// Mime type → human label
const MIME_TYPE_LABELS: Record<string, string> = {
  "application/vnd.google-apps.document": "Google Doc",
  "application/vnd.google-apps.spreadsheet": "Google Sheet",
  "application/vnd.google-apps.presentation": "Google Slides",
  "application/pdf": "PDF",
  "application/vnd.google-apps.folder": "Folder",
};

// Classify doc_type based on file name keywords
function classifyDocType(name: string, mimeType: string): string {
  const lower = name.toLowerCase();

  if (
    lower.includes("oddit") || lower.includes("audit") ||
    lower.includes("cro report") || lower.includes("ux report") ||
    lower.includes("cro audit")
  ) return "cro_audit";

  if (
    lower.includes("free trial") || lower.includes("free-trial") ||
    lower.includes("freetrial") || lower.includes("(ft)") ||
    lower.includes(" ft ") || lower.includes("ft -")
  ) return "free_trial";

  if (
    lower.includes("proposal") || lower.includes("report") ||
    lower.includes("deck") || lower.includes("client report") ||
    lower.includes("summary") || lower.includes("results")
  ) return "client_report";

  if (
    lower.includes("template") || lower.includes("framework") ||
    lower.includes("playbook") || lower.includes("sop") ||
    lower.includes("checklist") || lower.includes("guide")
  ) return "template";

  if (
    lower.includes("notes") || lower.includes("transcript") ||
    lower.includes("call") || lower.includes("meeting") ||
    lower.includes("discovery") || lower.includes("kickoff")
  ) return "meeting_notes";

  if (
    lower.includes("brief") || lower.includes("strategy") ||
    lower.includes("plan") || lower.includes("roadmap")
  ) return "strategy_doc";

  return "other";
}

// Extract client name from file name
function extractClientName(name: string): string | null {
  const patterns = [
    /^([^-–|]+)\s*[-–|]/,
    /^([A-Z][a-zA-Z&.]+(?:\s[A-Z][a-zA-Z&.]+)?)\s+(?:audit|report|proposal|notes|brief|deck|oddit|free trial)/i,
  ];
  const skipWords = ["oddit", "audit", "report", "template", "free trial", "meeting", "strategy", "notes"];
  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match) {
      const candidate = match[1].trim();
      if (!skipWords.some((w) => candidate.toLowerCase().includes(w)) && candidate.length > 1) {
        return candidate;
      }
    }
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Read Google Drive OAuth token from integration_credentials
    const { data: cred } = await sb
      .from("integration_credentials")
      .select("api_key")
      .eq("integration_id", "google-drive")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const accessToken = cred?.api_key;
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "Google Drive token not configured. Add your token in Settings → Integrations." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get scoped folders
    const { data: folders, error: foldersError } = await sb
      .from("google_drive_folders")
      .select("*")
      .eq("enabled", true);

    if (foldersError) throw foldersError;

    if (!folders || folders.length === 0) {
      return new Response(
        JSON.stringify({ error: "No Google Drive folders configured. Add a folder ID in the Integrations page." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const syncedFiles: any[] = [];
    const errors: string[] = [];

    for (const folder of folders) {
      try {
        // List files in this folder (non-recursive, one level)
        const params = new URLSearchParams({
          q: `'${folder.folder_id}' in parents and trashed = false`,
          fields: "files(id,name,mimeType,webViewLink,thumbnailLink,modifiedTime,parents)",
          pageSize: "200",
          orderBy: "modifiedTime desc",
        });

        const res = await fetch(`${DRIVE_API_BASE}/files?${params}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!res.ok) {
          const text = await res.text();
          errors.push(`Folder ${folder.folder_id}: ${res.status} - ${text}`);
          continue;
        }

        const data = await res.json();
        const files = data.files ?? [];

        for (const file of files) {
          // Skip folders themselves
          if (file.mimeType === "application/vnd.google-apps.folder") continue;

          // Check for manual override
          const { data: existing } = await sb
            .from("google_drive_files")
            .select("doc_type, raw_metadata")
            .eq("drive_file_id", file.id)
            .maybeSingle();

          const isManualOverride = (existing?.raw_metadata as any)?.manual_type_override === true;
          const docType = isManualOverride
            ? existing!.doc_type
            : classifyDocType(file.name, file.mimeType);

          const clientName = extractClientName(file.name);

          const upsertData: Record<string, any> = {
            drive_file_id: file.id,
            name: file.name,
            mime_type: file.mimeType,
            doc_type: docType,
            client_name: clientName,
            folder_id: folder.folder_id,
            folder_name: folder.folder_name || folder.folder_id,
            drive_url: file.webViewLink ?? null,
            thumbnail_url: file.thumbnailLink ?? null,
            last_modified: file.modifiedTime ?? null,
            tags: [docType, ...(clientName ? [clientName.toLowerCase()] : [])],
            raw_metadata: {
              mime_type: file.mimeType,
              mime_label: MIME_TYPE_LABELS[file.mimeType] ?? "File",
              ...(isManualOverride ? { manual_type_override: true } : {}),
            },
          };

          const { error: upsertError } = await sb
            .from("google_drive_files")
            .upsert(upsertData, { onConflict: "drive_file_id" });

          if (upsertError) {
            errors.push(`File ${file.id} (${file.name}): ${upsertError.message}`);
          } else {
            syncedFiles.push(upsertData);
          }
        }
      } catch (err) {
        errors.push(`Folder ${folder.folder_id}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        synced: syncedFiles.length,
        errors: errors.length > 0 ? errors : undefined,
        files: syncedFiles,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("google-drive-sync error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
