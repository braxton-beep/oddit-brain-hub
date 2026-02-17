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

  try {
    const { client_name, competitor_urls, client_industry } = await req.json();

    if (!client_name || !competitor_urls || !Array.isArray(competitor_urls) || competitor_urls.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing client_name or competitor_urls" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Insert pending records for each competitor URL
    const insertedIds: string[] = [];
    for (const url of competitor_urls) {
      const { data } = await sb
        .from("competitive_intel")
        .insert({ client_name, competitor_url: url, status: "analyzing" })
        .select("id")
        .single();
      if (data) insertedIds.push(data.id);
    }

    // Scrape each competitor page via Firecrawl (if available), else use URL as-is
    const scrapedData: { url: string; content: string; id: string }[] = [];

    for (let i = 0; i < competitor_urls.length; i++) {
      const url = competitor_urls[i];
      const id = insertedIds[i];
      let content = `URL: ${url}`;

      if (FIRECRAWL_API_KEY) {
        try {
          let formattedUrl = url.trim();
          if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
            formattedUrl = `https://${formattedUrl}`;
          }

          const scrapeResp = await fetch("https://api.firecrawl.dev/v1/scrape", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url: formattedUrl,
              formats: ["markdown", "summary"],
              onlyMainContent: true,
            }),
          });

          if (scrapeResp.ok) {
            const scrapeData = await scrapeResp.json();
            const markdown = scrapeData.data?.markdown || scrapeData.markdown || "";
            const summary = scrapeData.data?.summary || scrapeData.summary || "";
            content = `URL: ${url}\n\nSummary: ${summary}\n\nContent:\n${markdown.substring(0, 3000)}`;
          }
        } catch (e) {
          console.error(`Firecrawl scrape failed for ${url}:`, e);
        }
      }

      scrapedData.push({ url, content, id });
    }

    // Build analysis prompt
    const urlsContext = scrapedData
      .map((s, i) => `--- COMPETITOR ${i + 1}: ${s.url} ---\n${s.content}`)
      .join("\n\n");

    const systemPrompt = `You are a senior CRO (Conversion Rate Optimization) strategist at Oddit, a top-tier CRO agency. You specialize in analyzing competitor websites to surface design and copy patterns that clients are missing.

Analyze the provided competitor websites for a ${client_industry || "e-commerce"} client named "${client_name}".

For each competitor, extract:
1. **design_patterns**: Visual/layout patterns (hero structure, color usage, whitespace, imagery style, navigation patterns)
2. **copy_frameworks**: Messaging approaches (headlines, value props, tone, urgency tactics, benefit-focused vs feature-focused)
3. **trust_signals**: Social proof types (reviews, ratings, press logos, certifications, guarantees, customer counts)
4. **ctas**: Call-to-action strategies (button copy, placement, color contrast, micro-copy below CTAs, sticky CTAs)
5. **social_proof**: Community/UGC elements (testimonials format, star ratings placement, before/afters, influencer content)
6. **gaps_for_client**: Specific things this competitor does that "${client_name}" should consider implementing

Return a JSON object with this exact structure (no markdown, pure JSON):
{
  "competitors": [
    {
      "url": "competitor url",
      "brand_name": "extracted brand name",
      "design_patterns": ["pattern 1", "pattern 2", "pattern 3"],
      "copy_frameworks": ["framework 1", "framework 2", "framework 3"],
      "trust_signals": ["signal 1", "signal 2"],
      "ctas": ["cta pattern 1", "cta pattern 2"],
      "social_proof": ["proof type 1", "proof type 2"],
      "gaps_for_client": ["gap 1", "gap 2", "gap 3"],
      "overall_score": 85,
      "standout_feature": "The single most impressive CRO element on this site"
    }
  ],
  "client_recommendations": ["top recommendation 1", "top recommendation 2", "top recommendation 3"],
  "priority_wins": ["quick win 1", "quick win 2"]
}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze these competitor websites:\n\n${urlsContext}` },
        ],
        stream: false,
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage limit reached. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const text = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, text);
      throw new Error("AI gateway error");
    }

    const aiData = await aiResp.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "{}";

    // Parse JSON response from AI
    let findings: any = {};
    try {
      // Strip markdown code fences if present
      const cleaned = rawContent.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      findings = JSON.parse(cleaned);
    } catch {
      findings = { raw: rawContent };
    }

    // Update each competitive_intel record with findings
    const competitors = findings.competitors || [];
    for (let i = 0; i < scrapedData.length; i++) {
      const { id, url } = scrapedData[i];
      const competitorFindings = competitors[i] || { url };
      await sb
        .from("competitive_intel")
        .update({
          findings: competitorFindings,
          status: "complete",
        })
        .eq("id", id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        client_name,
        findings,
        record_ids: insertedIds,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("analyze-competitors error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
