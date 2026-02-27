import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SLACK_API = "https://slack.com/api";

// ── Helpers ─────────────────────────────────────────────────────────────────

async function postSlackMessage(token: string, channel: string, text: string, threadTs?: string) {
  const body: any = { channel, text };
  if (threadTs) body.thread_ts = threadTs;

  const resp = await fetch(`${SLACK_API}/chat.postMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await resp.json();
  if (!json.ok) console.error("Slack postMessage error:", json.error);
  return json;
}

// Verify Slack request signature
async function verifySlackSignature(body: string, timestamp: string, signature: string, signingSecret: string): Promise<boolean> {
  const basestring = `v0:${timestamp}:${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(basestring));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  return `v0=${hex}` === signature;
}

// Strip the bot mention from the message text
function stripMention(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/g, "").trim();
}

// ── Knowledge retrieval (mirrors ask-brain logic) ───────────────────────────

async function gatherContext(query: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, supabaseKey);

  const queryLower = query.toLowerCase();
  const isCallQuery = ["call", "meeting", "transcript", "said", "discussed", "mentioned", "conversation", "client"]
    .some(w => queryLower.includes(w));

  const stopWords = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
    "is", "was", "were", "are", "be", "been", "have", "has", "had", "do", "did", "does",
    "when", "what", "who", "how", "where", "why", "which", "that", "this", "these", "those",
    "last", "recent", "latest", "most", "call", "meeting", "transcript", "client", "about",
    "from", "our", "their", "there", "we", "they", "he", "she", "it", "i", "you", "my",
    "conversation", "discussed", "mentioned", "said", "talked", "spoke", "chat",
  ]);
  const queryKeywords = queryLower.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));

  let transcriptsToUse: any[] | null = null;

  if (queryKeywords.length > 0 && isCallQuery) {
    const orConditions = queryKeywords
      .flatMap(kw => [`title.ilike.%${kw}%`, `organizer_email.ilike.%${kw}%`, `summary.ilike.%${kw}%`, `transcript_text.ilike.%${kw}%`])
      .join(",");

    const { data } = await sb.from("fireflies_transcripts")
      .select("title, date, summary, action_items, organizer_email, participants, duration, transcript_text")
      .or(orConditions)
      .order("date", { ascending: false })
      .limit(30);

    if (data && data.length > 0) transcriptsToUse = data;
  }

  const [
    { data: knowledgeSources },
    { data: clients },
    { data: audits },
    { data: benchmarks },
    { data: fallbackTranscripts },
    { count: totalTranscripts },
    { data: compIntel },
    { data: pipelineProjects },
  ] = await Promise.all([
    sb.from("knowledge_sources").select("*").order("name"),
    sb.from("clients").select("name, industry, revenue_tier, project_status, contact_name, vertical, tags").order("name"),
    sb.from("cro_audits").select("client_name, shop_url, status, created_at").order("created_at", { ascending: false }).limit(10),
    sb.from("kpi_benchmarks").select("metric_name, industry, revenue_tier, p25, p50, p75, unit").limit(30),
    !transcriptsToUse
      ? sb.from("fireflies_transcripts")
          .select("title, date, summary, action_items, organizer_email, participants, duration, transcript_text")
          .order("date", { ascending: false })
          .limit(isCallQuery ? 15 : 5)
      : Promise.resolve({ data: [] }),
    sb.from("fireflies_transcripts").select("*", { count: "exact", head: true }),
    sb.from("competitive_intel").select("client_name, competitor_url, status, findings").order("created_at", { ascending: false }).limit(5),
    sb.from("pipeline_projects").select("client, page, stages, last_update").order("last_update", { ascending: false }).limit(10),
  ]);

  const transcripts = transcriptsToUse ?? fallbackTranscripts ?? [];

  // Build context blocks
  const blocks: string[] = [];

  // Clients
  if (clients && clients.length > 0) {
    blocks.push("CLIENTS:\n" + clients.map((c: any) =>
      `- ${c.name} | ${c.industry} | ${c.revenue_tier} | Status: ${c.project_status} | Contact: ${c.contact_name} | Tags: ${(c.tags || []).join(", ")}`
    ).join("\n"));
  }

  // Audits
  if (audits && audits.length > 0) {
    blocks.push("RECENT CRO AUDITS:\n" + audits.map((a: any) =>
      `- ${a.client_name}: ${a.shop_url} (${a.status}, ${new Date(a.created_at).toLocaleDateString()})`
    ).join("\n"));
  }

  // Benchmarks
  if (benchmarks && benchmarks.length > 0) {
    blocks.push("KPI BENCHMARKS:\n" + benchmarks.map((b: any) =>
      `- ${b.metric_name} (${b.industry}, ${b.revenue_tier}): p25=${b.p25}, p50=${b.p50}, p75=${b.p75} ${b.unit}`
    ).join("\n"));
  }

  // Competitive intel
  if (compIntel && compIntel.length > 0) {
    blocks.push("COMPETITIVE INTEL:\n" + compIntel.map((ci: any) =>
      `- ${ci.client_name} vs ${ci.competitor_url} (${ci.status})`
    ).join("\n"));
  }

  // Pipeline
  if (pipelineProjects && pipelineProjects.length > 0) {
    blocks.push("DEV PIPELINE:\n" + pipelineProjects.map((p: any) =>
      `- ${p.client} / ${p.page} — updated ${p.last_update}`
    ).join("\n"));
  }

  // Transcripts
  if (transcripts.length > 0) {
    const meetingLines = transcripts.map((t: any) => {
      const date = t.date ? new Date(t.date).toLocaleDateString() : "Unknown";
      const dur = t.duration ? `${Math.round(t.duration / 60)}min` : "";
      const participants = t.participants?.join(", ") || "Unknown";
      const summary = t.summary || "No summary";
      const actions = t.action_items ? `\nAction items: ${t.action_items}` : "";
      const transcript = t.transcript_text ? `\nFULL TRANSCRIPT:\n${t.transcript_text}` : "";
      return `--- MEETING: "${t.title}" (${date}, ${dur}) ---\nParticipants: ${participants}\nSummary: ${summary}${actions}${transcript}`;
    });
    const mode = transcriptsToUse ? "keyword-matched" : "most recent";
    blocks.push(`MEETING TRANSCRIPTS (${totalTranscripts ?? 0} total, showing ${transcripts.length} ${mode}):\n\n${meetingLines.join("\n\n")}`);
  }

  // Knowledge sources
  if (knowledgeSources && knowledgeSources.length > 0) {
    blocks.push("KNOWLEDGE SOURCES:\n" + knowledgeSources.map((ks: any) =>
      `- ${ks.name}: ${ks.item_count} items (${ks.source_type}, ${ks.status})`
    ).join("\n"));
  }

  return blocks.join("\n\n");
}

