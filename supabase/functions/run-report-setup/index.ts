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
const SECTION_SETUP_COMPLETE = "1207443359385418";
const ASANA_API = "https://app.asana.com/api/1.0";
const FIGMA_API = "https://api.figma.com/v1";
const FIRECRAWL_API = "https://api.firecrawl.dev/v1";

// ── Asana Custom Field GIDs ──────────────────────────────────────────────────
const CF_TYPE = "1205565239136671";
const CF_TYPE_REPORT = "1205565239136672";

// Note: "Not Started" (1205789138669683) is disabled in Asana — skipping Project Status
// const CF_PROJECT_STATUS = "1205789138669682";
// const CF_PROJECT_STATUS_NOT_STARTED = "1205789138669683";

const CF_BREAKPOINTS = "1206927655441547";
const CF_BREAKPOINTS_BOTH = "1206927655441550";

const CF_NUM_PAGES = "1206927655441553";
const CF_NUM_PAGES_MAP: Record<number, string> = {
  1: "1206927655441556",
  2: "1206927655441557",
  3: "1206927655441558",
  4: "1206927655441559",
  5: "1206927655443645",
  6: "1206927655443646",
  7: "1207661312443019",
  8: "1207661312443020",
  9: "1207661312443021",
  10: "1207661312443022",
};

const DEFAULT_FIGMA_AUDIT_TEMPLATE_KEY = "3EfexlsSpqIciz7PkcSPwu";
const DEFAULT_FIGMA_SLIDES_TEMPLATE_KEY = "7iTirmji3y4s35Xyrk2Cwg";

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

