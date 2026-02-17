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

    // Fetch all transcripts
    const { data: transcripts } = await sb
      .from("fireflies_transcripts")
      .select("id, title, summary, action_items, transcript_text, organizer_email")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!transcripts || transcripts.length === 0) {
      return new Response(JSON.stringify({ success: true, benchmarks: [], message: "No transcripts to scan" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build transcript summaries for AI
    const transcriptSummaries = transcripts
      .map((t) => `--- TRANSCRIPT: ${t.title} ---\n${(t.summary || "").substring(0, 500)}\n${(t.action_items || "").substring(0, 300)}`)
      .join("\n\n");

    const systemPrompt = `You are a CRO data analyst extracting KPI benchmarks from client meeting transcripts.

Find all numeric KPI mentions (conversion rates, AOV, CTR, bounce rates, revenue figures, etc.) and extract them as benchmarks.

Return ONLY valid JSON:
{
  "benchmarks": [
    {
      "metric_name": "Conversion Rate",
      "industry": "DTC Apparel",
      "revenue_tier": "1M-10M",
      "p50": 2.5,
      "unit": "%",
      "context": "brief context about this metric"
    }
  ]
}

Extract as many as you can find. Group similar metrics together. Be specific about units (%, $, x, etc.).`;

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
          { role: "user", content: `Extract KPI benchmarks from these ${transcripts.length} transcripts:\n\n${transcriptSummaries}` },
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

    const benchmarks = parsed.benchmarks || [];

    if (benchmarks.length > 0) {
      await sb.from("kpi_benchmarks").insert(
        benchmarks.map((b: any) => ({
          metric_name: b.metric_name || "Unknown",
          industry: b.industry || "General",
          revenue_tier: b.revenue_tier || "Unknown",
          p50: b.p50 ?? null,
          p25: b.p25 ?? null,
          p75: b.p75 ?? null,
          unit: b.unit || "%",
          source_count: 1,
          source_transcript_ids: JSON.stringify(transcripts.map((t) => t.id).slice(0, 3)),
        }))
      );
    }

    return new Response(
      JSON.stringify({ success: true, benchmarks, total_transcripts: transcripts.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("extract-kpis error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
