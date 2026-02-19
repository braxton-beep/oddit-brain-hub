import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ASANA_API = "https://app.asana.com/api/1.0";

async function asanaFetch(path: string, token: string, options: RequestInit = {}) {
  const res = await fetch(`${ASANA_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers ?? {}),
    },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Asana API ${res.status}: ${JSON.stringify(json.errors ?? json)}`);
  }
  return json.data ?? json;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Resolve Asana token: prefer env secret, fall back to DB integration_credentials
    let ASANA_TOKEN = Deno.env.get("ASANA_ACCESS_TOKEN");

    if (!ASANA_TOKEN) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, supabaseKey);

      const { data: cred } = await sb
        .from("integration_credentials")
        .select("api_key")
        .eq("integration_id", "asana")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      ASANA_TOKEN = cred?.api_key ?? null;
    }

    if (!ASANA_TOKEN) {
      return new Response(
        JSON.stringify({ error: "Asana token not configured. Add your Asana PAT in Settings." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    // ── Action: get_me ─────────────────────────────
    if (action === "get_me") {
      const me = await asanaFetch("/users/me", ASANA_TOKEN);
      return new Response(JSON.stringify({ success: true, user: me }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Action: list_workspaces ─────────────────────
    if (action === "list_workspaces") {
      const workspaces = await asanaFetch("/workspaces", ASANA_TOKEN);
      return new Response(JSON.stringify({ success: true, workspaces }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Action: list_projects ──────────────────────
    if (action === "list_projects") {
      const { workspace_gid } = body;
      if (!workspace_gid) {
        return new Response(JSON.stringify({ error: "workspace_gid required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const projects = await asanaFetch(
        `/projects?workspace=${workspace_gid}&limit=100&opt_fields=gid,name`,
        ASANA_TOKEN
      );
      return new Response(JSON.stringify({ success: true, projects }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Action: list_sections ──────────────────────
    if (action === "list_sections") {
      const { project_gid } = body;
      if (!project_gid) {
        return new Response(JSON.stringify({ error: "project_gid required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const sections = await asanaFetch(`/projects/${project_gid}/sections?opt_fields=gid,name`, ASANA_TOKEN);
      return new Response(JSON.stringify({ success: true, sections }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Action: create_task ────────────────────────
    if (action === "create_task") {
      const { project_gid, section_gid, name, notes, tags, custom_fields } = body;
      if (!project_gid || !name) {
        return new Response(JSON.stringify({ error: "project_gid and name required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const taskPayload: Record<string, unknown> = {
        name,
        notes: notes ?? "",
        projects: [project_gid],
      };
      if (custom_fields) taskPayload.custom_fields = custom_fields;

      const task = await asanaFetch("/tasks", ASANA_TOKEN, {
        method: "POST",
        body: JSON.stringify({ data: taskPayload }),
      });

      // Move to section if specified
      if (section_gid && task.gid) {
        await asanaFetch(`/sections/${section_gid}/addTask`, ASANA_TOKEN, {
          method: "POST",
          body: JSON.stringify({ data: { task: task.gid } }),
        });
      }

      // Add tags if specified
      if (tags && Array.isArray(tags)) {
        for (const tag_gid of tags) {
          await asanaFetch(`/tasks/${task.gid}/addTag`, ASANA_TOKEN, {
            method: "POST",
            body: JSON.stringify({ data: { tag: tag_gid } }),
          }).catch(() => null); // non-fatal
        }
      }

      return new Response(JSON.stringify({ success: true, task }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Action: update_task ────────────────────────
    if (action === "update_task") {
      const { task_gid, notes, custom_fields, name } = body;
      if (!task_gid) {
        return new Response(JSON.stringify({ error: "task_gid required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const updatePayload: Record<string, unknown> = {};
      if (notes !== undefined) updatePayload.notes = notes;
      if (name !== undefined) updatePayload.name = name;
      if (custom_fields !== undefined) updatePayload.custom_fields = custom_fields;

      const task = await asanaFetch(`/tasks/${task_gid}`, ASANA_TOKEN, {
        method: "PUT",
        body: JSON.stringify({ data: updatePayload }),
      });

      return new Response(JSON.stringify({ success: true, task }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Action: move_task_to_section ───────────────
    if (action === "move_task_to_section") {
      const { task_gid, section_gid } = body;
      if (!task_gid || !section_gid) {
        return new Response(JSON.stringify({ error: "task_gid and section_gid required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await asanaFetch(`/sections/${section_gid}/addTask`, ASANA_TOKEN, {
        method: "POST",
        body: JSON.stringify({ data: { task: task_gid } }),
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Action: add_attachment (link) ──────────────
    if (action === "add_attachment") {
      const { task_gid, url, name: attachName } = body;
      if (!task_gid || !url) {
        return new Response(JSON.stringify({ error: "task_gid and url required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Add as external link via task notes update (Asana attachments require multipart)
      // Instead we append the URL to the task notes
      const existing = await asanaFetch(`/tasks/${task_gid}?opt_fields=notes`, ASANA_TOKEN);
      const newNotes = `${existing.notes ?? ""}\n\n${attachName ?? "Link"}: ${url}`.trim();

      const task = await asanaFetch(`/tasks/${task_gid}`, ASANA_TOKEN, {
        method: "PUT",
        body: JSON.stringify({ data: { notes: newNotes } }),
      });

      return new Response(JSON.stringify({ success: true, task }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Action: get_task ──────────────────────────
    if (action === "get_task") {
      const { task_gid } = body;
      if (!task_gid) {
        return new Response(JSON.stringify({ error: "task_gid required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const task = await asanaFetch(`/tasks/${task_gid}?opt_fields=gid,name,memberships.project.gid,memberships.project.name,memberships.section.gid,memberships.section.name,custom_fields.gid,custom_fields.name,custom_fields.enum_value.gid,custom_fields.enum_value.name`, ASANA_TOKEN);
      return new Response(JSON.stringify({ success: true, task }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Action: list_custom_field_settings ─────────
    if (action === "list_custom_field_settings") {
      const { project_gid } = body;
      if (!project_gid) {
        return new Response(JSON.stringify({ error: "project_gid required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const settings = await asanaFetch(
        `/projects/${project_gid}/custom_field_settings?opt_fields=custom_field.name,custom_field.gid,custom_field.enum_options.gid,custom_field.enum_options.name,custom_field.enum_options.enabled`,
        ASANA_TOKEN
      );
      return new Response(JSON.stringify({ success: true, settings }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Action: list_tags ──────────────────────────
    if (action === "list_tags") {
      const { workspace_gid } = body;
      if (!workspace_gid) {
        return new Response(JSON.stringify({ error: "workspace_gid required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const tags = await asanaFetch(
        `/tags?workspace=${workspace_gid}&limit=100&opt_fields=gid,name,color`,
        ASANA_TOKEN
      );
      return new Response(JSON.stringify({ success: true, tags }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}. Valid actions: get_me, list_workspaces, list_projects, list_sections, create_task, update_task, move_task_to_section, add_attachment, get_task, list_tags` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error("asana-sync error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
