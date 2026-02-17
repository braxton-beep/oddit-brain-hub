import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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
    const { query } = await req.json();
    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "Missing query" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build dynamic context from the database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const [
      { data: knowledgeSources },
      { data: projects },
      { data: credentials },
      { data: recentTranscripts },
      { count: totalTranscripts },
    ] = await Promise.all([
      sb.from("knowledge_sources").select("*").order("name"),
      sb.from("projects").select("*").order("created_at", { ascending: false }),
      sb.from("integration_credentials").select("integration_id").order("integration_id"),
      sb.from("fireflies_transcripts").select("title, date, summary, action_items, organizer_email, participants, duration").order("date", { ascending: false }).limit(20),
      sb.from("fireflies_transcripts").select("*", { count: "exact", head: true }),
    ]);

    // Build knowledge context
    const ksLines = (knowledgeSources ?? []).map(
      (ks: any) => `- ${ks.name}: ${ks.item_count.toLocaleString()} items (${ks.source_type}, status: ${ks.status})`
    );
    const knowledgeBlock = ksLines.length > 0
      ? `Knowledge sources indexed:\n${ksLines.join("\n")}`
      : "No knowledge sources have been indexed yet.";

    // Build projects context
    const projLines = (projects ?? []).map(
      (p: any) => `- ${p.name} (${p.progress}% complete, ${p.priority} priority, owner: ${p.owner})`
    );
    const projectBlock = projLines.length > 0
      ? `Active projects:\n${projLines.join("\n")}`
      : "No active projects.";

    // Connected integrations
    const connectedIntegrations = [...new Set((credentials ?? []).map((c: any) => c.integration_id))];
    const intBlock = connectedIntegrations.length > 0
      ? `Connected integrations: ${connectedIntegrations.join(", ")}`
      : "No integrations connected yet.";

    // Fireflies meeting data
    let meetingBlock = "";
    if (recentTranscripts && recentTranscripts.length > 0) {
      const meetingLines = recentTranscripts.map((t: any) => {
        const date = t.date ? new Date(t.date).toLocaleDateString() : "Unknown date";
        const dur = t.duration ? `${Math.round(t.duration / 60)}min` : "";
        const participants = t.participants?.join(", ") || "Unknown";
        const summary = t.summary ? t.summary.substring(0, 200) : "No summary";
        const actions = t.action_items ? `Action items: ${t.action_items.substring(0, 150)}` : "";
        return `- "${t.title}" (${date}, ${dur}, participants: ${participants})\n  Summary: ${summary}\n  ${actions}`.trim();
      });
      meetingBlock = `\nFireflies Meeting Data (${totalTranscripts ?? 0} total transcripts, showing ${recentTranscripts.length} most recent):\n${meetingLines.join("\n")}`;
    } else {
      meetingBlock = "\nNo Fireflies meeting transcripts have been synced yet.";
    }

    const systemPrompt = `You are the Oddit Audit Brain — an AI assistant embedded inside a CRO (Conversion Rate Optimization) agency's internal dashboard.

${knowledgeBlock}

${projectBlock}

${intBlock}
${meetingBlock}

Answer questions concisely and specifically using this context. Reference specific meetings, dates, and participants when relevant. If you don't have data on something, say so honestly rather than making up numbers. Keep answers to 2-3 sentences unless more detail is requested.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: query },
          ],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage limit reached. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      return new Response(
        JSON.stringify({ error: "AI gateway error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ask-brain error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
