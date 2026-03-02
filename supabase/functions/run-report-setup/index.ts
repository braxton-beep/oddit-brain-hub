import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Constants ────────────────────────────────────────────────────────────────
const ASANA_PROJECT_GID = "1207443359385412"; // Oddit Setups
const SECTION_READY_FOR_SETUP = "1207443359385417";
const ASANA_API = "https://app.asana.com/api/1.0";
const FIGMA_API = "https://api.figma.com/v1";
const FIRECRAWL_API = "https://api.firecrawl.dev/v1";

// ── Asana Custom Field GIDs ──────────────────────────────────────────────────
const CF_TYPE = "1205565239136671";
const CF_TYPE_REPORT = "1205565239136672";
const CF_BREAKPOINTS = "1206927655441547";
const CF_BREAKPOINTS_BOTH = "1206927655441550";
const CF_NUM_PAGES = "1206927655441553";
const CF_NUM_PAGES_MAP: Record<number, string> = {
  1: "1206927655441556", 2: "1206927655441557", 3: "1206927655441558",
  4: "1206927655441559", 5: "1206927655443645", 6: "1206927655443646",
  7: "1207661312443019", 8: "1207661312443020", 9: "1207661312443021",
  10: "1207661312443022",
};

const DEFAULT_FIGMA_AUDIT_TEMPLATE_KEY = "3EfexlsSpqIciz7PkcSPwu";
const DEFAULT_FIGMA_SLIDES_TEMPLATE_KEY = "7iTirmji3y4s35Xyrk2Cwg";
const DEFAULT_FIGMA_LANDING_PAGE_TEMPLATE_KEY = "Jvl3mHljgyBWOJXunGjL1b";
const DEFAULT_FIGMA_NEW_SITE_TEMPLATE_KEY = "I5FKz7pnaTL1iXlujGTQvU";

// Figma destination project IDs for file placement
const FIGMA_PROJECT_LANDING_PAGES = "105286773";
const FIGMA_PROJECT_NEW_SITE_DESIGNS = "229666225";
const FIGMA_PROJECT_REPORTS = "258925701";

// ── Types ─────────────────────────────────────────────────────────────────────
type StepStatus = "running" | "done" | "error" | "skipped";
interface StepResult {
  step: number;
  name: string;
  status: StepStatus;
  detail?: string;
  error?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
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
  if (!res.ok) throw new Error(`Asana API ${res.status}: ${JSON.stringify(json.errors ?? json)}`);
  return json.data ?? json;
}

async function getAsanaToken(sb: ReturnType<typeof createClient>): Promise<string> {
  const envToken = Deno.env.get("ASANA_ACCESS_TOKEN");
  if (envToken) return envToken;
  const { data: cred } = await sb
    .from("integration_credentials").select("api_key")
    .eq("integration_id", "asana").order("created_at", { ascending: false }).limit(1).single();
  if (!cred?.api_key) throw new Error("Asana token not configured.");
  return cred.api_key;
}

async function getFigmaToken(sb: ReturnType<typeof createClient>): Promise<string | null> {
  const { data: cred } = await sb
    .from("integration_credentials").select("api_key")
    .eq("integration_id", "figma").order("created_at", { ascending: false }).limit(1).single();
  return cred?.api_key ?? null;
}

function getFirecrawlKey(): string | null {
  return Deno.env.get("FIRECRAWL_API_KEY") ?? null;
}

