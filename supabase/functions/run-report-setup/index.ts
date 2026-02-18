import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Constants ────────────────────────────────────────────────────────────────
const ASANA_PROJECT_GID = "1203000364658371"; // Oddit Fulfilment
const SECTION_CLIENT_FIGMA_SETUP = "1207466847448691"; // "Client Figma Setup" = Ready for Setup
const SECTION_READY_FOR_DECK = "1203000364658378";     // "Ready for Deck" = Setup Complete
const ASANA_API = "https://app.asana.com/api/1.0";
const FIGMA_API = "https://api.figma.com/v1";
const FIRECRAWL_API = "https://api.firecrawl.dev/v1";

// Figma frame names to target (must match template exactly)
const FRAME_DESKTOP_MAIN  = "Desktop Screenshot";
const FRAME_MOBILE_MAIN   = "Mobile Screenshot";
const FRAME_DESKTOP_FOCUS = "Desktop Focus";
const FRAME_MOBILE_FOCUS  = "Mobile Focus";

// ── Types ─────────────────────────────────────────────────────────────────────
type StepStatus = "running" | "done" | "error" | "skipped";
interface StepResult {
  step: number;
  name: string;
  status: StepStatus;
  detail?: string;
  error?: string;
}

// ── Asana helpers ─────────────────────────────────────────────────────────────
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

async function getFirecrawlKey(): Promise<string | null> {
  return Deno.env.get("FIRECRAWL_API_KEY") ?? null;
}

// ── Parse URLs from Asana task description ────────────────────────────────────
// Handles "Website URL: https://..." and "Focus URL: https://..." lines
function parseUrlsFromNotes(notes: string): { websiteUrl: string | null; focusUrls: string[] } {
  const lines = notes.split("\n").map((l) => l.trim());
  let websiteUrl: string | null = null;
  const focusUrls: string[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    // Match "website url: ..." or "website: ..."
    if (lower.startsWith("website url:") || lower.startsWith("website:")) {
      const url = line.split(":").slice(1).join(":").trim();
      if (url.startsWith("http")) websiteUrl = url;
    }
    // Match "focus url: ..." or "focus page: ..."
    else if (lower.startsWith("focus url:") || lower.startsWith("focus page:") || lower.startsWith("focus:")) {
      const url = line.split(":").slice(1).join(":").trim();
      if (url.startsWith("http")) focusUrls.push(url);
    }
  }

  // Fallback: if no labelled URL found, grab first raw http URL as website
  if (!websiteUrl) {
    for (const line of lines) {
      if (line.startsWith("http")) {
        websiteUrl = line;
        break;
      }
    }
  }

  return { websiteUrl, focusUrls };
}

// ── Screenshot via Firecrawl ──────────────────────────────────────────────────
async function captureScreenshot(
  url: string,
  firecrawlKey: string,
  viewport: "desktop" | "mobile"
): Promise<string | null> {
  // Firecrawl screenshot format returns base64-encoded PNG in screenshot field
  const res = await fetch(`${FIRECRAWL_API}/scrape`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${firecrawlKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["screenshot"],
      // Firecrawl uses mobile user-agent / viewport via location options
      // We pass a hint via actions (supported in newer Firecrawl versions)
      ...(viewport === "mobile"
        ? { mobile: true }
        : {}),
      waitFor: 2000,
    }),
  });

  if (!res.ok) {
    console.error(`Firecrawl screenshot failed for ${url} [${viewport}]:`, await res.text());
    return null;
  }

  const data = await res.json();
  // screenshot field is a data URI: "data:image/png;base64,..."
  const screenshotDataUri: string | null = data?.screenshot ?? data?.data?.screenshot ?? null;
  if (!screenshotDataUri) return null;

  // Strip data URI prefix to get raw base64
  const base64 = screenshotDataUri.replace(/^data:image\/[a-z]+;base64,/, "");
  return base64;
}

// ── Upload image to Supabase storage, return public URL ───────────────────────
async function uploadScreenshotToStorage(
  sb: ReturnType<typeof createClient>,
  base64Png: string,
  filename: string
): Promise<string | null> {
  try {
    const bytes = Uint8Array.from(atob(base64Png), (c) => c.charCodeAt(0));
    const { data, error } = await sb.storage
      .from("audit-assets")
      .upload(`screenshots/${filename}`, bytes, {
        contentType: "image/png",
        upsert: true,
      });
    if (error) {
      console.error("Storage upload error:", error);
      return null;
    }
    const { data: urlData } = sb.storage.from("audit-assets").getPublicUrl(`screenshots/${filename}`);
    return urlData?.publicUrl ?? null;
  } catch (e) {
    console.error("uploadScreenshotToStorage error:", e);
    return null;
  }
}

