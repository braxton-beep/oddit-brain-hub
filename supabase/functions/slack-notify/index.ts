import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SLACK_API = "https://slack.com/api/chat.postMessage";

async function sendSlackMessage(token: string, channel: string, text: string, blocks?: any[]) {
  const body: any = { channel, text };
  if (blocks) body.blocks = blocks;

  const resp = await fetch(SLACK_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const json = await resp.json();
  if (!json.ok) {
    throw new Error(`Slack API error: ${json.error}`);
  }
  return json;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN");

    if (!SLACK_BOT_TOKEN) {
      console.warn("SLACK_BOT_TOKEN not configured — notification skipped");
      return new Response(
        JSON.stringify({ skipped: true, reason: "SLACK_BOT_TOKEN not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { type, channel, payload } = body;

    if (!type || !channel) {
      return new Response(
        JSON.stringify({ error: "Missing type or channel" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let text = "";
    let blocks: any[] | undefined;

    if (type === "transcript_synced") {
      const { title, date, participant_count, duration_min } = payload ?? {};
      text = `🎙️ New transcript synced: *${title ?? "Untitled"}*`;
      blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🎙️ *New Meeting Transcript Synced*\n*${title ?? "Untitled"}*\n📅 ${date ?? "Unknown date"} · 👥 ${participant_count ?? "?"} participants · ⏱️ ${duration_min ?? "?"}min`,
          },
        },
        { type: "divider" },
      ];
    } else if (type === "churn_risk") {
      const { client_name, score, reason } = payload ?? {};
      text = `⚠️ Churn risk alert: *${client_name}* (score: ${score}/10)`;
      blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `⚠️ *High Churn Risk Detected*\n*Client:* ${client_name}\n*Risk Score:* ${score}/10\n*Reason:* ${reason ?? "See dashboard for details"}`,
          },
        },
        { type: "divider" },
      ];
    } else if (type === "report_ready") {
      const { client_name, report_id } = payload ?? {};
      text = `✅ Report draft ready: *${client_name}*`;
      blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `✅ *Report Draft Ready*\n*Client:* ${client_name}\nThe CRO audit report has been pre-drafted and is ready for review.`,
          },
        },
        { type: "divider" },
      ];
    } else if (type === "custom") {
      const { message } = payload ?? {};
      text = message ?? "Notification from Oddit Brain";
      blocks = [
        {
          type: "section",
          text: { type: "mrkdwn", text: `🤖 *Oddit Brain*\n${text}` },
        },
      ];
    } else {
      return new Response(
        JSON.stringify({ error: `Unknown notification type: ${type}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await sendSlackMessage(SLACK_BOT_TOKEN, channel, text, blocks);

    // Log to activity_log
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);
    await sb.from("activity_log").insert({
      workflow_name: `Slack notify: ${type} → ${channel}`,
      status: "completed",
    });

    return new Response(
      JSON.stringify({ success: true, ts: result.ts }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("slack-notify error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
