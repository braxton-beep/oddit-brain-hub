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
// SECTION_SETUP_COMPLETE removed — cards must NOT be moved there by automation
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

function getLovableApiKey(): string | null {
  return Deno.env.get("LOVABLE_API_KEY") ?? null;
}

// ── AI-driven section identification ──────────────────────────────────────────
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
                      section_name: { type: "string", description: "Short label e.g. 'Hero', 'Review Section', 'CTA Block'" },
                      scroll_percent: { type: "number", description: "Estimated scroll depth 0-100 where this section lives" },
                      why_optimize: { type: "string", description: "One sentence on why this section matters for CRO" },
                      css_selector: { type: "string", description: "Best CSS selector to target this element" },
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

  // JavaScript that scrolls the target element into view and hides overlays
  const scrollJs = `
    (function() {
      document.querySelectorAll('*').forEach(function(node) {
        var s = getComputedStyle(node);
        if (s.position === 'fixed' || s.position === 'sticky') {
          node.style.setProperty('display', 'none', 'important');
        }
      });
      var el = document.querySelector('${selector}');
      if (!el) {
        var tags = ['section', 'div', 'header', 'footer', 'main', 'article', 'aside'];
        for (var i = 0; i < tags.length; i++) {
          var all = document.querySelectorAll(tags[i]);
          for (var j = 0; j < all.length; j++) {
            var text = (all[j].className || '') + ' ' + (all[j].id || '') + ' ' + (all[j].textContent || '').substring(0, 300);
            if (text.toLowerCase().indexOf('${sectionKeyword}') !== -1) {
              el = all[j]; break;
            }
          }
          if (el) break;
        }
      }
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        return 'found:' + el.tagName + '.' + (el.className || '').substring(0, 50);
      }
      window.scrollTo(0, ${scrollPx});
      return 'fallback:scrolled_to_' + ${scrollPx} + 'px';
    })()
  `;

  console.log(`[Screenshot] Capturing "${section.section_name}" — selector: "${section.css_selector}", scroll: ${section.scroll_percent}%`);

  try {
    // IMPORTANT: Do NOT include "screenshot" in formats — that captures a full-page screenshot.
    // Instead, use the actions-based screenshot which captures only the current viewport.
    const resp = await fetch(`${FIRECRAWL_API}/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${firecrawlKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: [],
        waitFor: 3000,
        actions: [
          { type: "wait", milliseconds: 2000 },
          { type: "executeJavascript", script: scrollJs },
          { type: "wait", milliseconds: 1500 },
          { type: "screenshot" },
        ],
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      console.error(`[Screenshot] Firecrawl error for "${section.section_name}": ${resp.status} — ${errBody.substring(0, 500)}`);
      return null;
    }

    const data = await resp.json();
    
    // Log the response structure to debug
    const topKeys = Object.keys(data);
    const dataKeys = data.data ? Object.keys(data.data) : [];
    console.log(`[Screenshot] Response keys: top=[${topKeys}], data=[${dataKeys}]`);

    // The action-based screenshot may be in different locations
    let screenshotField = "";
    
    // Check actions results first (where action screenshots typically land)
    if (data.data?.actions?.results) {
      for (const result of data.data.actions.results) {
        if (result?.screenshot) {
          screenshotField = result.screenshot;
          console.log(`[Screenshot] Found in actions.results for "${section.section_name}"`);
          break;
        }
      }
    }
    
    // Fallback to top-level screenshot fields
    if (!screenshotField) {
      screenshotField = data.data?.screenshot || data.screenshot || "";
      if (screenshotField) {
        console.log(`[Screenshot] Found in data.screenshot for "${section.section_name}", type: ${screenshotField.substring(0, 30)}...`);
      }
    }
    
    if (!screenshotField) {
      console.warn(`[Screenshot] No screenshot data found for "${section.section_name}". Full response: ${JSON.stringify(data).substring(0, 1000)}`);
      return null;
    }

    // Handle URL (Google Cloud Storage) or base64
    if (screenshotField.startsWith("http")) {
      console.log(`[Screenshot] Downloading from URL for "${section.section_name}"`);
      const imgRes = await fetch(screenshotField);
      if (!imgRes.ok) {
        console.error(`[Screenshot] Image download failed: ${imgRes.status}`);
        return null;
      }
      return new Uint8Array(await imgRes.arrayBuffer());
    }

    // Base64 decode
    const raw = screenshotField.replace(/^data:image\/[a-z]+;base64,/, "");
    const padded = raw + "=".repeat((4 - (raw.length % 4)) % 4);
    const binaryStr = atob(padded);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    console.log(`[Screenshot] Decoded base64 for "${section.section_name}" — ${bytes.length} bytes`);
    return bytes;
  } catch (e) {
    console.error(`[Screenshot] Error for "${section.section_name}":`, e);
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
      headers: {
        Authorization: `Bearer ${asanaToken}`,
      },
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
              memberships: [{ project: ASANA_PROJECT_GID, section: SECTION_READY_FOR_SETUP }],
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

    // ── STEP 3: AI-driven targeted section screenshots ─────────────────────
    steps.push({ step: 3, name: "CRO Section Screenshots", status: "running" });
    const lovableApiKey = getLovableApiKey();
    if (!firecrawlKey) {
      steps[steps.length - 1] = { step: 3, name: "CRO Section Screenshots", status: "skipped", detail: "No Firecrawl API key — connect Firecrawl in Settings" };
    } else if (!lovableApiKey) {
      steps[steps.length - 1] = { step: 3, name: "CRO Section Screenshots", status: "skipped", detail: "No LOVABLE_API_KEY configured" };
    } else {
      try {
        const mainUrl = shop_url;
        const slug = client_name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const ts = Date.now();

        // 3A: Scrape the page to get markdown for AI analysis
        console.log("Scraping page for CRO section identification:", mainUrl);
        const scrapeResp = await fetch(`${FIRECRAWL_API}/scrape`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${firecrawlKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: mainUrl, formats: ["markdown"], onlyMainContent: true, waitFor: 2000 }),
        });

        let markdown = "";
        if (scrapeResp.ok) {
          const scrapeData = await scrapeResp.json();
          markdown = scrapeData.data?.markdown || scrapeData.markdown || "";
        }

        // 3B: AI identifies key CRO sections
        console.log(`[Step 3B] Identifying CRO sections with AI (markdown length: ${markdown.length})...`);
        const sections = await identifyCROSections(mainUrl, markdown, lovableApiKey);
        console.log(`[Step 3B] AI identified ${sections.length} sections:`);
        for (const s of sections) {
          console.log(`  → "${s.section_name}" at ${s.scroll_percent}% — selector: "${s.css_selector}"`);
        }

        if (sections.length === 0) {
          steps[steps.length - 1] = { step: 3, name: "CRO Section Screenshots", status: "error", detail: "AI could not identify sections" };
        } else {
          // 3C: Capture targeted screenshot for each section (3 at a time)
          const sectionResults: string[] = [];
          for (let i = 0; i < sections.length; i += 3) {
            const batch = sections.slice(i, i + 3);
            const batchResults = await Promise.all(
              batch.map(async (section) => {
                const bytes = await captureSectionScreenshot(mainUrl, section, firecrawlKey);
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

                // 3D: Attach to Asana task as attachment
                if (taskGid && result.bytes) {
                  await attachImageToAsana(
                    taskGid,
                    asanaToken,
                    result.bytes,
                    `${result.section.section_name}.png`
                  );
                }
              } else {
                sectionResults.push(`✗ ${result.section.section_name}`);
              }
            }
          }

          const successCount = Object.keys(screenshotUrls).length;
          steps[steps.length - 1] = {
            step: 3, name: "CRO Section Screenshots", status: successCount > 0 ? "done" : "error",
            detail: `${successCount}/${sections.length} sections captured — ${sectionResults.join(" | ")}`,
          };
        }
      } catch (e) {
        console.error("Step 3 error:", e);
        steps[steps.length - 1] = { step: 3, name: "CRO Section Screenshots", status: "error", error: String(e) };
      }
    }

    // ── STEP 4: Update Asana card notes with section screenshots ─────────────
    steps.push({ step: 4, name: "Update Asana Card Notes", status: "running" });
    try {
      const existing = await asanaFetch(`/tasks/${taskGid}?opt_fields=notes`, asanaToken);
      const parts = [existing.notes ?? ""];

      if (Object.keys(screenshotUrls).length > 0) {
        const screenshotSummary = Object.entries(screenshotUrls)
          .map(([section, url]) => `  📌 ${section}: ${url}`)
          .join("\n");
        parts.push(`\n\n📸 Section Screenshots:\n${screenshotSummary}`);
      }

      const newNotes = parts.join("").trim();
      if (newNotes !== (existing.notes ?? "").trim()) {
        await asanaFetch(`/tasks/${taskGid}`, asanaToken, {
          method: "PUT",
          body: JSON.stringify({ data: { notes: newNotes } }),
        });
      }
      steps[steps.length - 1] = {
        step: 4, name: "Update Asana Card Notes", status: "done",
        detail: `${Object.keys(screenshotUrls).length} section screenshot URLs in notes`,
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

    // ── STEP 7: Keep card in Ready for Setup (human moves to Setup Complete) ──
    // IMPORTANT: Do NOT move to Setup Complete automatically.
    // An Asana automation rule moves cards from Setup Complete → Oddit Design.
    // Only a human should trigger that transition.
    steps.push({ step: 7, name: "Card Placement", status: "done", detail: "Card stays in Ready for Setup — human moves to Setup Complete when ready" });

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
