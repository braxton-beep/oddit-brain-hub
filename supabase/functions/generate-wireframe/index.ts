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

    // Generate the wireframe content brief via AI
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are a senior CRO (Conversion Rate Optimization) landing page strategist at Oddit, a Shopify-focused CRO agency.

Your job: Given a client brief (from Asana notes) and their existing website content, generate a COMPLETE landing page wireframe content brief as structured JSON.

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
      "design_notes": "Layout and design guidance for the designer"
    }
  ],
  "brand_voice_notes": "Tone and voice guidance based on the existing site",
  "color_recommendations": "Color palette suggestions based on brand",
  "typography_notes": "Font/type suggestions"
}

Generate 6-10 sections that form a complete, high-converting landing page. Be specific with copy — write actual headlines, body text, and CTAs, not placeholders. Base everything on CRO best practices and the client's brand context.`;

    const userPrompt = `Generate a landing page wireframe content brief for:

CLIENT: ${client_name}
${site_url ? `WEBSITE: ${site_url}` : ""}
${asana_notes ? `\nBRIEF/NOTES FROM TEAM:\n${asana_notes}` : ""}
${scrapedContent ? `\nEXISTING SITE CONTENT (scraped):\n${scrapedContent.slice(0, 8000)}` : ""}
${Object.keys(brandContext).length > 0 ? `\nBRAND CONTEXT:\n${JSON.stringify(brandContext, null, 2).slice(0, 3000)}` : ""}

Return ONLY valid JSON. No markdown fences, no explanation.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
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
