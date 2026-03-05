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

async function extractDesignData(
  fileKey: string,
  token: string,
  sb: any,
  supabaseUrl: string
): Promise<{ design_data: Record<string, any>; errors: string[] }> {
  const errors: string[] = [];
  const designData: Record<string, any> = {};

  try {
    // 1. Get file structure + styles in one call (depth=2 keeps it light)
    const fileRes = await fetch(
      `${FIGMA_API_BASE}/files/${fileKey}?depth=2&geometry=paths`,
      { headers: { "X-Figma-Token": token } }
    );

    if (!fileRes.ok) {
      errors.push(`File ${fileKey} fetch: ${fileRes.status}`);
      return { design_data: designData, errors };
    }

    const fileData = await fileRes.json();

    // 2. Extract published styles (colors, text, effects, grids)
    const styles = fileData.styles ?? {};
    const styleEntries: Record<string, any[]> = {
      fills: [],
      text: [],
      effects: [],
      grids: [],
    };

    for (const [nodeId, styleMeta] of Object.entries(styles)) {
      const meta = styleMeta as any;
      const category = meta.style_type?.toLowerCase() ?? "other";
      if (category === "fill") styleEntries.fills.push({ nodeId, name: meta.name, description: meta.description });
      else if (category === "text") styleEntries.text.push({ nodeId, name: meta.name, description: meta.description });
      else if (category === "effect") styleEntries.effects.push({ nodeId, name: meta.name, description: meta.description });
      else if (category === "grid") styleEntries.grids.push({ nodeId, name: meta.name, description: meta.description });
    }

    designData.styles = styleEntries;

    // 3. Extract top-level page/frame structure
    const pages: any[] = [];
    const topFrameIds: string[] = [];

    for (const page of fileData.document?.children ?? []) {
      const frames: any[] = [];
      for (const child of (page.children ?? []).slice(0, 20)) {
        if (child.type === "FRAME" || child.type === "COMPONENT" || child.type === "COMPONENT_SET") {
          frames.push({
            id: child.id,
            name: child.name,
            type: child.type,
            width: child.absoluteBoundingBox?.width,
            height: child.absoluteBoundingBox?.height,
          });
          // Collect up to 6 key frames for export
          if (topFrameIds.length < 6) {
            topFrameIds.push(child.id);
          }
        }
      }
      pages.push({ name: page.name, frames });
    }

    designData.pages = pages;

    // 4. Export key frames as PNGs and store in storage
    if (topFrameIds.length > 0) {
      const idsParam = topFrameIds.join(",");
      const imgRes = await fetch(
        `${FIGMA_API_BASE}/images/${fileKey}?ids=${idsParam}&format=png&scale=1`,
        { headers: { "X-Figma-Token": token } }
      );

      if (imgRes.ok) {
        const imgData = await imgRes.json();
        const frameExports: Record<string, string> = {};

        // Download each image and upload to storage
        const imageUrls = imgData.images ?? {};
        for (const [nodeId, imageUrl] of Object.entries(imageUrls)) {
          if (!imageUrl) continue;
          try {
            const imgFetchRes = await fetch(imageUrl as string);
            if (!imgFetchRes.ok) continue;

            const imgBlob = await imgFetchRes.arrayBuffer();
            const safeNodeId = nodeId.replace(/[^a-zA-Z0-9]/g, "-");
            const storagePath = `${fileKey}/${safeNodeId}.png`;

            const { error: uploadError } = await sb.storage
              .from("figma-exports")
              .upload(storagePath, imgBlob, {
                contentType: "image/png",
                upsert: true,
              });

            if (uploadError) {
              errors.push(`Upload ${storagePath}: ${uploadError.message}`);
            } else {
              // Build public URL
              const publicUrl = `${supabaseUrl}/storage/v1/object/public/figma-exports/${storagePath}`;
              frameExports[nodeId] = publicUrl;
            }
          } catch (dlErr) {
            errors.push(`Download frame ${nodeId}: ${dlErr instanceof Error ? dlErr.message : "unknown"}`);
          }
        }

        designData.frame_exports = frameExports;
      } else {
        errors.push(`Frame export for ${fileKey}: ${imgRes.status}`);
      }
    }

    // 5. Extract color palette from document (scan fill styles for actual values)
    // We need node details for style nodes to get actual color values
    const styleNodeIds = [
      ...styleEntries.fills.map((s) => s.nodeId),
      ...styleEntries.text.map((s) => s.nodeId),
    ].slice(0, 30);

    if (styleNodeIds.length > 0) {
      const nodesParam = styleNodeIds.join(",");
      const nodesRes = await fetch(
        `${FIGMA_API_BASE}/files/${fileKey}/nodes?ids=${nodesParam}`,
        { headers: { "X-Figma-Token": token } }
      );

      if (nodesRes.ok) {
        const nodesData = await nodesRes.json();
        const colorPalette: any[] = [];
        const typography: any[] = [];

        for (const [nodeId, nodeInfo] of Object.entries(nodesData.nodes ?? {})) {
          const node = (nodeInfo as any)?.document;
          if (!node) continue;

          // Extract fill colors
          if (node.fills) {
            for (const fill of node.fills) {
              if (fill.type === "SOLID" && fill.color) {
                const { r, g, b, a } = fill.color;
                colorPalette.push({
                  name: node.name,
                  r: Math.round(r * 255),
                  g: Math.round(g * 255),
                  b: Math.round(b * 255),
                  a: a ?? 1,
                  hex: `#${Math.round(r * 255).toString(16).padStart(2, "0")}${Math.round(g * 255).toString(16).padStart(2, "0")}${Math.round(b * 255).toString(16).padStart(2, "0")}`,
                });
              }
            }
          }

          // Extract typography
          if (node.style) {
            const s = node.style;
            typography.push({
              name: node.name,
              fontFamily: s.fontFamily,
              fontWeight: s.fontWeight,
              fontSize: s.fontSize,
              lineHeight: s.lineHeightPx,
              letterSpacing: s.letterSpacing,
            });
          }
        }

        if (colorPalette.length > 0) designData.color_palette = colorPalette;
        if (typography.length > 0) designData.typography = typography;
      }
    }
  } catch (err) {
    errors.push(`Design data ${fileKey}: ${err instanceof Error ? err.message : "unknown"}`);
  }

  return { design_data: designData, errors };
}

