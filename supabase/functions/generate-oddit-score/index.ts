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
    const { audit_id, client_name, shop_url, site_content } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // If audit_id provided, fetch audit recommendations for context
    let context = site_content || "";
    let auditClientName = client_name || "";
    let auditShopUrl = shop_url || "";

    if (audit_id) {
      const { data: audit } = await sb.from("cro_audits").select("*").eq("id", audit_id).single();
      if (audit) {
        auditClientName = auditClientName || audit.client_name || audit.shop_url;
        auditShopUrl = auditShopUrl || audit.shop_url;
        const recs = (audit.recommendations || []) as any[];
        context = `Site: ${audit.shop_url}\nClient: ${audit.client_name}\n\nRecommendations from audit:\n${recs.map((r: any) => `- [${r.severity}] ${r.section}: ${r.current_issue}`).join("\n")}`;
      }
    }

    const systemPrompt = `You are an Oddit CRO expert who scores websites on the proprietary "Oddit Score" system — a 0-100 scale across 8 dimensions worth 12.5 points each.

The 8 dimensions and what to evaluate:
1. clarity_value_prop (0-12.5): Is the value proposition immediately clear above the fold? Does the headline communicate unique benefit?
2. visual_hierarchy (0-12.5): Do the most important elements draw the eye first? Is there clear visual flow guiding users to convert?
3. trust_signals (0-12.5): Quality and placement of reviews, badges, certifications, guarantees, press logos, social proof count
4. mobile_ux (0-12.5): Mobile layout quality, tap target sizes, load behavior, thumb-friendliness, reduced cognitive load
5. funnel_logic (0-12.5): Does the page flow logically toward conversion? Are there friction points, dead ends, or confusion?
6. copy_strength (0-12.5): Headline quality, benefit-focused vs feature-focused writing, urgency, specificity, readability
7. social_proof (0-12.5): Reviews format, UGC integration, testimonials, before/afters, star ratings, influencer content
8. speed_perception (0-12.5): Does the page feel fast? Good use of skeleton states, progressive loading, perceived performance

Score each dimension and provide a one-sentence note explaining the score.

Return ONLY valid JSON with no markdown:
{
  "clarity_value_prop": 9.5,
  "visual_hierarchy": 8.0,
  "trust_signals": 7.5,
  "mobile_ux": 10.0,
  "funnel_logic": 8.5,
  "copy_strength": 9.0,
  "social_proof": 7.0,
  "speed_perception": 8.5,
  "total_score": 68.0,
  "dimension_notes": {
    "clarity_value_prop": "Strong hero headline but value prop buried below fold on mobile",
    "visual_hierarchy": "Good use of whitespace but CTA competes with secondary elements",
    "trust_signals": "Only 1 trust badge visible; reviews not shown on product pages",
    "mobile_ux": "Excellent mobile layout with large tap targets and clean navigation",
    "funnel_logic": "Clear path from homepage to PDP but cart experience creates friction",
    "copy_strength": "Benefit-focused headlines throughout; lacks urgency and specificity",
    "social_proof": "Has reviews but no UGC or before/after content",
    "speed_perception": "Fast initial load but images not lazy loaded below fold"
  }
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
          {
            role: "user",
            content: `Score this website for ${auditClientName || auditShopUrl}:\n\n${context || `URL: ${auditShopUrl}`}`,
          },
        ],
        stream: false,
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiResp.status === 402) return new Response(JSON.stringify({ error: "AI usage limit reached." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "{}";

    let scores: any = {};
    try {
      const cleaned = rawContent.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      scores = JSON.parse(cleaned);
    } catch {
      throw new Error("Failed to parse AI scoring response");
    }

    // Compute total_score if not provided
    const dims = ["clarity_value_prop","visual_hierarchy","trust_signals","mobile_ux","funnel_logic","copy_strength","social_proof","speed_perception"];
    const total = scores.total_score ?? dims.reduce((s, d) => s + (scores[d] || 0), 0);

    // Save to DB
    const { data: savedScore, error: dbError } = await sb
      .from("oddit_scores")
      .insert({
        client_name: auditClientName,
        shop_url: auditShopUrl,
        cro_audit_id: audit_id || null,
        clarity_value_prop: scores.clarity_value_prop || 0,
        visual_hierarchy: scores.visual_hierarchy || 0,
        trust_signals: scores.trust_signals || 0,
        mobile_ux: scores.mobile_ux || 0,
        funnel_logic: scores.funnel_logic || 0,
        copy_strength: scores.copy_strength || 0,
        social_proof: scores.social_proof || 0,
        speed_perception: scores.speed_perception || 0,
        total_score: parseFloat(total.toFixed(1)),
        dimension_notes: scores.dimension_notes || {},
      })
      .select()
      .single();

    if (dbError) throw dbError;

    return new Response(JSON.stringify({ success: true, score: savedScore }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-oddit-score error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
