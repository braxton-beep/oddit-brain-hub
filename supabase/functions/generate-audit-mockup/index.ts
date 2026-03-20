import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { auditId, recommendationId, mockupPrompt, variantCount, refinementNotes, previousMockupUrl, quality } = await req.json();
    if (!auditId || recommendationId === undefined || !mockupPrompt) {
      return new Response(JSON.stringify({ error: "Missing auditId, recommendationId, or mockupPrompt" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const numVariants = Math.min(Math.max(variantCount || 1, 1), 3);
    const useProModel = quality === "final";
    const modelId = useProModel ? "google/gemini-3-pro-image-preview" : "google/gemini-3.1-flash-image-preview";
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch audit
    const { data: audit } = await supabase
      .from("cro_audits")
      .select("client_name, recommendations, screenshot_url, shop_url")
      .eq("id", auditId)
      .single();

    if (!audit) {
      return new Response(JSON.stringify({ error: "Audit not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const recs = (audit.recommendations as any[]) || [];
    const targetRec = recs.find((r: any) => r.id === recommendationId);

    // ── Parallel context fetches (lightweight) ──────────────────────────
    const contextPromises: Record<string, Promise<any>> = {};

    // Section screenshots for this client
    if (audit.client_name) {
      contextPromises.sectionScreenshots = supabase
        .from("setup_screenshots")
        .select("section_name, device_type, storage_url, full_screenshot_url, y_start_pct, y_end_pct")
        .ilike("client_name", audit.client_name)
        .eq("device_type", "desktop")
        .order("section_order", { ascending: true });

      // Figma Design DNA — only colors + typography for brand matching
      contextPromises.figmaDesignDNA = supabase
        .from("figma_files")
        .select("design_data")
        .ilike("client_name", audit.client_name)
        .eq("enabled", true)
        .not("design_data", "eq", "{}")
        .order("last_modified", { ascending: false })
        .limit(5);
    }

    // Top effectiveness patterns (small set)
    if (targetRec) {
      contextPromises.recTemplates = supabase
        .from("recommendation_insights")
        .select("recommendation_text, category, effectiveness_score, converted_count")
        .order("effectiveness_score", { ascending: false })
        .limit(10);
    }

    const resolved = await Promise.all(
      Object.entries(contextPromises).map(async ([key, promise]) => [key, await promise] as const)
    );
    const ctx: Record<string, any> = Object.fromEntries(resolved);

    // ── Find the section screenshot to use as edit base ──────────────────────────
    let baseImageUrl: string | null = null;
    let editMode = false;

    // Priority 1: Refinement mode — edit previous mockup
    if (previousMockupUrl && refinementNotes) {
      baseImageUrl = previousMockupUrl;
      editMode = true;
    }

    // Priority 2: Matched section screenshot from setup_screenshots
    if (!baseImageUrl && ctx.sectionScreenshots?.data?.length && targetRec) {
      const sections = ctx.sectionScreenshots.data;
      const sectionName = (targetRec.section || "").toLowerCase();
      const match = sections.find((s: any) =>
        sectionName.includes(s.section_name.toLowerCase()) ||
        s.section_name.toLowerCase().includes(sectionName.split(" ")[0])
      );
      if (match?.storage_url) {
        baseImageUrl = match.storage_url;
        editMode = true;
      }
    }

    // Priority 3: Recommendation-level screenshot
    if (!baseImageUrl && targetRec?.section_screenshot_url) {
      baseImageUrl = targetRec.section_screenshot_url;
      editMode = true;
    }

    // Priority 4: Full homepage screenshot (will generate from scratch with reference)
    if (!baseImageUrl && audit.screenshot_url) {
      baseImageUrl = audit.screenshot_url;
      editMode = true; // Still edit — crop/modify the relevant area
    }

    // ── Extract brand colors from Design DNA (compact) ──────────────────────────
    let brandColors = "";
    if (ctx.figmaDesignDNA?.data?.length) {
      const allColors: string[] = [];
      for (const f of ctx.figmaDesignDNA.data) {
        const dd = f.design_data as any;
        if (!dd) continue;
        const colors = dd.color_palette || dd.styles?.colors || [];
        for (const c of colors) {
          allColors.push(c.hex || c.rgba);
        }
      }
      const unique = [...new Set(allColors)].filter(Boolean).slice(0, 8);
      if (unique.length) brandColors = `Brand colors: ${unique.join(", ")}. `;
    }

    // ── Find relevant proven patterns (1-2 sentences max) ──────────────────────────
    let patternHint = "";
    if (ctx.recTemplates?.data?.length && targetRec) {
      const recText = (targetRec.recommended_change || "").toLowerCase();
      const sectionName = (targetRec.section || "").toLowerCase();
      const best = ctx.recTemplates.data
        .filter((t: any) => {
          if (sectionName.includes(t.category.toLowerCase())) return true;
          const words = t.recommendation_text.toLowerCase().split(/\s+/);
          return words.some((w: string) => w.length > 4 && recText.includes(w));
        })
        .slice(0, 2);
      if (best.length) {
        patternHint = `Proven patterns: ${best.map((b: any) => b.recommendation_text).join("; ")}. `;
      }
    }

    // ── Build the edit instruction — SHORT and focused ──────────────────────────
    const changeDescription = targetRec
      ? `${targetRec.recommended_change}. Current issue: ${targetRec.current_issue}.`
      : mockupPrompt;

    const editInstruction = refinementNotes
      ? `Apply these refinements to the mockup: ${refinementNotes}`
      : `Modify this screenshot of a ${audit.client_name || ""} Shopify store section ("${targetRec?.section || "page"}") to implement this CRO improvement:

${changeDescription}

${brandColors}${patternHint}

RULES:
- Keep the existing layout structure, fonts, and brand identity intact
- Only change what's needed to implement the recommendation
- Maintain realistic e-commerce styling — this should look like a real store
- Use real-looking copy, not placeholder text
- Keep surrounding elements exactly as they are
- The result should look like a polished, production-ready store section`;

    console.log(`Generating ${numVariants} ${useProModel ? "FINAL" : "draft"} mockup(s) for audit ${auditId}, rec ${recommendationId}. Model: ${modelId}. Edit mode: ${editMode}. Base image: ${!!baseImageUrl}`);

    // ── Generate variants ──────────────────────────
    const variants: { url: string; variantIndex: number }[] = [];

    for (let v = 0; v < numVariants; v++) {
      const variantSuffix = numVariants > 1
        ? `\n\nThis is variant ${v + 1} of ${numVariants}. ${v === 0 ? "Use the most conventional approach." : v === 1 ? "Try a bolder layout variation." : "Try a minimal alternative."}`
        : "";

      // Build message content
      const userContent: any[] = [];

      if (editMode && baseImageUrl) {
        // IMAGE EDIT MODE: pass base image + edit instruction
        userContent.push(
          { type: "image_url", image_url: { url: baseImageUrl } },
          { type: "text", text: editInstruction + variantSuffix }
        );
      } else {
        // FALLBACK: generate from scratch (no base image available)
        userContent.push({
          type: "text",
          text: `Create a photorealistic mockup of a Shopify store section for ${audit.client_name || audit.shop_url}.\n\n${editInstruction}${variantSuffix}`,
        });
      }

      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            {
              role: "system",
              content: "You are an expert e-commerce UI designer. Edit the provided screenshot to implement the requested change. Keep the existing design language, colors, and layout intact. Only modify what's necessary. Output should look like a real, polished Shopify store — not a wireframe or template.",
            },
            { role: "user", content: userContent },
          ],
          modalities: ["image", "text"],
        }),
      });

      if (!aiResp.ok) {
        const errText = await aiResp.text();
        console.error(`AI image error (variant ${v + 1}):`, aiResp.status, errText);
        if (aiResp.status === 429) {
          if (variants.length > 0) break;
          return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (aiResp.status === 402) {
          if (variants.length > 0) break;
          return new Response(JSON.stringify({ error: "AI usage limit reached." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        continue;
      }

      const aiData = await aiResp.json();
      const imageUrl = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

      if (!imageUrl) {
        console.warn(`No image in variant ${v + 1}`);
        continue;
      }

      // Upload to storage
      const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, "");
      const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
      const suffix = numVariants > 1 ? `-v${v + 1}` : "";
      const timestamp = refinementNotes ? `-r${Date.now()}` : "";
      const filePath = `mockups/${auditId}/${recommendationId}${suffix}${timestamp}.png`;

      const { error: uploadError } = await supabase.storage
        .from("audit-assets")
        .upload(filePath, binaryData, { contentType: "image/png", upsert: true });

      if (uploadError) {
        console.error(`Upload error (variant ${v + 1}):`, uploadError);
        continue;
      }

      const { data: urlData } = supabase.storage.from("audit-assets").getPublicUrl(filePath);
      variants.push({ url: urlData.publicUrl, variantIndex: v });
    }

    if (variants.length === 0) {
      return new Response(JSON.stringify({ error: "No mockups could be generated" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update the recommendation
    const primaryUrl = variants[0].url;
    const updatedRecs = recs.map((r: any) =>
      r.id === recommendationId
        ? {
            ...r,
            mockup_url: primaryUrl,
            mockup_variants: variants.map((v) => v.url),
            mockup_history: [
              ...((r.mockup_history as string[]) || []),
              ...(r.mockup_url && !refinementNotes ? [] : r.mockup_url ? [r.mockup_url] : []),
            ],
          }
        : r
    );
    await supabase.from("cro_audits").update({ recommendations: updatedRecs }).eq("id", auditId);

    console.log(`Generated ${variants.length} mockup variant(s) for rec ${recommendationId}. Edit mode: ${editMode}`);

    return new Response(
      JSON.stringify({
        mockupUrl: primaryUrl,
        variants: variants.map((v) => v.url),
        editMode,
        baseImageUsed: !!baseImageUrl,
        isRefinement: !!refinementNotes,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-audit-mockup error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
