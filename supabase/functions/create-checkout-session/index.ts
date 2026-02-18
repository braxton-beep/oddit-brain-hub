import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TIER_PRICES: Record<string, { amount: number; label: string }> = {
  pro:       { amount: 175000, label: "Oddit Pro Report"       }, // $1,750
  essential: { amount: 225000, label: "Oddit Essential Report" }, // $2,250
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "Stripe not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { client_name, shop_url, focus_url, tier, success_url, cancel_url } = body;

    if (!client_name || !shop_url || !tier) {
      return new Response(
        JSON.stringify({ error: "client_name, shop_url, and tier are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tierConfig = TIER_PRICES[tier.toLowerCase()];
    if (!tierConfig) {
      return new Response(
        JSON.stringify({ error: "tier must be 'pro' or 'essential'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build Stripe Checkout session
    const params = new URLSearchParams();
    params.append("payment_method_types[]", "card");
    params.append("mode", "payment");
    params.append("line_items[0][price_data][currency]", "usd");
    params.append("line_items[0][price_data][unit_amount]", String(tierConfig.amount));
    params.append("line_items[0][price_data][product_data][name]", tierConfig.label);
    params.append("line_items[0][price_data][product_data][description]",
      `CRO audit for ${client_name} — ${tier.charAt(0).toUpperCase() + tier.slice(1)} tier`
    );
    params.append("line_items[0][quantity]", "1");

    // Metadata — read by the stripe-webhook to trigger setup pipeline
    params.append("metadata[client_name]", client_name);
    params.append("metadata[shop_url]", shop_url);
    params.append("metadata[focus_url]", focus_url ?? "");
    params.append("metadata[tier]", tier.toLowerCase());

    // Redirect URLs
    const origin = req.headers.get("origin") || "https://oddit-brain-hub.lovable.app";
    params.append("success_url", success_url || `${origin}/order-success?session_id={CHECKOUT_SESSION_ID}`);
    params.append("cancel_url", cancel_url || `${origin}/order`);

    // Pre-fill customer email if we have a contact email
    if (body.client_email) {
      params.append("customer_email", body.client_email);
    }

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!stripeRes.ok) {
      const err = await stripeRes.json();
      console.error("Stripe error:", err);
      return new Response(
        JSON.stringify({ error: err.error?.message ?? "Stripe session creation failed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const session = await stripeRes.json();

    return new Response(
      JSON.stringify({ url: session.url, session_id: session.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error("create-checkout-session error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
