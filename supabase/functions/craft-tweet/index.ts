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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const { topic, tweet_type, figma_file_id, custom_prompt } = await req.json();

    // Pull a sample of top-performing tweets as voice training data
    // Prioritize by likes + retweets, filtered by tweet_type if provided
    let tweetQuery = sb
      .from("twitter_tweets")
      .select("text, like_count, retweet_count, tweet_type, topics, created_at_twitter")
      .order("like_count", { ascending: false })
      .limit(50);

    if (tweet_type && tweet_type !== "all") {
      tweetQuery = tweetQuery.eq("tweet_type", tweet_type);
    }

    const { data: topTweets } = await tweetQuery;

    // Also pull recent tweets for recency context
    const { data: recentTweets } = await sb
      .from("twitter_tweets")
      .select("text, like_count, tweet_type")
      .order("created_at_twitter", { ascending: false })
      .limit(20);

    // Pull Figma context if a file is specified
    let figmaContext = "";
    if (figma_file_id) {
      const { data: figmaFile } = await sb
        .from("figma_files")
        .select("name, design_type, client_name, project_name")
        .eq("id", figma_file_id)
        .maybeSingle();

      if (figmaFile) {
        figmaContext = `\n\nFigma design context:
- File: "${figmaFile.name}"
- Type: ${figmaFile.design_type}
- Client: ${figmaFile.client_name ?? "not specified"}
- Project: ${figmaFile.project_name ?? "not specified"}
Use this design context to make the tweet relevant to what we're working on.`;
      }
    }

    // Build voice training block from top tweets
    const voiceSamples = (topTweets ?? [])
      .slice(0, 30)
      .map((t) => `"${t.text.replace(/\n/g, " ")}" [${t.like_count} likes]`)
      .join("\n");

    const recentSamples = (recentTweets ?? [])
      .slice(0, 10)
      .map((t) => `"${t.text.replace(/\n/g, " ")}"`)
      .join("\n");

    const totalTweets = (topTweets?.length ?? 0);

    const systemPrompt = `You are a Twitter/X copywriter for Oddit — a CRO (Conversion Rate Optimization) agency that does deep UX audits, Oddit Reports, and landing page teardowns for e-commerce brands.

Your job is to write tweets that sound EXACTLY like @itsOddit. Study the voice from these real tweets:

TOP PERFORMING TWEETS (by likes):
${voiceSamples}

RECENT TWEETS:
${recentSamples}

Voice & style rules from analyzing ${totalTweets} tweets:
- Direct, confident, no fluff — gets to the point immediately
- Uses specific numbers and concrete examples when possible
- Occasionally uses line breaks for emphasis
- Short punchy sentences mixed with slightly longer explanations
- Talks about CRO, UX design, e-commerce conversion, landing pages
- Sometimes uses rhetorical questions to open
- No hashtag spam — use 0-2 max if any
- Never sounds corporate or salesy
- The handle is @itsOddit
${figmaContext}`;

    const userPrompt = custom_prompt
      ? custom_prompt
      : `Write a tweet about: ${topic || "CRO insight or design tip relevant to e-commerce brands"}. 
Tweet type to aim for: ${tweet_type || "insight"}.
Write 3 different variations. Format each clearly numbered 1), 2), 3). Keep each under 280 characters.`;

    const response = await fetch(
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
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          stream: false,
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      return new Response(
        JSON.stringify({ error: "AI gateway error", detail: text }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content ?? "";

    // Save the draft
    const { data: draft } = await sb
      .from("tweet_drafts")
      .insert({
        draft_text: content,
        figma_file_id: figma_file_id ?? null,
        prompt_used: userPrompt,
        status: "draft",
      })
      .select()
      .single();

    return new Response(
      JSON.stringify({ success: true, content, draft_id: draft?.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("craft-tweet error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
