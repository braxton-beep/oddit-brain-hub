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
    const url = new URL(req.url);
    const clientName = url.searchParams.get("client_name");

    if (!clientName) {
      return new Response(JSON.stringify({ error: "client_name query param required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find the most recent setup run for this client
    const { data: runs, error } = await sb
      .from("setup_runs")
      .select("id, client_name, shop_url, steps, figma_file_link, figma_slides_link, created_at")
      .ilike("client_name", clientName)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) throw error;
    if (!runs?.length) {
      return new Response(JSON.stringify({ error: "No setup run found for this client" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const run = runs[0];

    // List screenshot files from storage for this client
    const slug = clientName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const { data: files } = await sb.storage
      .from("audit-assets")
      .list("screenshots", { search: slug, limit: 20, sortBy: { column: "created_at", order: "desc" } });

    const screenshots: Record<string, string> = {};
    if (files?.length) {
      for (const file of files) {
        const { data: urlData } = sb.storage.from("audit-assets").getPublicUrl(`screenshots/${file.name}`);
        if (urlData?.publicUrl) {
          if (file.name.includes("-desktop-")) screenshots["desktop"] = urlData.publicUrl;
          else if (file.name.includes("-mobile-")) screenshots["mobile"] = urlData.publicUrl;
        }
      }
    }

    // Fetch detected sections if available
    const { data: sections } = await sb
      .from("setup_screenshots")
      .select("*")
      .ilike("client_name", clientName)
      .order("section_order", { ascending: true });

    return new Response(JSON.stringify({
      client_name: run.client_name,
      shop_url: run.shop_url,
      figma_file_link: run.figma_file_link,
      figma_slides_link: run.figma_slides_link,
      screenshots,
      sections: sections ?? [],
      has_sections: (sections?.length ?? 0) > 0,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("get-setup-screenshots error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
