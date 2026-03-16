import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// OAuth 1.0a signing for Twitter write API
function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function generateNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function createOAuthSignature(
  method: string,
  url: string,
  oauthParams: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string
): Promise<string> {
  const sortedParams = Object.entries(oauthParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${percentEncode(k)}=${percentEncode(v)}`)
    .join("&");

  const baseString = `${method}&${percentEncode(url)}&${percentEncode(sortedParams)}`;
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingKey),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(baseString));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { opportunity_id, reply_text, action } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Get the opportunity
    const { data: opp, error: oppError } = await sb
      .from("lead_gen_opportunities")
      .select("*")
      .eq("id", opportunity_id)
      .single();

    if (oppError || !opp) {
      return new Response(
        JSON.stringify({ error: "Opportunity not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle skip/reject
    if (action === "skip") {
      await sb
        .from("lead_gen_opportunities")
        .update({ status: "skipped" })
        .eq("id", opportunity_id);

      return new Response(
        JSON.stringify({ success: true, action: "skipped" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only X replies supported for now (Threads has no write API)
    if (opp.platform !== "x") {
      await sb
        .from("lead_gen_opportunities")
        .update({ status: "approved", draft_reply: reply_text || opp.draft_reply })
        .eq("id", opportunity_id);

      return new Response(
        JSON.stringify({ success: true, action: "approved_no_api", message: "Threads reply saved — post manually" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Post reply to X
    const CONSUMER_KEY = Deno.env.get("TWITTER_CONSUMER_KEY");
    const CONSUMER_SECRET = Deno.env.get("TWITTER_CONSUMER_SECRET");
    const ACCESS_TOKEN = Deno.env.get("TWITTER_ACCESS_TOKEN");
    const ACCESS_TOKEN_SECRET = Deno.env.get("TWITTER_ACCESS_TOKEN_SECRET");

    if (!CONSUMER_KEY || !CONSUMER_SECRET || !ACCESS_TOKEN || !ACCESS_TOKEN_SECRET) {
      // Save as approved but can't auto-post
      await sb
        .from("lead_gen_opportunities")
        .update({ status: "approved", draft_reply: reply_text || opp.draft_reply })
        .eq("id", opportunity_id);

      return new Response(
        JSON.stringify({ success: true, action: "approved_no_credentials", message: "Twitter API keys not configured — reply saved for manual posting" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const finalReply = reply_text || opp.draft_reply;
    const tweetUrl = "https://api.x.com/2/tweets";

    const oauthParams: Record<string, string> = {
      oauth_consumer_key: CONSUMER_KEY,
      oauth_nonce: generateNonce(),
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_token: ACCESS_TOKEN,
      oauth_version: "1.0",
    };

    const signature = await createOAuthSignature(
      "POST",
      tweetUrl,
      oauthParams,
      CONSUMER_SECRET,
      ACCESS_TOKEN_SECRET
    );

    oauthParams.oauth_signature = signature;

    const authHeader =
      "OAuth " +
      Object.entries(oauthParams)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`)
        .join(", ");

    const tweetRes = await fetch(tweetUrl, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: finalReply,
        reply: { in_reply_to_tweet_id: opp.post_id },
      }),
    });

    const tweetData = await tweetRes.json();

    if (!tweetRes.ok) {
      console.error("Tweet reply failed:", tweetRes.status, tweetData);
      await sb
        .from("lead_gen_opportunities")
        .update({ status: "failed" })
        .eq("id", opportunity_id);

      return new Response(
        JSON.stringify({ error: "Failed to post reply", detail: tweetData }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update status
    await sb
      .from("lead_gen_opportunities")
      .update({
        status: "replied",
        draft_reply: finalReply,
        replied_at: new Date().toISOString(),
      })
      .eq("id", opportunity_id);

    return new Response(
      JSON.stringify({ success: true, action: "replied", tweet_id: tweetData.data?.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("reply-lead error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
