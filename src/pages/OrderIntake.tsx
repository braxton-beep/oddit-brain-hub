import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ArrowRight, CheckCircle2, Globe, Target, User, Mail } from "lucide-react";
import odditLogo from "@/assets/oddit-eyes-icon.png";

const TIERS = [
  {
    id: "essential",
    name: "Essential",
    price: "$2,250",
    description: "In-depth CRO audit with actionable recommendations",
    features: ["Full homepage audit", "10+ recommendations", "Priority fixes", "PDF report"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$1,750",
    description: "Focused audit targeting your highest-impact page",
    features: ["Single page deep-dive", "8+ recommendations", "Quick wins", "PDF report"],
  },
];

export default function OrderIntake() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    client_name: "",
    client_email: "",
    shop_url: "",
    focus_url: "",
    tier: "" as "pro" | "essential" | "",
  });
  const [loading, setLoading] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const isValid =
    form.client_name.trim() &&
    form.shop_url.trim() &&
    form.tier;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || loading) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: {
          client_name: form.client_name.trim(),
          client_email: form.client_email.trim() || undefined,
          shop_url: form.shop_url.trim(),
          focus_url: form.focus_url.trim() || undefined,
          tier: form.tier,
        },
      });

      if (error || !data?.url) {
        throw new Error(data?.error || error?.message || "Failed to create checkout session");
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Ambient orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="orb orb-primary w-[600px] h-[600px] -top-40 -left-40" />
        <div className="orb orb-accent w-[400px] h-[400px] bottom-20 right-10" />
        <div className="orb orb-coral w-[300px] h-[300px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-center py-8 border-b border-border/40">
        <div className="flex items-center gap-3">
          <img src={odditLogo} alt="Oddit" className="w-8 h-8 object-contain" />
          <span className="font-bold text-lg text-foreground tracking-tight">Oddit</span>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-2xl">
          {/* Headline */}
          <div className="text-center mb-10">
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">
              Let's set up your{" "}
              <span className="text-gradient">CRO Audit</span>
            </h1>
            <p className="text-muted-foreground text-base">
              Fill in your details below and you'll be taken to checkout.
              <br />
              We'll handle the rest automatically.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Tier selection */}
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-3">
                Choose your report tier
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {TIERS.map((tier) => (
                  <button
                    key={tier.id}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, tier: tier.id as "pro" | "essential" }))}
                    className={`relative text-left p-4 rounded-xl border transition-all duration-200 ${
                      form.tier === tier.id
                        ? "border-primary/60 bg-primary/10 shadow-[0_0_20px_hsl(245_80%_80%/0.1)]"
                        : "border-border bg-card hover:border-primary/30 hover:bg-card/80"
                    }`}
                  >
                    {form.tier === tier.id && (
                      <CheckCircle2 className="absolute top-3 right-3 w-4 h-4 text-primary" />
                    )}
                    <div className="font-semibold text-foreground mb-0.5">{tier.name}</div>
                    <div className="text-xl font-bold text-primary mb-2">{tier.price}</div>
                    <p className="text-xs text-muted-foreground mb-3">{tier.description}</p>
                    <ul className="space-y-1">
                      {tier.features.map((f) => (
                        <li key={f} className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-accent flex-shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </button>
                ))}
              </div>
            </div>

            {/* Contact details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" /> Your name / brand name
                  </span>
                </label>
                <input
                  type="text"
                  value={form.client_name}
                  onChange={set("client_name")}
                  placeholder="Buckle Guy"
                  required
                  className="w-full px-3 py-2.5 rounded-lg bg-card border border-border text-foreground placeholder:text-muted-foreground/50 text-sm focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" /> Email address
                  </span>
                </label>
                <input
                  type="email"
                  value={form.client_email}
                  onChange={set("client_email")}
                  placeholder="you@brand.com"
                  className="w-full px-3 py-2.5 rounded-lg bg-card border border-border text-foreground placeholder:text-muted-foreground/50 text-sm focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition"
                />
              </div>
            </div>

            {/* URLs */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5" /> Store / website URL
                  </span>
                </label>
                <input
                  type="url"
                  value={form.shop_url}
                  onChange={set("shop_url")}
                  placeholder="https://yourstore.com"
                  required
                  className="w-full px-3 py-2.5 rounded-lg bg-card border border-border text-foreground placeholder:text-muted-foreground/50 text-sm focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5" /> Focus URL{" "}
                    <span className="text-muted-foreground font-normal">(optional — specific page to audit)</span>
                  </span>
                </label>
                <input
                  type="url"
                  value={form.focus_url}
                  onChange={set("focus_url")}
                  placeholder="https://yourstore.com/collections/belts"
                  className="w-full px-3 py-2.5 rounded-lg bg-card border border-border text-foreground placeholder:text-muted-foreground/50 text-sm focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition"
                />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={!isValid || loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-semibold text-sm bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-[0_0_24px_hsl(245_80%_80%/0.2)]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating your checkout…
                </>
              ) : (
                <>
                  Continue to payment
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <p className="text-center text-xs text-muted-foreground">
              Secured by Stripe · Once payment is confirmed, your setup begins automatically.
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}
