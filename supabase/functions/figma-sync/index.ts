import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIGMA_API_BASE = "https://api.figma.com/v1";

function classifyDesignType(name: string, keywordRules?: Record<string, string[]>): string {
  const lower = name.toLowerCase();
  const rules: Record<string, string[]> = {
    free_trial: ["free trial", "free-trial", "freetrial", "ft -", "- ft", " ft ", "(ft)"],
    oddit_report: ["oddit", "audit", "cro report", "ux report"],
    landing_page: ["landing page", "landing pg", "lp -", "- lp", " lp ", "lp:", "(lp)"],
    new_site_design: ["new site", "newsite", "redesign", "full site", "site design", "new design"],
    ...keywordRules,
  };
  const priority = ["free_trial", "oddit_report", "landing_page", "new_site_design"];
  for (const type of priority) {
    const keywords = rules[type] ?? [];
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) return type;
  }
  return "other";
}

function extractClientName(name: string): string | null {
  const patterns = [
    /^([^-–|]+)\s*[-–|]/,
    /^([A-Z][a-zA-Z&]+(?:\s[A-Z][a-zA-Z&]+)?)\s+(?:landing|oddit|report|audit|free|new site|ft|lp)/i,
  ];
  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match) {
      const candidate = match[1].trim();
      const skipWords = ["free trial", "oddit", "landing page", "new site", "redesign"];
      if (!skipWords.some((w) => candidate.toLowerCase().includes(w))) return candidate;
    }
  }
  return null;
}

// Fetch all projects for a Figma team and auto-register them in figma_projects
async function discoverTeamProjects(
  teamId: string,
  token: string,
  sb: any
): Promise<{ discovered: number; errors: string[] }> {
  const errors: string[] = [];
  let discovered = 0;

  const res = await fetch(`${FIGMA_API_BASE}/teams/${teamId}/projects`, {
    headers: { "X-Figma-Token": token },
  });

  if (!res.ok) {
    const text = await res.text();
    errors.push(`Team ${teamId}: ${res.status} - ${text}`);
    return { discovered, errors };
  }

  const data = await res.json();
  const projects = data.projects ?? [];

  for (const proj of projects) {
    const { error } = await sb
      .from("figma_projects")
      .upsert(
        {
          project_id: String(proj.id),
          project_name: proj.name || String(proj.id),
          team_id: teamId,
          enabled: true,
        },
        { onConflict: "project_id" }
      );
    if (error) {
      errors.push(`Team project ${proj.id}: ${error.message}`);
    } else {
      discovered++;
    }
  }

  return { discovered, errors };
}

// Sync files for a single project
async function syncProjectFiles(
  project: any,
  token: string,
  sb: any
): Promise<{ files: any[]; errors: string[] }> {
  const syncedFiles: any[] = [];
  const errors: string[] = [];

  const res = await fetch(`${FIGMA_API_BASE}/projects/${project.project_id}/files`, {
    headers: { "X-Figma-Token": token },
  });

  if (!res.ok) {
    const text = await res.text();
    errors.push(`Project ${project.project_id}: ${res.status} - ${text}`);
    return { files: syncedFiles, errors };
  }

  const data = await res.json();
  const files = data.files ?? [];

  for (const file of files) {
    const { data: existing } = await sb
      .from("figma_files")
      .select("design_type, id, raw_metadata")
      .eq("figma_file_key", file.key)
      .maybeSingle();

    const isManualOverride = existing?.raw_metadata?.manual_type_override === true;
    const designType = isManualOverride ? existing!.design_type : classifyDesignType(file.name);
    const clientName = extractClientName(file.name);

    const IN_SCOPE_TYPES = ["oddit_report", "landing_page"];
    const enabledByDefault = IN_SCOPE_TYPES.includes(designType);

    const upsertData: Record<string, any> = {
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
      ...(existing?.id ? {} : { enabled: enabledByDefault }),
      raw_metadata: {
        figma_last_modified: file.last_modified,
        thumbnail_url: file.thumbnail_url,
        ...(isManualOverride ? { manual_type_override: true } : {}),
      },
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

  if (data.name && !project.project_name) {
    await sb.from("figma_projects").update({ project_name: data.name }).eq("id", project.id);
  }

  return { files: syncedFiles, errors };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Resolve Figma token
    let FIGMA_ACCESS_TOKEN = Deno.env.get("FIGMA_ACCESS_TOKEN");
    if (!FIGMA_ACCESS_TOKEN) {
      const { data: cred } = await sb
        .from("integration_credentials")
        .select("api_key")
        .eq("integration_id", "figma")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      FIGMA_ACCESS_TOKEN = cred?.api_key ?? null;
    }

    if (!FIGMA_ACCESS_TOKEN) {
      return new Response(
        JSON.stringify({ error: "Figma token not configured. Add your Figma personal access token in Settings → Integrations." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 1: Discover projects from any configured team IDs
    const { data: teamRows } = await sb
      .from("figma_projects")
      .select("team_id")
      .not("team_id", "is", null)
      .eq("enabled", true);

    const teamIds = [...new Set((teamRows ?? []).map((r: any) => r.team_id).filter(Boolean))];
    let totalDiscovered = 0;
    const allErrors: string[] = [];

    for (const teamId of teamIds) {
      const { discovered, errors } = await discoverTeamProjects(teamId, FIGMA_ACCESS_TOKEN, sb);
      totalDiscovered += discovered;
      allErrors.push(...errors);
    }

    // Step 2: Sync files from all enabled projects
    const { data: figmaProjects, error: projError } = await sb
      .from("figma_projects")
      .select("*")
      .eq("enabled", true);

    if (projError) throw projError;

    if (!figmaProjects || figmaProjects.length === 0) {
      return new Response(
        JSON.stringify({ error: "No Figma projects configured. Add a Team ID or Project ID in the Integrations page." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const allSyncedFiles: any[] = [];

    for (const project of figmaProjects) {
      try {
        const { files, errors } = await syncProjectFiles(project, FIGMA_ACCESS_TOKEN, sb);
        allSyncedFiles.push(...files);
        allErrors.push(...errors);
      } catch (err) {
        allErrors.push(`Project ${project.project_id}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        teams_discovered: totalDiscovered,
        synced: allSyncedFiles.length,
        errors: allErrors.length > 0 ? allErrors : undefined,
        files: allSyncedFiles,
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
