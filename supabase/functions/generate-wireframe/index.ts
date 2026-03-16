import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, supabaseKey);

  try {
    const { client_name, site_url, asana_notes, asana_task_gid, setup_run_id } = await req.json();

    if (!client_name) {
      return new Response(JSON.stringify({ error: "client_name is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create the brief record
    const { data: brief, error: insertErr } = await sb
      .from("wireframe_briefs")
      .insert({
        client_name,
        site_url: site_url || null,
        asana_notes: asana_notes || null,
        asana_task_gid: asana_task_gid || null,
        setup_run_id: setup_run_id || null,
        status: "generating",
      })
      .select("id")
      .single();

    if (insertErr) throw insertErr;
    const briefId = brief.id;

    // Scrape the client's site for brand context
    let scrapedContent = "";
    let brandContext: Record<string, unknown> = {};

    if (site_url) {
      const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
      if (FIRECRAWL_API_KEY) {
        try {
          const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url: site_url.trim(),
              formats: ["markdown", "branding"],
              onlyMainContent: true,
            }),
          });

          if (scrapeRes.ok) {
            const scrapeData = await scrapeRes.json();
            scrapedContent = scrapeData?.data?.markdown || scrapeData?.markdown || "";
            brandContext = scrapeData?.data?.branding || scrapeData?.branding || {};
            console.log("Scraped site successfully, markdown length:", scrapedContent.length);
          } else {
            console.error("Scrape failed:", scrapeRes.status);
          }
        } catch (e) {
          console.error("Scrape error:", e);
        }
      }
    }

    // ── Parallel context fetches: Figma DNA, brand assets, transcripts, past audits, cross-client patterns, industry design profiles ──
    const contextPromises: Record<string, Promise<any>> = {};

    if (client_name) {
      // Figma Design DNA
      contextPromises.figmaFiles = sb
        .from("figma_files")
        .select("name, design_type, design_data, figma_url, last_modified")
        .ilike("client_name", client_name)
        .eq("enabled", true)
        .not("design_data", "eq", "{}")
        .order("last_modified", { ascending: false })
        .limit(10);

      // Client lookup for brand assets
      contextPromises.clientLookup = sb
        .from("clients")
        .select("id, industry, vertical, revenue_tier")
        .ilike("name", client_name)
        .limit(1);

      // Past CRO audits for this client
      contextPromises.pastAudits = sb
        .from("cro_audits")
        .select("recommendations, shop_url")
        .ilike("client_name", client_name)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(3);

      // Fireflies onboarding transcript
      contextPromises.transcripts = sb
        .from("fireflies_transcripts")
        .select("title, summary, action_items, transcript_text, date")
        .or(`title.ilike.%${client_name}%,transcript_text.ilike.%${client_name}%`)
        .order("date", { ascending: false })
        .limit(3);
    }

    // Cross-client recommendation patterns
    contextPromises.topPatterns = sb
      .from("recommendation_insights")
      .select("recommendation_text, category, frequency_count, template_content")
      .order("frequency_count", { ascending: false })
      .limit(10);

    const resolved = await Promise.all(
      Object.entries(contextPromises).map(async ([key, promise]) => [key, await promise] as const)
    );
    const ctx: Record<string, any> = Object.fromEntries(resolved);

    // ── Build Figma Design DNA context ──
    let designDNAContext = "";
    const figmaImageUrls: string[] = [];
    if (ctx.figmaFiles?.data?.length) {
      const allColors: string[] = [];
      const allTypography: string[] = [];
      const fileParts: string[] = [];

      for (const f of ctx.figmaFiles.data) {
        const dd = f.design_data as any;
        if (!dd) continue;

        const colors = dd.color_palette || dd.styles?.colors || [];
        for (const c of colors) allColors.push(`${c.name}: ${c.hex || ""}`);

        const typo = dd.typography || dd.styles?.typography || [];
        for (const t of typo) allTypography.push(`${t.name}: ${t.fontFamily} ${t.fontWeight} ${t.fontSize}px`);

        const frameExports = dd.frame_exports || dd.frameExports || {};
        const urls = typeof frameExports === "object" ? Object.values(frameExports) : [];
        for (const url of urls.slice(0, 2)) {
          if (url && figmaImageUrls.length < 6) figmaImageUrls.push(url as string);
        }

        fileParts.push(`  • [${f.design_type}] "${f.name}"`);
      }

      designDNAContext = "\n\nDESIGN DNA FROM PAST FIGMA FILES:\n" + fileParts.join("\n");
      if (allColors.length) designDNAContext += `\n  Brand Colors: ${[...new Set(allColors)].slice(0, 15).join(", ")}`;
      if (allTypography.length) designDNAContext += `\n  Brand Typography: ${[...new Set(allTypography)].slice(0, 8).join(", ")}`;
    }

    // ── Brand assets ──
    let brandAssetContext = "";
    if (ctx.clientLookup?.data?.length) {
      const clientId = ctx.clientLookup.data[0].id;
      const { data: assets } = await sb
        .from("client_brand_assets")
        .select("file_url, asset_type, file_name")
        .eq("client_id", clientId)
        .order("asset_type");

      if (assets?.length) {
        brandAssetContext = "\n\nBRAND ASSETS:\n" +
          assets.map((a: any) => `  [${a.asset_type}] ${a.file_name}: ${a.file_url}`).join("\n");
      }
    }

    // ── Fireflies transcript context ──
    let transcriptContext = "";
    if (ctx.transcripts?.data?.length) {
      const t = ctx.transcripts.data[0]; // Most recent matching transcript
      transcriptContext = `\n\nONBOARDING CALL TRANSCRIPT (${t.title}, ${t.date ? new Date(t.date).toLocaleDateString() : "unknown date"}):\nSummary: ${t.summary || "N/A"}\nAction Items: ${t.action_items || "N/A"}`;
      if (t.transcript_text) {
        transcriptContext += `\nFull Transcript:\n${t.transcript_text.slice(0, 8000)}`;
      }
    }

    // ── Past audit recommendations ──
    let pastAuditContext = "";
    if (ctx.pastAudits?.data?.length) {
      const topRecs: string[] = [];
      for (const a of ctx.pastAudits.data) {
        for (const r of ((a.recommendations as any[]) || []).slice(0, 3)) {
          topRecs.push(`  • [${r.section}] ${r.recommended_change?.slice(0, 150) || ""}`);
        }
      }
      if (topRecs.length) {
        pastAuditContext = "\n\nPAST CRO AUDIT RECOMMENDATIONS FOR THIS CLIENT (avoid duplicating solved issues, build on these):\n" + topRecs.slice(0, 8).join("\n");
      }
    }

    // ── Cross-client patterns ──
    let crossClientContext = "";
    if (ctx.topPatterns?.data?.length) {
      crossClientContext = "\n\nPROVEN CRO PATTERNS FROM PAST AUDITS:\n" +
        ctx.topPatterns.data.map((p: any) => `  • [${p.category}] (${p.frequency_count}x): ${p.recommendation_text}`).join("\n");
    }

    // ── Industry design profiles (same client + same industry) ──
    let industryDesignContext = "";
    if (ctx.clientLookup?.data?.length) {
      const clientIndustry = ctx.clientLookup.data[0].industry;
      if (clientIndustry) {
        // Find figma files from same-industry clients that have a design_language_profile
        const { data: industryFiles } = await sb
          .from("figma_files")
          .select("name, client_name, design_data, design_type")
          .eq("enabled", true)
          .not("design_data->design_language_profile", "is", null)
          .order("last_modified", { ascending: false })
          .limit(20);

        if (industryFiles?.length) {
          // Filter to same industry by cross-referencing client names
          const { data: industryClients } = await sb
            .from("clients")
            .select("name")
            .eq("industry", clientIndustry);
          
          const industryClientNames = new Set((industryClients || []).map((c: any) => c.name.toLowerCase()));
          
          // Prioritize: same client first, then same industry
          const profiles = industryFiles
            .filter((f: any) => {
              const cn = (f.client_name || "").toLowerCase();
              return cn.includes(client_name.toLowerCase()) || industryClientNames.has(cn);
            })
            .slice(0, 3);

          if (profiles.length) {
            industryDesignContext = "\n\nDESIGN LANGUAGE PROFILES (from this client and similar brands in the same industry — use as style references):\n" +
              profiles.map((f: any) => {
                const profile = (f.design_data as any)?.design_language_profile;
                return `  • "${f.name}" (${f.client_name}, ${f.design_type}):\n    ${JSON.stringify(profile).slice(0, 800)}`;
              }).join("\n");
          }
        }
      }
    }

    // Generate the wireframe content brief via AI
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const useVisionModel = figmaImageUrls.length > 0;

    const systemPrompt = `You are a senior CRO (Conversion Rate Optimization) landing page strategist at Oddit, a Shopify-focused CRO agency with 11,000+ audits completed.

Your job: Given a client brief (from Asana notes), their existing website content, their Design DNA from past Figma files, onboarding call insights, and proven CRO patterns — generate a COMPLETE landing page wireframe content brief as structured JSON.

CRITICAL: Reference the client's actual brand colors, typography, and design patterns from the Design DNA. Your copy and layout suggestions should feel like a natural extension of their existing brand, not a generic template.

When onboarding call transcripts are provided, extract specific client goals, pain points, target audience details, and product differentiators to make the copy hyper-specific.

The output must be a JSON object with this structure:
{
  "page_title": "Proposed page title",
  "meta_description": "SEO meta description",
  "target_audience": "Who this page is for",
  "primary_goal": "Main conversion goal",
  "sections": [
    {
      "section_type": "hero|features|social_proof|benefits|faq|cta|comparison|how_it_works|testimonials|stats|gallery|newsletter",
      "section_name": "Human-readable section name",
      "layout_hint": "full_width|two_column|three_column|centered|split_image_text",
      "headline": "Section headline",
      "subheadline": "Supporting text",
      "body_copy": "Main body copy for this section",
      "cta_text": "Button text if applicable",
      "cta_url": "#",
      "image_suggestions": ["Description of what images to use"],
      "design_notes": "Layout and design guidance for the designer — reference specific brand colors and fonts"
    }
  ],
  "brand_voice_notes": "Tone and voice guidance based on the existing site and onboarding call",
  "color_recommendations": "Use the EXACT brand colors from Design DNA",
  "typography_notes": "Use the EXACT brand fonts from Design DNA"
}

Generate 6-10 sections that form a complete, high-converting landing page. Be specific with copy — write actual headlines, body text, and CTAs, not placeholders. Base everything on CRO best practices, the client's brand context, and insights from their onboarding call.`;

    const userPrompt = `Generate a landing page wireframe content brief for:

CLIENT: ${client_name}
${site_url ? `WEBSITE: ${site_url}` : ""}
${asana_notes ? `\nBRIEF/NOTES FROM TEAM:\n${asana_notes}` : ""}
${scrapedContent ? `\nEXISTING SITE CONTENT (scraped):\n${scrapedContent.slice(0, 8000)}` : ""}
${Object.keys(brandContext).length > 0 ? `\nBRAND CONTEXT:\n${JSON.stringify(brandContext, null, 2).slice(0, 3000)}` : ""}
${designDNAContext}${brandAssetContext}${transcriptContext}${pastAuditContext}${crossClientContext}

Return ONLY valid JSON. No markdown fences, no explanation.`;

    // Build multimodal content if Figma images available
    let userContent: any = userPrompt;
    if (useVisionModel) {
      const parts: any[] = [{ type: "text", text: userPrompt }];
      for (const imgUrl of figmaImageUrls) {
        parts.push({ type: "image_url", image_url: { url: imgUrl } });
      }
      parts.push({ type: "text", text: `Above are ${figmaImageUrls.length} frame exports from this client's past Figma designs. Study their visual language and design patterns — your wireframe should feel like a natural extension of these designs.` });
      userContent = parts;
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: useVisionModel ? "google/gemini-2.5-flash" : "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI error:", aiRes.status, errText);

      await sb.from("wireframe_briefs").update({
        status: "error",
        error: `AI gateway error: ${aiRes.status}`,
      }).eq("id", briefId);

      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: aiRes.status === 429 ? 429 : aiRes.status === 402 ? 402 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "";

    // Parse JSON from AI response (strip markdown fences if present)
    let sections: unknown;
    try {
      const cleaned = rawContent.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
      sections = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI JSON:", rawContent.slice(0, 500));
      await sb.from("wireframe_briefs").update({
        status: "error",
        error: "Failed to parse AI response as JSON",
        raw_scraped_content: rawContent.slice(0, 5000),
      }).eq("id", briefId);

      return new Response(JSON.stringify({ error: "AI returned invalid JSON", raw: rawContent.slice(0, 1000) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save the completed brief
    await sb.from("wireframe_briefs").update({
      status: "complete",
      sections,
      brand_context: brandContext,
      raw_scraped_content: scrapedContent.slice(0, 50000),
    }).eq("id", briefId);

    return new Response(JSON.stringify({ success: true, brief_id: briefId, sections }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-wireframe error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
