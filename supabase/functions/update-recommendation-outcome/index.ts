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
    const { recommendation_id, outcome } = await req.json();

    if (!recommendation_id || !["implemented", "skipped", "converted"].includes(outcome)) {
      return new Response(
        JSON.stringify({ error: "recommendation_id and outcome (implemented|skipped|converted) required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Fetch current counts
    const { data: rec, error: fetchErr } = await sb
      .from("recommendation_insights")
      .select("id, implemented_count, skipped_count, converted_count, frequency_count")
      .eq("id", recommendation_id)
      .single();

    if (fetchErr || !rec) {
      return new Response(
        JSON.stringify({ error: "Recommendation not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Increment the appropriate counter
    const updates: Record<string, number> = {};
    if (outcome === "implemented") updates.implemented_count = (rec.implemented_count || 0) + 1;
    if (outcome === "skipped") updates.skipped_count = (rec.skipped_count || 0) + 1;
    if (outcome === "converted") updates.converted_count = (rec.converted_count || 0) + 1;

    // Recalculate effectiveness_score
    const impl = outcome === "implemented" ? (rec.implemented_count || 0) + 1 : (rec.implemented_count || 0);
    const conv = outcome === "converted" ? (rec.converted_count || 0) + 1 : (rec.converted_count || 0);
    const skip = outcome === "skipped" ? (rec.skipped_count || 0) + 1 : (rec.skipped_count || 0);
    const total = impl + conv + skip;

    // Score: weighted ratio — converted=3pts, implemented=1pt, skipped=-0.5pt, normalized by frequency
    const rawScore = total > 0 ? ((conv * 3 + impl * 1 - skip * 0.5) / total) * 100 : 0;
    // Blend with frequency for a composite score (more data = more reliable)
    const frequencyBoost = Math.min(rec.frequency_count / 10, 1); // caps at 1x
    updates.effectiveness_score = Math.round(rawScore * frequencyBoost * 100) / 100;

    const { error: updateErr } = await sb
      .from("recommendation_insights")
      .update(updates)
      .eq("id", recommendation_id);

    if (updateErr) throw updateErr;

    return new Response(
      JSON.stringify({ success: true, recommendation_id, outcome, effectiveness_score: updates.effectiveness_score }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("update-recommendation-outcome error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