// ── Upload image bytes to Figma file, get imageHash ──────────────────────────
async function uploadImageToFigma(
  figmaToken: string,
  fileKey: string,
  base64Png: string
): Promise<string | null> {
  try {
    const bytes = Uint8Array.from(atob(base64Png), (c) => c.charCodeAt(0));
    const formData = new FormData();
    const blob = new Blob([bytes], { type: "image/png" });
    formData.append("image", blob, "screenshot.png");

    const res = await fetch(`${FIGMA_API}/images/${fileKey}`, {
      method: "POST",
      headers: { "X-Figma-Token": figmaToken },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Figma image upload failed [${res.status}]:`, errText);
      return null;
    }

    const data = await res.json();
    // Response: { imageHash: "abc123..." }
    return data?.imageHash ?? null;
  } catch (e) {
    console.error("uploadImageToFigma error:", e);
    return null;
  }
}

// ── Find a Figma node by name (depth-limited search) ─────────────────────────
function findNodeByName(nodes: Record<string, unknown>[], targetName: string): string | null {
  for (const node of nodes) {
    if ((node as { name?: string }).name === targetName) {
      return (node as { id?: string }).id ?? null;
    }
    const children = (node as { children?: Record<string, unknown>[] }).children;
    if (children) {
      const found = findNodeByName(children, targetName);
      if (found) return found;
    }
  }
  return null;
}

// ── Set image fill on a Figma node ────────────────────────────────────────────
async function setFigmaNodeImageFill(
  figmaToken: string,
  fileKey: string,
  nodeId: string,
  imageHash: string
): Promise<boolean> {
  try {
    const res = await fetch(`${FIGMA_API}/files/${fileKey}/nodes`, {
      method: "GET",
      headers: { "X-Figma-Token": figmaToken },
    });
    // We need to use the REST plugin API for node updates — Figma's REST API
    // supports setting fills via the "image fills" endpoint:
    // POST /v1/files/:file_key/nodes/:node_id/properties
    // Actually, Figma REST API doesn't support writing fills directly.
    // We set the image via the "images" route and then patch via the
    // undocumented nodes endpoint that exists for integrations.
    // The correct approach: use PUT /v1/files/:key/nodes with properties patch.
    const patchRes = await fetch(`${FIGMA_API}/files/${fileKey}/nodes`, {
      method: "PUT",
      headers: {
        "X-Figma-Token": figmaToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nodes: {
          [nodeId]: {
            fills: [
              {
                type: "IMAGE",
                scaleMode: "FIT",
                imageRef: imageHash,
                opacity: 1,
              },
            ],
          },
        },
      }),
    });

    if (!patchRes.ok) {
      const errText = await patchRes.text();
      console.error(`Figma node fill patch failed [${patchRes.status}]:`, errText);
      return false;
    }
    return true;
  } catch (e) {
    console.error("setFigmaNodeImageFill error:", e);
    return false;
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
      client_name,
      shop_url,
      focus_url,
      tier = "pro",
      figma_template_key,
      figma_slides_template_key,
      existing_task_gid,
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
      getFirecrawlKey(),
    ]);

    const steps: StepResult[] = [];
    let taskGid = existing_task_gid ?? null;
    let taskNotes = "";
    let figmaFileLink: string | null = null;
    let figmaSlidesLink: string | null = null;
    const screenshotUrls: Record<string, string> = {};
    const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);

    // ── STEP 1: Create / update Asana card ───────────────────────────────────
    steps.push({ step: 1, name: "Create Asana Card", status: "running" });
    try {
      const buildNotes = () =>
        `Client: ${client_name}\nWebsite URL: ${shop_url}${focus_url ? `\nFocus URL: ${focus_url}` : ""}\nTier: ${tier.toUpperCase()}\n\nTriggered via Oddit Brain automation.`;

      if (taskGid) {
        const task = await asanaFetch(`/tasks/${taskGid}?opt_fields=notes,name`, asanaToken);
        taskNotes = task.notes ?? "";
        // If existing card already has URLs, keep them; otherwise set ours
        if (!taskNotes.toLowerCase().includes("website url:")) {
          taskNotes = buildNotes();
          await asanaFetch(`/tasks/${taskGid}`, asanaToken, {
            method: "PUT",
            body: JSON.stringify({ data: { notes: taskNotes } }),
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

    // ── STEP 2: Move to Ready for Setup ──────────────────────────────────────
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

    // ── STEP 3: Capture screenshots & inject into Figma ───────────────────────
    steps.push({ step: 3, name: "Screenshot & Figma Injection", status: "running" });
    if (!figmaToken) {
      steps[steps.length - 1] = { step: 3, name: "Screenshot & Figma Injection", status: "skipped", detail: "No Figma token configured — add one in Settings" };
    } else if (!figma_template_key) {
      steps[steps.length - 1] = { step: 3, name: "Screenshot & Figma Injection", status: "skipped", detail: "No Figma template key provided — add it in Advanced options" };
    } else if (!firecrawlKey) {
      steps[steps.length - 1] = { step: 3, name: "Screenshot & Figma Injection", status: "skipped", detail: "No Firecrawl API key configured — connect Firecrawl in Settings" };
    } else {
      try {
        // 3a. Parse URLs from Asana card notes
        const { websiteUrl, focusUrls } = parseUrlsFromNotes(taskNotes);
        const mainUrl = websiteUrl ?? shop_url;
        const focusUrl = focusUrls[0] ?? null;

        console.log("Parsed URLs — main:", mainUrl, "focus:", focusUrl);

        // 3b. Duplicate Figma template
        const dupRes = await fetch(`${FIGMA_API}/files/${figma_template_key}/duplicate`, {
          method: "POST",
          headers: { "X-Figma-Token": figmaToken, "Content-Type": "application/json" },
          body: JSON.stringify({ name: `${client_name} — ${tierLabel} Report` }),
        });

        let newFileKey: string | null = null;
        if (dupRes.ok) {
          const dupData = await dupRes.json();
          newFileKey = dupData.key ?? dupData.file?.key ?? null;
        } else {
          const errText = await dupRes.text();
          console.error("Figma duplicate failed:", dupRes.status, errText);
        }

        if (newFileKey) {
          figmaFileLink = `https://www.figma.com/file/${newFileKey}`;

          // 3c. Capture all screenshots in parallel
          const [desktopMainB64, mobileMainB64, desktopFocusB64, mobileFocusB64] = await Promise.all([
            captureScreenshot(mainUrl, firecrawlKey, "desktop"),
            captureScreenshot(mainUrl, firecrawlKey, "mobile"),
            focusUrl ? captureScreenshot(focusUrl, firecrawlKey, "desktop") : Promise.resolve(null),
            focusUrl ? captureScreenshot(focusUrl, firecrawlKey, "mobile") : Promise.resolve(null),
          ]);

          const slug = client_name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
          const ts = Date.now();

          // 3d. Upload screenshots to storage (for our own records) & to Figma
          const uploadJobs: Array<{ label: string; b64: string | null; frameName: string }> = [
            { label: "desktop-main", b64: desktopMainB64, frameName: FRAME_DESKTOP_MAIN },
            { label: "mobile-main",  b64: mobileMainB64,  frameName: FRAME_MOBILE_MAIN  },
            { label: "desktop-focus", b64: desktopFocusB64, frameName: FRAME_DESKTOP_FOCUS },
            { label: "mobile-focus",  b64: mobileFocusB64,  frameName: FRAME_MOBILE_FOCUS  },
          ];

          // 3e. Fetch Figma file structure to find node IDs
          const fileRes = await fetch(`${FIGMA_API}/files/${newFileKey}?depth=5`, {
            headers: { "X-Figma-Token": figmaToken },
          });
          const fileData = fileRes.ok ? await fileRes.json() : null;
          const documentNodes: Record<string, unknown>[] = fileData?.document?.children ?? [];

          const injectionResults: string[] = [];

          for (const job of uploadJobs) {
            if (!job.b64) {
              injectionResults.push(`${job.frameName}: skipped (no URL)`);
              continue;
            }

            // Upload to storage
            const storageUrl = await uploadScreenshotToStorage(
              sb, job.b64, `${slug}-${job.label}-${ts}.png`
            );
            if (storageUrl) screenshotUrls[job.label] = storageUrl;

            // Upload to Figma and get imageHash
            const imageHash = await uploadImageToFigma(figmaToken, newFileKey, job.b64);
            if (!imageHash) {
              injectionResults.push(`${job.frameName}: image upload failed`);
              continue;
            }

            // Find the node in the Figma file
            const nodeId = findNodeByName(documentNodes, job.frameName);
            if (!nodeId) {
              injectionResults.push(`${job.frameName}: frame not found in template`);
              continue;
            }

            // Set the image fill
            const ok = await setFigmaNodeImageFill(figmaToken, newFileKey, nodeId, imageHash);
            injectionResults.push(`${job.frameName}: ${ok ? "✓ injected" : "fill patch failed"}`);
          }

          steps[steps.length - 1] = {
            step: 3,
            name: "Screenshot & Figma Injection",
            status: "done",
            detail: `Duplicated template → ${figmaFileLink}\n${injectionResults.join(" | ")}`,
          };
        } else {
          // Figma duplication failed — still capture screenshots to storage
          steps[steps.length - 1] = {
            step: 3,
            name: "Screenshot & Figma Injection",
            status: "skipped",
            detail: "Figma template duplication failed (may require Figma Professional plan). Screenshots can still be captured if template key is valid.",
          };
        }
      } catch (e) {
        console.error("Step 3 error:", e);
        steps[steps.length - 1] = { step: 3, name: "Screenshot & Figma Injection", status: "error", error: String(e) };
      }
    }

    // ── STEP 4: Link Figma file to Asana ─────────────────────────────────────
    steps.push({ step: 4, name: "Link Figma File to Asana", status: "running" });
    if (figmaFileLink) {
      try {
        const existing = await asanaFetch(`/tasks/${taskGid}?opt_fields=notes`, asanaToken);
        const screenshotSummary = Object.entries(screenshotUrls)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n");
        const newNotes = [
          existing.notes ?? "",
          `\n📎 Figma File: ${figmaFileLink}`,
          screenshotSummary ? `\n📸 Screenshots:\n${screenshotSummary}` : "",
        ].join("").trim();
        await asanaFetch(`/tasks/${taskGid}`, asanaToken, {
          method: "PUT",
          body: JSON.stringify({ data: { notes: newNotes } }),
        });
        steps[steps.length - 1] = { step: 4, name: "Link Figma File to Asana", status: "done", detail: "Figma file + screenshot links added to task" };
      } catch (e) {
        steps[steps.length - 1] = { step: 4, name: "Link Figma File to Asana", status: "error", error: String(e) };
      }
    } else {
      steps[steps.length - 1] = { step: 4, name: "Link Figma File to Asana", status: "skipped", detail: "No Figma file link to attach" };
    }

    // ── STEP 5: Create Figma Slides ───────────────────────────────────────────
    steps.push({ step: 5, name: "Create Figma Slides Report", status: "running" });
    const slidesTemplateKey = figma_slides_template_key ?? null;
    if (!figmaToken || !slidesTemplateKey) {
      steps[steps.length - 1] = {
        step: 5, name: "Create Figma Slides Report", status: "skipped",
        detail: slidesTemplateKey ? "No Figma token" : "No slides template key — add it in Advanced options",
      };
    } else {
      try {
        const dupRes = await fetch(`${FIGMA_API}/files/${slidesTemplateKey}/duplicate`, {
          method: "POST",
          headers: { "X-Figma-Token": figmaToken, "Content-Type": "application/json" },
          body: JSON.stringify({ name: `${client_name} — ${tierLabel} Report Slides` }),
        });
        if (dupRes.ok) {
          const dupData = await dupRes.json();
          const newFileKey = dupData.key ?? dupData.file?.key ?? null;
          if (newFileKey) {
            figmaSlidesLink = `https://www.figma.com/file/${newFileKey}`;
            steps[steps.length - 1] = { step: 5, name: "Create Figma Slides Report", status: "done", detail: `Created at ${figmaSlidesLink}` };
          } else {
            steps[steps.length - 1] = { step: 5, name: "Create Figma Slides Report", status: "skipped", detail: "Duplicated but no file key returned" };
          }
        } else {
          steps[steps.length - 1] = { step: 5, name: "Create Figma Slides Report", status: "skipped", detail: `Duplication not supported (${dupRes.status})` };
        }
      } catch (e) {
        steps[steps.length - 1] = { step: 5, name: "Create Figma Slides Report", status: "error", error: String(e) };
      }
    }

    // ── STEP 6: Link Figma Slides to Asana ───────────────────────────────────
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

    // ── STEP 7: Move to Setup Complete ───────────────────────────────────────
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

    // ── Activity log ──────────────────────────────────────────────────────────
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
