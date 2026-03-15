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

    // Accept optional mode: "full" (re-scan everything) or "incremental" (only new audits)
    let mode = "full";
    try {
      const body = await req.json();
      mode = body.mode || "full";
    } catch {
      // No body = default full scan
    }

    // Fetch completed audits
    const { data: audits, error: auditErr } = await sb
      .from("cro_audits")
      .select("id, client_name, shop_url, recommendations, created_at")
      .eq("status", "completed")
      .order("created_at", { ascending: false });

    if (auditErr) throw auditErr;
    if (!audits || audits.length === 0) {
      return new Response(JSON.stringify({ success: true, insights: [], message: "No audits to scan" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract all recommendations with rich context
    const allRecs: {
      text: string;
      client: string;
      section: string;
      severity: string;
      aida_stage: string;
      cro_rationale: string;
      implementation_spec: string;
      mockup_rating: number | null;
      mockup_url: string | null;
      priority_score: number | null;
    }[] = [];

    for (const audit of audits) {
      const recs = (audit.recommendations || []) as any[];
      for (const rec of recs) {
        if (rec.recommended_change) {
          allRecs.push({
            text: rec.recommended_change,
            client: audit.client_name || audit.shop_url,
            section: rec.section || "General",
            severity: rec.severity || "medium",
            aida_stage: rec.aida_stage || "unknown",
            cro_rationale: rec.cro_rationale || "",
            implementation_spec: rec.implementation_spec || "",
            mockup_rating: rec.mockup_rating ?? null,
            mockup_url: rec.mockup_url ?? null,
            priority_score: rec.priority_score ?? null,
          });
        }
      }
    }

    if (allRecs.length === 0) {
      return new Response(JSON.stringify({ success: true, insights: [], message: "No recommendations found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Separate starred (4+ rating) mockups as exemplars
    const starredRecs = allRecs.filter(r => r.mockup_rating && r.mockup_rating >= 4);
    const starredBlock = starredRecs.length > 0
      ? `\n\nSTARRED RECOMMENDATIONS (rated 4+ stars by design team — these are your best work):\n${starredRecs.map((r, i) => `${i + 1}. [${r.section}] ${r.text} (client: ${r.client}, rating: ${r.mockup_rating}/5${r.mockup_url ? ", has mockup" : ""})`).join("\n")}`
      : "";

    // Build the recommendation list with enriched context
    const recList = allRecs.map((r, i) =>
      `${i + 1}. [${r.section}] ${r.text} (client: ${r.client}, severity: ${r.severity}, aida: ${r.aida_stage}${r.priority_score ? `, priority: ${r.priority_score}/100` : ""}${r.mockup_rating ? `, mockup_rating: ${r.mockup_rating}/5` : ""})`
    ).join("\n");

    console.log(`Scanning ${allRecs.length} recs from ${audits.length} audits (${starredRecs.length} starred)`);

    // Use tool calling for structured extraction
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a CRO analyst at Oddit, the world's leading DTC conversion optimization agency, reviewing ALL recommendations ever given to clients.

Your task: Analyze patterns across all recommendations to build a reusable "playbook" of proven CRO strategies.

RULES:
1. Group SIMILAR recommendations by semantic meaning, not exact text match. "Add trust badges below ATC" and "Insert trust icons near add-to-cart" are the SAME pattern.
2. For each pattern, write a TEMPLATE version that could be reused for any future client — with placeholders like [brand name], [product type], [primary CTA].
3. Include the CRO rationale — WHY does this pattern work? Reference conversion psychology principles.
4. Identify which AIDA stage each pattern primarily serves.
5. Prioritize patterns that appear across MULTIPLE different clients (cross-client frequency is more valuable than within-client repetition).
6. When starred (high-rated) recommendations exist for a pattern, mark it as "proven" and reference the successful implementation.
7. Return the top 25 most impactful patterns, sorted by cross-client frequency.`,
          },
          {
            role: "user",
            content: `Analyze these ${allRecs.length} recommendations from ${audits.length} client audits and extract reusable CRO patterns:\n\n${recList}${starredBlock}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "save_recommendation_patterns",
              description: "Save the extracted CRO recommendation patterns to the database",
              parameters: {
                type: "object",
                properties: {
                  insights: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        recommendation_text: {
                          type: "string",
                          description: "A clear, actionable 1-2 sentence summary of this recurring CRO pattern"
                        },
                        category: {
                          type: "string",
                          enum: [
                            "Trust Signals", "Copy & Messaging", "Visual Hierarchy",
                            "Social Proof", "CTA Optimization", "Mobile UX",
                            "Navigation", "Checkout", "Homepage", "Product Page",
                            "Above the Fold", "Footer", "Collection Page", "Speed & Performance"
                          ],
                          description: "Primary category for this pattern"
                        },
                        frequency_count: {
                          type: "number",
                          description: "How many times this pattern appears across all audits (count unique clients, not total occurrences)"
                        },
                        client_examples: {
                          type: "array",
                          items: { type: "string" },
                          description: "List of client names where this pattern was recommended"
                        },
                        template_content: {
                          type: "string",
                          description: "A reusable design-brief-quality template with placeholders like [brand name], [product type]. A designer could execute this for any future client without asking questions."
                        },
                        aida_stage: {
                          type: "string",
                          enum: ["attention", "interest", "desire", "action"],
                          description: "Primary AIDA funnel stage this pattern serves"
                        },
                        cro_rationale: {
                          type: "string",
                          description: "Why this pattern works — reference conversion psychology (Hick's Law, social proof bias, etc.) and any known benchmark data"
                        },
                        is_proven: {
                          type: "boolean",
                          description: "True if this pattern has a starred (4+ rating) mockup implementation"
                        },
                        avg_priority_score: {
                          type: "number",
                          description: "Average priority score across instances of this pattern (1-100)"
                        },
                      },
                      required: [
                        "recommendation_text", "category", "frequency_count",
                        "client_examples", "template_content", "aida_stage",
                        "cro_rationale", "is_proven", "avg_priority_score"
                      ],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["insights"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "save_recommendation_patterns" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiResp.status === 402) return new Response(JSON.stringify({ error: "AI usage limit reached." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const errText = await aiResp.text();
      console.error("AI error:", aiResp.status, errText);
      throw new Error(`AI error ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    let insights: any[] = [];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        insights = parsed.insights || [];
      } catch {
        console.error("Failed to parse tool call arguments");
      }
    }

    // Fallback: parse from content
    if (insights.length === 0) {
      const content = aiData.choices?.[0]?.message?.content || "";
      try {
        const cleaned = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
        const parsed = JSON.parse(cleaned);
        insights = parsed.insights || [];
      } catch {
        console.error("Failed to parse AI content fallback");
      }
    }

    if (insights.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "AI returned no insights" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upsert: match by category + similar recommendation text to avoid duplicates
    // Clear old and insert fresh (full scan) or merge (incremental)
    if (mode === "full") {
      await sb.from("recommendation_insights").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    }

    const insertRows = insights.map((insight: any) => ({
      recommendation_text: insight.recommendation_text || "",
      category: insight.category || "General",
      frequency_count: insight.frequency_count || 1,
      client_examples: insight.client_examples || [],
      template_content: insight.template_content || null,
    }));

    if (insertRows.length > 0) {
      const { error: insertErr } = await sb.from("recommendation_insights").insert(insertRows);
      if (insertErr) {
        console.error("Insert error:", insertErr);
        throw insertErr;
      }
    }

    console.log(`Saved ${insights.length} recommendation patterns from ${audits.length} audits (${allRecs.length} total recs, ${starredRecs.length} starred)`);

    return new Response(
      JSON.stringify({
        success: true,
        patterns_saved: insights.length,
        total_audits_scanned: audits.length,
        total_recommendations: allRecs.length,
        starred_recommendations: starredRecs.length,
        top_categories: insights.slice(0, 5).map((i: any) => `${i.category}: ${i.frequency_count}x`),
      }),
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
