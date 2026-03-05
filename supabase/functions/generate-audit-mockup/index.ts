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
    const { auditId, recommendationId, mockupPrompt, variantCount, refinementNotes, previousMockupUrl } = await req.json();
    if (!auditId || recommendationId === undefined || !mockupPrompt) {
      return new Response(JSON.stringify({ error: "Missing auditId, recommendationId, or mockupPrompt" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const numVariants = Math.min(Math.max(variantCount || 1, 1), 3);
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
    }

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

        if (dd.styles?.colors) {
          for (const c of dd.styles.colors) {
            allColors.push(`${c.name}: ${c.hex || c.rgba}`);
          }
        }
        if (dd.styles?.typography) {
          for (const t of dd.styles.typography) {
            allTypography.push(`${t.name}: ${t.fontFamily} ${t.fontWeight} ${t.fontSize}px`);
          }
        }
        // Collect frame export URLs for visual reference
        if (dd.frameExports?.length) {
          for (const fe of dd.frameExports.slice(0, 3)) {
            if (fe.url) figmaImageUrls.push(fe.url);
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

    // ── Build refinement context (#3) ──────────────────────────
    let refinementContext = "";
    if (refinementNotes && previousMockupUrl) {
      refinementContext = `\n\nITERATIVE REFINEMENT — A previous mockup was generated and the designer wants changes:
Designer feedback: "${refinementNotes}"
You MUST use the previous mockup as your starting point and apply ONLY the requested changes. Do not redesign from scratch.`;
    }

    // ── System prompt ──────────────────────────
    const systemPrompt = `You are a senior e-commerce UI/UX designer creating HIGH-FIDELITY mockup concepts for CRO recommendations. Your output should look like a real Shopify store section — not a wireframe, not a generic template.

DESIGN RULES:
1. Match the EXISTING site's aesthetic. If a homepage screenshot is provided, study its color palette, typography style, spacing patterns, and visual language. Your mockup should look like a natural improvement of the SAME store.
2. Focus on the SPECIFIC section mentioned. Don't design a full page — design just the section being improved (e.g., just the hero, just the PDP trust signals, just the mobile nav).
3. Use REALISTIC content — actual product photo placeholders, real-looking prices, genuine-feeling copy. No lorem ipsum.
4. Follow MOBILE-FIRST principles: 48px min tap targets, readable text without zooming, proper thumb-zone placement.
5. Show the AFTER state only — this is what the improved section looks like after implementing the recommendation.
${numVariants > 1 ? `6. Create variant #\${VARIANT_NUM} — vary the layout approach while keeping the same recommendation intent.` : ""}
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

    // Text context
    userContent.push({
      type: "text",
      text: `Store: ${audit.shop_url} | Client: ${audit.client_name}${odditScoreContext}${sectionContext}${brandAssetContext}${designDNAContext}

DESIGN BRIEF:
${mockupPrompt}`,
    });

    console.log(`Generating ${numVariants} mockup variant(s) for audit ${auditId}, rec ${recommendationId}${refinementNotes ? " (refinement)" : ""}. Figma images: ${figmaImageUrls.length}, Section screenshot: ${!!matchedSectionScreenshotUrl}`);

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
          model: "google/gemini-2.5-flash-image",
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
