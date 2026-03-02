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
    const { auditId, recommendationId, mockupPrompt } = await req.json();
    if (!auditId || recommendationId === undefined || !mockupPrompt) {
      return new Response(JSON.stringify({ error: "Missing auditId, recommendationId, or mockupPrompt" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch audit to get client_name
    const { data: audit } = await supabase
      .from("cro_audits")
      .select("client_name, recommendations")
      .eq("id", auditId)
      .single();

    // Fetch brand assets for this client (match by name)
    let brandAssetUrls: string[] = [];
    if (audit?.client_name) {
      // Find client by name
      const { data: clients } = await supabase
        .from("clients")
        .select("id")
        .ilike("name", audit.client_name)
        .limit(1);

      if (clients?.length) {
        const { data: assets } = await supabase
          .from("client_brand_assets")
          .select("file_url, asset_type, file_name")
          .eq("client_id", clients[0].id)
          .order("asset_type");

        if (assets?.length) {
          brandAssetUrls = assets.map(
            (a: any) => `[${a.asset_type}] ${a.file_name}: ${a.file_url}`
          );
        }
      }
    }

    // Build enhanced prompt with brand assets context
    let fullPrompt =
      "You are generating a high-fidelity web design concept mockup for a CRO recommendation. " +
      "Create a clean, modern, professional e-commerce design that looks like a real Shopify store. " +
      "Use realistic product photography placeholders, proper typography hierarchy, and modern UI patterns. " +
      "The design should be immediately implementable.";

    if (brandAssetUrls.length > 0) {
      fullPrompt +=
        "\n\nIMPORTANT — The client has provided brand assets. You MUST incorporate their actual brand identity into the mockup. " +
        "Use their logo, product images, colors, and visual style to make this look like THEIR store, not a generic mockup. " +
        "Here are the available brand assets:\n" +
        brandAssetUrls.join("\n");
    }

    fullPrompt += "\n\nHere is the specific design brief: " + mockupPrompt;

    console.log(`Generating mockup for audit ${auditId}, recommendation ${recommendationId}, ${brandAssetUrls.length} brand assets`);

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [
          {
            role: "user",
            content: fullPrompt,
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI image error:", aiResp.status, errText);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Image generation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const imageUrl = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageUrl) {
      return new Response(JSON.stringify({ error: "No image was generated" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upload to storage
    const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, "");
    const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const filePath = `mockups/${auditId}/${recommendationId}.png`;

    const { error: uploadError } = await supabase.storage
      .from("audit-assets")
      .upload(filePath, binaryData, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new Response(JSON.stringify({ error: "Failed to save mockup image" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: urlData } = supabase.storage
      .from("audit-assets")
      .getPublicUrl(filePath);

    const mockupUrl = urlData.publicUrl;

    // Update the recommendation in the audit record
    if (audit?.recommendations) {
      const recs = audit.recommendations as any[];
      const updatedRecs = recs.map((r: any) =>
        r.id === recommendationId ? { ...r, mockup_url: mockupUrl } : r
      );
      await supabase
        .from("cro_audits")
        .update({ recommendations: updatedRecs })
        .eq("id", auditId);
    }

    console.log(`Mockup generated for recommendation ${recommendationId}`);

    return new Response(
      JSON.stringify({ mockupUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-audit-mockup error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
