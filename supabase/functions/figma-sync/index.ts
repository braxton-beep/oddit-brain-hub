import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIGMA_API_BASE = "https://api.figma.com/v1";

// Classify design type based on file name keywords
// Supports custom keyword_rules per project: { free_trial: ["ft","trial"], oddit_report: ["audit"], ... }
function classifyDesignType(name: string, keywordRules?: Record<string, string[]>): string {
  const lower = name.toLowerCase();

  // Build rule map: merge defaults + project overrides
  const rules: Record<string, string[]> = {
    free_trial: ["free trial", "free-trial", "freetrial", "ft -", "- ft", " ft ", "(ft)"],
    oddit_report: ["oddit", "audit", "cro report", "ux report"],
    landing_page: ["landing page", "landing pg", "lp -", "- lp", " lp ", "lp:", "(lp)"],
    new_site_design: ["new site", "newsite", "redesign", "full site", "site design", "new design"],
    ...keywordRules,
  };

  // Priority order
  const priority = ["free_trial", "oddit_report", "landing_page", "new_site_design"];

  for (const type of priority) {
    const keywords = rules[type] ?? [];
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      return type;
    }
  }

  return "other";
}

// Extract potential client name from file name
function extractClientName(name: string): string | null {
  const patterns = [
    /^([^-–|]+)\s*[-–|]/,   // "ClientName - something" or "ClientName | something"
    /^([A-Z][a-zA-Z&]+(?:\s[A-Z][a-zA-Z&]+)?)\s+(?:landing|oddit|report|audit|free|new site|ft|lp)/i,
  ];
  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match) {
      const candidate = match[1].trim();
      // Ignore if it's just a design type keyword itself
      const skipWords = ["free trial", "oddit", "landing page", "new site", "redesign"];
      if (!skipWords.some((w) => candidate.toLowerCase().includes(w))) {
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

    // Resolve Figma token: prefer env secret, fall back to DB integration_credentials
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
        // Parse keyword_rules from project metadata if present
        const keywordRules: Record<string, string[]> | undefined =
          project.team_id ? undefined : undefined; // extended via raw_metadata in future

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
          // Check if file already has a manually-overridden design_type — preserve it
          const { data: existing } = await sb
            .from("figma_files")
            .select("design_type, id")
            .eq("figma_file_key", file.key)
            .maybeSingle();

          // Only auto-classify if not yet manually set (we track manual overrides via a flag in raw_metadata)
          const isManualOverride = existing?.id && (await (async () => {
            const { data: meta } = await sb
              .from("figma_files")
              .select("raw_metadata")
              .eq("figma_file_key", file.key)
              .single();
            return meta?.raw_metadata?.manual_type_override === true;
          })());

          const designType = isManualOverride
            ? existing!.design_type
            : classifyDesignType(file.name, keywordRules);

          const clientName = extractClientName(file.name);

          // Only oddit_report and landing_page are in scope for Oddit Brain by default
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
            // Only set enabled on first insert — never overwrite a user's manual toggle
            ...(existing?.id ? {} : { enabled: enabledByDefault }),
          };

          // Preserve manual_type_override flag if set
          if (isManualOverride) {
            upsertData.raw_metadata = { figma_last_modified: file.last_modified, thumbnail_url: file.thumbnail_url, manual_type_override: true };
          } else {
            upsertData.raw_metadata = { figma_last_modified: file.last_modified, thumbnail_url: file.thumbnail_url };
          }

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
