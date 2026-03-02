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
const SECTION_READY_FOR_SETUP = "1207443359385417";
const SECTION_READY_FOR_REVIEW = "1213418243007820";

// Asana "Type" custom field
const CF_TYPE_GID = "1205565239136671";
const CF_TYPE_REPORT = "1205565239136672";
const CF_TYPE_REPORT_WL = "1207991920217334";
const CF_TYPE_LANDING_PAGE = "1205565239136673";
const CF_TYPE_NEW_SITE_DESIGN = "1208115310094826";

// Figma template keys (from secrets, with hardcoded fallbacks)
const FIGMA_TEMPLATE_ODDIT_PRO = Deno.env.get("FIGMA_TEMPLATE_ODDIT_PRO") || "3EfexlsSpqIciz7PkcSPwu";
const FIGMA_SLIDES_ODDIT_PRO = Deno.env.get("FIGMA_SLIDES_ODDIT_PRO") || "7iTirmji3y4s35Xyrk2Cwg";
const FIGMA_TEMPLATE_ODDIT_ESSENTIAL = Deno.env.get("FIGMA_TEMPLATE_ODDIT_ESSENTIAL") || "";
const FIGMA_SLIDES_ODDIT_ESSENTIAL = Deno.env.get("FIGMA_SLIDES_ODDIT_ESSENTIAL") || "";
const FIGMA_TEMPLATE_LANDING_PAGE = Deno.env.get("FIGMA_TEMPLATE_LANDING_PAGE") || "Jvl3mHljgyBWOJXunGjL1b";
const FIGMA_TEMPLATE_NEW_SITE = Deno.env.get("FIGMA_TEMPLATE_NEW_SITE") || "I5FKz7pnaTL1iXlujGTQvU";

// Figma destination projects
const FIGMA_PROJECT_LANDING_PAGES = "105286773";
const FIGMA_PROJECT_NEW_SITE_DESIGNS = "229666225";
const FIGMA_PROJECT_REPORTS = "258925701";

// Figma frame names to inject screenshots into
const FRAME_DESKTOP_MAIN  = "Desktop Screenshot";
const FRAME_MOBILE_MAIN   = "Mobile Screenshot";
const FRAME_DESKTOP_FOCUS = "Desktop Focus";
const FRAME_MOBILE_FOCUS  = "Mobile Focus";


// ── Asana helpers ─────────────────────────────────────────────────────────────

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
      lower.startsWith("focus:") ||
      /^page\s*\d+\s*url:/i.test(line)
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

// ── Detect project type from Asana custom fields ─────────────────────────────
type ProjectType = "report" | "landing_page" | "new_site_design" | "other";

function detectProjectType(customFields: any[]): ProjectType {
  if (!Array.isArray(customFields)) return "other";
  const typeField = customFields.find((cf: any) => cf.gid === CF_TYPE_GID);
  const enumGid = typeField?.enum_value?.gid;
  if (!enumGid) return "other";

  if (enumGid === CF_TYPE_REPORT || enumGid === CF_TYPE_REPORT_WL) return "report";
  if (enumGid === CF_TYPE_LANDING_PAGE) return "landing_page";
  if (enumGid === CF_TYPE_NEW_SITE_DESIGN) return "new_site_design";
  return "other";
}

// ── Duplicate a Figma file and move to project ────────────────────────────────
async function duplicateFigmaFile(
  figmaToken: string,
  templateKey: string,
  fileName: string,
  destProjectId?: string | null
): Promise<string | null> {
  const dupRes = await fetch(`${FIGMA_API}/files/${templateKey}/duplicate`, {
    method: "POST",
    headers: { "X-Figma-Token": figmaToken, "Content-Type": "application/json" },
    body: JSON.stringify({ name: fileName }),
  });
  if (!dupRes.ok) {
    console.warn(`Figma duplication failed (${dupRes.status}):`, await dupRes.text().catch(() => ""));
    return null;
  }
  const dupData = await dupRes.json();
  const newKey = dupData.key ?? dupData.file?.key ?? null;
  if (!newKey) return null;

  if (destProjectId) {
    try {
      await fetch(`${FIGMA_API}/projects/${destProjectId}/move`, {
        method: "POST",
        headers: { "X-Figma-Token": figmaToken, "Content-Type": "application/json" },
        body: JSON.stringify({ files: [newKey] }),
      });
    } catch (e) {
      console.warn(`Failed to move file ${newKey} to project ${destProjectId}:`, e);
    }
  }
  return newKey;
}

