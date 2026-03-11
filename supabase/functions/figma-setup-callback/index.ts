/**
 * figma-setup-callback
 *
 * Called by the Playwright automation service when Figma setup completes.
 * - Updates setup_runs status + figma_file_link
 * - Moves Asana task to "Ready for Review"
 * - Posts Slack notification (if configured)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

const ASANA_API = "https://app.asana.com/api/1.0";

// Asana "Ready for Review" section GID (from Braxton's brief)
const SECTION_READY_FOR_REVIEW = "1213418243007820";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Validate webhook secret
  const automationSecret = Deno.env.get("FIGMA_AUTOMATION_SECRET");
  if (automationSecret) {
    const provided = req.headers.get("x-webhook-secret");
    if (provided !== automationSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { status, supabaseRunId, reportName, figmaUrl, error: automationError } = body;

    console.log("[figma-setup-callback] Received", { status, supabaseRunId, reportName });

    if (!supabaseRunId) {
      return new Response(JSON.stringify({ error: "supabaseRunId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Fetch the setup_run ────────────────────────────────────────────────
    const { data: run, error: fetchError } = await sb
      .from("setup_runs")
      .select("id, asana_task_gid, client_name, tier, steps")
      .eq("id", supabaseRunId)
      .single();

    if (fetchError || !run) {
      console.error("[figma-setup-callback] setup_run not found:", supabaseRunId);
      return new Response(JSON.stringify({ error: "setup_run not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Update setup_runs ──────────────────────────────────────────────────
    const newSteps = [
      ...(run.steps ?? []),
      {
        step: "figma_automation",
        name: "Figma Setup (Automated)",
        status: status === "success" ? "done" : "error",
        detail: status === "success"
          ? `Report created: ${reportName}`
          : `Automation failed: ${automationError}`,
      },
    ];

    await sb.from("setup_runs").update({
      status: status === "success" ? "done" : "error",
      figma_file_link: figmaUrl ?? null,
      steps: newSteps,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", supabaseRunId);

    // ── Move Asana task to Ready for Review ────────────────────────────────
    if (status === "success" && run.asana_task_gid) {
      try {
        const asanaToken = Deno.env.get("ASANA_ACCESS_TOKEN");
        if (!asanaToken) throw new Error("ASANA_ACCESS_TOKEN not set");

        // Move to Ready for Review section
        await fetch(`${ASANA_API}/sections/${SECTION_READY_FOR_REVIEW}/addTask`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${asanaToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ data: { task: run.asana_task_gid } }),
        });

        // Append Figma link to Asana task notes
        if (figmaUrl) {
          const taskRes = await fetch(
            `${ASANA_API}/tasks/${run.asana_task_gid}?opt_fields=notes`,
            { headers: { Authorization: `Bearer ${asanaToken}` } }
          );
          const taskData = await taskRes.json();
          const existingNotes = taskData?.data?.notes ?? "";

          const updatedNotes = `${existingNotes}\n\n✅ Figma file ready: ${figmaUrl}\n📋 Report: ${reportName}`.trim();
          await fetch(`${ASANA_API}/tasks/${run.asana_task_gid}`, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${asanaToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ data: { notes: updatedNotes } }),
          });
        }

        console.log(`[figma-setup-callback] Asana task ${run.asana_task_gid} moved to Ready for Review`);
      } catch (asanaErr) {
        console.error("[figma-setup-callback] Asana update failed (non-fatal):", asanaErr);
      }
    }

    // ── Slack notification ─────────────────────────────────────────────────
    const slackWebhook = Deno.env.get("SLACK_WEBHOOK_URL");
    if (slackWebhook) {
      const emoji = status === "success" ? "✅" : "❌";
      const msg = status === "success"
        ? `${emoji} *Figma setup complete* — ${run.client_name} (${run.tier})\n<${figmaUrl}|Open report> · Moved to Ready for Review`
        : `${emoji} *Figma setup failed* — ${run.client_name} (${run.tier})\nError: ${automationError}`;

      await fetch(slackWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: msg }),
      }).catch((e) => console.warn("[figma-setup-callback] Slack notify failed:", e));
    }

    return new Response(
      JSON.stringify({ success: true, status, reportName }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[figma-setup-callback] Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
