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

    // Detect if the query is about a specific call/meeting to decide how much transcript to pull
    const queryLower = query.toLowerCase();
    const isCallQuery = queryLower.includes("call") || queryLower.includes("meeting") ||
      queryLower.includes("transcript") || queryLower.includes("fireflies") ||
      queryLower.includes("said") || queryLower.includes("discussed") ||
      queryLower.includes("mentioned") || queryLower.includes("conversation") ||
      queryLower.includes("client");

    // Extract potential client/company name keywords from the query for targeted search
    // Remove common stop words to find meaningful search terms
    const stopWords = new Set([
      "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
      "is", "was", "were", "are", "be", "been", "have", "has", "had", "do", "did", "does",
      "when", "what", "who", "how", "where", "why", "which", "that", "this", "these", "those",
      "last", "recent", "latest", "most", "call", "meeting", "transcript", "client", "about",
      "from", "our", "their", "there", "we", "they", "he", "she", "it", "i", "you", "my",
      "conversation", "discussed", "mentioned", "said", "talked", "spoke", "chat"
    ]);
    const queryKeywords = queryLower
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));

    // Build transcript query — if we have meaningful keywords, search by relevance first
    let transcriptQuery = sb.from("fireflies_transcripts")
      .select("title, date, summary, action_items, organizer_email, participants, duration, transcript_text");

    if (queryKeywords.length > 0 && isCallQuery) {
      // Search titles and participants for keywords to find relevant transcripts
      const keywordFilters = queryKeywords
        .map(kw => `title.ilike.%${kw}%,participants.cs.{${kw}}`)
        .join(",");
      
      // Use OR filter: match keyword in title OR participants OR organizer email
      const orConditions = queryKeywords
        .flatMap(kw => [
          `title.ilike.%${kw}%`,
          `organizer_email.ilike.%${kw}%`,
          `summary.ilike.%${kw}%`,
        ])
        .join(",");

      const { data: relevantTranscripts } = await transcriptQuery
        .or(orConditions)
        .order("date", { ascending: false })
        .limit(10);

      // If keyword search finds results, use those; otherwise fall back to recent
      var transcriptsToUse = relevantTranscripts && relevantTranscripts.length > 0
        ? relevantTranscripts
        : null;
    }

    const [
      { data: knowledgeSources },
      { data: projects },
      { data: credentials },
      { data: fallbackTranscripts },
      { count: totalTranscripts },
    ] = await Promise.all([
      sb.from("knowledge_sources").select("*").order("name"),
      sb.from("projects").select("*").order("created_at", { ascending: false }),
      sb.from("integration_credentials").select("integration_id").order("integration_id"),
      // Only fetch recent transcripts if we didn't already find relevant ones
      (!transcriptsToUse)
        ? sb.from("fireflies_transcripts")
            .select("title, date, summary, action_items, organizer_email, participants, duration, transcript_text")
            .order("date", { ascending: false })
            .limit(isCallQuery ? 10 : 5)
        : Promise.resolve({ data: [] }),
      sb.from("fireflies_transcripts").select("*", { count: "exact", head: true }),
    ]);

    const recentTranscripts = transcriptsToUse ?? fallbackTranscripts;

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

    // Fireflies meeting data — include full transcript text when available
    let meetingBlock = "";
    if (recentTranscripts && recentTranscripts.length > 0) {
      const meetingLines = recentTranscripts.map((t: any) => {
        const date = t.date ? new Date(t.date).toLocaleDateString() : "Unknown date";
        const dur = t.duration ? `${Math.round(t.duration / 60)}min` : "";
        const participants = t.participants?.join(", ") || "Unknown";
        const summary = t.summary || "No summary available";
        const actions = t.action_items ? `\n  Action items: ${t.action_items}` : "";
        // Include full transcript text if present — this is the primary knowledge source
        const fullTranscript = t.transcript_text
          ? `\n  FULL TRANSCRIPT:\n${t.transcript_text}`
          : "";
        return `--- MEETING: "${t.title}" (${date}, ${dur}) ---\nParticipants: ${participants}\nSummary: ${summary}${actions}${fullTranscript}`;
      });
      const searchMode = transcriptsToUse ? "keyword-matched" : "most recent";
      meetingBlock = `\nFireflies Meeting Data (${totalTranscripts ?? 0} total transcripts — showing ${recentTranscripts.length} ${searchMode}):\n\nIMPORTANT: Each meeting block below is SELF-CONTAINED. Participants, dates, and details from one meeting DO NOT apply to any other meeting.\n\n${meetingLines.join("\n\n")}`;
    } else {
      meetingBlock = "\nNo Fireflies meeting transcripts have been synced yet.";
    }

    const systemPrompt = `You are the Oddit Audit Brain — an AI assistant embedded inside a CRO (Conversion Rate Optimization) agency's internal dashboard.

${knowledgeBlock}

${projectBlock}

${intBlock}
${meetingBlock}

Answer questions concisely and specifically using this context.

CRITICAL DATA ACCURACY RULES — YOU MUST FOLLOW THESE:
1. Each meeting block in the data is SELF-CONTAINED. The participants listed in one meeting are ONLY associated with THAT meeting. Never mix participants, dates, or details across different meeting records.
2. When asked about a specific client or company (e.g. "Buckleguy"), ONLY reference meetings where that name appears in the meeting TITLE or the participants' email domains match. Completely ignore unrelated meetings even if they are more recent.
3. If the provided transcripts don't clearly match the client being asked about, say "I don't see a recent call with [client] in the available transcripts" — never fabricate or substitute data from unrelated meetings.
4. When citing participants, always state which specific meeting they appear in.

When asked about calls or meetings, reference the full transcript text to give precise, detailed answers — quote what was actually said when relevant. Keep answers to 2-3 sentences unless more detail is requested.`;

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
