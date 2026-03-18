import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, clientName } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY is not configured");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Assemble full client dossier for context ──
    let dossierContext = "";
    if (clientName) {
      try {
        const dossierResp = await fetch(`${SUPABASE_URL}/functions/v1/assemble-dossier`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ client_name: clientName }),
        });
        if (dossierResp.ok) {
          const { narrativeSummary } = await dossierResp.json();
          if (narrativeSummary) {
            dossierContext = narrativeSummary;
            console.log("Dossier assembled, length:", dossierContext.length);
          }
        }
      } catch (e) {
        console.warn("Dossier assembly failed (non-fatal):", e);
      }
    }

    // Format URL
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
      formattedUrl = `https://${formattedUrl}`;
    }

    // Create audit record
    const { data: audit, error: insertError } = await supabase
      .from("cro_audits")
      .insert({ shop_url: formattedUrl, client_name: clientName || "", status: "scraping" })
      .select()
      .single();

    if (insertError) throw new Error(`DB insert failed: ${insertError.message}`);
    const auditId = audit.id;

    // Step 1: Scrape with Firecrawl (screenshot + markdown)
    console.log("Scraping:", formattedUrl);
    const scrapeResp = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: ["markdown", "screenshot"],
        waitFor: 3000,
      }),
    });

    const scrapeData = await scrapeResp.json();
    if (!scrapeResp.ok) {
      console.error("Firecrawl error:", scrapeData);
      await supabase.from("cro_audits").update({ status: "failed" }).eq("id", auditId);
      return new Response(JSON.stringify({ error: "Failed to scrape the website", auditId }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const markdown = scrapeData.data?.markdown || scrapeData.markdown || "";
    const screenshotBase64 = scrapeData.data?.screenshot || scrapeData.screenshot || "";

    // Upload screenshot to storage if available
    let screenshotUrl = "";
    if (screenshotBase64) {
      try {
        // Firecrawl may return a URL or base64 data
        if (screenshotBase64.startsWith("http://") || screenshotBase64.startsWith("https://")) {
          // It's a URL — download it then upload to storage
          const imgResp = await fetch(screenshotBase64);
          if (imgResp.ok) {
            const imgBuffer = new Uint8Array(await imgResp.arrayBuffer());
            const { error: uploadError } = await supabase.storage
              .from("audit-assets")
              .upload(`screenshots/${auditId}.png`, imgBuffer, {
                contentType: "image/png",
                upsert: true,
              });
            if (!uploadError) {
              const { data: urlData } = supabase.storage
                .from("audit-assets")
                .getPublicUrl(`screenshots/${auditId}.png`);
              screenshotUrl = urlData.publicUrl;
            }
          } else {
            // Fall back to using the URL directly
            screenshotUrl = screenshotBase64;
          }
        } else {
          // Base64 data — decode and upload
          const base64Data = screenshotBase64.replace(/^data:image\/\w+;base64,/, "");
          const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
          const { error: uploadError } = await supabase.storage
            .from("audit-assets")
            .upload(`screenshots/${auditId}.png`, binaryData, {
              contentType: "image/png",
              upsert: true,
            });
          if (!uploadError) {
            const { data: urlData } = supabase.storage
              .from("audit-assets")
              .getPublicUrl(`screenshots/${auditId}.png`);
            screenshotUrl = urlData.publicUrl;
          }
        }
      } catch (e) {
        console.error("Screenshot upload error:", e);
        // If everything fails but we have a URL, use it directly
        if (screenshotBase64.startsWith("http")) screenshotUrl = screenshotBase64;
      }
    }

    // Update status to analyzing
    await supabase
      .from("cro_audits")
      .update({ status: "analyzing", screenshot_url: screenshotUrl })
      .eq("id", auditId);

    // Fetch past Figma designs WITH full Design DNA for this client
    let figmaContext = "";
    const figmaImageUrls: string[] = [];
    if (clientName) {
      const { data: figmaFiles } = await supabase
        .from("figma_files")
        .select("name, design_type, figma_url, client_name, thumbnail_url, last_modified, design_data")
        .ilike("client_name", clientName)
        .eq("enabled", true)
        .order("last_modified", { ascending: false })
        .limit(15);

      if (figmaFiles?.length) {
        const fileParts: string[] = [];
        const allColors: string[] = [];
        const allTypography: string[] = [];

        for (const f of figmaFiles) {
          const dd = f.design_data as any;
          let fileDesc = `  • [${f.design_type}] "${f.name}" — ${f.figma_url || "no link"} (last modified: ${f.last_modified || "unknown"})`;

          if (dd && Object.keys(dd).length > 0) {
            // Extract colors
            const colors = dd.color_palette || dd.styles?.colors || [];
            for (const c of colors) {
              allColors.push(`${c.name}: ${c.hex || c.rgba || ""}`);
            }

            // Extract typography
            const typo = dd.typography || dd.styles?.typography || [];
            for (const t of typo) {
              allTypography.push(`${t.name}: ${t.fontFamily} ${t.fontWeight} ${t.fontSize}px`);
            }

            // Collect frame exports for multimodal
            const frameExports = dd.frame_exports || dd.frameExports || {};
            const urls = typeof frameExports === "object" ? Object.values(frameExports) : [];
            for (const url of urls.slice(0, 3)) {
              if (url && figmaImageUrls.length < 8) figmaImageUrls.push(url as string);
            }

            // Page/frame structure
            if (dd.pages?.length) {
              const frameNames = dd.pages.flatMap((p: any) => (p.frames || []).map((fr: any) => fr.name)).slice(0, 10);
              if (frameNames.length) fileDesc += `\n    Frames: ${frameNames.join(", ")}`;
            }
          }

          fileParts.push(fileDesc);
        }

        figmaContext = "\n\nDESIGN DNA FROM PAST FIGMA FILES — Use this to write recommendations that reference the client's actual design system:\n" +
          fileParts.join("\n");

        if (allColors.length) {
          const uniqueColors = [...new Set(allColors)].slice(0, 20);
          figmaContext += `\n\n  Brand Colors: ${uniqueColors.join(", ")}`;
        }
        if (allTypography.length) {
          const uniqueTypo = [...new Set(allTypography)].slice(0, 10);
          figmaContext += `\n  Brand Typography: ${uniqueTypo.join(", ")}`;
        }
        if (figmaImageUrls.length) {
          figmaContext += `\n  [${figmaImageUrls.length} frame exports attached as visual references]`;
        }

        console.log(`Found ${figmaFiles.length} Figma files for client "${clientName}", ${figmaImageUrls.length} frame images`);
      }
    }

    // Fetch cross-client recommendation patterns, weighted by effectiveness
    let crossClientContext = "";
    const { data: topPatterns } = await supabase
      .from("recommendation_insights")
      .select("recommendation_text, category, frequency_count, template_content, effectiveness_score, converted_count, implemented_count, skipped_count")
      .order("effectiveness_score", { ascending: false })
      .limit(15);

    if (topPatterns?.length) {
      crossClientContext = "\n\nPROVEN CRO PATTERNS FROM 11,000+ PAST AUDITS (prioritized by effectiveness score — higher = more often converted):\n" +
        topPatterns.map((p: any) => {
          const stats = p.converted_count || p.implemented_count || p.skipped_count
            ? ` | converted: ${p.converted_count}, implemented: ${p.implemented_count}, skipped: ${p.skipped_count}, effectiveness: ${p.effectiveness_score}`
            : "";
          return `  • [${p.category}] (used ${p.frequency_count}x${stats}): ${p.recommendation_text}${p.template_content ? `\n    Template: ${p.template_content.slice(0, 200)}` : ""}`;
        }).join("\n");
    }

    // Fetch top-rated mockups from ANY client as quality benchmarks
    let starredContext = "";
    const { data: recentAudits } = await supabase
      .from("cro_audits")
      .select("recommendations")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(30);

    if (recentAudits?.length) {
      const starredExamples: string[] = [];
      for (const a of recentAudits) {
        for (const r of ((a.recommendations as any[]) || [])) {
          if (r.mockup_rating >= 4 && r.recommended_change && starredExamples.length < 5) {
            starredExamples.push(`  • [${r.section}] ${r.recommended_change.slice(0, 200)}`);
          }
        }
      }
      if (starredExamples.length) {
        starredContext = "\n\nTOP-RATED RECOMMENDATIONS FROM PAST CLIENTS (these received 4+ star ratings from the design team):\n" + starredExamples.join("\n");
      }
    }

    // Step 2: Analyze with Gemini (multimodal when Figma images available)
    console.log(`Analyzing with AI... (${figmaImageUrls.length} Figma frame images for visual context)`);
    const truncatedMarkdown = markdown.slice(0, 15000); // Keep within context limits
    const useVisionModel = figmaImageUrls.length > 0;

    // Build user message — multimodal if we have Figma frame exports
    const userText = `Analyze this DTC/e-commerce website and produce 10 specific, copy-ready CRO recommendations. Remember: write actual headlines, reference real brands, specify mobile behavior, and make every mockup_prompt a complete design brief.\n\nURL: ${formattedUrl}\n\nPage content (use this to reference ACTUAL text, images, and layout on the site — be specific):\n${truncatedMarkdown}${figmaContext}${crossClientContext}${starredContext}`;

    let userContent: any = userText;
    if (useVisionModel) {
      const parts: any[] = [{ type: "text", text: userText }];
      for (const imgUrl of figmaImageUrls) {
        parts.push({ type: "image_url", image_url: { url: imgUrl } });
      }
      parts.push({ type: "text", text: `Above are ${figmaImageUrls.length} frame exports from this client's past Figma designs. Study their visual language, layout patterns, colors, and typography when writing recommendations. Your mockup_prompts should build on these established design patterns.` });
      userContent = parts;
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: useVisionModel ? "google/gemini-2.5-flash" : "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a senior CRO strategist at Oddit, a DTC-focused conversion agency with 11,000+ audits completed. You produce recommendations that read like design briefs — specific enough that a designer could execute them without asking a single question.
${dossierContext ? `\n## FULL CLIENT DOSSIER\nBelow is the complete client history — past audits, meeting transcripts, Oddit scores, Figma files, pipeline status, and competitive intel. Use this context to avoid repeating past recommendations that were already implemented and to build on established findings:\n\n${dossierContext}\n` : ""}

## YOUR OUTPUT RULES

1. **Write the actual copy.** Never say "improve the headline." Write the headline. e.g. "Replace current hero H1 with: 'Clinical-grade skincare. Zero compromise.' — 6 words, benefit-led, creates intrigue."

2. **Cite real benchmarks & competitors.** Every recommendation MUST reference a real DTC brand or conversion stat. e.g. "Glossier's single-CTA hero drives 40%+ of homepage clicks. Jones Road uses a sticky mobile ATC bar — conversion uplift reported at +23%."

3. **Mobile-first.** 70%+ of DTC traffic is mobile. Every recommendation must specify the mobile experience. Describe thumb zones, tap targets (min 48px), scroll depth, and viewport behavior.

4. **Follow AIDA for page flow.** Map each recommendation to where it sits in the Attention → Interest → Desire → Action funnel. Above-fold = Attention. Social proof = Desire. CTA = Action.

5. **Be a design brief.** The mockup_prompt must describe exact layout: grid columns, spacing in px, font sizes, color tokens, image aspect ratios, component hierarchy. A designer should be able to build it from your description alone.

6. **Quantify impact with specifics.** Don't say "increase conversions." Say "+12-18% add-to-cart rate based on Baymard Institute mobile CTA placement studies" or "reducing form fields from 6→3 typically yields +25-40% completion (Formstack 2023 benchmark)."

7. **No generic advice.** "Add social proof" is banned. Instead: "Insert a horizontal scrolling strip of 5 UGC photos with star overlay + review count badge, positioned 120px below the hero fold. Reference: Skims uses this pattern — their PDP social proof strip correlates with 2.3x higher ATC rate vs pages without."

8. **Reference the Design DNA.** When Figma design data and frame exports are provided, your recommendations MUST reference the client's existing brand colors, typography, and layout patterns. The mockup_prompt should specify exact color hex values and font families from the brand's design system — not generic values.

9. **Before/After copy comparison.** For EVERY recommendation, provide the EXACT current copy/element as it appears on the site (before_copy) and your improved version (after_copy). This creates an instant visual comparison. e.g. before: "Shop Now" → after: "Get 20% Off Your First Order — Free Shipping"

10. **Revenue impact estimation.** Estimate the monthly revenue impact for a store doing $500K/mo in revenue. Be specific: "+$4,200-$7,500/mo from 0.8-1.5% ATC uplift on hero CTA redesign." Base estimates on published conversion benchmarks from Baymard, NNGroup, CXL, or real brand case studies.

11. **Difficulty classification.** Rate each recommendation as quick_win (< 2 hours, copy/config change), moderate (2-8 hours, design + dev), or complex (1-2 weeks, structural change). Quick wins should be prioritized first.

## RECOMMENDATION STRUCTURE

For each of the 10 recommendations, think through:
- What EXACT element is broken and why it hurts conversions (cite the psychological principle: Hick's Law, Fitts's Law, social proof bias, loss aversion, etc.)
- What the FIXED version looks like — with actual copy, dimensions, colors, layout
- A real DTC brand that does this well, with the specific pattern they use
- The mobile-specific implementation (touch targets, scroll behavior, viewport stacking)
- AIDA stage this maps to
- The BEFORE copy/state vs AFTER copy/state side by side
- Estimated monthly revenue impact for a $500K/mo store

## CSS SELECTOR RULES
- Provide the most specific CSS selector you can infer from the markup
- Use class names, IDs, semantic tags, or structural selectors
- If the element is ambiguous, use the page structure (e.g. 'main > section:nth-child(3)')

## SCROLL PERCENTAGE
- Hero/nav: 0-10%
- Above-fold features: 10-25%
- Mid-page content: 25-60%
- Lower sections: 60-85%
- Footer area: 85-100%`,
          },
          {
            role: "user",
            content: userContent,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "cro_recommendations",
              description: "Return 10 specific, copy-ready CRO recommendations with real benchmarks, competitor references, and design-brief-quality mockup prompts",
              parameters: {
                type: "object",
                properties: {
                  recommendations: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "number" },
                        section: { type: "string", description: "Exact page section name (e.g. 'Hero Banner', 'Mobile Navigation Drawer', 'PDP Add-to-Cart Block')" },
                        severity: { type: "string", enum: ["high", "medium", "low"] },
                        aida_stage: { type: "string", enum: ["attention", "interest", "desire", "action"], description: "Where this sits in the AIDA funnel" },
                        current_issue: { type: "string", description: "What's broken and WHY it hurts conversions. Cite the psychological principle (Hick's Law, Fitts's Law, etc). Reference actual text/elements from the page." },
                        recommended_change: { type: "string", description: "The EXACT fix. Write actual copy, specify dimensions, describe the mobile experience. This should read like a design brief." },
                        competitor_reference: { type: "string", description: "A real DTC brand that does this well, with the specific pattern they use and any known conversion data." },
                        expected_impact: { type: "string", description: "Quantified impact with source. e.g. '+12-18% ATC rate (Baymard Institute mobile CTA study)'" },
                        mockup_prompt: { type: "string", description: "A complete design brief: grid layout, spacing in px, font sizes, color palette, image aspect ratios, component hierarchy. A designer could build from this alone." },
                        css_selector: { type: "string" },
                        scroll_percentage: { type: "number" },
                        cro_rationale: { type: "string", description: "The conversion psychology behind this recommendation. Why does this specific change drive revenue? Reference principles like Hick's Law, Fitts's Law, social proof bias, loss aversion, anchoring, etc." },
                        reference_examples: { type: "string", description: "2-3 real-world DTC brand examples that execute this pattern well, with specific details about their implementation and any known conversion data." },
                        implementation_spec: { type: "string", description: "Step-by-step technical implementation spec. Include exact CSS changes, component structure, copy strings, asset requirements, and responsive breakpoints. A developer should be able to build this without asking questions." },
                        priority_score: { type: "number", description: "1-100 priority score based on (impact × ease of implementation). 90+ = quick wins with massive impact. 50-89 = important but moderate effort. Below 50 = nice-to-have or complex." },
                      },
                      required: ["id", "section", "severity", "aida_stage", "current_issue", "recommended_change", "competitor_reference", "expected_impact", "mockup_prompt", "css_selector", "scroll_percentage", "cro_rationale", "reference_examples", "implementation_spec", "priority_score"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["recommendations"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "cro_recommendations" } },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI error:", aiResp.status, errText);
      if (aiResp.status === 429) {
        await supabase.from("cro_audits").update({ status: "failed" }).eq("id", auditId);
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly.", auditId }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        await supabase.from("cro_audits").update({ status: "failed" }).eq("id", auditId);
        return new Response(JSON.stringify({ error: "AI usage limit reached.", auditId }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await supabase.from("cro_audits").update({ status: "failed" }).eq("id", auditId);
      return new Response(JSON.stringify({ error: "AI analysis failed", auditId }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    let recommendations = [];

    // Extract from tool call response
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        recommendations = parsed.recommendations || [];
      } catch (e) {
        console.error("Failed to parse tool call:", e);
      }
    }

    // Fallback: try parsing content directly
    if (recommendations.length === 0) {
      const content = aiData.choices?.[0]?.message?.content;
      if (content) {
        try {
          const parsed = JSON.parse(content);
          recommendations = parsed.recommendations || [];
        } catch (e) {
          console.error("Failed to parse content:", e);
        }
      }
    }

    // Step 3: Capture targeted section screenshots per recommendation
    if (recommendations.length > 0) {
      console.log("Capturing targeted section screenshots...");
      await supabase.from("cro_audits").update({ status: "screenshotting" }).eq("id", auditId);

      // Use Firecrawl's actions API to scroll to each section before screenshotting
      // We batch by deduped scroll positions to reduce API calls (within 10% proximity = same shot)
      const screenshotPromises = recommendations.map(async (rec: any) => {
        const selector = rec.css_selector || "";
        const scrollPct = typeof rec.scroll_percentage === "number"
          ? Math.max(0, Math.min(100, rec.scroll_percentage))
          : 0;

        try {
          // Build JS that scrolls the target element into the center of the viewport
          // and optionally hides sticky headers/footers for a clean crop
          const scrollJs = selector
            ? `
              (function() {
                // Try to find the element with the AI-provided selector
                let el = document.querySelector('${selector.replace(/'/g, "\\'")}');
                // Fallback: try partial matches on common patterns
                if (!el) {
                  const candidates = ['section', 'div', 'header', 'footer', 'main', 'article', 'aside'];
                  for (const tag of candidates) {
                    const all = document.querySelectorAll(tag);
                    for (const c of all) {
                      const text = (c.className || '') + ' ' + (c.id || '');
                      if (text.toLowerCase().includes('${rec.section.toLowerCase().split(" ")[0].replace(/'/g, "\\'")}')) {
                        el = c; break;
                      }
                    }
                    if (el) break;
                  }
                }
                if (el) {
                  // Hide sticky/fixed elements that overlay the section
                  document.querySelectorAll('*').forEach(function(node) {
                    const s = getComputedStyle(node);
                    if (s.position === 'fixed' || s.position === 'sticky') {
                      node.style.setProperty('visibility', 'hidden', 'important');
                    }
                  });
                  el.scrollIntoView({ block: 'center', behavior: 'instant' });
                  return 'found';
                }
                // Fallback: scroll by percentage
                window.scrollTo(0, document.body.scrollHeight * ${scrollPct / 100});
                return 'fallback';
              })()
            `
            : `window.scrollTo(0, document.body.scrollHeight * ${scrollPct / 100}); 'fallback'`;

          const scrapePayload: any = {
            url: formattedUrl,
            formats: ["screenshot"],
            waitFor: 2000,
            actions: [
              { type: "wait", milliseconds: 1500 },
              { type: "executeJavascript", script: scrollJs },
              { type: "wait", milliseconds: 1000 },
              { type: "screenshot" },
            ],
          };

          const resp = await fetch("https://api.firecrawl.dev/v1/scrape", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(scrapePayload),
          });

          if (!resp.ok) {
            console.warn(`Section screenshot failed for rec ${rec.id}: ${resp.status}`);
            return { recId: rec.id, url: null };
          }

          const data = await resp.json();
          const screenshotData = data.data?.screenshot || data.screenshot || "";
          if (!screenshotData) return { recId: rec.id, url: null };

          const filePath = `screenshots/${auditId}/rec-${rec.id}.png`;
          let binary: Uint8Array;

          if (screenshotData.startsWith("http://") || screenshotData.startsWith("https://")) {
            // It's a URL — download then upload
            const imgResp = await fetch(screenshotData);
            if (!imgResp.ok) return { recId: rec.id, url: screenshotData };
            binary = new Uint8Array(await imgResp.arrayBuffer());
          } else {
            const cleanBase64 = screenshotData.replace(/^data:image\/\w+;base64,/, "");
            binary = Uint8Array.from(atob(cleanBase64), (c) => c.charCodeAt(0));
          }

          const { error: upErr } = await supabase.storage
            .from("audit-assets")
            .upload(filePath, binary, { contentType: "image/png", upsert: true });

          if (upErr) {
            console.warn(`Upload failed for rec ${rec.id}:`, upErr.message);
            return { recId: rec.id, url: null };
          }

          const { data: urlData } = supabase.storage.from("audit-assets").getPublicUrl(filePath);
          return { recId: rec.id, url: urlData.publicUrl };
        } catch (e) {
          console.warn(`Section screenshot error for rec ${rec.id}:`, e);
          return { recId: rec.id, url: null };
        }
      });

      // Run up to 3 at a time to avoid hammering Firecrawl
      const results: { recId: number; url: string | null }[] = [];
      for (let i = 0; i < screenshotPromises.length; i += 3) {
        const batch = await Promise.all(screenshotPromises.slice(i, i + 3));
        results.push(...batch);
      }

      // Attach section_screenshot_url to each recommendation
      const screenshotMap = new Map(results.map((r) => [r.recId, r.url]));
      recommendations = recommendations.map((rec: any) => ({
        ...rec,
        section_screenshot_url: screenshotMap.get(rec.id) || null,
      }));

      console.log(`Section screenshots done: ${results.filter((r) => r.url).length}/${results.length} successful`);
    }

    // Save recommendations to DB
    await supabase
      .from("cro_audits")
      .update({
        status: "completed",
        recommendations: recommendations,
      })
      .eq("id", auditId);

    console.log(`Audit ${auditId} completed with ${recommendations.length} recommendations`);

    // Fire-and-forget: trigger recommendation pattern scan to update cross-client learning corpus
    const scanUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/scan-recommendations`;
    fetch(scanUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode: "full" }),
    }).catch(e => console.warn("Background scan-recommendations trigger failed:", e));

    return new Response(
      JSON.stringify({
        auditId,
        status: "completed",
        screenshotUrl,
        recommendations,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-cro-audit error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