// ── Full-page homepage screenshot via Firecrawl ───────────────────────────────
async function captureFullPageScreenshot(
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
        waitFor: 3000,
      }),
    });

    if (!resp.ok) {
      console.error(`[Screenshot] Firecrawl error for ${label}: ${resp.status}`);
      return null;
    }

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
    console.log(`[Screenshot] ${label}: ${bytes.length} bytes`);
    return bytes;
  } catch (e) {
    console.error(`[Screenshot] Error for ${label}:`, e);
    return null;
  }
}

// ── Process a single Asana card through the full pipeline ─────────────────────
async function processCard(
  sb: ReturnType<typeof createClient>,
  asanaToken: string,
  figmaToken: string | null,
  firecrawlKey: string | null,
  task: { gid: string; name: string; notes: string; custom_fields?: any[] },
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

  // ── Detect project type from custom fields ──────────────────────────────
  const projectType = detectProjectType(task.custom_fields ?? []);
  console.log(`[${task.name}] Detected project type: ${projectType}`);

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

  // ── STEP 1: Duplicate Figma template(s) based on project type ───────────
  push({ step: 1, name: "Duplicate Figma Templates", status: "done", detail: "Starting..." });
  if (!figmaToken) {
    steps[steps.length - 1] = { step: 1, name: "Duplicate Figma Templates", status: "skipped", detail: "No Figma token" };
  } else {
    const figmaResults: string[] = [];

    try {
      if (projectType === "landing_page") {
        const newKey = await duplicateFigmaFile(
          figmaToken,
          FIGMA_TEMPLATE_LANDING_PAGE,
          `${displayClient} // Landing Page`,
          FIGMA_PROJECT_LANDING_PAGES
        );
        if (newKey) {
          figmaFileLink = `https://www.figma.com/file/${newKey}`;
          figmaResults.push("Landing Page: ✓");
        } else {
          figmaResults.push("Landing Page: ✗");
        }
      } else if (projectType === "new_site_design") {
        const newKey = await duplicateFigmaFile(
          figmaToken,
          FIGMA_TEMPLATE_NEW_SITE,
          `${displayClient} // New Site Design`,
          FIGMA_PROJECT_NEW_SITE_DESIGNS
        );
        if (newKey) {
          figmaFileLink = `https://www.figma.com/file/${newKey}`;
          figmaResults.push("New Site Design: ✓");
        } else {
          figmaResults.push("New Site Design: ✗");
        }
      } else if (projectType === "report") {
        // Select template based on tier (pro vs essential)
        const auditTemplate = tier === "essential" ? FIGMA_TEMPLATE_ODDIT_ESSENTIAL : FIGMA_TEMPLATE_ODDIT_PRO;
        const slidesTemplate = tier === "essential" ? FIGMA_SLIDES_ODDIT_ESSENTIAL : FIGMA_SLIDES_ODDIT_PRO;

        if (!auditTemplate) {
          figmaResults.push(`Audit: ✗ (no ${tierLabel} template configured)`);
        } else {
          const auditKey = await duplicateFigmaFile(
            figmaToken,
            auditTemplate,
            `${displayClient} // ${tierLabel} Report`,
            FIGMA_PROJECT_REPORTS
          );
          if (auditKey) {
            figmaFileLink = `https://www.figma.com/file/${auditKey}`;
            figmaResults.push(`Audit (${tierLabel}): ✓`);
          } else {
            figmaResults.push(`Audit (${tierLabel}): ✗`);
          }
        }

        if (!slidesTemplate) {
          figmaResults.push(`Slides: skipped (no ${tierLabel} slides template)`);
        } else {
          const slidesKey = await duplicateFigmaFile(
            figmaToken,
            slidesTemplate,
            `${displayClient} // ${tierLabel} Report Slides`,
            FIGMA_PROJECT_REPORTS
          );
          if (slidesKey) {
            figmaSlidesLink = `https://www.figma.com/file/${slidesKey}`;
            figmaResults.push(`Slides (${tierLabel}): ✓`);
          } else {
            figmaResults.push(`Slides (${tierLabel}): ✗`);
          }
        }
      } else {
        figmaResults.push(`Skipped — unsupported type: ${projectType}`);
      }
    } catch (e) {
      figmaResults.push(`Error: ${e}`);
    }

    steps[steps.length - 1] = {
      step: 1,
      name: "Duplicate Figma Templates",
      status: figmaFileLink || figmaSlidesLink ? "done" : (projectType === "other" ? "skipped" : "error"),
      detail: figmaResults.join(" | "),
    };
  }

  // ── STEP 2: Homepage screenshots (Desktop + Mobile, full page) ──────────
  if (!firecrawlKey || !websiteUrl) {
    push({ step: 2, name: "Homepage Screenshots", status: "skipped", detail: !firecrawlKey ? "No Firecrawl key" : "No website URL" });
  } else {
    try {
      const slug = displayClient.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const ts = Date.now();

      const [desktopBytes, mobileBytes] = await Promise.all([
        captureFullPageScreenshot(websiteUrl, firecrawlKey, false, "Desktop Homepage"),
        captureFullPageScreenshot(websiteUrl, firecrawlKey, true, "Mobile Homepage"),
      ]);

      const results: string[] = [];

      if (desktopBytes) {
        const filename = `${slug}-desktop-${ts}.png`;
        const url = await uploadToStorage(sb, desktopBytes, filename);
        if (url) screenshotUrls["Desktop"] = url;
        await attachImageToAsana(task.gid, asanaToken, desktopBytes, `${displayClient} - Desktop.png`);
        results.push(`✓ Desktop (${desktopBytes.length} bytes)`);
      } else {
        results.push("✗ Desktop");
      }

      if (mobileBytes) {
        const filename = `${slug}-mobile-${ts}.png`;
        const url = await uploadToStorage(sb, mobileBytes, filename);
        if (url) screenshotUrls["Mobile"] = url;
        await attachImageToAsana(task.gid, asanaToken, mobileBytes, `${displayClient} - Mobile.png`);
        results.push(`✓ Mobile (${mobileBytes.length} bytes)`);
      } else {
        results.push("✗ Mobile");
      }

      push({
        step: 2,
        name: "Homepage Screenshots",
        status: Object.keys(screenshotUrls).length > 0 ? "done" : "error",
        detail: results.join(" | "),
      });
    } catch (e) {
      push({ step: 2, name: "Homepage Screenshots", status: "error", error: String(e) });
    }
  }

  // ── STEP 3: Update Asana notes with Figma links + screenshot URLs ───────
  try {
    const existing = await asanaFetch(`/tasks/${task.gid}?opt_fields=notes`, asanaToken);
    const parts = [existing.notes ?? ""];

    if (figmaFileLink) parts.push(`\n\n📎 Figma File: ${figmaFileLink}`);
    if (figmaSlidesLink) parts.push(`\n📊 Figma Slides: ${figmaSlidesLink}`);

    if (Object.keys(screenshotUrls).length > 0) {
      const lines = Object.entries(screenshotUrls)
        .map(([label, url]) => `  📸 ${label}: ${url}`)
        .join("\n");
      parts.push(`\n\n📸 Homepage Screenshots:\n${lines}`);
      parts.push(`\n🖼️ Paste these into Figma template frames:`);
      for (const [label, url] of Object.entries(screenshotUrls)) {
        parts.push(`  → ${label} Screenshot: ${url}`);
      }
    }

    const newNotes = parts.join("").trim();
    if (newNotes !== (existing.notes ?? "").trim()) {
      await asanaFetch(`/tasks/${task.gid}`, asanaToken, {
        method: "PUT",
        body: JSON.stringify({ data: { notes: newNotes } }),
      });
    }
    push({ step: 3, name: "Update Asana Notes", status: "done", detail: "Figma links + screenshots added" });
  } catch (e) {
    push({ step: 3, name: "Update Asana Notes", status: "error", error: String(e) });
  }

  // ── STEP 4: Move card to "Ready for Review" ─────────────────────────────
  try {
    await asanaFetch(`/sections/${SECTION_READY_FOR_REVIEW}/addTask`, asanaToken, {
      method: "POST",
      body: JSON.stringify({ data: { task: task.gid } }),
    });
    push({ step: 4, name: "Move to Ready for Review", status: "done", detail: "Card moved for human QA" });
  } catch (e) {
    push({ step: 4, name: "Move to Ready for Review", status: "error", error: String(e) });
  }

  // ── STEP 5: Auto-generate wireframe brief for Landing Page projects ──────
  if (projectType === "landing_page") {
    try {
      // Search for a Fireflies transcript matching this client
      let transcriptContent = "";
      let transcriptTitle = "";
      const clientSearch = displayClient.toLowerCase();

      const { data: transcripts } = await sb
        .from("fireflies_transcripts")
        .select("title, transcript_text, summary, action_items")
        .or(`title.ilike.%${clientSearch}%,participants.cs.{${clientSearch}}`)
        .order("date", { ascending: false })
        .limit(1);

      if (transcripts?.length) {
        const t = transcripts[0];
        transcriptTitle = t.title;
        transcriptContent = [
          t.summary ? `CALL SUMMARY:\n${t.summary}` : "",
          t.action_items ? `ACTION ITEMS:\n${t.action_items}` : "",
          t.transcript_text ? `TRANSCRIPT:\n${t.transcript_text.slice(0, 15000)}` : "",
        ].filter(Boolean).join("\n\n");
        console.log(`[Wireframe] Found transcript "${t.title}" for ${displayClient}`);
      } else {
        console.log(`[Wireframe] No transcript found for ${displayClient}, proceeding with notes only`);
      }

      // Combine Asana notes + transcript as the brief input
      const combinedNotes = [
        task.notes ? `ASANA CARD NOTES:\n${task.notes}` : "",
        transcriptContent,
      ].filter(Boolean).join("\n\n---\n\n");

      // Call generate-wireframe edge function
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      const wireframeResp = await fetch(`${supabaseUrl}/functions/v1/generate-wireframe`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseAnonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_name: displayClient,
          site_url: websiteUrl,
          asana_notes: combinedNotes,
          asana_task_gid: task.gid,
          setup_run_id: runId,
        }),
      });

      if (wireframeResp.ok) {
        const wireframeData = await wireframeResp.json();
        push({
          step: 5,
          name: "Generate Wireframe Brief",
          status: "done",
          detail: `Brief ${wireframeData.brief_id}${transcriptTitle ? ` (using transcript: "${transcriptTitle}")` : " (no transcript, notes only)"}`,
        });
      } else {
        const errText = await wireframeResp.text();
        console.error("[Wireframe] Generation failed:", wireframeResp.status, errText);
        push({
          step: 5,
          name: "Generate Wireframe Brief",
          status: "error",
          error: `HTTP ${wireframeResp.status}: ${errText.slice(0, 200)}`,
        });
      }
    } catch (e) {
      console.error("[Wireframe] Error:", e);
      push({
        step: 5,
        name: "Generate Wireframe Brief",
        status: "error",
        error: String(e),
      });
    }
  }

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
      workflow_name: `Auto Setup: ${displayClient} (${projectType})`,
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

    // 1. Fetch all tasks in the "Ready For Setup" section (include custom fields for type detection)
    const tasks = await asanaFetch(
      `/sections/${SECTION_READY_FOR_SETUP}/tasks?opt_fields=gid,name,notes,custom_fields.gid,custom_fields.enum_value.gid,custom_fields.enum_value.name&limit=50`,
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
