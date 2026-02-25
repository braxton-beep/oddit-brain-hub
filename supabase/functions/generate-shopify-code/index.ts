import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { pipeline_project_id } = await req.json();
    if (!pipeline_project_id) {
      return new Response(JSON.stringify({ error: "pipeline_project_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const headers = {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    };

    // 1. Load pipeline project
    const projRes = await fetch(
      `${supabaseUrl}/rest/v1/pipeline_projects?id=eq.${pipeline_project_id}&select=*`,
      { headers }
    );
    const projects = await projRes.json();
    if (!projects?.length) {
      return new Response(JSON.stringify({ error: "Pipeline project not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const project = projects[0];

    // 2. Try to find CRO audit recommendations for this client
    let recommendationContext = "";
    const auditRes = await fetch(
      `${supabaseUrl}/rest/v1/cro_audits?client_name=eq.${encodeURIComponent(project.client)}&select=recommendations,shop_url&order=created_at.desc&limit=1`,
      { headers }
    );
    const audits = await auditRes.json();
    if (audits?.length && audits[0].recommendations) {
      const recs = audits[0].recommendations;
      recommendationContext = `\n\nCRO Audit Recommendations:\n${JSON.stringify(recs, null, 2).slice(0, 6000)}`;
    }

    // 3. Try to load Shopify theme files for context
    let themeContext = "";
    // Find a shopify connection for this client (by matching client name in clients table)
    const clientRes = await fetch(
      `${supabaseUrl}/rest/v1/clients?name=eq.${encodeURIComponent(project.client)}&select=id&limit=1`,
      { headers }
    );
    const clients = await clientRes.json();
    
    if (clients?.length) {
      const connRes = await fetch(
        `${supabaseUrl}/rest/v1/shopify_connections?client_id=eq.${clients[0].id}&select=id&limit=1`,
        { headers }
      );
      const conns = await connRes.json();
      
      if (conns?.length) {
        const filesRes = await fetch(
          `${supabaseUrl}/rest/v1/shopify_theme_files?connection_id=eq.${conns[0].id}&select=filename,content&limit=20`,
          { headers }
        );
        const files = await filesRes.json();
        if (files?.length) {
          // Include layout/theme.liquid and a few sections for context, truncated
          const themeFiles = files.map((f: { filename: string; content: string }) =>
            `--- ${f.filename} ---\n${f.content.slice(0, 3000)}`
          );
          themeContext = `\n\nExisting Shopify Theme Files:\n${themeFiles.join("\n\n").slice(0, 15000)}`;
        }
      }
    }

    // 4. Build prompt and call AI
    const systemPrompt = `You are a senior Shopify Liquid developer specializing in CRO (Conversion Rate Optimization) implementations.

Given the existing theme code and CRO recommendations, generate a production-ready Shopify section that implements the recommended changes.

Rules:
- Output valid Liquid/HTML/CSS/JS
- Match the existing theme's patterns, CSS variables, and design system
- Use Shopify section schema for settings when appropriate
- Include responsive CSS (mobile-first)
- Add structured CSS in a <style> tag within the section
- Add any JS in a <script> tag within the section
- Keep the code clean, commented, and production-ready
- Focus on the specific page/section: "${project.page}"

Respond with a JSON object (no markdown fences) with these exact keys:
{
  "section_name": "descriptive-section-name",
  "liquid_code": "full liquid/html code for the section",
  "css_code": "extracted CSS (also included in the liquid via style tag)",
  "js_code": "extracted JS (also included in the liquid via script tag)"
}`;

    const userPrompt = `Client: ${project.client}
Page/Section: ${project.page}
${recommendationContext}
${themeContext}

Generate a complete Shopify Liquid section implementing the CRO improvements for this page.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
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
                  liquid_code: { type: "string", description: "Complete Liquid/HTML section code" },
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
      // Fallback: try parsing content as JSON
      const content = aiData.choices?.[0]?.message?.content || "";
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      generated = JSON.parse(cleaned);
    }

    // 5. Store generated code
    await fetch(`${supabaseUrl}/rest/v1/generated_sections`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        pipeline_project_id,
        section_name: generated.section_name || project.page,
        liquid_code: generated.liquid_code || "",
        css_code: generated.css_code || "",
        js_code: generated.js_code || "",
        status: "generated",
      }),
    });

    // 6. Update pipeline project — mark Code Gen as done
    const stages = project.stages || [];
    const updatedStages = stages.map((s: { name: string; status: string }, i: number) => {
      if (s.name === "Code Gen") return { ...s, status: "done" };
      if (s.name === "QA" && stages.find((st: { name: string }) => st.name === "Code Gen")?.status !== "done") {
        return { ...s, status: "active" };
      }
      return s;
    });

    await fetch(`${supabaseUrl}/rest/v1/pipeline_projects?id=eq.${pipeline_project_id}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({ stages: updatedStages, last_update: "Code generated" }),
    });

    return new Response(
      JSON.stringify({ success: true, section_name: generated.section_name }),
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
