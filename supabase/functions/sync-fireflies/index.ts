import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIREFLIES_API = "https://api.fireflies.ai/graphql";

// Lightweight query — no sentences — for discovering all transcript IDs + metadata
const TRANSCRIPTS_LIGHT_QUERY = `
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
    }
  }
`;

// Full query with sentences — only used for transcripts not yet in DB
const TRANSCRIPTS_FULL_QUERY = `
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

interface FirefliesTranscriptLight {
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
}

interface FirefliesTranscriptFull extends FirefliesTranscriptLight {
  sentences: Array<{ speaker_name: string; text: string }> | null;
}

const PAGE_SIZE = 50;

async function fetchPage(apiKey: string, skip: number, full: boolean): Promise<any[]> {
  const resp = await fetch(FIREFLIES_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query: full ? TRANSCRIPTS_FULL_QUERY : TRANSCRIPTS_LIGHT_QUERY,
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

    // Load all existing fireflies_ids from DB so we can skip re-fetching sentences
    console.log("Loading existing transcript IDs from DB...");
    const { data: existingRows } = await sb
      .from("fireflies_transcripts")
      .select("fireflies_id");
    const existingIds = new Set((existingRows ?? []).map((r: any) => r.fireflies_id));
    console.log(`Found ${existingIds.size} existing transcripts in DB.`);

    let totalSynced = 0;
    let totalSkipped = 0;
    const errors: string[] = [];

    for (const cred of creds) {
      try {
        console.log(`Syncing with key ...${cred.api_key.slice(-4)}`);
        let skip = 0;
        let pageNum = 0;

        while (true) {
          pageNum++;
          console.log(`Fetching light page ${pageNum} (skip=${skip})`);

          // Always fetch light page first to get IDs
          const lightPage: FirefliesTranscriptLight[] = await fetchPage(cred.api_key, skip, false);

          if (lightPage.length === 0) {
            console.log(`No more transcripts at skip=${skip}, done.`);
            break;
          }

          // Split into new vs existing
          const newTranscripts = lightPage.filter(t => !existingIds.has(t.id));
          const existingTranscripts = lightPage.filter(t => existingIds.has(t.id));

          console.log(`Page ${pageNum}: ${newTranscripts.length} new, ${existingTranscripts.length} existing`);

          // For existing transcripts, upsert metadata only (no sentences fetch)
          if (existingTranscripts.length > 0) {
            const existingRows = existingTranscripts.map((t) => ({
              fireflies_id: t.id,
              title: t.title || "Untitled Meeting",
              date: t.date ? new Date(t.date).toISOString() : null,
              duration: t.duration || 0,
              organizer_email: t.organizer_email || null,
              participants: t.participants || [],
              summary: t.summary?.overview || t.summary?.shorthand_bullet || "",
              action_items: t.summary?.action_items || "",
              source_api_key_id: cred.id,
            }));

            const { error: upsertErr } = await sb
              .from("fireflies_transcripts")
              .upsert(existingRows, { onConflict: "fireflies_id" });

            if (upsertErr) {
              console.error(`Upsert error (existing) page ${pageNum}: ${upsertErr.message}`);
              totalSkipped += existingTranscripts.length;
            } else {
              totalSynced += existingTranscripts.length;
            }
          }

          // For new transcripts, fetch full data with sentences
          if (newTranscripts.length > 0) {
            // Fetch full page only if there are new transcripts on this page
            // We re-fetch the full page and filter to just new IDs
            const newIds = new Set(newTranscripts.map(t => t.id));
            console.log(`Fetching full data for ${newIds.size} new transcripts on page ${pageNum}...`);
            const fullPage: FirefliesTranscriptFull[] = await fetchPage(cred.api_key, skip, true);
            const newFullTranscripts = fullPage.filter(t => newIds.has(t.id));

            const newRows = newFullTranscripts.map((t) => ({
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

            const { error: upsertErr } = await sb
              .from("fireflies_transcripts")
              .upsert(newRows, { onConflict: "fireflies_id" });

            if (upsertErr) {
              console.error(`Upsert error (new) page ${pageNum}: ${upsertErr.message}`);
              totalSkipped += newRows.length;
            } else {
              totalSynced += newRows.length;
              // Add new IDs to our set so future pages know about them
              newRows.forEach(r => existingIds.add(r.fireflies_id));
              console.log(`Upserted ${newRows.length} new transcripts with full text. Total synced: ${totalSynced}`);
            }
          }

          if (lightPage.length < PAGE_SIZE) {
            console.log(`Partial page (${lightPage.length} < ${PAGE_SIZE}), finished.`);
            break;
          }

          skip += PAGE_SIZE;
        }

        console.log(`Finished key ...${cred.api_key.slice(-4)}: ${totalSynced} synced, ${totalSkipped} skipped`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        console.error(`Error with key ...${cred.api_key.slice(-4)}: ${msg}`);
        errors.push(msg);
      }
    }

    // Get true count from DB
    const { count } = await sb
      .from("fireflies_transcripts")
      .select("*", { count: "exact", head: true });

    console.log(`True DB count after sync: ${count}`);

    // Update knowledge_sources item_count to reflect reality
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

    // Fire Slack notification if new transcripts synced
    const newCount = totalSynced - (existingIds.size - (existingRows?.length ?? 0));
    if (newCount > 0) {
      const notifyChannel = Deno.env.get("SLACK_TRANSCRIPTS_CHANNEL") ?? "#transcripts";
      await notifySlack(supabaseUrl, "transcript_synced", notifyChannel, {
        title: `${newCount} new transcript${newCount > 1 ? "s" : ""} synced`,
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
