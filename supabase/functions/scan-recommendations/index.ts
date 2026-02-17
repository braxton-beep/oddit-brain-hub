import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Fetch all completed audits with recommendations
    const { data: audits } = await sb
      .from("cro_audits")
      .select("id, client_name, shop_url, recommendations")
      .eq("status", "completed");

    if (!audits || audits.length === 0) {
      return new Response(JSON.stringify({ success: true, insights: [], message: "No audits to scan" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract all recommendations with client context
    const allRecs: { text: string; client: string; section: string }[] = [];
    for (const audit of audits) {
      const recs = (audit.recommendations || []) as any[];
      for (const rec of recs) {
        if (rec.recommended_change) {
          allRecs.push({
            text: rec.recommended_change,
            client: audit.client_name || audit.shop_url,
            section: rec.section || "General",
          });
        }
      }
    }

    if (allRecs.length === 0) {
      return new Response(JSON.stringify({ success: true, insights: [], message: "No recommendations found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ask Gemini to group and rank recommendations
    const recList = allRecs.map((r, i) => `${i + 1}. [${r.section}] ${r.text} (client: ${r.client})`).join("\n");

    const systemPrompt = `You are a CRO analyst at Oddit reviewing all past recommendations given to clients.

Your task: group similar recommendations by theme, count how often each pattern appears, and identify the "greatest hits" — recommendations that come up over and over across different clients.

Return ONLY valid JSON (no markdown):
{
  "insights": [
    {
      "recommendation_text": "A clear, concise 1-sentence summary of this recurring recommendation",
      "category": "one of: Trust Signals | Copy & Messaging | Visual Hierarchy | Social Proof | CTA Optimization | Mobile UX | Navigation | Checkout | Homepage | Product Page",
      "frequency_count": 5,
      "client_examples": ["Client A", "Client B", "Client C"],
      "pattern_description": "2-sentence explanation of why this keeps coming up and what the business impact is"
    }
  ]
}

Merge similar recommendations. Focus on patterns that appear 2+ times. Return the top 20 most frequent patterns, sorted by frequency descending.`;

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
          { role: "user", content: `Here are ${allRecs.length} recommendations from ${audits.length} client audits:\n\n${recList}` },
        ],
        stream: false,
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiResp.status === 402) return new Response(JSON.stringify({ error: "AI usage limit reached." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI error ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "{}";

    let parsed: any = {};
    try {
      const cleaned = rawContent.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("Failed to parse AI response");
    }

    const insights = parsed.insights || [];

    // Clear old insights and save new ones
    await sb.from("recommendation_insights").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    if (insights.length > 0) {
      await sb.from("recommendation_insights").insert(
        insights.map((insight: any) => ({
          recommendation_text: insight.recommendation_text,
          category: insight.category || "General",
          frequency_count: insight.frequency_count || 1,
          client_examples: JSON.stringify(insight.client_examples || []),
        }))
      );
    }

    return new Response(
      JSON.stringify({ success: true, insights, total_audits: audits.length, total_recs: allRecs.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("scan-recommendations error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
