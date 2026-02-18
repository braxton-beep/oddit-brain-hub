import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const today = new Date().toISOString().split("T")[0];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `You are a CRO and ecommerce design intelligence assistant. Today is ${today}. 
Your job is to surface the most relevant and actionable AI, ecommerce, and UX/design news for a CRO agency that works with Shopify brands.
Focus on: AI tools for ecommerce, conversion rate optimization trends, Shopify platform updates, UX/design patterns, A/B testing insights, customer psychology, and digital marketing shifts.
Return exactly 5 news items as a JSON array. Each item must be concise and immediately relevant to the agency's work.`,
          },
          {
            role: "user",
            content: `Give me the 5 most important AI, ecommerce, and UX design developments that a CRO agency working with Shopify brands should know about right now. 
Return a JSON array with this exact structure:
[
  {
    "title": "Short punchy headline",
    "summary": "2-3 sentence summary of what this means for ecommerce brands",
    "category": "one of: AI Tools | Ecommerce | UX & Design | Shopify | CRO",
    "impact": "one of: High | Medium | Low",
    "emoji": "relevant emoji"
  }
]
Only return the JSON array, nothing else.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "[]";

    // Strip markdown code fences if present
    const cleaned = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    let news = [];
    try {
      news = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI response:", cleaned);
      news = [];
    }

    return new Response(JSON.stringify({ news, fetched_at: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-news error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
