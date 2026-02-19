import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Constants ────────────────────────────────────────────────────────────────
const ASANA_API = "https://app.asana.com/api/1.0";
const FIGMA_API = "https://api.figma.com/v1";
const FIRECRAWL_API = "https://api.firecrawl.dev/v1";

// Oddit Setups project
const ASANA_PROJECT_GID = "1207443359385412";
// The "Ready For Setup" column that triggers the pipeline
const SECTION_READY_FOR_SETUP = "1207443359385417"; // "Ready For Setup"
// The "Setup Complete" column the card moves to after pipeline finishes
// SECTION_SETUP_COMPLETE removed — cards must NOT be moved there by automation

// Figma frame names to inject screenshots into
const FRAME_DESKTOP_MAIN  = "Desktop Screenshot";
const FRAME_MOBILE_MAIN   = "Mobile Screenshot";
const FRAME_DESKTOP_FOCUS = "Desktop Focus";
const FRAME_MOBILE_FOCUS  = "Mobile Focus";

// Hardcoded default Figma template key (can be overridden per-run)
const DEFAULT_FIGMA_TEMPLATE_KEY = "";

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
  if (!res.ok) throw new Error(`Asana ${res.status}: ${JSON.stringify(json.errors ?? json)}`);
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

// ── Parse task metadata from Asana description ───────────────────────────────
// Expected format (flexible):
//   Website URL: https://...
//   Focus URL: https://...
//   Tier: PRO | ESSENTIAL
//   Client: Acme Store
function parseTaskNotes(notes: string): {
  clientName: string | null;
  websiteUrl: string | null;
  focusUrls: string[];
  tier: "pro" | "essential";
} {
  const lines = notes.split("\n").map((l) => l.trim());
  let clientName: string | null = null;
  let websiteUrl: string | null = null;
  const focusUrls: string[] = [];
  let tier: "pro" | "essential" = "pro";

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (lower.startsWith("client:") || lower.startsWith("client name:")) {
      clientName = line.split(":").slice(1).join(":").trim() || null;
    } else if (lower.startsWith("website url:") || lower.startsWith("website:")) {
      const url = line.split(":").slice(1).join(":").trim();
      if (url.startsWith("http")) websiteUrl = url;
    } else if (
      lower.startsWith("focus url:") ||
      lower.startsWith("focus page:") ||
      lower.startsWith("focus:")
    ) {
      const url = line.split(":").slice(1).join(":").trim();
      if (url.startsWith("http")) focusUrls.push(url);
    } else if (lower.startsWith("tier:")) {
      const t = line.split(":").slice(1).join(":").trim().toLowerCase();
      tier = t.includes("essential") ? "essential" : "pro";
    }
  }

  // Fallback: grab first raw http URL as website
  if (!websiteUrl) {
    for (const line of lines) {
      if (line.startsWith("http") && !focusUrls.includes(line)) {
        websiteUrl = line;
        break;
      }
    }
  }

  return { clientName, websiteUrl, focusUrls, tier };
}

// ── AI-driven CRO section identification ──────────────────────────────────────
interface CROSection {
  section_name: string;
  scroll_percent: number;
  why_optimize: string;
  css_selector: string;
}

