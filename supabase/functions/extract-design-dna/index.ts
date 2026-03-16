import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIGMA_API_BASE = "https://api.figma.com/v1";

// ── Color helpers ───────────────────────────────────────────────────────
function rgbaToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function colorKey(r: number, g: number, b: number): string {
  return `${Math.round(r * 255)}-${Math.round(g * 255)}-${Math.round(b * 255)}`;
}

// ── Deep node walker ────────────────────────────────────────────────────
// Walks the entire node tree and collects real design data from actual nodes
function walkNodes(
  node: any,
  collectors: {
    colors: Map<string, { hex: string; r: number; g: number; b: number; count: number; contexts: string[] }>;
    fonts: Map<string, { fontFamily: string; fontWeight: number; fontSize: number; count: number; contexts: string[] }>;
    textSamples: { text: string; fontFamily: string; fontSize: number; fontWeight: number; nodeName: string }[];
    components: Map<string, { name: string; type: string; count: number }>;
    spacingValues: number[];
    cornerRadii: number[];
    frameLayouts: { name: string; layoutMode: string; spacing: number; padding: number[]; width: number; height: number }[];
  },
  depth = 0,
  maxDepth = 8
) {
  if (!node || depth > maxDepth) return;

  // Extract fills (colors actually used)
  if (node.fills && Array.isArray(node.fills)) {
    for (const fill of node.fills) {
      if (fill.visible === false) continue;
      if (fill.type === "SOLID" && fill.color) {
        const { r, g, b } = fill.color;
        const key = colorKey(r, g, b);
        const existing = collectors.colors.get(key);
        const context = node.name || "unnamed";
        if (existing) {
          existing.count++;
          if (existing.contexts.length < 5 && !existing.contexts.includes(context)) {
            existing.contexts.push(context);
          }
        } else {
          collectors.colors.set(key, {
            hex: rgbaToHex(r, g, b),
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255),
            count: 1,
            contexts: [context],
          });
        }
      }
    }
  }

  // Extract strokes
  if (node.strokes && Array.isArray(node.strokes)) {
    for (const stroke of node.strokes) {
      if (stroke.visible === false) continue;
      if (stroke.type === "SOLID" && stroke.color) {
        const { r, g, b } = stroke.color;
        const key = `stroke-${colorKey(r, g, b)}`;
        const existing = collectors.colors.get(key);
        if (existing) {
          existing.count++;
        } else {
          collectors.colors.set(key, {
            hex: rgbaToHex(r, g, b),
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255),
            count: 1,
            contexts: [`stroke: ${node.name || "unnamed"}`],
          });
        }
      }
    }
  }

  // Extract typography from actual text nodes
  if (node.type === "TEXT" && node.style) {
    const s = node.style;
    const fontKey = `${s.fontFamily}-${s.fontWeight}-${s.fontSize}`;
    const existing = collectors.fonts.get(fontKey);
    const context = node.name || "unnamed";
    if (existing) {
      existing.count++;
      if (existing.contexts.length < 5 && !existing.contexts.includes(context)) {
        existing.contexts.push(context);
      }
    } else {
      collectors.fonts.set(fontKey, {
        fontFamily: s.fontFamily,
        fontWeight: s.fontWeight,
        fontSize: s.fontSize,
        count: 1,
        contexts: [context],
      });
    }

    // Collect text samples for tone/copy analysis
    if (node.characters && node.characters.length > 3 && collectors.textSamples.length < 40) {
      collectors.textSamples.push({
        text: node.characters.slice(0, 200),
        fontFamily: s.fontFamily,
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        nodeName: node.name || "unnamed",
      });
    }
  }

  // Extract component usage
  if (node.type === "COMPONENT" || node.type === "COMPONENT_SET" || node.type === "INSTANCE") {
    const compName = node.name || "unnamed";
    const existing = collectors.components.get(compName);
    if (existing) {
      existing.count++;
    } else {
      collectors.components.set(compName, { name: compName, type: node.type, count: 1 });
    }
  }

  // Extract layout/spacing from auto-layout frames
  if (node.type === "FRAME" && node.layoutMode) {
    collectors.frameLayouts.push({
      name: node.name || "unnamed",
      layoutMode: node.layoutMode,
      spacing: node.itemSpacing ?? 0,
      padding: [
        node.paddingTop ?? 0,
        node.paddingRight ?? 0,
        node.paddingBottom ?? 0,
        node.paddingLeft ?? 0,
      ],
      width: node.absoluteBoundingBox?.width ?? 0,
      height: node.absoluteBoundingBox?.height ?? 0,
    });
    if (node.itemSpacing) collectors.spacingValues.push(node.itemSpacing);
    if (node.paddingTop) collectors.spacingValues.push(node.paddingTop);
    if (node.paddingBottom) collectors.spacingValues.push(node.paddingBottom);
    if (node.paddingLeft) collectors.spacingValues.push(node.paddingLeft);
    if (node.paddingRight) collectors.spacingValues.push(node.paddingRight);
  }

  // Extract corner radii
  if (node.cornerRadius && node.cornerRadius > 0) {
    collectors.cornerRadii.push(node.cornerRadius);
  }

  // Recurse into children
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      walkNodes(child, collectors, depth + 1, maxDepth);
    }
  }
}