// ── Full-page homepage screenshot via Firecrawl ───────────────────────────────
async function captureHomepageScreenshot(
  url: string,
  firecrawlKey: string,
  mobile: boolean,
  label: string
): Promise<Uint8Array | null> {
  console.log(`[Screenshot] Capturing ${label} (${mobile ? "mobile" : "desktop"}, full page): ${url}`);
  try {
    const resp = await fetch(`${FIRECRAWL_API}/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${firecrawlKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["screenshot@fullPage"],
        mobile,
        waitFor: 2000,
        actions: [
          { type: "wait", milliseconds: 1000 },
          // Dismiss popups via JS — fast single injection
          { type: "evaluate", code: `
            document.querySelectorAll('[class*="popup" i], [class*="modal" i], [class*="overlay" i], [class*="cookie" i], [id*="popup" i], [id*="modal" i], [class*="klaviyo" i], [class*="newsletter" i], [class*="subscribe" i], [class*="banner" i]').forEach(el => { if (el.offsetHeight > 50) el.remove(); });
            document.querySelectorAll('[class*="backdrop" i], [class*="overlay" i]').forEach(el => el.remove());
            document.body.style.overflow = 'auto';
            document.documentElement.style.overflow = 'auto';
          `},
          { type: "wait", milliseconds: 500 },
        ],
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      console.error(`[Screenshot] Firecrawl error for ${label}: ${resp.status} — ${errBody.substring(0, 500)}`);
      return null;
    }

    const data = await resp.json();
    const screenshotField = data.data?.screenshot || data.screenshot || "";

    if (!screenshotField) {
      console.warn(`[Screenshot] No screenshot data for ${label}`);
      return null;
    }

    // Handle URL or base64
    if (screenshotField.startsWith("http")) {
      const imgRes = await fetch(screenshotField);
      if (!imgRes.ok) return null;
      return new Uint8Array(await imgRes.arrayBuffer());
    }

    const raw = screenshotField.replace(/^data:image\/[a-z]+;base64,/, "");
    const padded = raw + "=".repeat((4 - (raw.length % 4)) % 4);
    const binaryStr = atob(padded);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    console.log(`[Screenshot] ${label}: ${bytes.length} bytes`);
    return bytes;
  } catch (e) {
    console.error(`[Screenshot] Error for ${label}:`, e);
    return null;
  }
}

// ── Attach image to Asana task ────────────────────────────────────────────────
async function attachImageToAsana(
  taskGid: string,
  asanaToken: string,
  imageBytes: Uint8Array,
  filename: string
): Promise<boolean> {
  try {
    const formData = new FormData();
    formData.append("file", new Blob([imageBytes], { type: "image/png" }), filename);
    const res = await fetch(`${ASANA_API}/tasks/${taskGid}/attachments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${asanaToken}` },
      body: formData,
    });
    if (!res.ok) {
      console.warn(`Asana attachment failed for ${filename}:`, res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error(`Asana attachment error for ${filename}:`, e);
    return false;
  }
}

// ── Upload to Supabase storage ────────────────────────────────────────────────
async function uploadToStorage(
  sb: ReturnType<typeof createClient>,
  pngBytes: Uint8Array,
  filename: string
): Promise<string | null> {
  try {
    const { error } = await sb.storage
      .from("audit-assets")
      .upload(`screenshots/${filename}`, pngBytes, { contentType: "image/png", upsert: true });
    if (error) { console.error("Storage upload error:", error); return null; }
    const { data: urlData } = sb.storage.from("audit-assets").getPublicUrl(`screenshots/${filename}`);
    return urlData?.publicUrl ?? null;
  } catch (e) {
    console.error("uploadToStorage error:", e);
    return null;
  }
}

// ── Asana: find or create a tag ───────────────────────────────────────────────
async function findOrCreateAsanaTag(
  tagName: string, workspaceGid: string, asanaToken: string
): Promise<string | null> {
  try {
    const searchRes = await asanaFetch(
      `/workspaces/${workspaceGid}/tags?opt_fields=name&limit=100`, asanaToken
    );
    const existing = (searchRes as Array<{ gid: string; name: string }>)
      .find((t) => t.name.toLowerCase() === tagName.toLowerCase());
    if (existing) return existing.gid;

    const newTag = await asanaFetch("/tags", asanaToken, {
      method: "POST",
      body: JSON.stringify({ data: { name: tagName, workspace: workspaceGid } }),
    });
    return newTag.gid ?? null;
  } catch (e) {
    console.error(`Tag creation failed for "${tagName}":`, e);
    return null;
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const {
      client_name, shop_url, focus_url, tier = "pro",
      existing_task_gid, pages, extra_urls,
      project_type = "report", // "report" | "landing_page" | "new_site_design"
    } = body;

    if (!client_name || !shop_url) {
      return new Response(
        JSON.stringify({ error: "client_name and shop_url are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const [asanaToken, figmaToken, firecrawlKey] = await Promise.all([
      getAsanaToken(sb),
      getFigmaToken(sb),
      Promise.resolve(getFirecrawlKey()),
    ]);

    const steps: StepResult[] = [];
    let taskGid = existing_task_gid ?? null;
    let taskNotes = "";
    let figmaFileLink: string | null = null;
    let figmaSlidesLink: string | null = null;
    const screenshotUrls: Record<string, string> = {};
    const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
    let setupRunId: string | null = null;

    const pageCount: number | null = tier === "pro" && pages ? Number(pages) : (
      tier === "essential" && extra_urls ? (extra_urls as string[]).length + 1 : null
    );

    const customFields: Record<string, string> = {
      [CF_TYPE]: CF_TYPE_REPORT,
      [CF_BREAKPOINTS]: CF_BREAKPOINTS_BOTH,
    };
    if (pageCount && CF_NUM_PAGES_MAP[pageCount]) {
      customFields[CF_NUM_PAGES] = CF_NUM_PAGES_MAP[pageCount];
    }

    // ── STEP 1: Create / update Asana card ───────────────────────────────────
    steps.push({ step: 1, name: "Create Asana Card", status: "running" });
    try {
      const buildNotes = () =>
        `Client: ${client_name}\nWebsite URL: ${shop_url}${focus_url ? `\nFocus URL: ${focus_url}` : ""}\nTier: ${tier.toUpperCase()}${pageCount ? `\nPages: ${pageCount}` : ""}\n\nTriggered via Oddit Brain automation.`;

      if (taskGid) {
        const task = await asanaFetch(`/tasks/${taskGid}?opt_fields=notes,name`, asanaToken);
        taskNotes = task.notes ?? "";
        if (!taskNotes.toLowerCase().includes("website url:")) {
          taskNotes = buildNotes();
          await asanaFetch(`/tasks/${taskGid}`, asanaToken, {
            method: "PUT",
            body: JSON.stringify({ data: { notes: taskNotes, custom_fields: customFields } }),
          });
        }
        steps[steps.length - 1] = { step: 1, name: "Create Asana Card", status: "done", detail: `Updated existing task ${taskGid}` };
      } else {
        taskNotes = buildNotes();
        const task = await asanaFetch("/tasks", asanaToken, {
          method: "POST",
          body: JSON.stringify({
            data: {
              name: `${client_name} — ${tierLabel} Report`,
              notes: taskNotes,
              projects: [ASANA_PROJECT_GID],
              custom_fields: customFields,
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

    // ── Create setup_runs record ─────────────────────────────────────────────
    try {
      const { data: runRecord } = await sb.from("setup_runs").upsert({
        asana_task_gid: taskGid!,
        client_name,
        shop_url,
        tier,
        status: "running",
        started_at: new Date().toISOString(),
        asana_url: `https://app.asana.com/0/${ASANA_PROJECT_GID}/${taskGid}`,
        steps,
      }, { onConflict: "asana_task_gid" }).select("id").single();
      if (runRecord) setupRunId = runRecord.id;
    } catch (e) {
      console.warn("Failed to create setup_runs record:", e);
    }

    // Helper to persist step progress
    async function persistSteps() {
      if (!setupRunId) return;
      try { await sb.from("setup_runs").update({ steps, updated_at: new Date().toISOString() }).eq("id", setupRunId); } catch (_) {}
    }

    // ── STEP 2: Move to Ready for Setup ──────────────────────────────────────
    steps.push({ step: 2, name: "Move to Ready for Setup", status: "running" });
    try {
      await asanaFetch(`/sections/${SECTION_READY_FOR_SETUP}/addTask`, asanaToken, {
        method: "POST",
        body: JSON.stringify({ data: { task: taskGid } }),
      });
      steps[steps.length - 1] = { step: 2, name: "Move to Ready for Setup", status: "done" };
    } catch (e) {
      steps[steps.length - 1] = { step: 2, name: "Move to Ready for Setup", status: "error", error: String(e) };
    }

    // ── STEP 3: Homepage screenshots (Desktop + Mobile) ──────────────────────
    steps.push({ step: 3, name: "Homepage Screenshots", status: "running" });
    if (!firecrawlKey) {
      steps[steps.length - 1] = { step: 3, name: "Homepage Screenshots", status: "skipped", detail: "No Firecrawl API key" };
    } else {
      try {
        const slug = client_name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const ts = Date.now();
        const mainUrl = shop_url;

        // Capture desktop + mobile in parallel
        const [desktopBytes, mobileBytes] = await Promise.all([
          captureHomepageScreenshot(mainUrl, firecrawlKey, false, "Desktop"),
          captureHomepageScreenshot(mainUrl, firecrawlKey, true, "Mobile"),
        ]);

        const results: string[] = [];

        // Upload & attach desktop
        if (desktopBytes) {
          const filename = `${slug}-desktop-${ts}.png`;
          const url = await uploadToStorage(sb, desktopBytes, filename);
          if (url) screenshotUrls["Desktop"] = url;
          if (taskGid) await attachImageToAsana(taskGid, asanaToken, desktopBytes, `${client_name} - Desktop.png`);
          results.push(`✓ Desktop (${desktopBytes.length} bytes)`);
        } else {
          results.push("✗ Desktop");
        }

        // Upload & attach mobile
        if (mobileBytes) {
          const filename = `${slug}-mobile-${ts}.png`;
          const url = await uploadToStorage(sb, mobileBytes, filename);
          if (url) screenshotUrls["Mobile"] = url;
          if (taskGid) await attachImageToAsana(taskGid, asanaToken, mobileBytes, `${client_name} - Mobile.png`);
          results.push(`✓ Mobile (${mobileBytes.length} bytes)`);
        } else {
          results.push("✗ Mobile");
        }

        const successCount = Object.keys(screenshotUrls).length;
        steps[steps.length - 1] = {
          step: 3, name: "Homepage Screenshots",
          status: successCount > 0 ? "done" : "error",
          detail: results.join(" | "),
        };
      } catch (e) {
        console.error("Step 3 error:", e);
        steps[steps.length - 1] = { step: 3, name: "Homepage Screenshots", status: "error", error: String(e) };
      }
    }

    // ── STEP 4: Update Asana card notes with screenshot URLs ─────────────────
    steps.push({ step: 4, name: "Update Asana Notes", status: "running" });
    try {
      const existing = await asanaFetch(`/tasks/${taskGid}?opt_fields=notes`, asanaToken);
      const parts = [existing.notes ?? ""];

      if (Object.keys(screenshotUrls).length > 0) {
        const lines = Object.entries(screenshotUrls)
          .map(([label, url]) => `  📸 ${label}: ${url}`)
          .join("\n");
        parts.push(`\n\n📸 Homepage Screenshots:\n${lines}`);
      }

      const newNotes = parts.join("").trim();
      if (newNotes !== (existing.notes ?? "").trim()) {
        await asanaFetch(`/tasks/${taskGid}`, asanaToken, {
          method: "PUT",
          body: JSON.stringify({ data: { notes: newNotes } }),
        });
      }
      steps[steps.length - 1] = { step: 4, name: "Update Asana Notes", status: "done" };
    } catch (e) {
      steps[steps.length - 1] = { step: 4, name: "Update Asana Notes", status: "error", error: String(e) };
    }

    // ── STEP 5: Add tags ─────────────────────────────────────────────────────
    steps.push({ step: 5, name: "Add Asana Tags", status: "running" });
    try {
      const taskDetail = await asanaFetch(`/tasks/${taskGid}?opt_fields=workspace.gid`, asanaToken);
      const workspaceGid = taskDetail?.workspace?.gid;

      if (!workspaceGid) {
        steps[steps.length - 1] = { step: 5, name: "Add Asana Tags", status: "skipped", detail: "No workspace" };
      } else {
        const tagNames = [`Tier: ${tierLabel}`, "Auto-Setup"];
        const tagResults: string[] = [];
        for (const tagName of tagNames) {
          const tagGid = await findOrCreateAsanaTag(tagName, workspaceGid, asanaToken);
          if (tagGid) {
            await asanaFetch(`/tasks/${taskGid}/addTag`, asanaToken, {
              method: "POST",
              body: JSON.stringify({ data: { tag: tagGid } }),
            });
            tagResults.push(`✓ ${tagName}`);
          } else {
            tagResults.push(`✗ ${tagName}`);
          }
        }
        steps[steps.length - 1] = { step: 5, name: "Add Asana Tags", status: "done", detail: tagResults.join(" | ") };
      }
    } catch (e) {
      steps[steps.length - 1] = { step: 5, name: "Add Asana Tags", status: "error", error: String(e) };
    }

    // ── STEP 6: Duplicate Figma templates ────────────────────────────────────
    steps.push({ step: 6, name: "Duplicate Figma Templates", status: "running" });
    if (!figmaToken) {
      steps[steps.length - 1] = { step: 6, name: "Duplicate Figma Templates", status: "skipped", detail: "No Figma token" };
    } else {
      const figmaResults: string[] = [];

      // Helper: duplicate a Figma file and optionally move to a project
      async function duplicateFigmaFile(
        templateKey: string, fileName: string, destProjectId?: string
      ): Promise<string | null> {
        const dupRes = await fetch(`${FIGMA_API}/files/${templateKey}/duplicate`, {
          method: "POST",
          headers: { "X-Figma-Token": figmaToken!, "Content-Type": "application/json" },
          body: JSON.stringify({ name: fileName }),
        });
        if (!dupRes.ok) return null;
        const dupData = await dupRes.json();
        const newKey = dupData.key ?? dupData.file?.key ?? null;
        if (!newKey) return null;

        // Move to destination project if specified
        if (destProjectId) {
          try {
            await fetch(`${FIGMA_API}/projects/${destProjectId}/move`, {
              method: "POST",
              headers: { "X-Figma-Token": figmaToken!, "Content-Type": "application/json" },
              body: JSON.stringify({ files: [newKey] }),
            });
          } catch (e) {
            console.warn(`Failed to move file ${newKey} to project ${destProjectId}:`, e);
          }
        }
        return newKey;
      }

      if (project_type === "landing_page") {
        // Landing Page: single template, naming: "Client Name // Landing Page"
        try {
          const newKey = await duplicateFigmaFile(
            DEFAULT_FIGMA_LANDING_PAGE_TEMPLATE_KEY,
            `${client_name} // Landing Page`,
            FIGMA_PROJECT_LANDING_PAGES
          );
          if (newKey) {
            figmaFileLink = `https://www.figma.com/file/${newKey}`;
            figmaResults.push("Landing Page: ✓");
          } else {
            figmaResults.push("Landing Page: skipped");
          }
        } catch (e) {
          figmaResults.push(`Landing Page: error — ${e}`);
        }
      } else if (project_type === "new_site_design") {
        // New Site Design: single template, naming: "Client Name // New Site Design"
        try {
          const newKey = await duplicateFigmaFile(
            DEFAULT_FIGMA_NEW_SITE_TEMPLATE_KEY,
            `${client_name} // New Site Design`,
            FIGMA_PROJECT_NEW_SITE_DESIGNS
          );
          if (newKey) {
            figmaFileLink = `https://www.figma.com/file/${newKey}`;
            figmaResults.push("New Site Design: ✓");
          } else {
            figmaResults.push("New Site Design: skipped");
          }
        } catch (e) {
          figmaResults.push(`New Site Design: error — ${e}`);
        }
      } else {
        // Report (default): Audit + Slides templates
        try {
          const newKey = await duplicateFigmaFile(
            DEFAULT_FIGMA_AUDIT_TEMPLATE_KEY,
            `${client_name} // ${tierLabel} Report`,
            FIGMA_PROJECT_REPORTS
          );
          if (newKey) {
            figmaFileLink = `https://www.figma.com/file/${newKey}`;
            figmaResults.push("Audit: ✓");
          } else {
            figmaResults.push("Audit: skipped");
          }
        } catch (e) {
          figmaResults.push(`Audit: error — ${e}`);
        }

        try {
          const newKey = await duplicateFigmaFile(
            DEFAULT_FIGMA_SLIDES_TEMPLATE_KEY,
            `${client_name} // ${tierLabel} Report Slides`,
            FIGMA_PROJECT_REPORTS
          );
          if (newKey) {
            figmaSlidesLink = `https://www.figma.com/file/${newKey}`;
            figmaResults.push("Slides: ✓");
          } else {
            figmaResults.push("Slides: skipped");
          }
        } catch (e) {
          figmaResults.push(`Slides: error — ${e}`);
        }
      }

      // Append Figma links to Asana notes
      if (figmaFileLink || figmaSlidesLink) {
        try {
          const existing = await asanaFetch(`/tasks/${taskGid}?opt_fields=notes`, asanaToken);
          const additions: string[] = [];
          if (figmaFileLink) additions.push(`📎 Figma File: ${figmaFileLink}`);
          if (figmaSlidesLink) additions.push(`📊 Figma Slides: ${figmaSlidesLink}`);

          if (Object.keys(screenshotUrls).length > 0) {
            additions.push(`\n🖼️ Paste these into Figma template frames:`);
            for (const [label, url] of Object.entries(screenshotUrls)) {
              additions.push(`  → ${label} Screenshot: ${url}`);
            }
          }

          const newNotes = `${existing.notes ?? ""}\n\n${additions.join("\n")}`.trim();
          await asanaFetch(`/tasks/${taskGid}`, asanaToken, {
            method: "PUT",
            body: JSON.stringify({ data: { notes: newNotes } }),
          });
        } catch (e) {
          console.warn("Failed to append Figma links to Asana:", e);
        }
      }

      steps[steps.length - 1] = {
        step: 6, name: "Duplicate Figma Templates",
        status: figmaFileLink || figmaSlidesLink ? "done" : "skipped",
        detail: figmaResults.join(" | "),
      };
    }

    // ── STEP 7: Card stays in Ready for Setup ────────────────────────────────
    steps.push({ step: 7, name: "Card Placement", status: "done", detail: "Card stays in Ready for Setup — human moves to Setup Complete" });

    // ── Finalize setup_runs record ──────────────────────────────────────────
    const allOk = steps.every((s) => s.status === "done" || s.status === "skipped");
    if (setupRunId) {
      try {
        await sb.from("setup_runs").update({
          status: allOk ? "done" : "error",
          steps,
          figma_file_link: figmaFileLink,
          figma_slides_link: figmaSlidesLink,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", setupRunId);
      } catch (_) {}
    }

    // ── Activity log ──────────────────────────────────────────────────────────
    try {
      await sb.from("activity_log").insert({
        workflow_name: `Report Setup: ${client_name} (${tier})`,
        status: allOk ? "completed" : "partial",
      });
    } catch (_) { /* non-fatal */ }

    return new Response(
      JSON.stringify({
        success: true,
        task_gid: taskGid,
        asana_url: `https://app.asana.com/0/${ASANA_PROJECT_GID}/${taskGid}`,
        figma_file_link: figmaFileLink,
        figma_slides_link: figmaSlidesLink,
        screenshot_urls: screenshotUrls,
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
