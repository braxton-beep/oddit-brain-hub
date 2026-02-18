import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const INDUSTRIES = [
  "Apparel & Fashion", "Beauty & Skincare", "Health & Wellness", "Food & Beverage",
  "Home & Lifestyle", "Sports & Outdoors", "Electronics & Tech", "Pets",
  "Baby & Kids", "Jewelry & Accessories", "Supplements & Nutrition",
  "CBD & Wellness", "Automotive", "Other",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY not configured");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log("Scraping:", formattedUrl);

    // Scrape the store with Firecrawl — get markdown + branding data
    const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: ["markdown", "summary"],
        onlyMainContent: true,
        waitFor: 2000,
      }),
    });

    if (!scrapeRes.ok) {
      const err = await scrapeRes.text();
      throw new Error(`Firecrawl error: ${scrapeRes.status} — ${err}`);
    }

    const scrapeData = await scrapeRes.json();
    const pageContent = scrapeData.data?.markdown || scrapeData.markdown || "";
    const pageSummary = scrapeData.data?.summary || scrapeData.summary || "";
    const pageTitle = scrapeData.data?.metadata?.title || scrapeData.metadata?.title || "";

    console.log("Scraped content length:", pageContent.length);

    // Use Gemini to extract structured client data
    const extractionPrompt = `You are a CRO agency analyst. Analyze this ecommerce store page and extract client profile information.

Store URL: ${formattedUrl}
Page Title: ${pageTitle}
Page Summary: ${pageSummary}
Page Content (first 3000 chars):
${pageContent.substring(0, 3000)}

Extract the following and respond ONLY with a valid JSON object (no markdown, no explanation):
{
  "name": "Brand name (clean, no LLC/Inc suffixes)",
  "industry": "One of: ${INDUSTRIES.join(", ")}",
  "vertical": "Specific sub-niche e.g. 'Men's grooming', 'Collagen peptides', 'Trail running gear'",
  "revenue_tier": "Estimated tier based on brand maturity/presence. One of: <$1M, $1M-$5M, $5M-$10M, $10M-$50M, $50M+, or empty string if unknown",
  "notes": "2-3 sentence brand summary: what they sell, who they target, what makes them notable for CRO work",
  "tags": ["array", "of", "3-5", "relevant", "topic", "tags"]
}

Rules:
- industry must be EXACTLY one of the listed options
- revenue_tier: estimate based on signals (ad spend hints, team size mentions, press mentions, product range breadth)
- Be honest — use empty string if you genuinely can't determine revenue
- tags should be lowercase, e.g. ["dtc", "subscription", "high-aov", "mobile-first", "men's-health"]`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: extractionPrompt }],
        temperature: 0.2,
      }),
    });

    if (!aiRes.ok) {
      const err = await aiRes.text();
      throw new Error(`AI extraction error: ${aiRes.status} — ${err}`);
    }

    const aiData = await aiRes.json();
    const rawContent = aiData.choices?.[0]?.message?.content ?? "";

    // Strip markdown code fences if present
    const jsonStr = rawContent.replace(/^```json\n?/i, "").replace(/^```\n?/i, "").replace(/\n?```$/i, "").trim();

    let extracted: Record<string, any> = {};
    try {
      extracted = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response:", rawContent);
      throw new Error("AI returned invalid JSON — could not parse client data");
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          name: extracted.name || "",
          shopify_url: formattedUrl,
          industry: INDUSTRIES.includes(extracted.industry) ? extracted.industry : "Other",
          vertical: extracted.vertical || "",
          revenue_tier: extracted.revenue_tier || "",
          notes: extracted.notes || "",
          tags: Array.isArray(extracted.tags) ? extracted.tags : [],
          contact_name: "",
          contact_email: "",
          project_status: "Active",
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("enrich-client error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
