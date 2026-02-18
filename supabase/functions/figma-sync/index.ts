import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIGMA_API_BASE = "https://api.figma.com/v1";

// Classify design type based on file name keywords
function classifyDesignType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("free trial") || lower.includes("free-trial") || lower.includes("freetrial")) {
    return "free_trial";
  }
  if (lower.includes("oddit") || lower.includes("audit")) {
    return "oddit_report";
  }
  if (lower.includes("landing") || lower.includes("lp ") || lower.includes(" lp") || lower.includes("landing page")) {
    return "landing_page";
  }
  if (lower.includes("new site") || lower.includes("newsite") || lower.includes("redesign") || lower.includes("full site")) {
    return "new_site_design";
  }
  return "other";
}

// Extract potential client name from file name
function extractClientName(name: string): string | null {
  // Common patterns: "ClientName - Oddit Report", "ClientName Landing Page", etc.
  const patterns = [
    /^([^-–]+)\s*[-–]/,   // "ClientName - something"
    /^([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)\s+(?:landing|oddit|report|audit|free|new site)/i,
  ];
  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FIGMA_ACCESS_TOKEN = Deno.env.get("FIGMA_ACCESS_TOKEN");
    if (!FIGMA_ACCESS_TOKEN) {
      return new Response(
        JSON.stringify({ error: "FIGMA_ACCESS_TOKEN is not configured. Please add your Figma personal access token in Settings → Integrations." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Get configured Figma projects from DB
    const { data: figmaProjects, error: projError } = await sb
      .from("figma_projects")
      .select("*")
      .eq("enabled", true);

    if (projError) throw projError;

    if (!figmaProjects || figmaProjects.length === 0) {
      return new Response(
        JSON.stringify({ error: "No Figma projects configured. Add a project ID in the Integrations page." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const syncedFiles: any[] = [];
    const errors: string[] = [];

    for (const project of figmaProjects) {
      try {
        // Fetch files from Figma project
        const res = await fetch(`${FIGMA_API_BASE}/projects/${project.project_id}/files`, {
          headers: { "X-Figma-Token": FIGMA_ACCESS_TOKEN },
        });

        if (!res.ok) {
          const text = await res.text();
          errors.push(`Project ${project.project_id}: ${res.status} - ${text}`);
          continue;
        }

        const data = await res.json();
        const files = data.files ?? [];

        for (const file of files) {
          const designType = classifyDesignType(file.name);
          const clientName = extractClientName(file.name);

          const upsertData = {
            figma_file_key: file.key,
            name: file.name,
            design_type: designType,
            client_name: clientName,
            thumbnail_url: file.thumbnail_url ?? null,
            figma_url: `https://www.figma.com/file/${file.key}`,
            last_modified: file.last_modified ?? null,
            project_id: project.project_id,
            project_name: project.project_name || data.name || "",
            tags: [designType, ...(clientName ? [clientName.toLowerCase()] : [])],
            raw_metadata: { figma_last_modified: file.last_modified, thumbnail_url: file.thumbnail_url },
          };

          const { error: upsertError } = await sb
            .from("figma_files")
            .upsert(upsertData, { onConflict: "figma_file_key" });

          if (upsertError) {
            errors.push(`File ${file.key}: ${upsertError.message}`);
          } else {
            syncedFiles.push(upsertData);
          }
        }

        // Update project name if we got it from API
        if (data.name && !project.project_name) {
          await sb.from("figma_projects").update({ project_name: data.name }).eq("id", project.id);
        }
      } catch (err) {
        errors.push(`Project ${project.project_id}: ${err instanceof Error ? err.message : "Unknown error"}`);
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
    console.error("figma-sync error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
