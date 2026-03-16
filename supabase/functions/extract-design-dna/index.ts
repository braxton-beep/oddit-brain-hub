import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIGMA_API_BASE = "https://api.figma.com/v1";

// ── Extract design data for a single file ──────────────────────────────────
async function extractDesignData(
  fileKey: string,
  token: string,
  sb: any,
  supabaseUrl: string
): Promise<{ design_data: Record<string, any>; errors: string[] }> {
  const errors: string[] = [];
  const designData: Record<string, any> = {};

  // 1. Get file structure + styles
  const fileRes = await fetch(
    `${FIGMA_API_BASE}/files/${fileKey}?depth=2&geometry=paths`,
    { headers: { "X-Figma-Token": token } }
  );

  if (!fileRes.ok) {
    const text = await fileRes.text();
    // Figma Slides / FigJam files return 400 "File type not supported"
    if (fileRes.status === 400 && text.includes("not supported")) {
      designData._unsupported_file_type = true;
      return { design_data: designData, errors: [] };
    }
    errors.push(`File ${fileKey} fetch: ${fileRes.status} - ${text.slice(0, 200)}`);
    return { design_data: designData, errors };
  }

  const fileData = await fileRes.json();

  // 2. Extract published styles
  const styles = fileData.styles ?? {};
  const styleEntries: Record<string, any[]> = {
    fills: [], text: [], effects: [], grids: [],
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
        if (topFrameIds.length < 6) topFrameIds.push(child.id);
      }
    }
    pages.push({ name: page.name, frames });
  }

  designData.pages = pages;

  // 4. Export key frames as PNGs → storage
  if (topFrameIds.length > 0) {
    const idsParam = topFrameIds.join(",");
    const imgRes = await fetch(
      `${FIGMA_API_BASE}/images/${fileKey}?ids=${idsParam}&format=png&scale=1`,
      { headers: { "X-Figma-Token": token } }
    );

    if (imgRes.ok) {
      const imgData = await imgRes.json();
      const frameExports: Record<string, string> = {};

      for (const [nodeId, imageUrl] of Object.entries(imgData.images ?? {})) {
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

  // 5. Extract actual color values + typography from style nodes
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

      for (const [_nodeId, nodeInfo] of Object.entries(nodesData.nodes ?? {})) {
        const node = (nodeInfo as any)?.document;
        if (!node) continue;

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

        if (node.style) {
          typography.push({
            name: node.name,
            fontFamily: node.style.fontFamily,
            fontWeight: node.style.fontWeight,
            fontSize: node.style.fontSize,
            lineHeight: node.style.lineHeightPx,
            letterSpacing: node.style.letterSpacing,
          });
        }
      }

      if (colorPalette.length > 0) designData.color_palette = colorPalette;
      if (typography.length > 0) designData.typography = typography;
    }
  }

  return { design_data: designData, errors };
}

// ── Main handler ────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Parse params
    let batchSize = 5;
    let designTypes = ["oddit_report", "landing_page", "new_site_design"];
    let fileIds: string[] | null = null;

    try {
      const body = await req.json();
      if (body?.batch_size) batchSize = Math.min(body.batch_size, 10);
      if (body?.design_types) designTypes = body.design_types;
      if (body?.file_ids) fileIds = body.file_ids;
    } catch { /* no body = defaults */ }

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
        JSON.stringify({ error: "Figma token not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get files that need extraction
    let query = sb
      .from("figma_files")
      .select("id, figma_file_key, name, design_type, design_data")
      .eq("enabled", true);

    if (fileIds && fileIds.length > 0) {
      query = query.in("id", fileIds);
    } else {
      query = query.in("design_type", designTypes);
    }

    const { data: files, error: queryError } = await query
      .order("last_modified", { ascending: false })
      .limit(100);

    if (queryError) throw queryError;

    // Filter to only files with empty design_data
    const needsExtraction = (files ?? []).filter((f: any) => {
      if (!f.design_data) return true;
      const keys = Object.keys(f.design_data);
      return keys.length === 0;
    });

    // Process batch
    const batch = needsExtraction.slice(0, batchSize);
    const results: any[] = [];
    const allErrors: string[] = [];

    console.log(`Processing ${batch.length} of ${needsExtraction.length} files needing extraction`);

    for (const file of batch) {
      console.log(`Extracting: ${file.name} (${file.figma_file_key})`);
      
      const { design_data, errors } = await extractDesignData(
        file.figma_file_key,
        FIGMA_ACCESS_TOKEN,
        sb,
        supabaseUrl
      );

      allErrors.push(...errors);

      // Count what we got
      const frameCount = Object.keys(design_data.frame_exports ?? {}).length;
      const colorCount = (design_data.color_palette ?? []).length;
      const typoCount = (design_data.typography ?? []).length;
      const pageCount = (design_data.pages ?? []).length;

      // Update the file
      const { error: updateError } = await sb
        .from("figma_files")
        .update({ design_data })
        .eq("id", file.id);

      if (updateError) {
        allErrors.push(`Update ${file.name}: ${updateError.message}`);
      }

      results.push({
        name: file.name,
        file_key: file.figma_file_key,
        frames_exported: frameCount,
        colors: colorCount,
        typography: typoCount,
        pages: pageCount,
        success: !updateError,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        remaining: needsExtraction.length - batch.length,
        total_needing_extraction: needsExtraction.length,
        results,
        errors: allErrors.length > 0 ? allErrors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("extract-design-dna error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
