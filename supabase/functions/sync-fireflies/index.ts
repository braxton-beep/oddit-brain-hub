import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIREFLIES_API = "https://api.fireflies.ai/graphql";

const TRANSCRIPTS_QUERY = `
  query Transcripts($limit: Int, $skip: Int) {
    transcripts(limit: $limit, skip: $skip) {
      id
      title
      date
      duration
      organizer_email
      participants
      summary {
        overview
        action_items
        shorthand_bullet
      }
      sentences {
        speaker_name
        text
      }
    }
  }
`;

interface FirefliesTranscript {
  id: string;
  title: string;
  date: number;
  duration: number;
  organizer_email: string;
  participants: string[];
  summary: {
    overview: string;
    action_items: string;
    shorthand_bullet: string;
  } | null;
  sentences: Array<{ speaker_name: string; text: string }> | null;
}

const PAGE_SIZE = 50;

async function fetchTranscriptPage(apiKey: string, skip: number): Promise<FirefliesTranscript[]> {
  const resp = await fetch(FIREFLIES_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query: TRANSCRIPTS_QUERY,
      variables: { limit: PAGE_SIZE, skip },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Fireflies API error [${resp.status}]: ${text}`);
  }

  const json = await resp.json();
  if (json.errors) {
    throw new Error(`Fireflies GraphQL error: ${JSON.stringify(json.errors)}`);
  }

  return json.data?.transcripts ?? [];
}

function buildTranscriptText(sentences: Array<{ speaker_name: string; text: string }> | null): string {
  if (!sentences || sentences.length === 0) return "";
  const blocks: string[] = [];
  let currentSpeaker = "";
  let currentText = "";
  for (const s of sentences) {
    if (s.speaker_name === currentSpeaker) {
      currentText += " " + s.text;
    } else {
      if (currentSpeaker) blocks.push(`${currentSpeaker}: ${currentText.trim()}`);
      currentSpeaker = s.speaker_name;
      currentText = s.text;
    }
  }
  if (currentSpeaker) blocks.push(`${currentSpeaker}: ${currentText.trim()}`);
  return blocks.join("\n");
}

function computeSpeakerStats(sentences: Array<{ speaker_name: string; text: string }> | null): any[] {
  if (!sentences || sentences.length === 0) return [];
  const stats: Record<string, { words: number; turns: number }> = {};
  for (const s of sentences) {
    if (!stats[s.speaker_name]) stats[s.speaker_name] = { words: 0, turns: 0 };
    stats[s.speaker_name].words += s.text.split(/\s+/).length;
    stats[s.speaker_name].turns += 1;
  }
  return Object.entries(stats).map(([name, data]) => ({ name, ...data }));
}

async function notifySlack(supabaseUrl: string, type: string, channel: string, payload: any) {
  try {
    const notifyUrl = `${supabaseUrl}/functions/v1/slack-notify`;
    await fetch(notifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, channel, payload }),
    });
  } catch (e) {
    console.warn("Slack notify failed (non-fatal):", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Fetch all Fireflies API keys from integration_credentials
    const { data: creds, error: credsErr } = await sb
      .from("integration_credentials")
      .select("id, api_key")
      .eq("integration_id", "fireflies");

    if (credsErr) throw new Error(`Failed to fetch credentials: ${credsErr.message}`);
    if (!creds || creds.length === 0) {
      return new Response(
        JSON.stringify({ error: "No Fireflies API keys configured. Add one in Settings." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalSynced = 0;
    let totalSkipped = 0;
    const errors: string[] = [];

    for (const cred of creds) {
      try {
        console.log(`Syncing with key ...${cred.api_key.slice(-4)}`);
        let skip = 0;
        let pageNum = 0;

        // Fetch-and-upsert one page at a time to avoid timeout
        while (true) {
          pageNum++;
          console.log(`Fetching page ${pageNum} (skip=${skip})`);
          const page = await fetchTranscriptPage(cred.api_key, skip);

          if (page.length === 0) {
            console.log(`No more transcripts at skip=${skip}, done.`);
            break;
          }

          console.log(`Fetched ${page.length} transcripts (page ${pageNum}), upserting...`);

          // Build rows for this page
          const rows = page.map((t) => ({
            fireflies_id: t.id,
            title: t.title || "Untitled Meeting",
            date: t.date ? new Date(t.date).toISOString() : null,
            duration: t.duration || 0,
            organizer_email: t.organizer_email || null,
            participants: t.participants || [],
            summary: t.summary?.overview || t.summary?.shorthand_bullet || "",
            action_items: t.summary?.action_items || "",
            transcript_text: buildTranscriptText(t.sentences),
            speaker_stats: computeSpeakerStats(t.sentences),
            source_api_key_id: cred.id,
          }));

          // Upsert this page immediately
          const { error: upsertErr } = await sb
            .from("fireflies_transcripts")
            .upsert(rows, { onConflict: "fireflies_id" });

          if (upsertErr) {
            console.error(`Upsert error on page ${pageNum}: ${upsertErr.message}`);
            totalSkipped += page.length;
          } else {
            totalSynced += page.length;
            console.log(`Upserted page ${pageNum} (${page.length} rows). Total synced: ${totalSynced}`);
          }

          if (page.length < PAGE_SIZE) {
            // Partial page = last page
            console.log(`Partial page (${page.length} < ${PAGE_SIZE}), finished.`);
            break;
          }

          skip += PAGE_SIZE;
        }

        console.log(`Finished syncing key ...${cred.api_key.slice(-4)}: ${totalSynced} synced, ${totalSkipped} skipped`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        console.error(`Error with key ...${cred.api_key.slice(-4)}: ${msg}`);
        errors.push(msg);
      }
    }

    // Get true count from DB using count query (no limit)
    const { count } = await sb
      .from("fireflies_transcripts")
      .select("*", { count: "exact", head: true });

    console.log(`True DB count after sync: ${count}`);

    // Update or insert the knowledge source entry for Fireflies
    const { data: existingKs } = await sb
      .from("knowledge_sources")
      .select("id")
      .eq("integration_id", "fireflies")
      .limit(1);

    if (existingKs && existingKs.length > 0) {
      await sb.from("knowledge_sources")
        .update({ item_count: count ?? 0, status: "synced" })
        .eq("id", existingKs[0].id);
    } else {
      await sb.from("knowledge_sources").insert({
        name: "Meeting Transcripts",
        icon: "Phone",
        source_type: "fireflies",
        integration_id: "fireflies",
        item_count: count ?? 0,
        status: "synced",
      });
    }

    // Fire Slack notification for transcript sync if we synced new ones
    if (totalSynced > 0) {
      const notifyChannel = Deno.env.get("SLACK_TRANSCRIPTS_CHANNEL") ?? "#transcripts";
      await notifySlack(supabaseUrl, "transcript_synced", notifyChannel, {
        title: `${totalSynced} transcript${totalSynced > 1 ? "s" : ""} synced`,
        date: new Date().toLocaleDateString(),
        participant_count: "—",
        duration_min: "—",
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        synced: totalSynced,
        skipped: totalSkipped,
        total_transcripts: count ?? 0,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("sync-fireflies error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