// ── Main handler ────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN");
  const SLACK_SIGNING_SECRET = Deno.env.get("SLACK_SIGNING_SECRET");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  if (!SLACK_BOT_TOKEN || !LOVABLE_API_KEY) {
    console.error("Missing SLACK_BOT_TOKEN or LOVABLE_API_KEY");
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const rawBody = await req.text();

    // Verify Slack signature if signing secret is set
    if (SLACK_SIGNING_SECRET) {
      const timestamp = req.headers.get("x-slack-request-timestamp") ?? "";
      const slackSig = req.headers.get("x-slack-signature") ?? "";

      // Reject requests older than 5 minutes
      if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
        return new Response("Request too old", { status: 403 });
      }

      const valid = await verifySlackSignature(rawBody, timestamp, slackSig, SLACK_SIGNING_SECRET);
      if (!valid) {
        console.error("Invalid Slack signature");
        return new Response("Invalid signature", { status: 403 });
      }
    }

    const body = JSON.parse(rawBody);

    // Slack URL verification challenge
    if (body.type === "url_verification") {
      return new Response(JSON.stringify({ challenge: body.challenge }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle events
    if (body.type === "event_callback") {
      const event = body.event;

      // Only respond to app_mention events; ignore bot messages to prevent loops
      if (event.type !== "app_mention" || event.bot_id) {
        return new Response("ok", { status: 200 });
      }

      const userQuestion = stripMention(event.text);
      if (!userQuestion) {
        await postSlackMessage(SLACK_BOT_TOKEN, event.channel, "Hey! Ask me anything about our clients, audits, transcripts, or CRO data 🧠", event.ts);
        return new Response("ok", { status: 200 });
      }

      // Acknowledge immediately (Slack requires < 3s response)
      // Process in background via waitUntil-style pattern
      const responsePromise = (async () => {
        try {
          // Post a thinking indicator
          await postSlackMessage(SLACK_BOT_TOKEN, event.channel, "🧠 Thinking...", event.ts);

          // Gather full knowledge context
          const context = await gatherContext(userQuestion);

          const systemPrompt = `You are the Oddit Brain — the AI-powered brain of Oddit, a CRO agency. You live in Slack and you're the team's smartest teammate. You can answer ANY question — simple or complex. This includes:
• Deep CRO strategy and conversion optimization advice
• Client data lookups, audit results, and Oddit Scores
• Meeting transcript search and summaries across 3,000+ calls
• Competitive intelligence and industry benchmarking
• Creative brainstorming (A/B test ideas, copy, UX concepts)
• Writing help (emails, reports, summaries, proposals)
• General business advice, industry trends, AI/tech updates
• Literally anything else the team asks — you're a thinking partner.

You have access to the agency's full knowledge base below. Use it to answer questions accurately.

${context}

RULES:
1. Be concise and conversational — this is Slack, not an essay. Use 2-4 sentences unless more detail is needed.
2. Use Slack markdown (*bold*, _italic_, \`code\`, bullet lists with •).
3. When referencing specific data, cite the source (client name, meeting title, date).
4. Each meeting is self-contained. Never mix participants or details across meetings.
5. If data isn't available, say so honestly. Never fabricate.
6. Be proactive — if you spot something relevant beyond what was asked, briefly mention it.
7. Be helpful but have personality. You're a teammate, not a corporate chatbot.`;

          const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userQuestion },
              ],
              stream: false,
            }),
          });

          if (!aiResp.ok) {
            const errText = await aiResp.text();
            console.error("AI gateway error:", aiResp.status, errText);
            await postSlackMessage(SLACK_BOT_TOKEN, event.channel, "⚠️ Sorry, I hit an error trying to process that. Please try again in a moment.", event.ts);
            return;
          }

          const aiData = await aiResp.json();
          const answer = aiData.choices?.[0]?.message?.content ?? "I couldn't generate a response. Please try rephrasing your question.";

          await postSlackMessage(SLACK_BOT_TOKEN, event.channel, answer, event.ts);

          // Log to activity_log
          const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
          await sb.from("activity_log").insert({
            workflow_name: `Slack Agent: answered "${userQuestion.slice(0, 60)}..."`,
            status: "completed",
          });
        } catch (err) {
          console.error("Background processing error:", err);
          await postSlackMessage(SLACK_BOT_TOKEN, event.channel, "⚠️ Something went wrong. Please try again.", event.ts);
        }
      })();

      // Don't await — respond to Slack immediately
      // Use EdgeRuntime.waitUntil if available, otherwise just fire and forget
      try {
        // @ts-ignore — Deno Deploy / Supabase edge runtime specific
        if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
          // @ts-ignore
          EdgeRuntime.waitUntil(responsePromise);
        }
      } catch {
        // Fire and forget if waitUntil isn't available
      }

      return new Response("ok", { status: 200 });
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("slack-events error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