async function identifyCROSections(
  url: string,
  markdown: string,
  apiKey: string
): Promise<CROSection[]> {
  const truncated = markdown.slice(0, 12000);
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `You are a world-class CRO expert at Oddit (11,000+ audits completed). Analyze this e-commerce page and identify the top 5-8 key sections that need CRO optimization. Focus on: hero/header, navigation, product displays, trust signals, social proof, CTAs, conversion blocks, footer CTAs, review sections, pricing areas.`,
        },
        {
          role: "user",
          content: `Analyze this page and identify the key sections to optimize.\n\nURL: ${url}\n\nPage content:\n${truncated}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "identify_sections",
            description: "Return 5-8 key page sections for CRO optimization",
            parameters: {
              type: "object",
              properties: {
                sections: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      section_name: { type: "string" },
                      scroll_percent: { type: "number" },
                      why_optimize: { type: "string" },
                      css_selector: { type: "string" },
                    },
                    required: ["section_name", "scroll_percent", "why_optimize", "css_selector"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["sections"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "identify_sections" } },
    }),
  });

  if (!resp.ok) {
    console.error("AI section identification failed:", resp.status, await resp.text());
    return [];
  }

  const data = await resp.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    try {
      const parsed = JSON.parse(toolCall.function.arguments);
      return (parsed.sections || []) as CROSection[];
    } catch (e) {
      console.error("Failed to parse sections:", e);
    }
  }
  return [];
}

// ── Targeted section screenshot via Firecrawl ─────────────────────────────────
async function captureSectionScreenshot(
  url: string,
  section: CROSection,
  firecrawlKey: string
): Promise<Uint8Array | null> {
  const DEFAULT_PAGE_HEIGHT = 6000;
  const scrollPx = Math.round((section.scroll_percent / 100) * DEFAULT_PAGE_HEIGHT);
  const selector = section.css_selector.replace(/'/g, "\\'");
  const sectionKeyword = section.section_name.toLowerCase().split(" ")[0].replace(/'/g, "\\'");

  const scrollJs = `
    (function() {
      document.querySelectorAll('*').forEach(function(node) {
        var s = getComputedStyle(node);
        if (s.position === 'fixed' || s.position === 'sticky') {
          node.style.setProperty('visibility', 'hidden', 'important');
        }
      });
      var el = document.querySelector('${selector}');
      if (!el) {
        var tags = ['section', 'div', 'header', 'footer', 'main', 'article'];
        for (var i = 0; i < tags.length; i++) {
          var all = document.querySelectorAll(tags[i]);
          for (var j = 0; j < all.length; j++) {
            var text = (all[j].className || '') + ' ' + (all[j].id || '') + ' ' + (all[j].textContent || '').substring(0, 200);
            if (text.toLowerCase().indexOf('${sectionKeyword}') !== -1) {
              el = all[j]; break;
            }
          }
          if (el) break;
        }
      }
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        return 'found';
      }
      window.scrollTo(0, ${scrollPx});
      return 'fallback';
    })()
  `;

  try {
    const resp = await fetch(`${FIRECRAWL_API}/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${firecrawlKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["screenshot"],
        waitFor: 2000,
        actions: [
          { type: "wait", milliseconds: 1500 },
          { type: "executeJavascript", script: scrollJs },
          { type: "wait", milliseconds: 1000 },
          { type: "screenshot" },
        ],
      }),
    });

    if (!resp.ok) return null;

    const data = await resp.json();
    const screenshotField = data.data?.screenshot || data.screenshot || "";
    if (!screenshotField) return null;

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
    return bytes;
  } catch (e) {
    console.error(`Section screenshot error for "${section.section_name}":`, e);
    return null;
  }
}

// ── Upload bytes to Supabase storage ──────────────────────────────────────────
async function uploadToStorage(
  sb: ReturnType<typeof createClient>,
  bytes: Uint8Array,
  filename: string
): Promise<string | null> {
  try {
    const { error } = await sb.storage
      .from("audit-assets")
      .upload(`screenshots/${filename}`, bytes, { contentType: "image/png", upsert: true });
    if (error) return null;
    const { data } = sb.storage.from("audit-assets").getPublicUrl(`screenshots/${filename}`);
    return data?.publicUrl ?? null;
  } catch {
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
      console.warn(`Asana attachment failed for ${filename}:`, res.status);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`Asana attachment error for ${filename}:`, e);
    return false;
  }
}

// ── Upload image to Figma, return imageHash ───────────────────────────────────
async function uploadImageToFigma(
  figmaToken: string,
  fileKey: string,
  base64Png: string
): Promise<string | null> {
  try {
    const bytes = Uint8Array.from(atob(base64Png), (c) => c.charCodeAt(0));
    const formData = new FormData();
    formData.append("image", new Blob([bytes], { type: "image/png" }), "screenshot.png");
    const res = await fetch(`${FIGMA_API}/images/${fileKey}`, {
      method: "POST",
      headers: { "X-Figma-Token": figmaToken },
      body: formData,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.imageHash ?? null;
  } catch {
    return null;
  }
}

// ── Find a Figma node by name ─────────────────────────────────────────────────
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
    const patchRes = await fetch(`${FIGMA_API}/files/${fileKey}/nodes`, {
      method: "PUT",
      headers: { "X-Figma-Token": figmaToken, "Content-Type": "application/json" },
      body: JSON.stringify({
        nodes: {
          [nodeId]: {
            fills: [{ type: "IMAGE", scaleMode: "FIT", imageRef: imageHash, opacity: 1 }],
          },
        },
      }),
    });
    return patchRes.ok;
  } catch {
    return false;
  }
}

