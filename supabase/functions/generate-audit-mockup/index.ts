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

    // Fetch audit with all context
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

    // ── Parallel context fetches ──────────────────────────
    const contextPromises: Record<string, Promise<any>> = {};

    // Oddit Score
    contextPromises.odditScore = supabase
      .from("oddit_scores")
      .select("*")
      .eq("cro_audit_id", auditId)
      .limit(1);

    // Brand assets + Figma Design DNA (need client lookup first)
    if (audit.client_name) {
      contextPromises.clientLookup = supabase
        .from("clients")
        .select("id")
        .ilike("name", audit.client_name)
        .limit(1);

      // Figma Design DNA — extract from figma_files with design_data
      contextPromises.figmaDesignDNA = supabase
        .from("figma_files")
        .select("name, design_type, design_data, figma_url, thumbnail_url")
        .ilike("client_name", audit.client_name)
        .eq("enabled", true)
        .not("design_data", "eq", "{}")
        .order("last_modified", { ascending: false })
        .limit(10);

      // Section screenshots for this client
      contextPromises.sectionScreenshots = supabase
        .from("setup_screenshots")
        .select("section_name, device_type, storage_url, full_screenshot_url, y_start_pct, y_end_pct")
        .ilike("client_name", audit.client_name)
        .eq("device_type", "desktop")
        .order("section_order", { ascending: true });

      // Competitor intel for visual references (#3)
      contextPromises.competitorIntel = supabase
        .from("competitive_intel")
        .select("competitor_url, findings")
        .ilike("client_name", audit.client_name)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(3);
    }

    // Recommendation insights — effectiveness-weighted (converted > implemented > frequency)
    if (targetRec) {
      contextPromises.recTemplates = supabase
        .from("recommendation_insights")
        .select("recommendation_text, template_content, category, frequency_count, effectiveness_score, converted_count, implemented_count, skipped_count")
        .order("effectiveness_score", { ascending: false })
        .limit(30);
    }

    // Design language profiles for same-client + same-industry files
    if (audit.client_name) {
      contextPromises.designProfiles = supabase
        .from("figma_files")
        .select("name, client_name, design_type, design_data")
        .eq("enabled", true)
        .not("design_data->design_language_profile", "is", null)
        .order("last_modified", { ascending: false })
        .limit(20);
    }

    // Starred mockup references — find high-rated mockups from past audits
    contextPromises.starredMockups = supabase
      .from("cro_audits")
      .select("recommendations")
      .eq("status", "completed")
      .neq("id", auditId)
      .order("created_at", { ascending: false })
      .limit(20);

    const resolved = await Promise.all(
      Object.entries(contextPromises).map(async ([key, promise]) => [key, await promise] as const)
    );
    const ctx: Record<string, any> = Object.fromEntries(resolved);

    // ── Build Oddit Score context ──────────────────────────
    let odditScoreContext = "";
    if (ctx.odditScore?.data?.length) {
      const s = ctx.odditScore.data[0];
      odditScoreContext = `\nOddit Score: ${s.total_score}/100 — Visual Hierarchy: ${s.visual_hierarchy}, Clarity: ${s.clarity_value_prop}, Trust: ${s.trust_signals}, Social Proof: ${s.social_proof}, Mobile UX: ${s.mobile_ux}, Copy: ${s.copy_strength}, Funnel: ${s.funnel_logic}, Speed: ${s.speed_perception}`;
    }

    // ── Brand assets context ──────────────────────────
    let brandAssetContext = "";
    if (ctx.clientLookup?.data?.length) {
      const clientId = ctx.clientLookup.data[0].id;
      const { data: assets } = await supabase
        .from("client_brand_assets")
        .select("file_url, asset_type, file_name")
        .eq("client_id", clientId)
        .order("asset_type");

      if (assets?.length) {
        brandAssetContext = "\n\nBRAND ASSETS — You MUST incorporate these into the design to match the client's actual brand identity:\n" +
          assets.map((a: any) => `  [${a.asset_type}] ${a.file_name}: ${a.file_url}`).join("\n");
      }
    }

    // ── Figma Design DNA context (#4) ──────────────────────────
    let designDNAContext = "";
    const figmaImageUrls: string[] = [];
    if (ctx.figmaDesignDNA?.data?.length) {
      const files = ctx.figmaDesignDNA.data;
      const allColors: string[] = [];
      const allTypography: string[] = [];

      for (const f of files) {
        const dd = f.design_data as any;
        if (!dd) continue;

        // Support both property naming conventions (color_palette vs styles.colors)
        const colors = dd.color_palette || dd.styles?.colors || [];
        for (const c of colors) {
          allColors.push(`${c.name}: ${c.hex || c.rgba}`);
        }
        const typography = dd.typography || dd.styles?.typography || [];
        for (const t of typography) {
          allTypography.push(`${t.name}: ${t.fontFamily} ${t.fontWeight} ${t.fontSize}px`);
        }
        // Collect frame export URLs for visual reference (support both formats)
        const frameExports = dd.frame_exports || dd.frameExports || {};
        if (Array.isArray(frameExports)) {
          for (const fe of frameExports.slice(0, 3)) {
            if (fe.url) figmaImageUrls.push(fe.url);
          }
        } else if (typeof frameExports === "object") {
          const urls = Object.values(frameExports) as string[];
          for (const url of urls.slice(0, 3)) {
            if (url) figmaImageUrls.push(url);
          }
        }
      }

      if (allColors.length || allTypography.length) {
        designDNAContext = "\n\nDESIGN DNA FROM PAST FIGMA FILES — Use these exact colors and typography to match the brand:\n";
        if (allColors.length) {
          const unique = [...new Set(allColors)].slice(0, 20);
          designDNAContext += `  Colors: ${unique.join(", ")}\n`;
        }
        if (allTypography.length) {
          const unique = [...new Set(allTypography)].slice(0, 10);
          designDNAContext += `  Typography: ${unique.join(", ")}\n`;
        }
      }
    }

    // ── Section screenshot context (#2) ──────────────────────────
    let matchedSectionScreenshotUrl: string | null = null;
    if (ctx.sectionScreenshots?.data?.length && targetRec) {
      const sections = ctx.sectionScreenshots.data;
      // Try to match by section name
      const sectionName = (targetRec.section || "").toLowerCase();
      const match = sections.find((s: any) =>
        sectionName.includes(s.section_name.toLowerCase()) ||
        s.section_name.toLowerCase().includes(sectionName.split(" ")[0])
      );
      if (match?.storage_url) {
        matchedSectionScreenshotUrl = match.storage_url;
      }
    }

    // ── Build section context ──────────────────────────
    let sectionContext = "";
    if (targetRec) {
      sectionContext = `
SECTION CONTEXT:
- Page Section: ${targetRec.section}
- Severity: ${targetRec.severity} priority
- AIDA Stage: ${targetRec.aida_stage || "unknown"}
- Priority Score: ${targetRec.priority_score || "N/A"}/100
- Scroll Position: ~${targetRec.scroll_percentage ?? 0}% down the page
- Current Issue: ${targetRec.current_issue}
- Recommended Change: ${targetRec.recommended_change}
- CRO Rationale: ${targetRec.cro_rationale || ""}
- Competitor Reference: ${targetRec.competitor_reference || ""}
- Expected Impact: ${targetRec.expected_impact || ""}`;
    }

    // ── Competitor context ──────────────────────────
    let competitorContext = "";
    if (ctx.competitorIntel?.data?.length) {
      const insights: string[] = [];
      for (const ci of ctx.competitorIntel.data) {
        const f = ci.findings as any;
        if (!f) continue;
        const patterns = f.design_patterns || f.designPatterns || [];
        const copy = f.copy_frameworks || f.copyFrameworks || [];
        if (patterns.length || copy.length) {
          insights.push(`Competitor ${ci.competitor_url}: Design patterns: ${(patterns as string[]).slice(0, 5).join(", ")}. Copy: ${(copy as string[]).slice(0, 3).join(", ")}`);
        }
      }
      if (insights.length) {
        competitorContext = "\n\nCOMPETITOR BEST PRACTICES — Reference these patterns from top performers in the same vertical:\n" + insights.join("\n");
      }
    }

    // ── Recommendation prompt templates ──────────────────────────
    let templateContext = "";
    if (ctx.recTemplates?.data?.length && targetRec) {
      const recText = (targetRec.recommended_change || "").toLowerCase();
      const match = ctx.recTemplates.data.find((t: any) =>
        recText.includes(t.category.toLowerCase()) ||
        t.recommendation_text.toLowerCase().split(" ").some((word: string) => word.length > 4 && recText.includes(word))
      );
      if (match?.template_content) {
        templateContext = `\n\nPROVEN TEMPLATE (used ${match.frequency_count}x across clients):\n${match.template_content}`;
      }
    }

    // ── Starred mockup references ──────────────────────────
    const starredMockupUrls: string[] = [];
    if (ctx.starredMockups?.data?.length) {
      for (const a of ctx.starredMockups.data) {
        const aRecs = (a.recommendations as any[]) || [];
        for (const r of aRecs) {
          if (r.mockup_rating >= 4 && r.mockup_url) {
            starredMockupUrls.push(r.mockup_url);
          }
        }
        if (starredMockupUrls.length >= 5) break;
      }
    }
    let refinementContext = "";
    if (refinementNotes && previousMockupUrl) {
      refinementContext = `\n\nITERATIVE REFINEMENT — A previous mockup was generated and the designer wants changes:
Designer feedback: "${refinementNotes}"
You MUST use the previous mockup as your starting point and apply ONLY the requested changes. Do not redesign from scratch.`;
    }

    // ── System prompt ──────────────────────────
    const systemPrompt = `You are a world-class e-commerce UI/UX designer creating PHOTOREALISTIC high-fidelity mockup concepts for CRO recommendations. Your output must look indistinguishable from a real, polished Shopify store — not a wireframe, not a template, not a flat design.

PHOTOREALISM RULES:
1. **Match the EXISTING site's aesthetic PRECISELY.** Study the homepage screenshot: its color palette, typography hierarchy, spacing rhythm, shadow depth, border-radius patterns, gradient angles, and image treatment. Your mockup must look like the store's own design team made it.
2. **Use REAL visual fidelity.** Include subtle shadows (box-shadow with 2-4 layers), proper line-height, anti-aliased text, realistic product photography placeholders, hover state indicators, proper padding/margin rhythm, and micro-interactions cues.
3. **Section-specific focus.** Design ONLY the section being improved. Show it at the correct viewport width (1440px desktop or 390px mobile). Include 40px of neighboring sections above and below for context.
4. **REALISTIC content.** Use plausible brand copy (not lorem ipsum), realistic price points ($24-$198 range), actual-looking star ratings (4.7/5), review counts (2,847 reviews), and product names that feel authentic.
5. **Mobile-first precision.** 48px min tap targets, proper safe areas, readable 16px+ body text, natural thumb-zone placement for CTAs.
6. **Show the AFTER state only** — this is the improved, conversion-optimized version.
7. **Typography must be sharp.** Use clear font weight hierarchy: 700-800 for headlines, 600 for subheads, 400 for body. Ensure proper contrast ratios (4.5:1 min for body text).
8. **Color accuracy.** When brand colors are provided from Design DNA, use EXACTLY those hex values. Don't approximate — match precisely.
${numVariants > 1 ? `9. Create variant #\${VARIANT_NUM} — vary the layout approach while keeping the same recommendation intent.` : ""}
${starredMockupUrls.length > 0 ? "10. REFERENCE MOCKUPS are provided — study their quality level, composition, and polish. Your output should match or exceed this standard." : ""}
${competitorContext}${templateContext}
${refinementContext}`;

    // ── Build user message with visual inputs ──────────────────────────
    const userContent: any[] = [];

    // Previous mockup as visual input for refinement (#3)
    if (previousMockupUrl && refinementNotes) {
      userContent.push(
        { type: "image_url", image_url: { url: previousMockupUrl } },
        { type: "text", text: "Above is the PREVIOUS mockup. Apply the designer's refinement feedback to improve it. Keep the same general approach but incorporate the requested changes." }
      );
    }

    // Homepage screenshot
    if (audit.screenshot_url) {
      userContent.push(
        { type: "image_url", image_url: { url: audit.screenshot_url } },
        { type: "text", text: "Above is the CURRENT homepage of the store. Study its design language, color palette, typography, and visual style. Your mockup must look like it belongs on this same site." }
      );
    }

    // Section screenshot from setup_screenshots (#2)
    if (matchedSectionScreenshotUrl) {
      userContent.push(
        { type: "image_url", image_url: { url: matchedSectionScreenshotUrl } },
        { type: "text", text: `Above is the CURRENT state of the "${targetRec?.section}" section captured from the live site. Your mockup should show the IMPROVED version of this exact section.` }
      );
    } else if (targetRec?.section_screenshot_url) {
      // Fallback to recommendation-level screenshot
      userContent.push(
        { type: "image_url", image_url: { url: targetRec.section_screenshot_url } },
        { type: "text", text: `Above is the CURRENT state of the "${targetRec.section}" section. Your mockup should show the IMPROVED version of this exact section.` }
      );
    }

    // Figma Design DNA frame exports as visual reference (#4)
    for (const imgUrl of figmaImageUrls.slice(0, 4)) {
      userContent.push(
        { type: "image_url", image_url: { url: imgUrl } },
      );
    }
    if (figmaImageUrls.length > 0) {
      userContent.push({
        type: "text",
        text: `Above are ${figmaImageUrls.length} frame exports from past Figma designs for this client. Match their visual style, layout patterns, and design language.`,
      });
    }

    // Starred reference mockups as visual quality benchmarks (#1)
    for (const starUrl of starredMockupUrls.slice(0, 3)) {
      userContent.push({ type: "image_url", image_url: { url: starUrl } });
    }
    if (starredMockupUrls.length > 0) {
      userContent.push({
        type: "text",
        text: `Above are ${starredMockupUrls.length} STARRED reference mockups rated as top quality by the design team. Match this level of polish, composition, and detail.`,
      });
    }

    // Text context
    userContent.push({
      type: "text",
      text: `Store: ${audit.shop_url} | Client: ${audit.client_name}${odditScoreContext}${sectionContext}${brandAssetContext}${designDNAContext}

