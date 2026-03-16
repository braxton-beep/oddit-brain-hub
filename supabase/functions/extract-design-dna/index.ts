import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIGMA_API_BASE = "https://api.figma.com/v1";

function rgbaToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function colorKey(r: number, g: number, b: number): string {
  return `${Math.round(r * 255)}-${Math.round(g * 255)}-${Math.round(b * 255)}`;
}

// ── Collect node IDs from tree (lightweight pass) ───────────────────────
function collectNodeIds(node: any, ids: string[], maxIds: number, depth = 0): void {
  if (!node || ids.length >= maxIds || depth > 6) return;
  
  // Collect frames, text nodes, rectangles, components — anything with design properties
  const interesting = ["FRAME", "TEXT", "RECTANGLE", "ELLIPSE", "COMPONENT", "COMPONENT_SET", "INSTANCE", "VECTOR", "LINE", "STAR", "POLYGON", "BOOLEAN_OPERATION"];
  if (interesting.includes(node.type) && node.id) {
    ids.push(node.id);
  }

  if (node.children) {
    for (const child of node.children) {
      collectNodeIds(child, ids, maxIds, depth + 1);
    }
  }
}

// ── Walk a fully-detailed node tree to extract design tokens ────────────
function walkDetailedNode(
  node: any,
  colors: Map<string, any>,
  fonts: Map<string, any>,
  textSamples: any[],
  components: Map<string, any>,
  spacingValues: number[],
  cornerRadii: number[],
  depth = 0
): void {
  if (!node || depth > 10) return;

  // Colors from fills
  if (node.fills && Array.isArray(node.fills)) {
    for (const fill of node.fills) {
      if (fill.visible === false || fill.type !== "SOLID" || !fill.color) continue;
      const { r, g, b } = fill.color;
      const key = colorKey(r, g, b);
      const ex = colors.get(key);
      const ctx = node.name || "unnamed";
      if (ex) { ex.count++; if (ex.contexts.length < 5 && !ex.contexts.includes(ctx)) ex.contexts.push(ctx); }
      else colors.set(key, { hex: rgbaToHex(r, g, b), r: Math.round(r*255), g: Math.round(g*255), b: Math.round(b*255), count: 1, contexts: [ctx] });
    }
  }

  // Colors from strokes
  if (node.strokes && Array.isArray(node.strokes)) {
    for (const stroke of node.strokes) {
      if (stroke.visible === false || stroke.type !== "SOLID" || !stroke.color) continue;
      const { r, g, b } = stroke.color;
      const key = `s-${colorKey(r, g, b)}`;
      const ex = colors.get(key);
      if (ex) ex.count++;
      else colors.set(key, { hex: rgbaToHex(r, g, b), r: Math.round(r*255), g: Math.round(g*255), b: Math.round(b*255), count: 1, contexts: [`stroke:${node.name||"unnamed"}`] });
    }
  }

  // Typography
  if (node.type === "TEXT" && node.style) {
    const s = node.style;
    const fk = `${s.fontFamily}-${s.fontWeight}-${s.fontSize}`;
    const ex = fonts.get(fk);
    const ctx = node.name || "unnamed";
    if (ex) { ex.count++; if (ex.contexts.length < 5 && !ex.contexts.includes(ctx)) ex.contexts.push(ctx); }
    else fonts.set(fk, { fontFamily: s.fontFamily, fontWeight: s.fontWeight, fontSize: s.fontSize, lineHeight: s.lineHeightPx, letterSpacing: s.letterSpacing, count: 1, contexts: [ctx] });

    if (node.characters && node.characters.length > 3 && textSamples.length < 30) {
      textSamples.push({ text: node.characters.slice(0, 200), fontFamily: s.fontFamily, fontSize: s.fontSize, fontWeight: s.fontWeight, nodeName: node.name || "unnamed" });
    }
  }

  // Components
  if (node.type === "COMPONENT" || node.type === "COMPONENT_SET" || node.type === "INSTANCE") {
    const cn = node.name || "unnamed";
    const ex = components.get(cn);
    if (ex) ex.count++;
    else components.set(cn, { name: cn, type: node.type, count: 1 });
  }

  // Spacing from auto-layout
  if (node.layoutMode) {
    if (node.itemSpacing) spacingValues.push(node.itemSpacing);
    if (node.paddingTop) spacingValues.push(node.paddingTop);
    if (node.paddingBottom) spacingValues.push(node.paddingBottom);
    if (node.paddingLeft) spacingValues.push(node.paddingLeft);
    if (node.paddingRight) spacingValues.push(node.paddingRight);
  }

  // Corner radius
  if (node.cornerRadius && node.cornerRadius > 0) cornerRadii.push(node.cornerRadius);

  // Recurse
  if (node.children) for (const child of node.children) walkDetailedNode(child, colors, fonts, textSamples, components, spacingValues, cornerRadii, depth + 1);
}

