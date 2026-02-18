import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TWITTER_USERNAME = "itsOddit";

function classifyTweetType(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("case study") || lower.includes("results") || lower.includes("increased") || lower.includes("revenue") || lower.includes("conversion")) return "case_study";
  if (lower.includes("audit") || lower.includes("oddit") || lower.includes("cro") || lower.includes("review")) return "product_launch";
  if (lower.includes("tip") || lower.includes("insight") || lower.includes("lesson") || lower.includes("thread") || lower.includes("why most")) return "insight";
  if (lower.includes("testimonial") || lower.includes("client said") || lower.includes("⭐") || lower.includes("feedback")) return "social_proof";
  if (lower.includes("?") && text.length < 200) return "engagement";
  return "other";
}

function extractTopics(text: string): string[] {
  const lower = text.toLowerCase();
  const topics: string[] = [];
  if (lower.includes("shopify")) topics.push("shopify");
  if (lower.includes("landing page") || lower.includes("lp")) topics.push("landing_page");
  if (lower.includes("cro") || lower.includes("conversion")) topics.push("cro");
  if (lower.includes("design") || lower.includes("ui") || lower.includes("ux")) topics.push("design");
  if (lower.includes("ecommerce") || lower.includes("e-commerce") || lower.includes("store")) topics.push("ecommerce");
  if (lower.includes("copy") || lower.includes("headline") || lower.includes("text")) topics.push("copywriting");
  if (lower.includes("trust") || lower.includes("social proof") || lower.includes("review")) topics.push("trust");
  if (lower.includes("mobile")) topics.push("mobile");
  return topics;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TWITTER_BEARER_TOKEN = Deno.env.get("TWITTER_BEARER_TOKEN");
    if (!TWITTER_BEARER_TOKEN) {
      return new Response(
        JSON.stringify({ error: "TWITTER_BEARER_TOKEN not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Step 1: Get user ID for @itsOddit
    const userRes = await fetch(
      `https://api.twitter.com/2/users/by/username/${TWITTER_USERNAME}`,
      {
        headers: { Authorization: `Bearer ${TWITTER_BEARER_TOKEN}` },
      }
    );

    if (!userRes.ok) {
      const errText = await userRes.text();
      console.error("Twitter user lookup failed:", userRes.status, errText);
      return new Response(
        JSON.stringify({ error: `Twitter API error: ${userRes.status}`, detail: errText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userData = await userRes.json();
    const userId = userData.data?.id;
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Could not resolve Twitter user ID" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Fetch up to 3200 tweets (max allowed by API)
    // Twitter API v2 allows max 100 per page, paginate with next_token
    let allTweets: any[] = [];
    let paginationToken: string | null = null;
    let pagesFetched = 0;
    const MAX_PAGES = 32; // 32 * 100 = 3200 tweets max

    do {
      const params = new URLSearchParams({
        max_results: "100",
        "tweet.fields": "created_at,public_metrics,text",
        exclude: "retweets,replies",
      });
      if (paginationToken) params.set("pagination_token", paginationToken);

      const tweetsRes = await fetch(
        `https://api.twitter.com/2/users/${userId}/tweets?${params}`,
        {
          headers: { Authorization: `Bearer ${TWITTER_BEARER_TOKEN}` },
        }
      );

      if (!tweetsRes.ok) {
        const errText = await tweetsRes.text();
        console.error("Tweet fetch failed:", tweetsRes.status, errText);
        break;
      }

      const tweetsData = await tweetsRes.json();
      const tweets = tweetsData.data ?? [];
      allTweets = allTweets.concat(tweets);
      paginationToken = tweetsData.meta?.next_token ?? null;
      pagesFetched++;

      // Rate limit safety: stop if no more pages
      if (!paginationToken) break;

    } while (pagesFetched < MAX_PAGES);

    // Step 3: Upsert into DB, preserving manual tags
    let upserted = 0;
    let skipped = 0;

    for (const tweet of allTweets) {
      // Check if manually tagged — preserve those
      const { data: existing } = await sb
        .from("twitter_tweets")
        .select("tweet_type, manually_tagged")
        .eq("tweet_id", tweet.id)
        .maybeSingle();

      const tweetType = existing?.manually_tagged ? existing.tweet_type : classifyTweetType(tweet.text);
      const topics = extractTopics(tweet.text);

      const { error } = await sb
        .from("twitter_tweets")
        .upsert(
          {
            tweet_id: tweet.id,
            text: tweet.text,
            created_at_twitter: tweet.created_at,
            like_count: tweet.public_metrics?.like_count ?? 0,
            retweet_count: tweet.public_metrics?.retweet_count ?? 0,
            reply_count: tweet.public_metrics?.reply_count ?? 0,
            quote_count: tweet.public_metrics?.quote_count ?? 0,
            impression_count: tweet.public_metrics?.impression_count ?? 0,
            tweet_type: tweetType,
            topics,
            synced_at: new Date().toISOString(),
          },
          { onConflict: "tweet_id", ignoreDuplicates: false }
        );

      if (error) {
        console.error("Upsert error for tweet", tweet.id, error);
        skipped++;
      } else {
        upserted++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_fetched: allTweets.length,
        upserted,
        skipped,
        pages_fetched: pagesFetched,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("sync-tweets error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
