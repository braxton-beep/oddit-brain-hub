import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Search queries targeting CRO/UX leads
const SEARCH_QUERIES = [
  '"rate my site" OR "rate my store" OR "rate my landing page"',
  '"low conversion" OR "conversion rate help" OR "why no one buys"',
  '"shopify store feedback" OR "just launched my store" OR "new shopify store"',
  '"landing page review" OR "landing page feedback" OR "roast my site"',
  '"CRO agency" OR "conversion optimization" OR "UX audit"',
  '"bounce rate too high" OR "no sales" OR "store not converting"',
];

const CATEGORIES: Record<string, string[]> = {
  cro_pain: ["low conversion", "conversion rate", "not converting", "bounce rate", "no sales", "why no one buys"],
  store_launch: ["just launched", "new store", "launched my", "new shopify", "check out my store"],
  feedback_request: ["rate my", "roast my", "feedback", "review my", "what do you think"],
  competitor_mention: ["cro agency", "conversion optimization", "ux audit", "site audit"],
};

function classifyCategory(text: string): string {
  const lower = text.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORIES)) {
    if (keywords.some((kw) => lower.includes(kw))) return cat;
  }
  return "other";
}

function scoreRelevance(text: string, metrics: any): number {
  let score = 0;
  const lower = text.toLowerCase();
  // Keyword relevance
  const highValue = ["shopify", "ecommerce", "e-commerce", "landing page", "conversion", "cro", "ux", "store"];
  for (const kw of highValue) {
    if (lower.includes(kw)) score += 10;
  }
  // Engagement signals
  if (metrics) {
    if ((metrics.like_count ?? 0) > 5) score += 5;
    if ((metrics.reply_count ?? 0) > 2) score += 5;
    if ((metrics.impression_count ?? 0) > 1000) score += 10;
  }
  // Question = higher intent
  if (text.includes("?")) score += 5;
  // URL in post = they have a site
  if (lower.includes("http") || lower.includes(".com") || lower.includes(".co")) score += 10;
  return Math.min(score, 100);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TWITTER_BEARER_TOKEN = Deno.env.get("TWITTER_BEARER_TOKEN");
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    let allPosts: any[] = [];

    // ── Step 1: Scan X/Twitter ──
    if (TWITTER_BEARER_TOKEN) {
      console.log("Scanning X/Twitter...");
      for (const query of SEARCH_QUERIES) {
        try {
          const params = new URLSearchParams({
            query: `${query} -is:retweet lang:en`,
            max_results: "20",
            "tweet.fields": "created_at,public_metrics,author_id,text",
            expansions: "author_id",
            "user.fields": "username,name",
          });

          const res = await fetch(
            `https://api.x.com/2/tweets/search/recent?${params}`,
            { headers: { Authorization: `Bearer ${TWITTER_BEARER_TOKEN}` } }
          );

          if (!res.ok) {
            console.error(`X search failed for query: ${res.status}`);
            continue;
          }

          const data = await res.json();
          const users = new Map(
            (data.includes?.users ?? []).map((u: any) => [u.id, u])
          );

          for (const tweet of data.data ?? []) {
            const author = users.get(tweet.author_id);
            allPosts.push({
              platform: "x",
              post_id: tweet.id,
              post_url: `https://x.com/${author?.username ?? "i"}/status/${tweet.id}`,
              post_author: `@${author?.username ?? "unknown"}`,
              post_text: tweet.text,
              post_date: tweet.created_at,
              category: classifyCategory(tweet.text),
              relevance_score: scoreRelevance(tweet.text, tweet.public_metrics),
            });
          }

          // Rate limit safety
          await new Promise((r) => setTimeout(r, 1200));
        } catch (e) {
          console.error("X search query error:", e);
        }
      }
    } else {
      console.log("TWITTER_BEARER_TOKEN not set, skipping X scan");
    }

    // ── Step 2: Scan Threads + Reddit via Firecrawl ──
    if (FIRECRAWL_API_KEY) {
      // Threads queries - target actual posts, not profiles
      const threadsQueries = [
        "site:threads.net \"conversion rate\" OR \"not converting\" OR \"no sales\"",
        "site:threads.net \"rate my site\" OR \"rate my store\" OR \"roast my\"",
        "site:threads.net \"just launched\" shopify OR ecommerce OR \"my store\"",
        "site:threads.net \"landing page\" feedback OR review OR help",
        "site:threads.net \"bounce rate\" OR \"why no one buys\" OR \"low traffic\"",
      ];

      // Reddit queries - rich source of CRO/UX leads
      const redditQueries = [
        "site:reddit.com \"rate my shopify\" OR \"rate my store\" OR \"rate my site\"",
        "site:reddit.com \"low conversion rate\" OR \"store not converting\" OR \"no sales shopify\"",
        "site:reddit.com \"landing page feedback\" OR \"landing page review\" OR \"roast my landing page\"",
        "site:reddit.com \"just launched my store\" OR \"new shopify store\" OR \"launched my website\"",
        "site:reddit.com \"CRO help\" OR \"conversion optimization\" OR \"UX audit\" ecommerce",
        "site:reddit.com \"bounce rate too high\" OR \"why is no one buying\" OR \"shopify help\"",
      ];

      const firecrawlQueries = [
        ...threadsQueries.map((q) => ({ query: q, platform: "threads" as const })),
        ...redditQueries.map((q) => ({ query: q, platform: "reddit" as const })),
      ];

      for (const { query, platform } of firecrawlQueries) {
        try {
          console.log(`Scanning ${platform}: ${query.slice(0, 60)}...`);
          const res = await fetch("https://api.firecrawl.dev/v1/search", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              query,
              limit: 10,
              tbs: "qdr:w", // Last week for more results
            }),
          });

          if (!res.ok) {
            const errText = await res.text();
            console.error(`Firecrawl search failed (${platform}): ${res.status} ${errText}`);
            continue;
          }

          const data = await res.json();
          const expectedDomain = platform === "threads" ? "threads.net" : "reddit.com";

          for (const result of data.data ?? []) {
            if (!result.url?.includes(expectedDomain)) continue;
            // Skip profile pages and subreddit homepages
            if (platform === "threads" && !result.url.includes("/post/")) {
              // Still allow if there's substantial text in description
              if (!result.description || result.description.length < 50) continue;
            }
            if (platform === "reddit" && result.url.match(/reddit\.com\/r\/[^/]+\/?$/)) continue;

            const text = result.description || result.title || "";
            if (text.length < 20) continue; // Skip empty/tiny results

            const author = platform === "threads"
              ? `@${result.url.split("threads.net/@")[1]?.split("/")[0] ?? "unknown"}`
              : result.url.match(/reddit\.com\/r\/([^/]+)/)?.[1] ?? "unknown";

            allPosts.push({
              platform,
              post_id: result.url,
              post_url: result.url,
              post_author: author,
              post_text: text.slice(0, 1000),
              post_date: new Date().toISOString(),
              category: classifyCategory(text),
              relevance_score: scoreRelevance(text, null),
            });
          }
        } catch (e) {
          console.error(`${platform} scan error:`, e);
        }
      }
    } else {
      console.log("FIRECRAWL_API_KEY not set, skipping Threads/Reddit scan");
    }

    // ── Step 3: Dedupe against existing ──
    const existingIds = new Set<string>();
    const { data: existing } = await sb
      .from("lead_gen_opportunities")
      .select("post_id, platform")
      .in("post_id", allPosts.map((p) => p.post_id));

    for (const e of existing ?? []) {
      existingIds.add(`${e.platform}:${e.post_id}`);
    }

    const newPosts = allPosts.filter(
      (p) => !existingIds.has(`${p.platform}:${p.post_id}`)
    );

    // Sort by relevance, take top 20
    newPosts.sort((a, b) => b.relevance_score - a.relevance_score);
    const topPosts = newPosts.slice(0, 20);

    if (topPosts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No new opportunities found", scanned: allPosts.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Step 4: AI draft replies ──
    console.log(`Drafting replies for ${topPosts.length} opportunities...`);

    // Pull top Oddit tweets for voice training
    const { data: voiceTweets } = await sb
      .from("twitter_tweets")
      .select("text, like_count")
      .order("like_count", { ascending: false })
      .limit(20);

    const voiceSamples = (voiceTweets ?? [])
      .map((t) => `"${t.text.replace(/\n/g, " ")}" [${t.like_count} likes]`)
      .join("\n");

    for (const post of topPosts) {
      try {
        const aiRes = await fetch(
          "https://ai.gateway.lovable.dev/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                {
                  role: "system",
                  content: `You are the social media voice of Oddit (@itsOddit), a CRO agency that does deep UX audits for e-commerce brands.

Your job is to write a helpful, value-adding reply to a social media post that could turn into a lead. 

Voice training from top-performing tweets:
${voiceSamples}

Rules:
- Be genuinely helpful first — share a specific insight or tip related to their post
- Don't be salesy. Never say "DM me" or "check us out" — if the value is good enough, they'll look at the profile
- Sound like a knowledgeable friend, not a brand account
- Keep it under 240 characters for X, under 400 for Threads
- If they shared a URL, reference something specific about their site
- Match the energy of the original post (casual → casual, frustrated → empathetic)
- End with a question or actionable next step when natural
- Never use hashtags in replies`,
                },
                {
                  role: "user",
                  content: `Platform: ${post.platform}\nCategory: ${post.category}\nOriginal post by ${post.post_author}:\n"${post.post_text}"\n\nWrite a single reply. No quotes, no alternatives — just the reply text.`,
                },
              ],
              stream: false,
            }),
          }
        );

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          post.draft_reply = aiData.choices?.[0]?.message?.content?.trim() ?? "";
        }
      } catch (e) {
        console.error("AI draft error:", e);
        post.draft_reply = "";
      }
    }

    // ── Step 5: Save to DB ──
    const { error: insertError, data: inserted } = await sb
      .from("lead_gen_opportunities")
      .insert(topPosts.map((p) => ({
        platform: p.platform,
        post_id: p.post_id,
        post_url: p.post_url,
        post_author: p.post_author,
        post_text: p.post_text,
        post_date: p.post_date,
        category: p.category,
        relevance_score: p.relevance_score,
        draft_reply: p.draft_reply,
        status: "pending",
      })))
      .select();

    if (insertError) {
      console.error("Insert error:", insertError);
      throw new Error(`Failed to save opportunities: ${insertError.message}`);
    }

    // ── Step 6: Notify Slack ──
    if (SLACK_BOT_TOKEN && (inserted?.length ?? 0) > 0) {
      console.log("Sending Slack notification...");
      const topOps = (inserted ?? []).slice(0, 5);
      const blocks: any[] = [
        {
          type: "header",
          text: { type: "plain_text", text: `🎯 ${inserted?.length ?? 0} New Lead Opportunities Found`, emoji: true },
        },
        { type: "divider" },
      ];

      for (const op of topOps) {
        const platformEmoji = op.platform === "x" ? "𝕏" : op.platform === "reddit" ? "🤖" : "🧵";
        const categoryLabel = op.category.replace(/_/g, " ");
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${platformEmoji} *${op.post_author}* (${categoryLabel} · score: ${op.relevance_score})\n>${op.post_text.slice(0, 150)}...\n\n💬 *Draft reply:*\n${op.draft_reply.slice(0, 200)}`,
          },
          accessory: {
            type: "button",
            text: { type: "plain_text", text: "View Post" },
            url: op.post_url,
            action_id: `view_post_${op.id}`,
          },
        });
      }

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `👉 <${Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", "") || "https://oddit-brain-hub.lovable.app"}/lead-gen|Review all opportunities in dashboard>`,
        },
      });

      try {
        const slackRes = await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            channel: "#leads",
            text: `🎯 ${inserted?.length ?? 0} new lead opportunities found!`,
            blocks,
            username: "Oddit Lead Scout",
            icon_emoji: ":dart:",
          }),
        });

        const slackData = await slackRes.json();
        if (!slackData.ok) {
          console.error("Slack error:", slackData.error);
        }
      } catch (e) {
        console.error("Slack notification error:", e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        scanned: allPosts.length,
        new_opportunities: inserted?.length ?? 0,
        platforms: {
          x: allPosts.filter((p) => p.platform === "x").length,
          threads: allPosts.filter((p) => p.platform === "threads").length,
          reddit: allPosts.filter((p) => p.platform === "reddit").length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("scan-leads error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
