import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { generated_section_id } = await req.json();
    if (!generated_section_id) {
      return new Response(JSON.stringify({ error: "generated_section_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const headers = {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    };

    // 1. Load generated section
    const secRes = await fetch(
      `${supabaseUrl}/rest/v1/generated_sections?id=eq.${generated_section_id}&select=*`,
      { headers }
    );
    const sections = await secRes.json();
    if (!sections?.length) {
      return new Response(JSON.stringify({ error: "Generated section not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const section = sections[0];

    // 2. Load pipeline project to get client name
    const projRes = await fetch(
      `${supabaseUrl}/rest/v1/pipeline_projects?id=eq.${section.pipeline_project_id}&select=client`,
      { headers }
    );
    const projects = await projRes.json();
    if (!projects?.length) {
      return new Response(JSON.stringify({ error: "Pipeline project not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const clientName = projects[0].client;

    // 3. Find client → shopify connection
    const clientRes = await fetch(
      `${supabaseUrl}/rest/v1/clients?name=eq.${encodeURIComponent(clientName)}&select=id&limit=1`,
      { headers }
    );
    const clients = await clientRes.json();
    if (!clients?.length) {
      return new Response(JSON.stringify({ error: `Client "${clientName}" not found` }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const connRes = await fetch(
      `${supabaseUrl}/rest/v1/shopify_connections?client_id=eq.${clients[0].id}&status=eq.connected&select=*&limit=1`,
      { headers }
    );
    const conns = await connRes.json();
    if (!conns?.length) {
      return new Response(JSON.stringify({ error: "No Shopify connection found for this client" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const conn = conns[0];
    const { shop_domain, access_token, theme_id } = conn;

    if (!theme_id) {
      return new Response(JSON.stringify({ error: "No theme_id on Shopify connection" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Build the asset key
    const sectionName = section.section_name || "custom-section";
    const assetKey = `sections/${sectionName}.liquid`;

    // 5. Push to Shopify Asset API
    const shopifyRes = await fetch(
      `https://${shop_domain}/admin/api/2024-01/themes/${theme_id}/assets.json`,
      {
        method: "PUT",
        headers: {
          "X-Shopify-Access-Token": access_token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          asset: {
            key: assetKey,
            value: section.liquid_code,
          },
        }),
      }
    );

    if (!shopifyRes.ok) {
      const errText = await shopifyRes.text();
      console.error("Shopify push error:", shopifyRes.status, errText);
      return new Response(JSON.stringify({ error: "Failed to push to Shopify", details: errText }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await shopifyRes.json();

    // 6. Update section status
    await fetch(`${supabaseUrl}/rest/v1/generated_sections?id=eq.${generated_section_id}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({ status: "pushed" }),
    });

    return new Response(
      JSON.stringify({ success: true, asset_key: assetKey, theme_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("shopify-push-section error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
