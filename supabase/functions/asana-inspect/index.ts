import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ASANA_API = "https://app.asana.com/api/1.0";
const ASANA_PROJECT_GID = "1207443359385412";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const envToken = Deno.env.get("ASANA_ACCESS_TOKEN");
    let token = envToken;
    if (!token) {
      const { data: cred } = await sb
        .from("integration_credentials").select("api_key")
        .eq("integration_id", "asana").order("created_at", { ascending: false }).limit(1).single();
      token = cred?.api_key;
    }
    if (!token) throw new Error("No Asana token");

    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const body = await req.json().catch(() => ({}));

    if (body.action === "create_section") {
      // Create "Ready for Review" section, inserted before "Setup Complete"
      const res = await fetch(`${ASANA_API}/projects/${ASANA_PROJECT_GID}/sections`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          data: {
            name: "Ready for Review",
            insert_before: "1207443359385418", // Before "Setup Complete"
          },
        }),
      });
      const data = await res.json();
      return new Response(JSON.stringify(data, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default: inspect
    const [sectionsRes, projectRes] = await Promise.all([
      fetch(`${ASANA_API}/projects/${ASANA_PROJECT_GID}/sections?opt_fields=name,gid`, { headers }),
      fetch(`${ASANA_API}/projects/${ASANA_PROJECT_GID}/custom_field_settings?opt_fields=custom_field.name,custom_field.gid,custom_field.type,custom_field.enum_options.name,custom_field.enum_options.gid,custom_field.enum_options.enabled`, { headers }),
    ]);

    const sectionsData = await sectionsRes.json();
    const fieldsData = await projectRes.json();

    return new Response(
      JSON.stringify({
        sections: sectionsData.data,
        custom_fields: (fieldsData.data || []).map((s: any) => s.custom_field),
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