// ── Main extraction for one file ────────────────────────────────────────
async function extractDesignData(
  fileKey: string,
  token: string,
  sb: any,
  supabaseUrl: string
): Promise<{ design_data: Record<string, any>; errors: string[] }> {
  const errors: string[] = [];
  const designData: Record<string, any> = {};
  const headers = { "X-Figma-Token": token };

  // STEP 1: Lightweight file fetch (depth=2) to get structure + discover node IDs
  const fileRes = await fetch(`${FIGMA_API_BASE}/files/${fileKey}?depth=2`, { headers });
  if (!fileRes.ok) {
    const text = await fileRes.text();
    if (fileRes.status === 400 && text.includes("not supported")) {
      return { design_data: { _unsupported_file_type: true }, errors: [] };
    }
    errors.push(`File fetch: ${fileRes.status} - ${text.slice(0, 200)}`);
    return { design_data: designData, errors };
  }
  const fileData = await fileRes.json();

  // Build page/frame structure and collect node IDs for deep query
  const pages: any[] = [];
  const topFrameIds: string[] = [];
  const allNodeIds: string[] = [];

  for (const page of fileData.document?.children ?? []) {
    const frames: any[] = [];
    for (const child of (page.children ?? []).slice(0, 30)) {
      if (child.type === "FRAME" || child.type === "COMPONENT" || child.type === "COMPONENT_SET") {
        frames.push({ id: child.id, name: child.name, type: child.type, width: child.absoluteBoundingBox?.width, height: child.absoluteBoundingBox?.height });
        if (topFrameIds.length < 8) topFrameIds.push(child.id);
        // Collect this frame's ID for deep query
        if (allNodeIds.length < 50) allNodeIds.push(child.id);
      }
    }
    pages.push({ name: page.name, frameCount: frames.length, frames });
  }
  designData.pages = pages;

  // Published styles
  const styles = fileData.styles ?? {};
  const publishedStyles: Record<string, any[]> = { fills: [], text: [], effects: [], grids: [] };
  for (const [nodeId, meta] of Object.entries(styles)) {
    const m = meta as any;
    const cat = m.style_type?.toLowerCase() ?? "other";
    const entry = { nodeId, name: m.name, description: m.description };
    if (cat === "fill") publishedStyles.fills.push(entry);
    else if (cat === "text") publishedStyles.text.push(entry);
    else if (cat === "effect") publishedStyles.effects.push(entry);
    else if (cat === "grid") publishedStyles.grids.push(entry);
  }
  designData.published_styles = publishedStyles;

  // STEP 2: Deep query — fetch full node details for top frames
  // The /nodes endpoint returns FULL properties including fills, strokes, styles
  const colors = new Map<string, any>();
  const fonts = new Map<string, any>();
  const textSamples: any[] = [];
  const components = new Map<string, any>();
  const spacingValues: number[] = [];
  const cornerRadii: number[] = [];

  // Query nodes ONE AT A TIME to avoid massive responses
  const startTime = Date.now();
  const MAX_TIME_MS = 20000; // 20s budget for node queries

  for (const nodeId of allNodeIds.slice(0, 10)) {
    if (Date.now() - startTime > MAX_TIME_MS) {
      console.log(`Time budget exceeded after ${allNodeIds.indexOf(nodeId)} nodes`);
      break;
    }

    try {
      const nodesRes = await fetch(
        `${FIGMA_API_BASE}/files/${fileKey}/nodes?ids=${nodeId}&depth=4`,
        { headers }
      );

      if (nodesRes.ok) {
        const nodesData = await nodesRes.json();
        for (const [_nid, nodeInfo] of Object.entries(nodesData.nodes ?? {})) {
          const doc = (nodeInfo as any)?.document;
          if (!doc) continue;
          walkDetailedNode(doc, colors, fonts, textSamples, components, spacingValues, cornerRadii, 0);
        }
        console.log(`Node ${nodeId}: ${colors.size} colors, ${fonts.size} fonts so far`);
      } else {
        errors.push(`Node ${nodeId}: ${nodesRes.status}`);
      }
    } catch (err) {
      errors.push(`Node ${nodeId}: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  // Process collected design tokens
  const allColors = Array.from(colors.values()).sort((a, b) => b.count - a.count).slice(0, 40);
  designData.color_palette = allColors;

  const allFonts = Array.from(fonts.values()).sort((a, b) => b.count - a.count).slice(0, 25);
  designData.typography = allFonts;
  designData.font_families = [...new Set(allFonts.map(f => f.fontFamily))];
  designData.font_size_scale = [...new Set(allFonts.map(f => f.fontSize))].sort((a, b) => a - b);
  designData.text_samples = textSamples;

  const allComps = Array.from(components.values()).sort((a, b) => b.count - a.count).slice(0, 30);
  designData.components = allComps;

  // Spacing scale
  const spacingCounts = new Map<number, number>();
  for (const s of spacingValues) spacingCounts.set(s, (spacingCounts.get(s) ?? 0) + 1);
  designData.spacing_scale = Array.from(spacingCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([value, count]) => ({ value, count }));

  // Corner radius patterns
  const radiusCounts = new Map<number, number>();
  for (const r of cornerRadii) radiusCounts.set(r, (radiusCounts.get(r) ?? 0) + 1);
  designData.corner_radii = Array.from(radiusCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([value, count]) => ({ value, count }));

  // STEP 3: Export key frames as PNGs
  if (topFrameIds.length > 0) {
    const idsParam = topFrameIds.join(",");
    const imgRes = await fetch(`${FIGMA_API_BASE}/images/${fileKey}?ids=${idsParam}&format=png&scale=2`, { headers });

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

          const { error: uploadError } = await sb.storage.from("figma-exports").upload(storagePath, imgBlob, { contentType: "image/png", upsert: true });
          if (uploadError) errors.push(`Upload ${storagePath}: ${uploadError.message}`);
          else frameExports[nodeId] = `${supabaseUrl}/storage/v1/object/public/figma-exports/${storagePath}`;
        } catch (dlErr) {
          errors.push(`Download frame ${nodeId}: ${dlErr instanceof Error ? dlErr.message : "unknown"}`);
        }
      }
      designData.frame_exports = frameExports;
    } else {
      errors.push(`Frame export: ${imgRes.status}`);
    }
  }

  // Summary
  designData._extracted = true;
  designData._extraction_summary = {
    total_colors: allColors.length,
    total_fonts: allFonts.length,
    font_families: designData.font_families.length,
    components_found: allComps.length,
    text_samples: textSamples.length,
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

    let batchSize = 2;
    let designTypes = ["oddit_report", "landing_page", "new_site_design"];
    let fileIds: string[] | null = null;
    let forceReExtract = false;

    try {
      const body = await req.json();
      if (body?.batch_size) batchSize = Math.min(body.batch_size, 5);
      if (body?.design_types) designTypes = body.design_types;
      if (body?.file_ids) fileIds = body.file_ids;
      if (body?.force) forceReExtract = true;
    } catch { /* defaults */ }

    // Resolve Figma token
    let FIGMA_ACCESS_TOKEN = Deno.env.get("FIGMA_ACCESS_TOKEN");
    if (!FIGMA_ACCESS_TOKEN) {
      const { data: cred } = await sb.from("integration_credentials").select("api_key").eq("integration_id", "figma").order("created_at", { ascending: false }).limit(1).single();
      FIGMA_ACCESS_TOKEN = cred?.api_key ?? null;
    }

    if (!FIGMA_ACCESS_TOKEN) {
      return new Response(JSON.stringify({ error: "Figma token not configured" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get files
    let query = sb.from("figma_files").select("id, figma_file_key, name, design_type, design_data").eq("enabled", true);
    if (fileIds?.length) query = query.in("id", fileIds);
    else query = query.in("design_type", designTypes);

    const { data: files, error: queryError } = await query.order("last_modified", { ascending: false }).limit(200);
    if (queryError) throw queryError;

    const needsExtraction = (files ?? []).filter((f: any) => {
      if (forceReExtract) return true;
      if (!f.design_data) return true;
      return !f.design_data._extracted;
    });

    const batch = needsExtraction.slice(0, batchSize);
    const results: any[] = [];
    const allErrors: string[] = [];

    console.log(`Deep extracting ${batch.length} of ${needsExtraction.length} files`);

    for (const file of batch) {
      console.log(`Extracting: ${file.name} (${file.figma_file_key})`);
      const { design_data, errors } = await extractDesignData(file.figma_file_key, FIGMA_ACCESS_TOKEN, sb, supabaseUrl);
      allErrors.push(...errors);

      const { error: updateError } = await sb.from("figma_files").update({ design_data }).eq("id", file.id);
      if (updateError) allErrors.push(`Update ${file.name}: ${updateError.message}`);

      results.push({ name: file.name, file_key: file.figma_file_key, ...(design_data._extraction_summary ?? {}), success: !updateError });
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, remaining: needsExtraction.length - batch.length, total_needing_extraction: needsExtraction.length, results, errors: allErrors.length > 0 ? allErrors : undefined }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("extract-design-dna error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
