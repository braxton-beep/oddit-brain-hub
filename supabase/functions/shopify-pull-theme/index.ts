import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// File patterns we want to pull from the theme — expanded for richer AI context
const TARGET_PATTERNS = [
  "layout/theme.liquid",
  "layout/password.liquid",
  "sections/",
  "templates/",
  "snippets/",
  "config/settings_schema.json",
  "config/settings_data.json",
  "assets/base.css",
  "assets/global.css",
  "assets/theme.css",
  "assets/section-",
  "assets/component-",
];

function shouldIncludeFile(key: string): boolean {
  const validExtensions = [".liquid", ".json", ".css"];
  const hasValidExt = validExtensions.some((ext) => key.endsWith(ext));
  if (!hasValidExt) return false;
  return TARGET_PATTERNS.some((p) => key.startsWith(p));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { connection_id } = await req.json();
    if (!connection_id) {
      return new Response(JSON.stringify({ error: "connection_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Fetch connection details
    const connRes = await fetch(
      `${supabaseUrl}/rest/v1/shopify_connections?id=eq.${connection_id}&select=*`,
      {
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
        },
      }
    );
    const connections = await connRes.json();
    if (!connections?.length) {
      return new Response(JSON.stringify({ error: "Connection not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const conn = connections[0];
    const { shop_domain, access_token, theme_id } = conn;

    if (!theme_id) {
      return new Response(JSON.stringify({ error: "No theme_id on connection. Connect first." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch asset list from Shopify
    const assetsRes = await fetch(
      `https://${shop_domain}/admin/api/2024-01/themes/${theme_id}/assets.json`,
      {
        headers: {
          "X-Shopify-Access-Token": access_token,
          "Content-Type": "application/json",
        },
      }
    );

    if (!assetsRes.ok) {
      const err = await assetsRes.text();
      console.error("Shopify assets list error:", err);
      return new Response(JSON.stringify({ error: "Failed to list theme assets", details: err }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { assets } = await assetsRes.json() as { assets: Array<{ key: string }> };
    const targetKeys = assets.map((a) => a.key).filter(shouldIncludeFile);

    console.log(`Found ${targetKeys.length} matching theme files to pull`);

    // Delete existing files for this connection
    await fetch(
      `${supabaseUrl}/rest/v1/shopify_theme_files?connection_id=eq.${connection_id}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          Prefer: "return=minimal",
        },
      }
    );

    // Fetch each file content and store
    const results: Array<{ filename: string; status: string }> = [];

    for (const key of targetKeys) {
      try {
        const fileRes = await fetch(
          `https://${shop_domain}/admin/api/2024-01/themes/${theme_id}/assets.json?asset[key]=${encodeURIComponent(key)}`,
          {
            headers: {
              "X-Shopify-Access-Token": access_token,
              "Content-Type": "application/json",
            },
          }
        );

        if (!fileRes.ok) {
          results.push({ filename: key, status: "error" });
          await fileRes.text(); // consume body
          continue;
        }

        const { asset } = await fileRes.json() as { asset: { key: string; value?: string } };
        const content = asset.value || "";

        // Upsert into shopify_theme_files
        await fetch(`${supabaseUrl}/rest/v1/shopify_theme_files`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            connection_id,
            filename: key,
            content,
          }),
        });

        results.push({ filename: key, status: "ok" });
      } catch (e) {
        console.error(`Error fetching ${key}:`, e);
        results.push({ filename: key, status: "error" });
      }
    }

    return new Response(
      JSON.stringify({ pulled: results.length, files: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("shopify-pull-theme error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
