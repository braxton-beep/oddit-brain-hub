import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function sbFetch(url: string, key: string, path: string) {
  return fetch(`${url}/rest/v1/${path}`, {
    headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
  }).then((r) => r.json());
}

function sbPatch(url: string, key: string, path: string, body: unknown) {
  return fetch(`${url}/rest/v1/${path}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pipeline_project_id } = await req.json();
    if (!pipeline_project_id) {
      return new Response(JSON.stringify({ error: "pipeline_project_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Load pipeline project
    const projects = await sbFetch(supabaseUrl, serviceRoleKey,
      `pipeline_projects?id=eq.${pipeline_project_id}&select=*`);
    if (!projects?.length) {
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const project = projects[0];
    const clientName = project.client;
    const stages = project.stages || [];
    const log: string[] = [];

    // Helper to update stages
    const updateStages = (updatedStages: any[]) =>
      sbPatch(supabaseUrl, serviceRoleKey,
        `pipeline_projects?id=eq.${pipeline_project_id}`, {
          stages: updatedStages,
          last_update: new Date().toISOString(),
        });

    // ── STAGE 1: Figma Pull ─────────────────────────────────────────────────
    // Mark Figma Pull as active
    const s1 = stages.map((s: any, i: number) =>
      i === 0 ? { ...s, status: "active" } : s
    );
    await updateStages(s1);

    let figmaPullSuccess = false;

    try {
      // Check if we have Figma files for this client
      const figmaFiles = await sbFetch(supabaseUrl, serviceRoleKey,
        `figma_files?client_name=eq.${encodeURIComponent(clientName)}&select=id,name,design_type&limit=50`);

      if (figmaFiles?.length > 0) {
        log.push(`Found ${figmaFiles.length} Figma files for ${clientName}`);
        figmaPullSuccess = true;
      } else {
        // No Figma files — check if there's a setup_run with figma_file_link
        const runs = await sbFetch(supabaseUrl, serviceRoleKey,
          `setup_runs?client_name=eq.${encodeURIComponent(clientName)}&select=id,figma_file_link,shop_url&order=created_at.desc&limit=1`);
        if (runs?.length && runs[0].figma_file_link) {
          log.push(`Found setup run with Figma link for ${clientName}`);
          figmaPullSuccess = true;
        } else {
          log.push(`No Figma files found for ${clientName} — marking as done (manual pull needed)`);
          figmaPullSuccess = true; // Don't block the pipeline
        }
      }
    } catch (e) {
      log.push(`Figma Pull error: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Update Figma Pull result
    const s2 = stages.map((s: any, i: number) => {
      if (i === 0) return { ...s, status: figmaPullSuccess ? "done" : "error" };
      if (i === 1) return { ...s, status: figmaPullSuccess ? "active" : "pending" };
      return s;
    });
    await updateStages(s2);

    if (!figmaPullSuccess) {
      return new Response(JSON.stringify({ success: false, log, error: "Figma Pull failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── STAGE 2: Section Split ──────────────────────────────────────────────
    let sectionSplitSuccess = false;

    try {
      // Check if we already have setup_screenshots for this client
      const existingScreenshots = await sbFetch(supabaseUrl, serviceRoleKey,
        `setup_screenshots?client_name=eq.${encodeURIComponent(clientName)}&select=id&limit=1`);

      if (existingScreenshots?.length > 0) {
        log.push(`Section data already exists for ${clientName} — reusing`);
        sectionSplitSuccess = true;
      } else {
        // Try to run detect-sections if we have screenshots in storage
        const setupRuns = await sbFetch(supabaseUrl, serviceRoleKey,
          `setup_runs?client_name=eq.${encodeURIComponent(clientName)}&select=id&order=created_at.desc&limit=1`);

        const setupRunId = setupRuns?.[0]?.id || null;

        // Call detect-sections edge function
        const detectRes = await fetch(`${supabaseUrl}/functions/v1/detect-sections`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_name: clientName,
            setup_run_id: setupRunId,
          }),
        });

        if (detectRes.ok) {
          const detectData = await detectRes.json();
          if (detectData.sections_detected > 0) {
            log.push(`Detected ${detectData.sections_detected} sections for ${clientName}`);
            sectionSplitSuccess = true;
          } else {
            log.push(`No sections detected — screenshots may not exist yet`);
            // Still mark as done so pipeline isn't blocked
            sectionSplitSuccess = true;
          }
        } else {
          const errText = await detectRes.text();
          log.push(`detect-sections returned ${detectRes.status}: ${errText.slice(0, 200)}`);
          // Don't block pipeline for missing screenshots
          sectionSplitSuccess = true;
        }
      }
    } catch (e) {
      log.push(`Section Split error: ${e instanceof Error ? e.message : String(e)}`);
      sectionSplitSuccess = true; // Non-blocking
    }

    // Update Section Split result + mark Code Gen as next active
    const s3 = stages.map((s: any, i: number) => {
      if (i === 0) return { ...s, status: "done" };
      if (i === 1) return { ...s, status: sectionSplitSuccess ? "done" : "error" };
      if (i === 2) return { ...s, status: sectionSplitSuccess ? "active" : "pending" };
      return s;
    });
    await updateStages(s3);

    return new Response(
      JSON.stringify({
        success: true,
        pipeline_project_id,
        figma_pull: figmaPullSuccess ? "done" : "error",
        section_split: sectionSplitSuccess ? "done" : "error",
        log,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("pipeline-auto-setup error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