// Sync files for a single project
async function syncProjectFiles(
  project: any,
  token: string,
  sb: any,
  supabaseUrl: string,
  extractDesign: boolean
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
      .select("design_type, id, raw_metadata, design_data, last_modified")
      .eq("figma_file_key", file.key)
      .maybeSingle();

    const isManualOverride = existing?.raw_metadata?.manual_type_override === true;
    const designType = isManualOverride ? existing!.design_type : classifyDesignType(file.name);
    const clientName = extractClientName(file.name);

    const IN_SCOPE_TYPES = ["oddit_report", "landing_page", "new_site_design"];
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

    // Extract design data for in-scope files if changed since last sync
    if (extractDesign && IN_SCOPE_TYPES.includes(designType)) {
      const hasChanged = !existing?.last_modified || existing.last_modified !== file.last_modified;
      const hasNoDesignData = !existing?.design_data || Object.keys(existing.design_data).length === 0;

      if (hasChanged || hasNoDesignData) {
        console.log(`Extracting design data for: ${file.name} (${file.key})`);
        const { design_data, errors: ddErrors } = await extractDesignData(file.key, token, sb, supabaseUrl);
        upsertData.design_data = design_data;
        errors.push(...ddErrors);
      }
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

    // Check if caller wants design extraction (default: true)
    let extractDesign = true;
    try {
      const body = await req.json();
      if (body?.extract_design === false) extractDesign = false;
    } catch { /* no body is fine */ }

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
        const { files, errors } = await syncProjectFiles(project, FIGMA_ACCESS_TOKEN, sb, supabaseUrl, extractDesign);
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
        design_extraction: extractDesign,
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
