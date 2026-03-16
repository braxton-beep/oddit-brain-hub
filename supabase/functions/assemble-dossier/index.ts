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
    const { client_name } = await req.json();
    if (!client_name) {
      return new Response(JSON.stringify({ error: "Missing client_name" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const namePattern = `%${client_name}%`;

    // Pull all client data in parallel
    const [
      { data: clients },
      { data: audits },
      { data: odditScores },
      { data: transcripts },
      { data: figmaFiles },
      { data: competitiveIntel },
      { data: pipelineProjects },
      { data: wireframeBriefs },
      { data: tweets },
      { data: recommendations },
      { data: implementations },
      { data: emailDrafts },
    ] = await Promise.all([
      sb.from("clients").select("*").ilike("name", namePattern),
      sb.from("cro_audits").select("*").ilike("client_name", namePattern).order("created_at", { ascending: false }),
      sb.from("oddit_scores").select("*").ilike("client_name", namePattern).order("created_at", { ascending: false }),
      sb.from("fireflies_transcripts")
        .select("id, title, date, summary, action_items, organizer_email, participants, duration")
        .or(`title.ilike.${namePattern},organizer_email.ilike.${namePattern},summary.ilike.${namePattern}`)
        .order("date", { ascending: false })
        .limit(50),
      sb.from("figma_files").select("id, name, design_type, client_name, figma_url, last_modified, thumbnail_url")
        .ilike("client_name", namePattern)
        .eq("enabled", true)
        .order("last_modified", { ascending: false }),
      sb.from("competitive_intel").select("*").ilike("client_name", namePattern).order("created_at", { ascending: false }),
      sb.from("pipeline_projects").select("*").ilike("client", namePattern).order("updated_at", { ascending: false }),
      sb.from("wireframe_briefs").select("id, client_name, site_url, status, sections, created_at")
        .ilike("client_name", namePattern)
        .order("created_at", { ascending: false }),
      sb.from("twitter_tweets").select("*")
        .ilike("text", namePattern)
        .order("created_at_twitter", { ascending: false })
        .limit(20),
      sb.from("recommendation_insights").select("*").order("frequency_count", { ascending: false }).limit(20),
      sb.from("client_implementations").select("*"),
      sb.from("email_drafts").select("*").ilike("client_name", namePattern).order("created_at", { ascending: false }),
    ]);

    // Match client record
    const client = clients?.[0] ?? null;

    // Filter recommendations to the client's industry if available
    const clientIndustry = client?.industry;
    const relevantRecommendations = clientIndustry
      ? (recommendations ?? []).filter((r: any) => {
          const examples = r.client_examples ?? [];
          return examples.some((ex: any) =>
            typeof ex === "string"
              ? ex.toLowerCase().includes(client_name.toLowerCase())
              : ex?.client_name?.toLowerCase().includes(client_name.toLowerCase())
          );
        })
      : [];

    // Filter implementations to this client's audits
    const auditIds = (audits ?? []).map((a: any) => a.id);
    const clientImplementations = (implementations ?? []).filter((impl: any) =>
      auditIds.includes(impl.audit_id)
    );

    const dossier = {
      client,
      audits: audits ?? [],
      odditScores: odditScores ?? [],
      transcripts: transcripts ?? [],
      figmaFiles: figmaFiles ?? [],
      competitiveIntel: competitiveIntel ?? [],
      pipelineProjects: pipelineProjects ?? [],
      wireframeBriefs: wireframeBriefs ?? [],
      tweets: tweets ?? [],
      relevantRecommendations,
      implementations: clientImplementations,
      emailDrafts: emailDrafts ?? [],
      meta: {
        client_name,
        assembled_at: new Date().toISOString(),
        counts: {
          audits: (audits ?? []).length,
          odditScores: (odditScores ?? []).length,
          transcripts: (transcripts ?? []).length,
          figmaFiles: (figmaFiles ?? []).length,
          competitiveIntel: (competitiveIntel ?? []).length,
          pipelineProjects: (pipelineProjects ?? []).length,
          wireframeBriefs: (wireframeBriefs ?? []).length,
          tweets: (tweets ?? []).length,
          implementations: clientImplementations.length,
          emailDrafts: (emailDrafts ?? []).length,
        },
      },
    };

    // Build narrative summary for prompt injection
    const lines: string[] = [];
    lines.push(`# Client Dossier: ${client?.name ?? client_name}`);

    if (client) {
      lines.push(`Industry: ${client.industry} | Revenue Tier: ${client.revenue_tier} | Status: ${client.project_status}`);
      lines.push(`Contact: ${client.contact_name} (${client.contact_email})`);
      if (client.shopify_url) lines.push(`Shopify: ${client.shopify_url}`);
      if (client.notes) lines.push(`Notes: ${client.notes}`);
    }

    if ((audits ?? []).length > 0) {
      lines.push(`\n## CRO Audits (${audits!.length})`);
      for (const a of audits!.slice(0, 3)) {
        const recCount = Array.isArray(a.recommendations) ? a.recommendations.length : 0;
        lines.push(`- ${a.shop_url} (${a.status}) — ${recCount} recommendations`);
      }
    }

    if ((odditScores ?? []).length > 0) {
      const latest = odditScores![0];
      lines.push(`\n## Latest Oddit Score: ${latest.total_score}/100`);
      lines.push(`  Clarity: ${latest.clarity_value_prop} | Visual: ${latest.visual_hierarchy} | Trust: ${latest.trust_signals} | Mobile: ${latest.mobile_ux} | Funnel: ${latest.funnel_logic} | Copy: ${latest.copy_strength} | Social Proof: ${latest.social_proof} | Speed: ${latest.speed_perception}`);
    }

    if ((transcripts ?? []).length > 0) {
      lines.push(`\n## Meeting History (${transcripts!.length} transcripts)`);
      for (const t of transcripts!.slice(0, 5)) {
        const date = t.date ? new Date(t.date).toLocaleDateString() : "?";
        lines.push(`- "${t.title}" (${date}) — ${t.summary?.slice(0, 150) ?? "no summary"}`);
      }
    }

    if ((figmaFiles ?? []).length > 0) {
      lines.push(`\n## Figma Files (${figmaFiles!.length})`);
      for (const f of figmaFiles!.slice(0, 5)) {
        lines.push(`- ${f.name} (${f.design_type}) ${f.figma_url ?? ""}`);
      }
    }

    if ((pipelineProjects ?? []).length > 0) {
      lines.push(`\n## Pipeline Projects (${pipelineProjects!.length})`);
      for (const p of pipelineProjects!) {
        const stages = Array.isArray(p.stages) ? p.stages : [];
        const stageStr = stages.map((s: any) => `${s.name}:${s.status}`).join(", ");
        lines.push(`- ${p.page} — ${stageStr}`);
      }
    }

    if ((competitiveIntel ?? []).length > 0) {
      lines.push(`\n## Competitive Intel (${competitiveIntel!.length})`);
      for (const ci of competitiveIntel!.slice(0, 3)) {
        lines.push(`- ${ci.competitor_url} (${ci.status})`);
      }
    }

    if (relevantRecommendations.length > 0) {
      lines.push(`\n## Recurring Recommendation Patterns`);
      for (const r of relevantRecommendations.slice(0, 5)) {
        lines.push(`- ${r.recommendation_text} (seen ${r.frequency_count}x, category: ${r.category})`);
      }
    }

    const narrativeSummary = lines.join("\n");

    return new Response(
      JSON.stringify({ dossier, narrativeSummary }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("assemble-dossier error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
