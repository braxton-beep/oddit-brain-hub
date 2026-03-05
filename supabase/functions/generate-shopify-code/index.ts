import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Helper to fetch from Supabase REST API
function sbFetch(supabaseUrl: string, serviceRoleKey: string, path: string) {
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    },
  }).then((r) => r.json());
}

function sbWrite(supabaseUrl: string, serviceRoleKey: string, path: string, method: string, body: unknown) {
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
}

// Extract CSS variables from theme files for pattern matching
function extractCSSVariables(cssContent: string): string {
  const varRegex = /--[\w-]+:\s*[^;]+;/g;
  const matches = cssContent.match(varRegex) || [];
  return matches.slice(0, 100).join("\n");
}

// Extract Shopify section schema patterns from existing sections
function extractSchemaPatterns(liquidFiles: Array<{ filename: string; content: string }>): string {
  const schemas: string[] = [];
  for (const f of liquidFiles) {
    const schemaMatch = f.content.match(/{% schema %}([\s\S]*?){% endschema %}/);
    if (schemaMatch) {
      schemas.push(`--- ${f.filename} schema ---\n${schemaMatch[1].trim().slice(0, 1500)}`);
    }
  }
  return schemas.slice(0, 5).join("\n\n");
}

// Extract class naming conventions from theme
function extractClassPatterns(liquidFiles: Array<{ filename: string; content: string }>): string {
  const classRegex = /class="([^"]+)"/g;
  const allClasses = new Set<string>();
  for (const f of liquidFiles.slice(0, 10)) {
    let match;
    while ((match = classRegex.exec(f.content)) !== null) {
      match[1].split(/\s+/).forEach((c) => {
        if (c.length > 2 && c.length < 40) allClasses.add(c);
      });
    }
  }
  // Return the most common prefixes to understand naming convention
  const prefixMap: Record<string, number> = {};
  for (const cls of allClasses) {
    const prefix = cls.split(/[-_]/)[0];
    prefixMap[prefix] = (prefixMap[prefix] || 0) + 1;
  }
  const topPrefixes = Object.entries(prefixMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([p, c]) => `${p} (${c}x)`);
  
  return `Common class prefixes: ${topPrefixes.join(", ")}\nSample classes: ${[...allClasses].slice(0, 50).join(", ")}`;
}

