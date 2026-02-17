import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();

    // Fireflies webhook payload structure
    const transcriptData = body.transcript || body;
    const title = transcriptData.title || "Untitled Meeting";
    const summary = transcriptData.summary || transcriptData.summary_points?.join("\n") || "";
    const actionItems = transcriptData.action_items?.join("\n") || "";
    const participants = transcriptData.participants || [];
    const organizer = transcriptData.organizer_email || "";
    const firefliesId = transcriptData.id || transcriptData.fireflies_id || `webhook-${Date.now()}`;

    // Determine client name from title or participants
    const clientName = title.replace(/meeting|call|sync|with|and/gi, "").trim() || "Unknown Client";

    // Create report draft record
    const { data: draft, error: draftError } = await sb
      .from("report_drafts")
      .insert({
        client_name: clientName,
        fireflies_id: firefliesId,
        status: "in-progress",
        progress: 10,
        sections: {
          meeting_title: title,
          participants,
          organizer,
          summary_raw: summary,
          action_items_raw: actionItems,
        },
      })
      .select()
      .single();

    if (draftError) throw draftError;

    // Update progress to 30% — starting AI drafting
    await sb.from("report_drafts").update({ progress: 30 }).eq("id", draft.id);

    // Use AI to draft report sections
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are the Oddit Report Writer — an expert CRO strategist who drafts professional client follow-up reports based on meeting transcripts.

Draft a structured follow-up report with these sections. Return ONLY valid JSON (no markdown):
{
  "executive_summary": "2-3 sentence high-level summary of the call and key outcomes",
  "key_discussion_points": ["point 1", "point 2", "point 3"],
  "client_pain_points": ["pain point 1", "pain point 2"],
  "recommended_next_steps": ["step 1", "step 2", "step 3"],
  "cro_opportunities": ["opportunity 1", "opportunity 2"],
  "follow_up_email_subject": "Suggested email subject line",
  "follow_up_email_preview": "First 2 sentences of the follow-up email"
}`,
          },
          {
            role: "user",
            content: `Draft a report for: ${title}\n\nParticipants: ${participants.join(", ")}\nOrganizer: ${organizer}\n\nMeeting Summary:\n${summary}\n\nAction Items:\n${actionItems}`,
          },
        ],
        stream: false,
      }),
    });

    let sections: any = {};
    if (aiResp.ok) {
      const aiData = await aiResp.json();
      const rawContent = aiData.choices?.[0]?.message?.content || "{}";
      try {
        const cleaned = rawContent.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
        const aiSections = JSON.parse(cleaned);
        sections = {
          ...((draft.sections || {}) as object),
          ...aiSections,
        };
      } catch {
        sections = (draft.sections || {}) as object;
      }
    }

    // Update draft to complete
    await sb
      .from("report_drafts")
      .update({
        sections,
        status: "ready",
        progress: 100,
      })
      .eq("id", draft.id);

    return new Response(
      JSON.stringify({ success: true, draft_id: draft.id, client_name: clientName }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("fireflies-webhook error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