// ── Extract design data for a single file ───────────────────────────────
async function extractDesignData(
  fileKey: string,
  token: string,
  sb: any,
  supabaseUrl: string
): Promise<{ design_data: Record<string, any>; errors: string[] }> {
  const errors: string[] = [];
  const designData: Record<string, any> = {};

  // 1. Get FULL file structure (deep) with geometry
  const fileRes = await fetch(
    `${FIGMA_API_BASE}/files/${fileKey}?geometry=paths`,
    { headers: { "X-Figma-Token": token } }
  );

  if (!fileRes.ok) {
    const text = await fileRes.text();
    if (fileRes.status === 400 && text.includes("not supported")) {
      designData._unsupported_file_type = true;
      return { design_data: designData, errors: [] };
    }
    errors.push(`File ${fileKey} fetch: ${fileRes.status} - ${text.slice(0, 200)}`);
    return { design_data: designData, errors };
  }

  const fileData = await fileRes.json();

  // 2. Deep-walk the ENTIRE node tree
  const collectors = {
    colors: new Map<string, { hex: string; r: number; g: number; b: number; count: number; contexts: string[] }>(),
    fonts: new Map<string, { fontFamily: string; fontWeight: number; fontSize: number; count: number; contexts: string[] }>(),
    textSamples: [] as any[],
    components: new Map<string, { name: string; type: string; count: number }>(),
    spacingValues: [] as number[],
    cornerRadii: [] as number[],
    frameLayouts: [] as any[],
  };

  for (const page of fileData.document?.children ?? []) {
    walkNodes(page, collectors, 0, 8);
  }

  // 3. Process collected data into structured output

  // Color palette — sorted by usage frequency, deduplicated
  const allColors = Array.from(collectors.colors.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);
  designData.color_palette = allColors;

  // Typography — sorted by usage, deduped
  const allFonts = Array.from(collectors.fonts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
  designData.typography = allFonts;

  // Unique font families used
  const fontFamilies = [...new Set(allFonts.map((f) => f.fontFamily))];
  designData.font_families = fontFamilies;

  // Font size scale
  const fontSizes = [...new Set(allFonts.map((f) => f.fontSize))].sort((a, b) => a - b);
  designData.font_size_scale = fontSizes;

  // Text samples for tone analysis
  designData.text_samples = collectors.textSamples;

  // Component library
  const components = Array.from(collectors.components.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);
  designData.components = components;

  // Spacing system — find the most common spacing values
  const spacingCounts = new Map<number, number>();
  for (const s of collectors.spacingValues) {
    spacingCounts.set(s, (spacingCounts.get(s) ?? 0) + 1);
  }
  const spacingScale = Array.from(spacingCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([value, count]) => ({ value, count }));
  designData.spacing_scale = spacingScale;

  // Corner radius patterns
  const radiusCounts = new Map<number, number>();
  for (const r of collectors.cornerRadii) {
    radiusCounts.set(r, (radiusCounts.get(r) ?? 0) + 1);
  }
  const radiusScale = Array.from(radiusCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([value, count]) => ({ value, count }));
  designData.corner_radii = radiusScale;

  // Layout patterns (auto-layout frames)
  designData.layout_patterns = collectors.frameLayouts.slice(0, 20);

  // 4. Page/frame structure
  const pages: any[] = [];
  const topFrameIds: string[] = [];

  for (const page of fileData.document?.children ?? []) {
    const frames: any[] = [];
    for (const child of (page.children ?? []).slice(0, 30)) {
      if (child.type === "FRAME" || child.type === "COMPONENT" || child.type === "COMPONENT_SET") {
        frames.push({
          id: child.id,
          name: child.name,
          type: child.type,
          width: child.absoluteBoundingBox?.width,
          height: child.absoluteBoundingBox?.height,
        });
        if (topFrameIds.length < 8) topFrameIds.push(child.id);
      }
    }
    pages.push({ name: page.name, frameCount: frames.length, frames });
  }
  designData.pages = pages;

  // 5. Export key frames as PNGs → storage
  if (topFrameIds.length > 0) {
    const idsParam = topFrameIds.join(",");
    const imgRes = await fetch(
      `${FIGMA_API_BASE}/images/${fileKey}?ids=${idsParam}&format=png&scale=2`,
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
            frameExports[nodeId] = `${supabaseUrl}/storage/v1/object/public/figma-exports/${storagePath}`;
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

  // 6. Published styles (bonus — on top of deep extraction)
  const styles = fileData.styles ?? {};
  const publishedStyles: Record<string, any[]> = { fills: [], text: [], effects: [], grids: [] };

  for (const [nodeId, styleMeta] of Object.entries(styles)) {
    const meta = styleMeta as any;
    const category = meta.style_type?.toLowerCase() ?? "other";
    const entry = { nodeId, name: meta.name, description: meta.description };
    if (category === "fill") publishedStyles.fills.push(entry);
    else if (category === "text") publishedStyles.text.push(entry);
    else if (category === "effect") publishedStyles.effects.push(entry);
    else if (category === "grid") publishedStyles.grids.push(entry);
  }
  designData.published_styles = publishedStyles;

  // 7. Summary stats
  designData._extraction_summary = {
    total_colors: allColors.length,
    total_fonts: allFonts.length,
    font_families: fontFamilies.length,
    components_found: components.length,
    text_samples: collectors.textSamples.length,
    frames_exported: Object.keys(designData.frame_exports ?? {}).length,
    pages: pages.length,
    extracted_at: new Date().toISOString(),
  };

  return { design_data: designData, errors };
}

// ── Main handler ────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    let batchSize = 3;
    let designTypes = ["oddit_report", "landing_page", "new_site_design"];
    let fileIds: string[] | null = null;
    let forceReExtract = false;

    try {
      const body = await req.json();
      if (body?.batch_size) batchSize = Math.min(body.batch_size, 5);
      if (body?.design_types) designTypes = body.design_types;
      if (body?.file_ids) fileIds = body.file_ids;
      if (body?.force) forceReExtract = true;
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

    // Get files needing extraction
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
      .limit(200);

    if (queryError) throw queryError;

    // Filter: needs extraction if no color_palette or forced
    const needsExtraction = (files ?? []).filter((f: any) => {
      if (forceReExtract) return true;
      if (!f.design_data) return true;
      const dd = f.design_data;
      // Re-extract if no deep data (color_palette is the marker)
      return !dd.color_palette || dd.color_palette.length === 0;
    });

    const batch = needsExtraction.slice(0, batchSize);
    const results: any[] = [];
    const allErrors: string[] = [];

    console.log(`Deep extracting ${batch.length} of ${needsExtraction.length} files`);

    for (const file of batch) {
      console.log(`Deep extracting: ${file.name} (${file.figma_file_key})`);

      const { design_data, errors } = await extractDesignData(
        file.figma_file_key,
        FIGMA_ACCESS_TOKEN,
        sb,
        supabaseUrl
      );

      allErrors.push(...errors);

      const summary = design_data._extraction_summary ?? {};

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
        ...summary,
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
