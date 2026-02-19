import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MODELS = ["google/gemini-2.5-flash", "google/gemini-2.5-flash-lite"];

async function callAI(apiKey: string, model: string) {
  const today = new Date().toISOString().split("T")[0];

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: `You are a CRO and ecommerce design intelligence assistant. Today is ${today}. 
Your job is to surface the most relevant and actionable AI, ecommerce, and UX/design news for a CRO agency that works with Shopify brands.
Focus on: AI tools for ecommerce, conversion rate optimization trends, Shopify platform updates, UX/design patterns, A/B testing insights, customer psychology, and digital marketing shifts.`,
        },
        {
          role: "user",
          content: `Give me the 5 most important AI, ecommerce, and UX design developments that a CRO agency working with Shopify brands should know about right now.`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "return_news",
            description: "Return 5 CRO/ecommerce news items",
            parameters: {
              type: "object",
              properties: {
                news: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      summary: { type: "string" },
                      category: { type: "string", enum: ["AI Tools", "Ecommerce", "UX & Design", "Shopify", "CRO"] },
                      impact: { type: "string", enum: ["High", "Medium", "Low"] },
                      emoji: { type: "string" },
                    },
                    required: ["title", "summary", "category", "impact", "emoji"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["news"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "return_news" } },
    }),
  });

  return response;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let lastError = "";

    for (const model of MODELS) {
      console.log(`Trying model: ${model}`);
      try {
        const response = await callAI(LOVABLE_API_KEY, model);

        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded, try again later." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (!response.ok) {
          const errBody = await response.text();
          console.error(`Model ${model} failed:`, response.status, errBody);
          lastError = `${model}: ${response.status}`;
          continue; // try next model
        }

        const data = await response.json();

        // Extract from tool call
        const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall?.function?.arguments) {
          try {
            const parsed = JSON.parse(toolCall.function.arguments);
            return new Response(JSON.stringify({ news: parsed.news || [], fetched_at: new Date().toISOString() }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          } catch (e) {
            console.error("Failed to parse tool call:", e);
          }
        }

        // Fallback: try content
        const content = data.choices?.[0]?.message?.content ?? "[]";
        const cleaned = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
        let news = [];
        try { news = JSON.parse(cleaned); } catch { news = []; }

        return new Response(JSON.stringify({ news, fetched_at: new Date().toISOString() }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        console.error(`Model ${model} threw:`, e);
        lastError = `${model}: ${e instanceof Error ? e.message : "unknown"}`;
        continue;
      }
    }

    throw new Error(`All models failed. Last: ${lastError}`);
  } catch (e) {
    console.error("ai-news error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
