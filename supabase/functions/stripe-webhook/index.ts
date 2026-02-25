import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
};

// ── Verify Stripe webhook signature (HMAC-SHA256) ────────────────────────────
async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string
): Promise<boolean> {
  let timestamp = "";
  const signatures: string[] = [];

  for (const part of sigHeader.split(",")) {
    const eqIdx = part.indexOf("=");
    const key = part.slice(0, eqIdx);
    const val = part.slice(eqIdx + 1);
    if (key === "t") timestamp = val;
    if (key === "v1") signatures.push(val);
  }

  if (!timestamp || signatures.length === 0) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    console.warn("Stripe webhook timestamp too old:", timestamp);
    return false;
  }

  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(signedPayload));
  const hexSig = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return signatures.includes(hexSig);
}

// ── Detect tier from Stripe product/price name ───────────────────────────────
function detectTier(session: Record<string, unknown>): "pro" | "essential" {
  const meta = (session.metadata ?? {}) as Record<string, string>;
  if (meta.tier) {
    return meta.tier.toLowerCase().includes("essential") ? "essential" : "pro";
  }
  const name = ((session.display_items as Array<{ custom?: { name?: string } }>)?.[0]?.custom?.name ?? "").toLowerCase();
  return name.includes("essential") ? "essential" : "pro";
}

// ── Helper to call a sibling edge function ───────────────────────────────────
async function callFunction(name: string, body: Record<string, unknown>) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  console.log(`${name} result (${res.status}):`, JSON.stringify(data).slice(0, 500));
  return { ok: res.ok, data };
}

// ── Insert activity log via Supabase REST ────────────────────────────────────
async function logActivity(workflowName: string, status = "completed") {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  await fetch(`${supabaseUrl}/rest/v1/activity_log`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ workflow_name: workflowName, status }),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!STRIPE_WEBHOOK_SECRET) {
      console.error("STRIPE_WEBHOOK_SECRET not configured");
      return new Response(JSON.stringify({ error: "Webhook secret not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Validate signature ───────────────────────────────────────────────────
    const sigHeader = req.headers.get("stripe-signature");
    if (!sigHeader) {
      return new Response(JSON.stringify({ error: "Missing stripe-signature header" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = await req.text();
    const isValid = await verifyStripeSignature(payload, sigHeader, STRIPE_WEBHOOK_SECRET);
    if (!isValid) {
      console.error("Invalid Stripe signature");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const event = JSON.parse(payload) as { type: string; data: { object: Record<string, unknown> } };

    // ── Only handle completed checkouts ─────────────────────────────────────
    if (event.type !== "checkout.session.completed") {
      return new Response(JSON.stringify({ received: true, skipped: `event type: ${event.type}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const session = event.data.object;
    const metadata = (session.metadata ?? {}) as Record<string, string>;
    const customerDetails = session.customer_details as { name?: string; email?: string } | null;

    const clientName = metadata.client_name || customerDetails?.name || "Unknown Client";
    const clientEmail = metadata.client_email || customerDetails?.email || "";
    const shopUrl = metadata.shop_url || metadata.website_url || "";
    const focusUrl = metadata.focus_url || "";
    const tier = detectTier(session);

    console.log("Stripe checkout.session.completed →", {
      sessionId: session.id,
      clientName,
      clientEmail,
      shopUrl,
      focusUrl,
      tier,
    });

    if (!shopUrl) {
      console.warn("⚠️ No shop_url in metadata. Pipeline may skip screenshots.");
    }

    // ── Step 1: Trigger setup pipeline (Asana card, screenshots, etc.) ──────
    const setupResult = await callFunction("run-report-setup", {
      client_name: clientName,
      shop_url: shopUrl,
      focus_url: focusUrl,
      tier,
    });

    // ── Step 2: Generate CRO audit ──────────────────────────────────────────
    let auditId: string | null = null;
    if (shopUrl) {
      const auditResult = await callFunction("generate-cro-audit", {
        client_name: clientName,
        shop_url: shopUrl,
        focus_url: focusUrl || undefined,
        tier,
      });

      auditId = auditResult.data?.audit_id || auditResult.data?.id || null;
      console.log("Audit ID:", auditId);

      // ── Step 3: Generate mockups for each recommendation ────────────────
      if (auditId && auditResult.data?.recommendations) {
        const recs = auditResult.data.recommendations as Array<{ id?: number; title?: string }>;
        console.log(`Generating mockups for ${recs.length} recommendations…`);

        for (let i = 0; i < recs.length; i++) {
          try {
            await callFunction("generate-audit-mockup", {
              audit_id: auditId,
              recommendation_index: i,
              shop_url: shopUrl,
            });
          } catch (e) {
            console.error(`Mockup ${i} failed:`, e);
          }
        }
      }

      // ── Step 4: Generate Oddit Score ────────────────────────────────────
      await callFunction("generate-oddit-score", {
        client_name: clientName,
        shop_url: shopUrl,
        cro_audit_id: auditId || undefined,
      });
    }

    // ── Step 5: Log activity ────────────────────────────────────────────────
    await logActivity("auto_audit_complete");

    return new Response(
      JSON.stringify({
        received: true,
        client: clientName,
        client_email: clientEmail,
        tier,
        audit_id: auditId,
        pipeline: setupResult.data,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error("stripe-webhook error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