// ── Screenshot capture via Firecrawl ──────────────────────────────────────────
async function captureScreenshot(
  url: string,
  firecrawlKey: string,
  viewport: "desktop" | "mobile"
): Promise<Uint8Array | null> {
  try {
    const res = await fetch(`${FIRECRAWL_API}/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${firecrawlKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["screenshot"],
        ...(viewport === "mobile" ? { mobile: true } : {}),
        waitFor: 2000,
      }),
    });

    if (!res.ok) {
      console.error(`Firecrawl screenshot failed for ${url} [${viewport}]:`, await res.text());
      return null;
    }

    const data = await res.json();
    const screenshotField: string | null = data?.data?.screenshot ?? data?.screenshot ?? null;
    if (!screenshotField) {
      console.error(`No screenshot field in Firecrawl response for ${url} [${viewport}]. Keys:`, Object.keys(data?.data ?? data ?? {}));
      return null;
    }

    console.log(`Screenshot field type for ${viewport}: starts with "${screenshotField.substring(0, 30)}..."`);

    // If it's a URL, fetch the image bytes directly
    if (screenshotField.startsWith("http")) {
      const imgRes = await fetch(screenshotField);
      if (!imgRes.ok) {
        console.error(`Failed to fetch screenshot URL [${imgRes.status}]:`, screenshotField);
        return null;
      }
      return new Uint8Array(await imgRes.arrayBuffer());
    }

    // Handle data URI or raw base64
    const raw = screenshotField.replace(/^data:image\/[a-z]+;base64,/, "");
    // Pad base64 if needed
    const padded = raw + "=".repeat((4 - (raw.length % 4)) % 4);
    const binaryStr = atob(padded);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  } catch (e) {
    console.error(`captureScreenshot error [${viewport}]:`, e);
    return null;
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
    if (error) {
      console.error("Storage upload error:", error);
      return null;
    }
    const { data: urlData } = sb.storage.from("audit-assets").getPublicUrl(`screenshots/${filename}`);
    return urlData?.publicUrl ?? null;
  } catch (e) {
    console.error("uploadToStorage error:", e);
    return null;
  }
}

// ── Asana: find or create a tag ───────────────────────────────────────────────
async function findOrCreateAsanaTag(
  tagName: string,
  workspaceGid: string,
  asanaToken: string
): Promise<string | null> {
  try {
    // Search for existing tag
    const searchRes = await asanaFetch(
      `/workspaces/${workspaceGid}/tags?opt_fields=name&limit=100`,
      asanaToken
    );
    const existing = (searchRes as Array<{ gid: string; name: string }>)
      .find((t) => t.name.toLowerCase() === tagName.toLowerCase());
    if (existing) return existing.gid;

    // Create new tag
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

// ── Parse URLs from Asana card notes ──────────────────────────────────────────
function parseUrlsFromNotes(notes: string): { websiteUrl: string | null; focusUrls: string[] } {
  const lines = notes.split("\n").map((l) => l.trim());
  let websiteUrl: string | null = null;
  const focusUrls: string[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith("website url:") || lower.startsWith("website:")) {
      const url = line.split(":").slice(1).join(":").trim();
      if (url.startsWith("http")) websiteUrl = url;
    } else if (lower.startsWith("focus url:") || lower.startsWith("focus page:") || lower.startsWith("focus:")) {
      const url = line.split(":").slice(1).join(":").trim();
      if (url.startsWith("http")) focusUrls.push(url);
    }
  }

  if (!websiteUrl) {
    for (const line of lines) {
      if (line.startsWith("http")) { websiteUrl = line; break; }
    }
  }

  return { websiteUrl, focusUrls };
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
      client_name,
      shop_url,
      focus_url,
      tier = "pro",
      existing_task_gid,
      pages,
      extra_urls,
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

    // Determine page count for the custom field
    const pageCount: number | null = tier === "pro" && pages ? Number(pages) : (
      tier === "essential" && extra_urls ? (extra_urls as string[]).length + 1 : null
    );

    // Build custom fields for every new card
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
        steps[steps.length - 1] = { step: 1, name: "Create Asana Card", status: "done", detail: `Created task ${taskGid} with custom fields` };
      }
    } catch (e) {
      steps[steps.length - 1] = { step: 1, name: "Create Asana Card", status: "error", error: String(e) };
      return new Response(JSON.stringify({ success: false, steps, error: String(e) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── STEP 2: Move to Ready for Setup ──────────────────────────────────────
    steps.push({ step: 2, name: "Move to Ready for Setup", status: "running" });
    try {
      await asanaFetch(`/sections/${SECTION_READY_FOR_SETUP}/addTask`, asanaToken, {
        method: "POST",
        body: JSON.stringify({ data: { task: taskGid } }),
      });
      steps[steps.length - 1] = { step: 2, name: "Move to Ready for Setup", status: "done", detail: "Moved to Ready for Setup column" };
    } catch (e) {
      steps[steps.length - 1] = { step: 2, name: "Move to Ready for Setup", status: "error", error: String(e) };
    }

    // ── STEP 3: Capture screenshots (independent of Figma) ───────────────────
    steps.push({ step: 3, name: "Capture Screenshots", status: "running" });
    if (!firecrawlKey) {
      steps[steps.length - 1] = { step: 3, name: "Capture Screenshots", status: "skipped", detail: "No Firecrawl API key — connect Firecrawl in Settings" };
    } else {
      try {
        const { websiteUrl, focusUrls } = parseUrlsFromNotes(taskNotes);
        const mainUrl = websiteUrl ?? shop_url;
        const focusUrlParsed = focusUrls[0] ?? focus_url ?? null;

        console.log("Capturing screenshots — main:", mainUrl, "focus:", focusUrlParsed);

        const [desktopMainB64, mobileMainB64, desktopFocusB64, mobileFocusB64] = await Promise.all([
          captureScreenshot(mainUrl, firecrawlKey, "desktop"),
          captureScreenshot(mainUrl, firecrawlKey, "mobile"),
          focusUrlParsed ? captureScreenshot(focusUrlParsed, firecrawlKey, "desktop") : Promise.resolve(null),
          focusUrlParsed ? captureScreenshot(focusUrlParsed, firecrawlKey, "mobile") : Promise.resolve(null),
        ]);

        const slug = client_name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const ts = Date.now();

        const uploads = [
          { label: "desktop-main", b64: desktopMainB64 },
          { label: "mobile-main", b64: mobileMainB64 },
          { label: "desktop-focus", b64: desktopFocusB64 },
          { label: "mobile-focus", b64: mobileFocusB64 },
        ];

        const results: string[] = [];
        for (const { label, b64 } of uploads) {
          if (!b64) { results.push(`${label}: no data`); continue; }
          const url = await uploadToStorage(sb, b64, `${slug}-${label}-${ts}.png`);
          if (url) {
            screenshotUrls[label] = url;
            results.push(`${label}: ✓`);
          } else {
            results.push(`${label}: upload failed`);
          }
        }

        const successCount = Object.keys(screenshotUrls).length;
        steps[steps.length - 1] = {
          step: 3, name: "Capture Screenshots", status: successCount > 0 ? "done" : "error",
          detail: `${successCount}/${uploads.length} captured — ${results.join(" | ")}`,
        };
      } catch (e) {
        console.error("Step 3 error:", e);
        steps[steps.length - 1] = { step: 3, name: "Capture Screenshots", status: "error", error: String(e) };
      }
    }

    // ── STEP 4: Attach screenshots + links to Asana card notes ───────────────
    steps.push({ step: 4, name: "Update Asana Card Notes", status: "running" });
    try {
      const existing = await asanaFetch(`/tasks/${taskGid}?opt_fields=notes`, asanaToken);
      const parts = [existing.notes ?? ""];

      if (Object.keys(screenshotUrls).length > 0) {
        const screenshotSummary = Object.entries(screenshotUrls)
          .map(([k, v]) => `  ${k}: ${v}`)
          .join("\n");
        parts.push(`\n\n📸 Screenshots:\n${screenshotSummary}`);
      }

      // Figma links will be appended here if they exist (added in step 5)
      const newNotes = parts.join("").trim();
      if (newNotes !== (existing.notes ?? "").trim()) {
        await asanaFetch(`/tasks/${taskGid}`, asanaToken, {
          method: "PUT",
          body: JSON.stringify({ data: { notes: newNotes } }),
        });
      }
      steps[steps.length - 1] = {
        step: 4, name: "Update Asana Card Notes", status: "done",
        detail: `${Object.keys(screenshotUrls).length} screenshot URLs attached`,
      };
    } catch (e) {
      steps[steps.length - 1] = { step: 4, name: "Update Asana Card Notes", status: "error", error: String(e) };
    }

    // ── STEP 5: Add tags to Asana card ────────────────────────────────────────
    steps.push({ step: 5, name: "Add Asana Tags", status: "running" });
    try {
      // Get workspace GID from the task
      const taskDetail = await asanaFetch(`/tasks/${taskGid}?opt_fields=workspace.gid`, asanaToken);
      const workspaceGid = taskDetail?.workspace?.gid;

      if (!workspaceGid) {
        steps[steps.length - 1] = { step: 5, name: "Add Asana Tags", status: "skipped", detail: "Could not determine workspace" };
      } else {
        const tagNames = [
          `Tier: ${tierLabel}`,
          "Auto-Setup",
        ];

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

    // ── STEP 6: Attempt Figma template duplication (best-effort) ──────────────
    steps.push({ step: 6, name: "Duplicate Figma Templates", status: "running" });
    if (!figmaToken) {
      steps[steps.length - 1] = { step: 6, name: "Duplicate Figma Templates", status: "skipped", detail: "No Figma token — add one in Settings" };
    } else {
      const figmaResults: string[] = [];

      // Try audit template
      try {
        const dupRes = await fetch(`${FIGMA_API}/files/${DEFAULT_FIGMA_AUDIT_TEMPLATE_KEY}/duplicate`, {
          method: "POST",
          headers: { "X-Figma-Token": figmaToken, "Content-Type": "application/json" },
          body: JSON.stringify({ name: `${client_name} — ${tierLabel} Report` }),
        });
        if (dupRes.ok) {
          const dupData = await dupRes.json();
          const newKey = dupData.key ?? dupData.file?.key ?? null;
          if (newKey) {
            figmaFileLink = `https://www.figma.com/file/${newKey}`;
            figmaResults.push(`Audit: ✓ ${figmaFileLink}`);
          }
        } else {
          const errText = await dupRes.text();
          console.warn(`Figma audit duplication failed [${dupRes.status}]:`, errText);
          figmaResults.push(`Audit: skipped (API ${dupRes.status} — Figma may not support REST duplication on this plan)`);
        }
      } catch (e) {
        figmaResults.push(`Audit: error — ${e}`);
      }

      // Try slides template
      try {
        const dupRes = await fetch(`${FIGMA_API}/files/${DEFAULT_FIGMA_SLIDES_TEMPLATE_KEY}/duplicate`, {
          method: "POST",
          headers: { "X-Figma-Token": figmaToken, "Content-Type": "application/json" },
          body: JSON.stringify({ name: `${client_name} — ${tierLabel} Report Slides` }),
        });
        if (dupRes.ok) {
          const dupData = await dupRes.json();
          const newKey = dupData.key ?? dupData.file?.key ?? null;
          if (newKey) {
            figmaSlidesLink = `https://www.figma.com/file/${newKey}`;
            figmaResults.push(`Slides: ✓ ${figmaSlidesLink}`);
          }
        } else {
          figmaResults.push(`Slides: skipped (API ${dupRes.status})`);
        }
      } catch (e) {
        figmaResults.push(`Slides: error — ${e}`);
      }

      // If any Figma links were created, append them to Asana notes
      if (figmaFileLink || figmaSlidesLink) {
        try {
          const existing = await asanaFetch(`/tasks/${taskGid}?opt_fields=notes`, asanaToken);
          const additions: string[] = [];
          if (figmaFileLink) additions.push(`📎 Figma File: ${figmaFileLink}`);
          if (figmaSlidesLink) additions.push(`📊 Figma Slides: ${figmaSlidesLink}`);
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

    // ── STEP 7: Move to Setup Complete (only if screenshots were captured) ───
    steps.push({ step: 7, name: "Move to Setup Complete", status: "running" });
    const hasScreenshots = Object.keys(screenshotUrls).length > 0;
    const hasFigma = !!figmaFileLink || !!figmaSlidesLink;
    if (hasScreenshots || hasFigma) {
      try {
        await asanaFetch(`/sections/${SECTION_SETUP_COMPLETE}/addTask`, asanaToken, {
          method: "POST",
          body: JSON.stringify({ data: { task: taskGid } }),
        });
        steps[steps.length - 1] = { step: 7, name: "Move to Setup Complete", status: "done", detail: "Moved to Setup Complete" };
      } catch (e) {
        steps[steps.length - 1] = { step: 7, name: "Move to Setup Complete", status: "error", error: String(e) };
      }
    } else {
      steps[steps.length - 1] = { step: 7, name: "Move to Setup Complete", status: "skipped", detail: "Card stays in Ready for Setup — no assets generated" };
    }

    // ── Activity log ──────────────────────────────────────────────────────────
    const allOk = steps.every((s) => s.status === "done" || s.status === "skipped");
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
