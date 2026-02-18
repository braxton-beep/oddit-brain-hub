import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Constants (resolved from live API lookup) ────────────────────────────────
const ASANA_PROJECT_GID = "1203000364658371"; // Oddit Fulfilment
const SECTION_CLIENT_FIGMA_SETUP = "1207466847448691"; // "Client Figma Setup" = Ready for Setup
const SECTION_READY_FOR_DECK = "1203000364658378"; // "Ready for Deck" = Setup Complete

const ASANA_API = "https://app.asana.com/api/1.0";

// ── Helpers ──────────────────────────────────────────────────────────────────
async function asanaFetch(path: string, token: string, options: RequestInit = {}) {
  const res = await fetch(`${ASANA_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers ?? {}),
    },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Asana API ${res.status}: ${JSON.stringify(json.errors ?? json)}`);
  }
  return json.data ?? json;
}

async function getAsanaToken(sb: ReturnType<typeof createClient>): Promise<string> {
  // Prefer env secret
  const envToken = Deno.env.get("ASANA_ACCESS_TOKEN");
  if (envToken) return envToken;

  // Fall back to DB credentials
  const { data: cred } = await sb
    .from("integration_credentials")
    .select("api_key")
    .eq("integration_id", "asana")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!cred?.api_key) throw new Error("Asana token not configured. Add your PAT in Settings.");
  return cred.api_key;
}

async function getFigmaToken(sb: ReturnType<typeof createClient>): Promise<string | null> {
  const { data: cred } = await sb
    .from("integration_credentials")
    .select("api_key")
    .eq("integration_id", "figma")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  return cred?.api_key ?? null;
}

// ── Step emitter helper ───────────────────────────────────────────────────────
type StepStatus = "running" | "done" | "error" | "skipped";

interface StepResult {
  step: number;
  name: string;
  status: StepStatus;
  detail?: string;
  error?: string;
}

// ── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const {
      client_name,
      shop_url,
      tier = "pro", // "pro" | "essential"
      figma_template_key,
      existing_task_gid,
    } = body;

    if (!client_name || !shop_url) {
      return new Response(
        JSON.stringify({ error: "client_name and shop_url are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const asanaToken = await getAsanaToken(sb);
    const figmaToken = await getFigmaToken(sb);

    const steps: StepResult[] = [];
    let taskGid = existing_task_gid ?? null;
    let figmaFileLink: string | null = null;
    let figmaSlidesLink: string | null = null;

    // ── STEP 1: Create/verify Asana card ─────────────────────────────────────
    steps.push({ step: 1, name: "Create Asana Card", status: "running" });
    try {
      if (taskGid) {
        // Update existing task notes with URLs
        await asanaFetch(`/tasks/${taskGid}`, asanaToken, {
          method: "PUT",
          body: JSON.stringify({
            data: {
              notes: `Client: ${client_name}\nShop URL: ${shop_url}\nTier: ${tier.toUpperCase()}\n\nTriggered via Oddit Brain automation.`,
            },
          }),
        });
        steps[steps.length - 1] = { step: 1, name: "Create Asana Card", status: "done", detail: `Updated existing task ${taskGid}` };
      } else {
        const task = await asanaFetch("/tasks", asanaToken, {
          method: "POST",
          body: JSON.stringify({
            data: {
              name: `${client_name} — ${tier.charAt(0).toUpperCase() + tier.slice(1)} Report`,
              notes: `Client: ${client_name}\nShop URL: ${shop_url}\nTier: ${tier.toUpperCase()}\n\nTriggered via Oddit Brain automation.`,
              projects: [ASANA_PROJECT_GID],
            },
          }),
        });
        taskGid = task.gid;
        steps[steps.length - 1] = { step: 1, name: "Create Asana Card", status: "done", detail: `Created task ${taskGid}` };
      }
    } catch (e) {
      steps[steps.length - 1] = { step: 1, name: "Create Asana Card", status: "error", error: String(e) };
      return new Response(JSON.stringify({ success: false, steps, error: String(e) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── STEP 2: Move to "Client Figma Setup" (Ready for Setup) ───────────────
    steps.push({ step: 2, name: "Move to Ready for Setup", status: "running" });
    try {
      await asanaFetch(`/sections/${SECTION_CLIENT_FIGMA_SETUP}/addTask`, asanaToken, {
        method: "POST",
        body: JSON.stringify({ data: { task: taskGid } }),
      });
      steps[steps.length - 1] = { step: 2, name: "Move to Ready for Setup", status: "done", detail: "Moved to Client Figma Setup column" };
    } catch (e) {
      steps[steps.length - 1] = { step: 2, name: "Move to Ready for Setup", status: "error", error: String(e) };
    }

    // ── STEP 3: Figma file setup ──────────────────────────────────────────────
    steps.push({ step: 3, name: "Figma File Setup", status: "running" });
    if (!figmaToken) {
      steps[steps.length - 1] = { step: 3, name: "Figma File Setup", status: "skipped", detail: "No Figma token configured — skipped" };
    } else if (figma_template_key) {
      try {
        // Duplicate the Figma file (Figma API: POST /v1/files/:file_key/duplicate)
        const dupRes = await fetch(`https://api.figma.com/v1/files/${figma_template_key}/duplicate`, {
          method: "POST",
          headers: {
            "X-Figma-Token": figmaToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: `${client_name} — ${tier.charAt(0).toUpperCase() + tier.slice(1)} Report` }),
        });
        if (dupRes.ok) {
          const dupData = await dupRes.json();
          const newFileKey = dupData.key ?? dupData.file?.key;
          if (newFileKey) {
            figmaFileLink = `https://www.figma.com/file/${newFileKey}`;
            steps[steps.length - 1] = { step: 3, name: "Figma File Setup", status: "done", detail: `Duplicated to ${figmaFileLink}` };
          } else {
            steps[steps.length - 1] = { step: 3, name: "Figma File Setup", status: "skipped", detail: "Duplicate succeeded but no file key returned" };
          }
        } else {
          const errText = await dupRes.text();
          steps[steps.length - 1] = { step: 3, name: "Figma File Setup", status: "skipped", detail: `Figma duplication not available via API (${dupRes.status}): ${errText}` };
        }
      } catch (e) {
        steps[steps.length - 1] = { step: 3, name: "Figma File Setup", status: "error", error: String(e) };
      }
    } else {
      steps[steps.length - 1] = { step: 3, name: "Figma File Setup", status: "skipped", detail: "No template key provided — paste Figma link manually" };
    }

    // ── STEP 4: Update Asana card with Figma file link ────────────────────────
    steps.push({ step: 4, name: "Link Figma File to Asana", status: "running" });
    if (figmaFileLink) {
      try {
        const existing = await asanaFetch(`/tasks/${taskGid}?opt_fields=notes`, asanaToken);
        const newNotes = `${existing.notes ?? ""}\n\n📎 Figma File: ${figmaFileLink}`.trim();
        await asanaFetch(`/tasks/${taskGid}`, asanaToken, {
          method: "PUT",
          body: JSON.stringify({ data: { notes: newNotes } }),
        });
        steps[steps.length - 1] = { step: 4, name: "Link Figma File to Asana", status: "done", detail: "Figma file link added to task notes" };
      } catch (e) {
        steps[steps.length - 1] = { step: 4, name: "Link Figma File to Asana", status: "error", error: String(e) };
      }
    } else {
      steps[steps.length - 1] = { step: 4, name: "Link Figma File to Asana", status: "skipped", detail: "No Figma file link to attach" };
    }

    // ── STEP 5: Create Figma Slides report ────────────────────────────────────
    steps.push({ step: 5, name: "Create Figma Slides Report", status: "running" });
    // Figma Slides (FigJam/Slides) duplication uses the same duplicate endpoint.
    // If no slides template provided, we skip and instruct manual creation.
    const slidesTemplateKey = body.figma_slides_template_key ?? null;
    if (!figmaToken) {
      steps[steps.length - 1] = { step: 5, name: "Create Figma Slides Report", status: "skipped", detail: "No Figma token — skipped" };
    } else if (slidesTemplateKey) {
      try {
        const dupRes = await fetch(`https://api.figma.com/v1/files/${slidesTemplateKey}/duplicate`, {
          method: "POST",
          headers: {
            "X-Figma-Token": figmaToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: `${client_name} — ${tier.charAt(0).toUpperCase() + tier.slice(1)} Report Slides` }),
        });
        if (dupRes.ok) {
          const dupData = await dupRes.json();
          const newFileKey = dupData.key ?? dupData.file?.key;
          if (newFileKey) {
            figmaSlidesLink = `https://www.figma.com/file/${newFileKey}`;
            steps[steps.length - 1] = { step: 5, name: "Create Figma Slides Report", status: "done", detail: `Created slides at ${figmaSlidesLink}` };
          } else {
            steps[steps.length - 1] = { step: 5, name: "Create Figma Slides Report", status: "skipped", detail: "Slides template duplicated but no key returned" };
          }
        } else {
          const errText = await dupRes.text();
          steps[steps.length - 1] = { step: 5, name: "Create Figma Slides Report", status: "skipped", detail: `Figma slides duplication not supported (${dupRes.status})` };
        }
      } catch (e) {
        steps[steps.length - 1] = { step: 5, name: "Create Figma Slides Report", status: "error", error: String(e) };
      }
    } else {
      steps[steps.length - 1] = { step: 5, name: "Create Figma Slides Report", status: "skipped", detail: "No slides template key — add it in the trigger form" };
    }

    // ── STEP 6: Update Asana card with Figma Slides link ─────────────────────
    steps.push({ step: 6, name: "Link Figma Slides to Asana", status: "running" });
    if (figmaSlidesLink) {
      try {
        const existing = await asanaFetch(`/tasks/${taskGid}?opt_fields=notes`, asanaToken);
        const newNotes = `${existing.notes ?? ""}\n\n📊 Figma Slides: ${figmaSlidesLink}`.trim();
        await asanaFetch(`/tasks/${taskGid}`, asanaToken, {
          method: "PUT",
          body: JSON.stringify({ data: { notes: newNotes } }),
        });
        steps[steps.length - 1] = { step: 6, name: "Link Figma Slides to Asana", status: "done", detail: "Slides link added to task notes" };
      } catch (e) {
        steps[steps.length - 1] = { step: 6, name: "Link Figma Slides to Asana", status: "error", error: String(e) };
      }
    } else {
      steps[steps.length - 1] = { step: 6, name: "Link Figma Slides to Asana", status: "skipped", detail: "No slides link to attach" };
    }

    // ── STEP 7: Move to "Ready for Deck" (Setup Complete) ────────────────────
    steps.push({ step: 7, name: "Move to Setup Complete", status: "running" });
    try {
      await asanaFetch(`/sections/${SECTION_READY_FOR_DECK}/addTask`, asanaToken, {
        method: "POST",
        body: JSON.stringify({ data: { task: taskGid } }),
      });
      steps[steps.length - 1] = { step: 7, name: "Move to Setup Complete", status: "done", detail: "Moved to Ready for Deck column" };
    } catch (e) {
      steps[steps.length - 1] = { step: 7, name: "Move to Setup Complete", status: "error", error: String(e) };
    }

    // ── Log to activity_log ───────────────────────────────────────────────────
    const allDone = steps.every((s) => s.status === "done" || s.status === "skipped");
    try {
      await sb.from("activity_log").insert({
        workflow_name: `Report Setup: ${client_name} (${tier})`,
        status: allDone ? "completed" : "partial",
      });
    } catch (_) { /* non-fatal */ }

    return new Response(
      JSON.stringify({
        success: true,
        task_gid: taskGid,
        asana_url: `https://app.asana.com/0/${ASANA_PROJECT_GID}/${taskGid}`,
        figma_file_link: figmaFileLink,
        figma_slides_link: figmaSlidesLink,
        steps,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("run-report-setup error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
