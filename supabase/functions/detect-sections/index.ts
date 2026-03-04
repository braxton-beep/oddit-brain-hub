import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const SECTION_DETECTION_PROMPT = `You are analyzing a full-page screenshot of an e-commerce website homepage. Your job is to identify distinct visual sections of the page.

For each section, provide:
- section_name: A standardized name from this list: "Navigation", "Announcement Bar", "Hero", "Featured Products", "Collection Grid", "Social Proof", "Testimonials", "Trust Badges", "Value Props", "Newsletter", "Brand Story", "Video Section", "Instagram Feed", "Blog Posts", "FAQ", "Footer", "Popup/Modal", "Banner", "Product Carousel", "Before After", "Stats Counter", "Logo Bar", "Comparison Table", "Guarantee Section", "Shipping Info"
- If a section doesn't match any of the above, use a descriptive name
- y_start_pct: The percentage from the top of the page where this section starts (0-100)
- y_end_pct: The percentage from the top of the page where this section ends (0-100)
- section_order: The order of the section from top to bottom (1-based)

Be precise with the boundaries. Each section should capture the full visual content of that area.
Sections should not overlap and should cover the entire page from 0% to 100%.
Typically a homepage has 8-15 sections.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { setup_run_id, client_name } = body;

    if (!client_name) {
      return new Response(
        JSON.stringify({ error: "client_name is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find the full-page screenshots from storage
    const slug = client_name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const { data: files } = await sb.storage
      .from("audit-assets")
      .list("screenshots", { search: slug, limit: 20, sortBy: { column: "created_at", order: "desc" } });

    if (!files?.length) {
      return new Response(
        JSON.stringify({ error: "No screenshots found for this client. Run the setup first." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get desktop and mobile screenshot URLs
    const screenshotUrls: Record<string, string> = {};
    for (const file of files) {
      const { data: urlData } = sb.storage.from("audit-assets").getPublicUrl(`screenshots/${file.name}`);
      if (!urlData?.publicUrl) continue;
      if (file.name.includes("-desktop-") && !screenshotUrls.desktop) {
        screenshotUrls.desktop = urlData.publicUrl;
      } else if (file.name.includes("-mobile-") && !screenshotUrls.mobile) {
        screenshotUrls.mobile = urlData.publicUrl;
      }
    }

    if (!screenshotUrls.desktop && !screenshotUrls.mobile) {
      return new Response(
        JSON.stringify({ error: "No desktop or mobile screenshots found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete existing section data for this client to avoid duplicates
    if (setup_run_id) {
      await sb.from("setup_screenshots").delete().eq("setup_run_id", setup_run_id);
    } else {
      await sb.from("setup_screenshots").delete().eq("client_name", client_name);
    }

    const allSections: any[] = [];
    const errors: string[] = [];

    // Process each device type
    for (const [deviceType, screenshotUrl] of Object.entries(screenshotUrls)) {
      console.log(`[detect-sections] Analyzing ${deviceType} screenshot for ${client_name}`);

      try {
        // Call Gemini vision to detect sections
        const aiResponse = await fetch(AI_GATEWAY, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: SECTION_DETECTION_PROMPT },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Analyze this ${deviceType} full-page screenshot and identify all visual sections. Return the sections using the detect_sections tool.`,
                  },
                  {
                    type: "image_url",
                    image_url: { url: screenshotUrl },
                  },
                ],
              },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "detect_sections",
                  description: "Return the detected page sections with their boundaries",
                  parameters: {
                    type: "object",
                    properties: {
                      sections: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            section_name: { type: "string" },
                            section_order: { type: "integer" },
                            y_start_pct: { type: "number", description: "Start position as percentage (0-100)" },
                            y_end_pct: { type: "number", description: "End position as percentage (0-100)" },
                          },
                          required: ["section_name", "section_order", "y_start_pct", "y_end_pct"],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ["sections"],
                    additionalProperties: false,
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "detect_sections" } },
          }),
        });

        if (!aiResponse.ok) {
          if (aiResponse.status === 429) {
            errors.push(`Rate limited for ${deviceType}`);
            continue;
          }
          if (aiResponse.status === 402) {
            errors.push(`Payment required for AI analysis`);
            continue;
          }
          const errText = await aiResponse.text();
          errors.push(`AI error for ${deviceType}: ${aiResponse.status} ${errText.substring(0, 200)}`);
          continue;
        }

        const aiData = await aiResponse.json();
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

        if (!toolCall?.function?.arguments) {
          errors.push(`No tool call response for ${deviceType}`);
          continue;
        }

        const parsed = JSON.parse(toolCall.function.arguments);
        const sections = parsed.sections ?? [];

        console.log(`[detect-sections] Found ${sections.length} sections for ${deviceType}`);

        // Insert sections into the database
        for (const section of sections) {
          const record = {
            setup_run_id: setup_run_id || null,
            client_name,
            section_name: section.section_name,
            section_order: section.section_order,
            device_type: deviceType,
            y_start_pct: section.y_start_pct,
            y_end_pct: section.y_end_pct,
            full_screenshot_url: screenshotUrl,
          };

          const { error: insertError } = await sb.from("setup_screenshots").insert(record);
          if (insertError) {
            errors.push(`Insert error for ${section.section_name}: ${insertError.message}`);
          } else {
            allSections.push(record);
          }
        }
      } catch (e) {
        errors.push(`${deviceType} analysis failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        client_name,
        sections_detected: allSections.length,
        sections: allSections,
        screenshot_urls: screenshotUrls,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("detect-sections error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