// ── NEW: Build Figma design context from design_data ──────────────────────
function buildFigmaDesignContext(figmaFiles: any[]): { textContext: string; imageUrls: string[] } {
  const textParts: string[] = [];
  const imageUrls: string[] = [];

  for (const file of figmaFiles) {
    const dd = file.design_data;
    if (!dd || Object.keys(dd).length === 0) continue;

    textParts.push(`\n--- FIGMA DESIGN: ${file.name} (${file.design_type}) ---`);

    // Color palette
    if (dd.color_palette?.length) {
      const colors = dd.color_palette
        .map((c: any) => `  ${c.name}: ${c.hex} (rgba ${c.r},${c.g},${c.b},${c.a})`)
        .join("\n");
      textParts.push(`Color Palette:\n${colors}`);
    }

    // Typography
    if (dd.typography?.length) {
      const typo = dd.typography
        .map((t: any) => `  ${t.name}: ${t.fontFamily} ${t.fontWeight} ${t.fontSize}px${t.lineHeight ? ` / ${Math.round(t.lineHeight)}px` : ""}${t.letterSpacing ? ` ls:${t.letterSpacing}` : ""}`)
        .join("\n");
      textParts.push(`Typography:\n${typo}`);
    }

    // Styles summary
    if (dd.styles) {
      const s = dd.styles;
      if (s.fills?.length) textParts.push(`Fill styles: ${s.fills.map((f: any) => f.name).join(", ")}`);
      if (s.effects?.length) textParts.push(`Effect styles: ${s.effects.map((f: any) => f.name).join(", ")}`);
    }

    // Page/frame structure
    if (dd.pages?.length) {
      for (const page of dd.pages) {
        if (page.frames?.length) {
          const frameList = page.frames
            .map((f: any) => `  ${f.name} (${f.width}×${f.height})`)
            .join("\n");
          textParts.push(`Page "${page.name}" frames:\n${frameList}`);
        }
      }
    }

    // Collect frame export URLs for multimodal
    if (dd.frame_exports) {
      const urls = Object.values(dd.frame_exports) as string[];
      imageUrls.push(...urls.slice(0, 4)); // Max 4 per file
    }
  }

  return {
    textContext: textParts.join("\n"),
    imageUrls: imageUrls.slice(0, 10), // Max 10 total images
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pipeline_project_id, refinement_feedback, previous_section_id } = await req.json();
    if (!pipeline_project_id) {
      return new Response(JSON.stringify({ error: "pipeline_project_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1. Load pipeline project
    const projects = await sbFetch(supabaseUrl, serviceRoleKey,
      `pipeline_projects?id=eq.${pipeline_project_id}&select=*`);
    if (!projects?.length) {
      return new Response(JSON.stringify({ error: "Pipeline project not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const project = projects[0];

    // 2. Load CRO audit recommendations
    let recommendationContext = "";
    const audits = await sbFetch(supabaseUrl, serviceRoleKey,
      `cro_audits?client_name=eq.${encodeURIComponent(project.client)}&select=recommendations,shop_url&order=created_at.desc&limit=1`);
    if (audits?.length && audits[0].recommendations) {
      recommendationContext = `\n\nCRO AUDIT RECOMMENDATIONS:\n${JSON.stringify(audits[0].recommendations, null, 2).slice(0, 8000)}`;
    }

    // 3. Load Shopify theme files
    let themeContext = "";
    let cssVariables = "";
    let schemaPatterns = "";
    let classPatterns = "";

    const clients = await sbFetch(supabaseUrl, serviceRoleKey,
      `clients?name=eq.${encodeURIComponent(project.client)}&select=id&limit=1`);

    if (clients?.length) {
      const conns = await sbFetch(supabaseUrl, serviceRoleKey,
        `shopify_connections?client_id=eq.${clients[0].id}&select=id&limit=1`);

      if (conns?.length) {
        const allFiles = await sbFetch(supabaseUrl, serviceRoleKey,
          `shopify_theme_files?connection_id=eq.${conns[0].id}&select=filename,content&order=filename&limit=100`);

        if (allFiles?.length) {
          const layoutFiles = allFiles.filter((f: any) => f.filename.startsWith("layout/"));
          const configFiles = allFiles.filter((f: any) => f.filename.startsWith("config/"));
          const cssFiles = allFiles.filter((f: any) => f.filename.endsWith(".css"));
          const sectionFiles = allFiles.filter((f: any) => f.filename.startsWith("sections/"));
          const snippetFiles = allFiles.filter((f: any) => f.filename.startsWith("snippets/"));

          const allCSS = cssFiles.map((f: any) => f.content).join("\n");
          cssVariables = extractCSSVariables(allCSS);
          schemaPatterns = extractSchemaPatterns(sectionFiles);
          classPatterns = extractClassPatterns([...sectionFiles, ...snippetFiles]);

          const contextParts: string[] = [];

          for (const f of layoutFiles) {
            contextParts.push(`--- ${f.filename} ---\n${f.content.slice(0, 5000)}`);
          }
          for (const f of configFiles) {
            contextParts.push(`--- ${f.filename} ---\n${f.content.slice(0, 4000)}`);
          }
          for (const f of cssFiles) {
            contextParts.push(`--- ${f.filename} ---\n${f.content.slice(0, 4000)}`);
          }

          const pageLower = project.page.toLowerCase();
          const relevantSections = sectionFiles
            .sort((a: any, b: any) => {
              const aRelevance = a.filename.toLowerCase().includes(pageLower) ? 1 : 0;
              const bRelevance = b.filename.toLowerCase().includes(pageLower) ? 1 : 0;
              return bRelevance - aRelevance;
            })
            .slice(0, 8);

          for (const f of relevantSections) {
            contextParts.push(`--- ${f.filename} ---\n${f.content.slice(0, 4000)}`);
          }

          const keySnippets = snippetFiles
            .filter((f: any) =>
              /icon|button|card|price|badge|image|media/i.test(f.filename))
            .slice(0, 5);
          for (const f of keySnippets) {
            contextParts.push(`--- ${f.filename} ---\n${f.content.slice(0, 2000)}`);
          }

          themeContext = contextParts.join("\n\n").slice(0, 30000);
        }
      }
    }

    // 4. Load Figma design context (ENHANCED — style DNA + frame exports)
    let figmaTextContext = "";
    let figmaImageUrls: string[] = [];

    const figmaFiles = await sbFetch(supabaseUrl, serviceRoleKey,
      `figma_files?client_name=eq.${encodeURIComponent(project.client)}&select=name,figma_url,design_type,tags,design_data&order=last_modified.desc&limit=10`);
    
    if (figmaFiles?.length) {
      const { textContext, imageUrls } = buildFigmaDesignContext(figmaFiles);
      figmaTextContext = textContext;
      figmaImageUrls = imageUrls;

      // Fallback text for files without design_data
      const noDataFiles = figmaFiles.filter((f: any) => !f.design_data || Object.keys(f.design_data).length === 0);
      if (noDataFiles.length > 0) {
        const fallbackLines = noDataFiles.map((f: any) =>
          `- ${f.name} (${f.design_type}) ${f.figma_url || ""} tags: ${(f.tags || []).join(", ")}`
        );
        figmaTextContext += `\n\nAdditional Figma files (metadata only):\n${fallbackLines.join("\n")}`;
      }
    }

    // 5. Load previous generated code if this is a refinement
    let previousCode = "";
    if (refinement_feedback && previous_section_id) {
      const prevSections = await sbFetch(supabaseUrl, serviceRoleKey,
        `generated_sections?id=eq.${previous_section_id}&select=liquid_code,css_code,js_code,section_name`);
      if (prevSections?.length) {
        const prev = prevSections[0];
        previousCode = `\n\nPREVIOUS GENERATED CODE (needs refinement):\n--- ${prev.section_name} ---\nLiquid:\n${prev.liquid_code}\n\nCSS:\n${prev.css_code}\n\nJS:\n${prev.js_code}\n\nFEEDBACK FROM REVIEWER:\n${refinement_feedback}`;
      }
    }

    // 6. Build the enhanced prompt
    const systemPrompt = `You are a senior Shopify Liquid developer at a top CRO agency. Your code is PRODUCTION-READY and deployed directly to live stores.

CRITICAL REQUIREMENTS:
1. MATCH THE EXISTING THEME EXACTLY — use the same CSS variables, class naming conventions, and design patterns shown below
2. Use Shopify section schema for ALL configurable content (text, images, colors, etc.)
3. Mobile-first responsive CSS using the theme's existing breakpoints
4. Include <style> and <script> tags inline within the section file
5. Use the theme's existing snippet patterns when available (e.g., {% render 'icon-...' %})
6. Follow the existing schema structure patterns shown below
7. Keep code clean, well-commented, and production-ready
8. Use semantic HTML and accessibility best practices
9. STUDY THE FIGMA DESIGNS PROVIDED — match the exact colors, typography, spacing, and layout patterns from previous designs for this client. Your output should be visually consistent with the design system established in Figma.

TARGET PAGE/SECTION: "${project.page}"

${cssVariables ? `THEME CSS VARIABLES (use these, don't create new ones):\n${cssVariables}\n` : ""}
${classPatterns ? `THEME CLASS NAMING CONVENTIONS:\n${classPatterns}\n` : ""}
${schemaPatterns ? `EXISTING SECTION SCHEMA PATTERNS (follow this structure):\n${schemaPatterns}\n` : ""}
${figmaTextContext ? `\nFIGMA DESIGN SYSTEM (study these carefully for visual consistency):\n${figmaTextContext}\n` : ""}

Respond with a JSON object (no markdown fences) with these exact keys:
{
  "section_name": "descriptive-section-name",
  "liquid_code": "full liquid/html code for the section including style and script tags",
  "css_code": "extracted CSS (same as in the style tag)",
  "js_code": "extracted JS if any (same as in the script tag)"
}`;

    const userPrompt = `Client: ${project.client}
Page/Section: ${project.page}
${recommendationContext}

EXISTING THEME FILES:
${themeContext}
${previousCode}

${refinement_feedback
  ? `This is a REFINEMENT request. Fix the issues described in the feedback while keeping the parts that work well. Focus specifically on the feedback.`
  : `Generate a complete, production-ready Shopify Liquid section implementing CRO improvements for this page. The code should be indistinguishable from what a senior Shopify developer would write — matching the theme's patterns perfectly AND reflecting the visual design language from the Figma designs.`
}`;

    // 7. Build multimodal messages (text + images from Figma frame exports)
    const userContent: any[] = [];
    
    // Add text
    userContent.push({ type: "text", text: userPrompt });
    
    // Add Figma frame images as visual references
    for (const imageUrl of figmaImageUrls) {
      userContent.push({
        type: "image_url",
        image_url: { url: imageUrl },
      });
    }

    // Use multimodal-capable model when we have images
    const model = figmaImageUrls.length > 0 ? "google/gemini-2.5-flash" : "google/gemini-3-flash-preview";

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: figmaImageUrls.length > 0 ? userContent : userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_shopify_code",
              description: "Return the generated Shopify section code",
              parameters: {
                type: "object",
                properties: {
                  section_name: { type: "string", description: "Kebab-case section name" },
                  liquid_code: { type: "string", description: "Complete Liquid/HTML section code with inline style/script tags" },
                  css_code: { type: "string", description: "Extracted CSS code" },
                  js_code: { type: "string", description: "Extracted JavaScript code" },
                },
                required: ["section_name", "liquid_code", "css_code", "js_code"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_shopify_code" } },
      }),
    });

    if (!aiRes.ok) {
      const status = aiRes.status;
      const errText = await aiRes.text();
      console.error("AI gateway error:", status, errText);
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error ${status}`);
    }

    const aiData = await aiRes.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    let generated: { section_name: string; liquid_code: string; css_code: string; js_code: string };

    if (toolCall?.function?.arguments) {
      generated = JSON.parse(toolCall.function.arguments);
    } else {
      const content = aiData.choices?.[0]?.message?.content || "";
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      generated = JSON.parse(cleaned);
    }

    // 8. Store generated code
    const isRefinement = !!refinement_feedback && !!previous_section_id;
    
    if (isRefinement) {
      await sbWrite(supabaseUrl, serviceRoleKey,
        `generated_sections?id=eq.${previous_section_id}`, "PATCH", {
          section_name: generated.section_name || project.page,
          liquid_code: generated.liquid_code || "",
          css_code: generated.css_code || "",
          js_code: generated.js_code || "",
          status: "refined",
        });
    } else {
      await sbWrite(supabaseUrl, serviceRoleKey, "generated_sections", "POST", {
        pipeline_project_id,
        section_name: generated.section_name || project.page,
        liquid_code: generated.liquid_code || "",
        css_code: generated.css_code || "",
        js_code: generated.js_code || "",
        status: "generated",
      });
    }

    // 9. Update pipeline project stages
    const stages = project.stages || [];
    const updatedStages = stages.map((s: { name: string; status: string }) => {
      if (s.name === "Code Gen") return { ...s, status: "done" };
      if (s.name === "QA") return { ...s, status: "active" };
      return s;
    });

    await sbWrite(supabaseUrl, serviceRoleKey,
      `pipeline_projects?id=eq.${pipeline_project_id}`, "PATCH", {
        stages: updatedStages,
        last_update: isRefinement ? "Code refined" : "Code generated",
      });

    return new Response(
      JSON.stringify({
        success: true,
        section_name: generated.section_name,
        refined: isRefinement,
        figma_images_used: figmaImageUrls.length,
        model_used: model,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-shopify-code error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