DESIGN BRIEF:
${mockupPrompt}`,
    });

    console.log(`Generating ${numVariants} ${useProModel ? "FINAL" : "draft"} mockup(s) for audit ${auditId}, rec ${recommendationId}. Model: ${modelId}. Starred refs: ${starredMockupUrls.length}, Figma: ${figmaImageUrls.length}, Competitor: ${!!competitorContext}`);

    // ── Generate variants ──────────────────────────
    const variants: { url: string; variantIndex: number }[] = [];

    for (let v = 0; v < numVariants; v++) {
      const variantPrompt = numVariants > 1
        ? systemPrompt.replace("${VARIANT_NUM}", String(v + 1)) +
          `\n\nThis is variant ${v + 1} of ${numVariants}. ${v === 0 ? "Use the most conventional layout approach." : v === 1 ? "Try a bolder, more experimental layout." : "Try a minimal, clean alternative."}`
        : systemPrompt;

      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: "system", content: variantPrompt },
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
            // Keep history for refinement
            mockup_history: [
              ...((r.mockup_history as string[]) || []),
              ...(r.mockup_url && !refinementNotes ? [] : r.mockup_url ? [r.mockup_url] : []),
            ],
          }
        : r
    );
    await supabase.from("cro_audits").update({ recommendations: updatedRecs }).eq("id", auditId);

    console.log(`Generated ${variants.length} mockup variant(s) for rec ${recommendationId}`);

    return new Response(
      JSON.stringify({
        mockupUrl: primaryUrl,
        variants: variants.map((v) => v.url),
        figmaImagesUsed: figmaImageUrls.length,
        sectionScreenshotUsed: !!matchedSectionScreenshotUrl,
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