// ── Update run record in DB ───────────────────────────────────────────────────
async function updateRun(
  sb: ReturnType<typeof createClient>,
  id: string,
  patch: Record<string, unknown>
) {
  await sb.from("setup_runs").update(patch).eq("id", id);
}

// ── Process a single Asana card through the full pipeline ─────────────────────
async function processCard(
  sb: ReturnType<typeof createClient>,
  asanaToken: string,
  figmaToken: string | null,
  firecrawlKey: string | null,
  task: { gid: string; name: string; notes: string },
  runId: string
) {
  type StepStatus = "done" | "error" | "skipped";
  interface StepResult {
    step: number;
    name: string;
    status: StepStatus;
    detail?: string;
    error?: string;
  }

  const steps: StepResult[] = [];
  const push = (s: StepResult) => {
    steps.push(s);
    updateRun(sb, runId, { steps, status: "running" });
  };

  const { clientName, websiteUrl, focusUrls, tier } = parseTaskNotes(task.notes ?? "");
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
  const displayClient = clientName ?? task.name;
  const focusUrl = focusUrls[0] ?? null;

  // Update run with parsed metadata
  await updateRun(sb, runId, {
    client_name: displayClient,
    tier,
    shop_url: websiteUrl ?? "",
    focus_url: focusUrl ?? "",
    asana_url: `https://app.asana.com/0/${ASANA_PROJECT_GID}/${task.gid}`,
  });

  let figmaFileLink: string | null = null;
  let figmaSlidesLink: string | null = null;
  const screenshotUrls: Record<string, string> = {};

  // ── STEP 1: AI-driven CRO Section Screenshots ────────────────────────────
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY") ?? null;

  if (!firecrawlKey) {
    push({ step: 1, name: "CRO Section Screenshots", status: "skipped", detail: "No Firecrawl key configured" });
  } else if (!lovableApiKey) {
    push({ step: 1, name: "CRO Section Screenshots", status: "skipped", detail: "No LOVABLE_API_KEY configured" });
  } else if (!websiteUrl) {
    push({ step: 1, name: "CRO Section Screenshots", status: "skipped", detail: "No Website URL found on Asana card" });
  } else {
    try {
      const slug = displayClient.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const ts = Date.now();

      // 1A: Scrape page for AI analysis
      console.log("Scraping page for CRO section identification:", websiteUrl);
      const scrapeResp = await fetch(`${FIRECRAWL_API}/scrape`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${firecrawlKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: websiteUrl, formats: ["markdown"], onlyMainContent: true, waitFor: 2000 }),
      });

      let markdown = "";
      if (scrapeResp.ok) {
        const scrapeData = await scrapeResp.json();
        markdown = scrapeData.data?.markdown || scrapeData.markdown || "";
      }

      // 1B: AI identifies key CRO sections
      console.log("Identifying CRO sections with AI...");
      const sections = await identifyCROSections(websiteUrl, markdown, lovableApiKey);
      console.log(`AI identified ${sections.length} sections`);

      if (sections.length === 0) {
        push({ step: 1, name: "CRO Section Screenshots", status: "error", detail: "AI could not identify sections" });
      } else {
        // 1C: Capture targeted screenshot for each section (3 at a time)
        const sectionResults: string[] = [];
        for (let i = 0; i < sections.length; i += 3) {
          const batch = sections.slice(i, i + 3);
          const batchResults = await Promise.all(
            batch.map(async (section) => {
              const bytes = await captureSectionScreenshot(websiteUrl, section, firecrawlKey);
              if (!bytes) return { section, url: null, bytes: null };

              const sectionSlug = section.section_name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
              const filename = `${slug}-${sectionSlug}-${ts}.png`;
              const url = await uploadToStorage(sb, bytes, filename);
              return { section, url, bytes };
            })
          );

          for (const result of batchResults) {
            if (result.url) {
              screenshotUrls[result.section.section_name] = result.url;
              sectionResults.push(`✓ ${result.section.section_name}`);

              // Attach to Asana task
              if (result.bytes) {
                await attachImageToAsana(task.gid, asanaToken, result.bytes, `${result.section.section_name}.png`);
              }
            } else {
              sectionResults.push(`✗ ${result.section.section_name}`);
            }
          }
        }

        const successCount = Object.keys(screenshotUrls).length;
        push({
          step: 1,
          name: "CRO Section Screenshots",
          status: successCount > 0 ? "done" : "error",
          detail: `${successCount}/${sections.length} sections captured — ${sectionResults.join(" | ")}`,
        });
      }
    } catch (e) {
      push({ step: 1, name: "CRO Section Screenshots", status: "error", error: String(e) });
    }
  }

  // ── STEP 2: Link Figma file back to Asana ────────────────────────────────
  // ── STEP 2: Update Asana notes with section screenshots + Figma links ──
  try {
    const existing = await asanaFetch(`/tasks/${task.gid}?opt_fields=notes`, asanaToken);
    const parts = [existing.notes ?? ""];

    if (figmaFileLink) {
      parts.push(`\n\nInternal Figma: ${figmaFileLink}`);
    }

    if (Object.keys(screenshotUrls).length > 0) {
      const screenshotSummary = Object.entries(screenshotUrls)
        .map(([section, url]) => `  📌 ${section}: ${url}`)
        .join("\n");
      parts.push(`\n\n📸 Section Screenshots:\n${screenshotSummary}`);
    }

    const newNotes = parts.join("").trim();
    if (newNotes !== (existing.notes ?? "").trim()) {
      await asanaFetch(`/tasks/${task.gid}`, asanaToken, {
        method: "PUT",
        body: JSON.stringify({ data: { notes: newNotes } }),
      });
    }
    push({ step: 2, name: "Update Asana Notes", status: "done", detail: `${Object.keys(screenshotUrls).length} section URLs + Figma links in notes` });
  } catch (e) {
    push({ step: 2, name: "Update Asana Notes", status: "error", error: String(e) });
  }

  // ── STEP 3: Create Figma Slides report ───────────────────────────────────
  // Slides template key is tier-dependent (extend as needed)
  const slidesTemplateKey: string | null = null; // TODO: set per-tier keys when available

  if (!figmaToken || !slidesTemplateKey) {
    push({
      step: 3,
      name: "Create Figma Slides Report",
      status: "skipped",
      detail: slidesTemplateKey ? "No Figma token" : "No slides template key configured",
    });
  } else {
    try {
      const dupRes = await fetch(`${FIGMA_API}/files/${slidesTemplateKey}/duplicate`, {
        method: "POST",
        headers: { "X-Figma-Token": figmaToken, "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${displayClient} — ${tierLabel} Report Slides` }),
      });
      if (dupRes.ok) {
        const dupData = await dupRes.json();
        const newFileKey = dupData.key ?? dupData.file?.key ?? null;
        if (newFileKey) {
          figmaSlidesLink = `https://www.figma.com/file/${newFileKey}`;
          push({ step: 3, name: "Create Figma Slides Report", status: "done", detail: figmaSlidesLink });
        } else {
          push({ step: 3, name: "Create Figma Slides Report", status: "skipped", detail: "Duplicated but no key returned" });
        }
      } else {
        push({ step: 3, name: "Create Figma Slides Report", status: "skipped", detail: `Duplication failed (${dupRes.status})` });
      }
    } catch (e) {
      push({ step: 3, name: "Create Figma Slides Report", status: "error", error: String(e) });
    }
  }

  // ── STEP 4: Link Figma Slides → Asana ────────────────────────────────────
  if (figmaSlidesLink) {
    try {
      const existing = await asanaFetch(`/tasks/${task.gid}?opt_fields=notes`, asanaToken);
      const newNotes = `${existing.notes ?? ""}\n\nFigma Slides: ${figmaSlidesLink}`.trim();
      await asanaFetch(`/tasks/${task.gid}`, asanaToken, {
        method: "PUT",
        body: JSON.stringify({ data: { notes: newNotes } }),
      });
      push({ step: 4, name: "Link Figma Slides → Asana", status: "done", detail: "Slides link added to card" });
    } catch (e) {
      push({ step: 4, name: "Link Figma Slides → Asana", status: "error", error: String(e) });
    }
  } else {
    push({ step: 4, name: "Link Figma Slides → Asana", status: "skipped", detail: "No slides to link" });
  }

  // ── STEP 5: Keep card in Ready For Setup (human moves to Setup Complete) ──
  // IMPORTANT: Do NOT move to Setup Complete automatically.
  // An Asana automation rule moves cards from Setup Complete → Oddit Design.
  // Only a human should trigger that transition.
  push({ step: 5, name: "Card Placement", status: "done", detail: "Card stays in Ready For Setup — human moves to Setup Complete when ready" });

  // ── Finalise run record ───────────────────────────────────────────────────
  const allOk = steps.every((s) => s.status === "done" || s.status === "skipped");
  const hasError = steps.some((s) => s.status === "error");
  await updateRun(sb, runId, {
    status: hasError ? "error" : "done",
    steps,
    figma_file_link: figmaFileLink,
    figma_slides_link: figmaSlidesLink,
    completed_at: new Date().toISOString(),
  });

  // Activity log
  try {
    await sb.from("activity_log").insert({
      workflow_name: `Auto Setup: ${displayClient} (${tier})`,
      status: allOk ? "completed" : hasError ? "partial" : "completed",
    });
  } catch { /* non-fatal */ }
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const [asanaToken, figmaToken] = await Promise.all([
      getAsanaToken(sb),
      getFigmaToken(sb),
    ]);
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY") ?? null;

    // 1. Fetch all tasks in the "Ready For Setup" section
    const tasks = await asanaFetch(
      `/sections/${SECTION_READY_FOR_SETUP}/tasks?opt_fields=gid,name,notes,memberships.section.gid&limit=50`,
      asanaToken
    );

    if (!Array.isArray(tasks) || tasks.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No cards in Ready For Setup", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Filter out cards that already have a run record (idempotency)
    const taskGids = tasks.map((t: { gid: string }) => t.gid);
    const { data: existingRuns } = await sb
      .from("setup_runs")
      .select("asana_task_gid, status")
      .in("asana_task_gid", taskGids);

    const existingMap = new Map(
      (existingRuns ?? []).map((r) => [r.asana_task_gid, r.status])
    );

    // Only process NEW cards: no prior run record at all (never processed before).
    // Cards with any existing record (pending, running, done, error) are skipped
    // so that pre-existing cards like La Colombe can be moved freely in Asana
    // without being re-grabbed by the poller.
    const newTasks = tasks.filter((t: { gid: string }) => {
      return !existingMap.has(t.gid);
    });

    if (newTasks.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "All cards already processed", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Create run records for each new task (status: running)
    const runRecords = newTasks.map((t: { gid: string; name: string }) => ({
      asana_task_gid: t.gid,
      client_name: t.name,
      status: "running",
      started_at: new Date().toISOString(),
    }));

    const { data: insertedRuns, error: insertError } = await sb
      .from("setup_runs")
      .upsert(runRecords, { onConflict: "asana_task_gid" })
      .select("id, asana_task_gid");

    if (insertError) {
      console.error("Failed to create run records:", insertError);
      throw insertError;
    }

    const runIdMap = new Map(
      (insertedRuns ?? []).map((r) => [r.asana_task_gid, r.id])
    );

    // 4. Process each card (sequentially to avoid rate limits)
    let processed = 0;
    for (const task of newTasks) {
      const runId = runIdMap.get(task.gid);
      if (!runId) continue;

      console.log(`Processing card: ${task.name} (${task.gid})`);
      try {
        await processCard(sb, asanaToken, figmaToken, firecrawlKey, task, runId);
        processed++;
      } catch (e) {
        console.error(`Failed to process card ${task.gid}:`, e);
        await updateRun(sb, runId, {
          status: "error",
          error: e instanceof Error ? e.message : String(e),
          completed_at: new Date().toISOString(),
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed, total_in_section: tasks.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("poll-asana-setups error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
