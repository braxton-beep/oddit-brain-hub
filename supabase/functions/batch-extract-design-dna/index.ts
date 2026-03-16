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
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let batchSize = 3;
    try {
      const body = await req.json();
      if (body?.batch_size) batchSize = Math.min(body.batch_size, 5);
    } catch { /* defaults */ }

    // Find figma_files that have frame_exports but no design_language_profile
    const { data: files, error: queryError } = await sb
      .from("figma_files")
      .select("id, name, client_name, design_type, design_data, figma_file_key")
      .eq("enabled", true)
      .order("last_modified", { ascending: false })
      .limit(200);

    if (queryError) throw queryError;

    // Filter: has frame_exports, no design_language_profile
    const candidates = (files ?? []).filter((f: any) => {
      const dd = f.design_data;
      if (!dd) return false;
      const exports = dd.frame_exports ?? {};
      const hasFrames = Object.keys(exports).length > 0;
      const hasProfile = !!dd.design_language_profile;
      return hasFrames && !hasProfile;
    });

    const batch = candidates.slice(0, batchSize);
    const results: any[] = [];
    const errors: string[] = [];

    console.log(`Processing ${batch.length} of ${candidates.length} files needing design language profiles`);

    for (const file of batch) {
      try {
        const dd = file.design_data as any;
        const frameExports = dd.frame_exports ?? {};
        const frameUrls = Object.values(frameExports).filter(Boolean).slice(0, 4) as string[];

        if (frameUrls.length === 0) {
          errors.push(`${file.name}: no frame export URLs`);
          continue;
        }

        // Build multimodal prompt with frame images
        const contentParts: any[] = [
          {
            type: "text",
            text: `You are a design analyst. Analyze these exported frames from a Figma file called "${file.name}" (type: ${file.design_type}, client: ${file.client_name || "unknown"}).

Produce a structured design language profile as a JSON object with these fields:
- overall_style: string (e.g. "modern minimalist", "bold maximalist", "editorial", "playful", "luxury", "corporate clean")
- color_mood: string (e.g. "warm earthy", "cool tech", "vibrant pop", "muted elegant")
- primary_colors: string[] (up to 5 hex codes you observe as dominant)
- typography_style: string (e.g. "sans-serif modern", "serif editorial", "mixed display + body")
- layout_pattern: string (e.g. "grid-based", "asymmetric", "full-width sections", "card-heavy")
- visual_density: string ("sparse" | "balanced" | "dense")
- hero_pattern: string (describe the hero/above-fold pattern)
- cta_style: string (describe button/CTA visual treatment)
- imagery_style: string (e.g. "lifestyle photography", "product-focused", "illustration-heavy", "minimal")
- trust_elements: string[] (what trust signals are visible)
- unique_traits: string[] (2-3 distinctive design choices)
- cro_observations: string[] (2-3 conversion-relevant observations)

${dd.color_palette?.length ? `Known extracted colors: ${dd.color_palette.slice(0, 10).map((c: any) => c.hex).join(", ")}` : ""}
${dd.font_families?.length ? `Known fonts: ${dd.font_families.join(", ")}` : ""}

Return ONLY the JSON object, no markdown fences.`,
          },
        ];

        for (const url of frameUrls) {
          contentParts.push({
            type: "image_url",
            image_url: { url },
          });
        }

        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "user", content: contentParts },
            ],
          }),
        });

        if (!aiRes.ok) {
          const errText = await aiRes.text();
          errors.push(`${file.name}: AI error ${aiRes.status} — ${errText.slice(0, 200)}`);
          continue;
        }

        const aiData = await aiRes.json();
        const rawContent = aiData?.choices?.[0]?.message?.content ?? "";

        // Parse JSON from response (strip markdown fences if present)
        let profile: any;
        try {
          const jsonStr = rawContent.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
          profile = JSON.parse(jsonStr);
        } catch {
          errors.push(`${file.name}: Failed to parse AI response as JSON`);
          // Store raw response as fallback
          profile = { _raw_response: rawContent.slice(0, 2000), _parse_failed: true };
        }

        profile._analyzed_at = new Date().toISOString();
        profile._frames_analyzed = frameUrls.length;

        // Merge into existing design_data
        const updatedDesignData = {
          ...dd,
          design_language_profile: profile,
        };

        const { error: updateError } = await sb
          .from("figma_files")
          .update({ design_data: updatedDesignData })
          .eq("id", file.id);

        if (updateError) {
          errors.push(`${file.name}: DB update failed — ${updateError.message}`);
        } else {
          results.push({
            name: file.name,
            client: file.client_name,
            design_type: file.design_type,
            frames_analyzed: frameUrls.length,
            profile_style: profile.overall_style ?? "unknown",
          });
        }

        console.log(`✓ ${file.name}: ${profile.overall_style ?? "processed"}`);
      } catch (err) {
        errors.push(`${file.name}: ${(err as Error).message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        remaining: candidates.length - batch.length,
        total_needing_profiles: candidates.length,
        results,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("batch-extract-design-dna error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
