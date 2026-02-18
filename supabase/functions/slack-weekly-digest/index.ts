import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SLACK_API = "https://slack.com/api/chat.postMessage";

async function sendSlackMessage(token: string, channel: string, text: string, blocks: any[]) {
  const resp = await fetch(SLACK_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ channel, text, blocks }),
  });

  const json = await resp.json();
  if (!json.ok) throw new Error(`Slack API error: ${json.error}`);
  return json;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN");

    if (!SLACK_BOT_TOKEN) {
      console.warn("SLACK_BOT_TOKEN not configured — digest skipped");
      return new Response(
        JSON.stringify({ skipped: true, reason: "SLACK_BOT_TOKEN not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Read digest channel from request body (set by cron) or env
    const body = await req.json().catch(() => ({}));
    const channel = body.channel ?? Deno.env.get("SLACK_DIGEST_CHANNEL") ?? "#general";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

    // Pull data in parallel
    const [
      { data: recentTranscripts },
      { data: recentAudits },
      { data: recentReports },
      { data: topRecs },
      { count: transcriptCount },
    ] = await Promise.all([
      sb.from("fireflies_transcripts")
        .select("title, date, participants, organizer_email")
        .gte("created_at", sevenDaysAgo)
        .order("date", { ascending: false })
        .limit(5),
      sb.from("cro_audits")
        .select("client_name, status, created_at")
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(5),
      sb.from("report_drafts")
        .select("client_name, status, created_at")
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(3),
      sb.from("recommendation_insights")
        .select("recommendation_text, frequency_count, category")
        .order("frequency_count", { ascending: false })
        .limit(3),
      sb.from("fireflies_transcripts")
        .select("*", { count: "exact", head: true })
        .gte("created_at", sevenDaysAgo),
    ]);

    // Clients that may need attention (no transcript in 14+ days)
    const { data: allAudits } = await sb
      .from("cro_audits")
      .select("client_name, updated_at")
      .order("updated_at", { ascending: true })
      .limit(20);

    const staleClients = (allAudits ?? [])
      .filter((a: any) => new Date(a.updated_at) < new Date(twoWeeksAgo))
      .slice(0, 3)
      .map((a: any) => a.client_name);

    // Build blocks
    const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

    const blocks: any[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `📊 Oddit Weekly Digest — ${dateStr}`,
          emoji: true,
        },
      },
      { type: "divider" },
    ];

    // Meetings this week
    const transcriptLines = (recentTranscripts ?? []).map((t: any) => {
      const d = t.date ? new Date(t.date).toLocaleDateString() : "?";
      const pCount = t.participants?.length ?? 0;
      return `• *${t.title}* — ${d} (${pCount} participants)`;
    });

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: transcriptLines.length > 0
          ? `🎙️ *Meetings This Week (${transcriptCount ?? 0} new)*\n${transcriptLines.join("\n")}`
          : `🎙️ *Meetings This Week*\nNo new transcripts synced this week.`,
      },
    });

    // Clients needing attention
    if (staleClients.length > 0) {
      blocks.push({ type: "divider" });
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `⚠️ *Clients Needing Attention (14+ days inactive)*\n${staleClients.map((c: string) => `• ${c}`).join("\n")}`,
        },
      });
    }

    // Recent audits
    if ((recentAudits ?? []).length > 0) {
      blocks.push({ type: "divider" });
      const auditLines = (recentAudits ?? []).map((a: any) => `• *${a.client_name}* — ${a.status}`);
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `🔍 *Audits This Week*\n${auditLines.join("\n")}`,
        },
      });
    }

    // Top recommendation of the week
    if ((topRecs ?? []).length > 0) {
      const top = topRecs![0];
      blocks.push({ type: "divider" });
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `💡 *Top Recommendation This Week*\n_"${top.recommendation_text}"_\nUsed *${top.frequency_count}x* across audits · Category: ${top.category}`,
        },
      });
    }

    // Footer
    blocks.push({ type: "divider" });
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Sent by *Oddit Brain* · ${now.toISOString()}`,
        },
      ],
    });

    await sendSlackMessage(SLACK_BOT_TOKEN, channel, `📊 Oddit Weekly Digest — ${dateStr}`, blocks);

    // Log
    await sb.from("activity_log").insert({
      workflow_name: "Slack weekly digest sent",
      status: "completed",
    });

    return new Response(
      JSON.stringify({ success: true, channel }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("slack-weekly-digest error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
