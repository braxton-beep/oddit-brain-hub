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
    const { url, clientName } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY is not configured");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Format URL
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
      formattedUrl = `https://${formattedUrl}`;
    }

    // Create audit record
    const { data: audit, error: insertError } = await supabase
      .from("cro_audits")
      .insert({ shop_url: formattedUrl, client_name: clientName || "", status: "scraping" })
      .select()
      .single();

    if (insertError) throw new Error(`DB insert failed: ${insertError.message}`);
    const auditId = audit.id;

    // Step 1: Scrape with Firecrawl (screenshot + markdown)
    console.log("Scraping:", formattedUrl);
    const scrapeResp = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: ["markdown", "screenshot"],
        waitFor: 3000,
      }),
    });

    const scrapeData = await scrapeResp.json();
    if (!scrapeResp.ok) {
      console.error("Firecrawl error:", scrapeData);
      await supabase.from("cro_audits").update({ status: "failed" }).eq("id", auditId);
      return new Response(JSON.stringify({ error: "Failed to scrape the website", auditId }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const markdown = scrapeData.data?.markdown || scrapeData.markdown || "";
    const screenshotBase64 = scrapeData.data?.screenshot || scrapeData.screenshot || "";

    // Upload screenshot to storage if available
    let screenshotUrl = "";
    if (screenshotBase64) {
      try {
        // Remove data URL prefix if present
        const base64Data = screenshotBase64.replace(/^data:image\/\w+;base64,/, "");
        const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

        const { error: uploadError } = await supabase.storage
          .from("audit-assets")
          .upload(`screenshots/${auditId}.png`, binaryData, {
            contentType: "image/png",
            upsert: true,
          });

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from("audit-assets")
            .getPublicUrl(`screenshots/${auditId}.png`);
          screenshotUrl = urlData.publicUrl;
        }
      } catch (e) {
        console.error("Screenshot upload error:", e);
      }
    }

    // Update status to analyzing
    await supabase
      .from("cro_audits")
      .update({ status: "analyzing", screenshot_url: screenshotUrl })
      .eq("id", auditId);

    // Step 2: Analyze with Gemini
    console.log("Analyzing with AI...");
    const truncatedMarkdown = markdown.slice(0, 15000); // Keep within context limits

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are an elite CRO (Conversion Rate Optimization) expert at Oddit, a top-tier agency that has completed 11,000+ audits. You analyze e-commerce websites and identify specific UI/UX improvements that will increase conversion rates.

Your task: Analyze the provided website content and return EXACTLY 10 specific, actionable CRO recommendations. Each recommendation should identify a specific section or element on the site that can be improved.

You MUST respond with valid JSON only — no markdown, no code fences, no explanation text. Return this exact structure:
{
  "recommendations": [
    {
      "id": 1,
      "section": "Name of the page section (e.g., Hero Banner, Product Cards, Navigation, Footer CTA)",
      "severity": "high" | "medium" | "low",
      "current_issue": "Detailed description of what's currently wrong or suboptimal (the 'before' state). Be specific about the element, its placement, and why it hurts conversions.",
      "recommended_change": "Detailed description of what the improved version should look like (the 'after' state). Include specific design recommendations like layout, copy changes, color usage, CTA placement.",
      "expected_impact": "Estimated conversion impact (e.g., '+12-18% click-through rate on hero CTA')",
      "mockup_prompt": "A detailed image generation prompt that would create a clean, professional UI mockup of the IMPROVED version of this section. Describe colors, layout, typography, and key elements. Start with 'A professional e-commerce website section mockup showing...'",
      "scroll_percentage": 0
    }
  ]
}

Guidelines:
- Focus on above-the-fold content, CTAs, trust signals, social proof, navigation, product presentation, and checkout friction
- Be extremely specific — reference actual text, images, or layout patterns from the scraped content
- Order by severity (high impact first)
- The mockup_prompt should describe a realistic, professional web design mockup
- scroll_percentage: estimate what percentage down the page (0-100) this section lives. Hero/nav = 0-10, above fold features = 10-25, mid-page = 25-60, lower sections = 60-85, footer = 85-100`,
          },
          {
            role: "user",
            content: `Analyze this e-commerce website and provide 10 CRO recommendations.\n\nURL: ${formattedUrl}\n\nPage content:\n${truncatedMarkdown}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "cro_recommendations",
              description: "Return 10 CRO recommendations for the website",
              parameters: {
                type: "object",
                properties: {
                  recommendations: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "number" },
                        section: { type: "string" },
                        severity: { type: "string", enum: ["high", "medium", "low"] },
                        current_issue: { type: "string" },
                        recommended_change: { type: "string" },
                        expected_impact: { type: "string" },
                        mockup_prompt: { type: "string" },
                        scroll_percentage: { type: "number" },
                      },
                      required: ["id", "section", "severity", "current_issue", "recommended_change", "expected_impact", "mockup_prompt", "scroll_percentage"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["recommendations"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "cro_recommendations" } },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI error:", aiResp.status, errText);
      if (aiResp.status === 429) {
        await supabase.from("cro_audits").update({ status: "failed" }).eq("id", auditId);
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly.", auditId }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        await supabase.from("cro_audits").update({ status: "failed" }).eq("id", auditId);
        return new Response(JSON.stringify({ error: "AI usage limit reached.", auditId }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await supabase.from("cro_audits").update({ status: "failed" }).eq("id", auditId);
      return new Response(JSON.stringify({ error: "AI analysis failed", auditId }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    let recommendations = [];

    // Extract from tool call response
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        recommendations = parsed.recommendations || [];
      } catch (e) {
        console.error("Failed to parse tool call:", e);
      }
    }

    // Fallback: try parsing content directly
    if (recommendations.length === 0) {
      const content = aiData.choices?.[0]?.message?.content;
      if (content) {
        try {
          const parsed = JSON.parse(content);
          recommendations = parsed.recommendations || [];
        } catch (e) {
          console.error("Failed to parse content:", e);
        }
      }
    }

    // Step 3: Capture targeted section screenshots per recommendation
    if (recommendations.length > 0) {
      console.log("Capturing targeted section screenshots...");
      await supabase.from("cro_audits").update({ status: "screenshotting" }).eq("id", auditId);

      // Use Firecrawl's actions API to scroll to each section before screenshotting
      // We batch by deduped scroll positions to reduce API calls (within 10% proximity = same shot)
      const screenshotPromises = recommendations.map(async (rec: any) => {
        const scrollPct = typeof rec.scroll_percentage === "number"
          ? Math.max(0, Math.min(100, rec.scroll_percentage))
          : 0;

        try {
          const scrapePayload: any = {
            url: formattedUrl,
            formats: ["screenshot"],
            waitFor: 2000,
            actions: [
              { type: "wait", milliseconds: 1500 },
              { type: "scroll", direction: "down", amount: Math.round(scrollPct * 80) }, // approx pixel offset
              { type: "wait", milliseconds: 800 },
            ],
          };

          const resp = await fetch("https://api.firecrawl.dev/v1/scrape", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(scrapePayload),
          });

          if (!resp.ok) {
            console.warn(`Section screenshot failed for rec ${rec.id}: ${resp.status}`);
            return { recId: rec.id, url: null };
          }

          const data = await resp.json();
          const base64 = data.data?.screenshot || data.screenshot || "";
          if (!base64) return { recId: rec.id, url: null };

          const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, "");
          const binary = Uint8Array.from(atob(cleanBase64), (c) => c.charCodeAt(0));
          const filePath = `screenshots/${auditId}/rec-${rec.id}.png`;

          const { error: upErr } = await supabase.storage
            .from("audit-assets")
            .upload(filePath, binary, { contentType: "image/png", upsert: true });

          if (upErr) {
            console.warn(`Upload failed for rec ${rec.id}:`, upErr.message);
            return { recId: rec.id, url: null };
          }

          const { data: urlData } = supabase.storage.from("audit-assets").getPublicUrl(filePath);
          return { recId: rec.id, url: urlData.publicUrl };
        } catch (e) {
          console.warn(`Section screenshot error for rec ${rec.id}:`, e);
          return { recId: rec.id, url: null };
        }
      });

      // Run up to 3 at a time to avoid hammering Firecrawl
      const results: { recId: number; url: string | null }[] = [];
      for (let i = 0; i < screenshotPromises.length; i += 3) {
        const batch = await Promise.all(screenshotPromises.slice(i, i + 3));
        results.push(...batch);
      }

      // Attach section_screenshot_url to each recommendation
      const screenshotMap = new Map(results.map((r) => [r.recId, r.url]));
      recommendations = recommendations.map((rec: any) => ({
        ...rec,
        section_screenshot_url: screenshotMap.get(rec.id) || null,
      }));

      console.log(`Section screenshots done: ${results.filter((r) => r.url).length}/${results.length} successful`);
    }

    // Save recommendations to DB
    await supabase
      .from("cro_audits")
      .update({
        status: "completed",
        recommendations: recommendations,
      })
      .eq("id", auditId);

    console.log(`Audit ${auditId} completed with ${recommendations.length} recommendations`);

    return new Response(
      JSON.stringify({
        auditId,
        status: "completed",
        screenshotUrl,
        recommendations,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-cro-audit error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
