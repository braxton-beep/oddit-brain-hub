import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Users,
  Plus,
  Search,
  ExternalLink,
  Pencil,
  Trash2,
  X,
  ChevronDown,
  Building2,
  Sparkles,
  Loader2,
} from "lucide-react";
import {
  useClients,
  useAddClient,
  useUpdateClient,
  useDeleteClient,
  INDUSTRIES,
  PROJECT_STATUSES,
  REVENUE_TIERS,
  STATUS_COLORS,
  type Client,
  type ClientInsert,
} from "@/hooks/useClients";
import { useClientHealthScores } from "@/hooks/useClientHealthScores";

const EMPTY_FORM: ClientInsert = {
  name: "",
  shopify_url: "",
  industry: "Other",
  vertical: "",
  revenue_tier: "",
  project_status: "Active",
  contact_name: "",
  contact_email: "",
  notes: "",
  tags: [],
};

function ClientForm({
  initial,
  onSave,
  onCancel,
  isSaving,
}: {
  initial: ClientInsert;
  onSave: (data: ClientInsert) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<ClientInsert>(initial);
  const [smartUrl, setSmartUrl] = useState(initial.shopify_url || "");
  const [isEnriching, setIsEnriching] = useState(false);
  const set = (k: keyof ClientInsert, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const handleSmartFill = async () => {
    if (!smartUrl.trim()) { toast.error("Enter a Shopify URL first"); return; }
    setIsEnriching(true);
    try {
      const { data, error } = await supabase.functions.invoke("enrich-client", {
        body: { url: smartUrl.trim() },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Enrichment failed");
      setForm((f) => ({ ...f, ...data.data }));
      toast.success(`Auto-filled from ${data.data.name || "the store"} ✨`, {
        description: "Review and edit before saving",
      });
    } catch (e: any) {
      toast.error("Smart fill failed", { description: e.message });
    } finally {
      setIsEnriching(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-5">
      {/* Smart fill banner */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-xs font-bold text-primary uppercase tracking-wider">Smart Fill from URL</span>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">
          Paste a Shopify store URL — the AI will auto-fill brand name, industry, vertical, revenue tier, and notes.
        </p>
        <div className="flex gap-2">
          <input
            value={smartUrl}
            onChange={(e) => setSmartUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSmartFill()}
            placeholder="https://brand.myshopify.com or https://brand.com"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            onClick={handleSmartFill}
            disabled={isEnriching}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all whitespace-nowrap"
          >
            {isEnriching ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing…</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5" /> Auto-Fill</>
            )}
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Name */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Brand Name *</label>
          <input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Beardbrand"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        {/* Shopify URL */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Shopify URL</label>
          <input
            value={form.shopify_url}
            onChange={(e) => set("shopify_url", e.target.value)}
            placeholder="https://store.myshopify.com"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        {/* Industry */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Industry / Vertical</label>
          <select
            value={form.industry}
            onChange={(e) => set("industry", e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>

        {/* Sub-vertical */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Sub-vertical (optional)</label>
          <input
            value={form.vertical}
            onChange={(e) => set("vertical", e.target.value)}
            placeholder="e.g. Men's grooming, Collagen peptides"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        {/* Revenue Tier */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Revenue Tier</label>
          <select
            value={form.revenue_tier}
            onChange={(e) => set("revenue_tier", e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">Unknown</option>
            {REVENUE_TIERS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {/* Project Status */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Project Status</label>
          <select
            value={form.project_status}
            onChange={(e) => set("project_status", e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Contact Name */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Contact Name</label>
          <input
            value={form.contact_name}
            onChange={(e) => set("contact_name", e.target.value)}
            placeholder="Jane Smith"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        {/* Contact Email */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Contact Email</label>
          <input
            type="email"
            value={form.contact_email}
            onChange={(e) => set("contact_email", e.target.value)}
            placeholder="jane@brand.com"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Notes</label>
        <textarea
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={3}
          placeholder="Any context about this client… (auto-filled from AI analysis)"
          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {/* AI Tags */}
      {form.tags && form.tags.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">AI-Generated Tags</label>
          <div className="flex flex-wrap gap-1.5">
            {form.tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">
                {tag}
                <button onClick={() => set("tags", form.tags?.filter((t) => t !== tag))} className="hover:text-destructive ml-0.5">
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 justify-end pt-1">
        <button onClick={onCancel} className="rounded-lg px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground border border-border bg-card transition-colors">
          Cancel
        </button>
        <button
          onClick={() => {
            if (!form.name.trim()) { toast.error("Brand name is required"); return; }
            onSave(form);
          }}
          disabled={isSaving}
          className="rounded-lg px-4 py-2 text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all"
        >
          {isSaving ? "Saving…" : "Save Client"}
        </button>
      </div>
    </div>
  );
}

const INDUSTRY_COLORS: Record<string, string> = {
  "Apparel & Fashion": "text-pink-400 bg-pink-400/10 border-pink-400/30",
  "Beauty & Skincare": "text-rose-400 bg-rose-400/10 border-rose-400/30",
  "Health & Wellness": "text-green-400 bg-green-400/10 border-green-400/30",
  "Food & Beverage": "text-orange-400 bg-orange-400/10 border-orange-400/30",
  "Home & Lifestyle": "text-amber-400 bg-amber-400/10 border-amber-400/30",
  "Sports & Outdoors": "text-blue-400 bg-blue-400/10 border-blue-400/30",
  "Electronics & Tech": "text-cyan-400 bg-cyan-400/10 border-cyan-400/30",
  "Pets": "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  "Baby & Kids": "text-violet-400 bg-violet-400/10 border-violet-400/30",
  "Jewelry & Accessories": "text-purple-400 bg-purple-400/10 border-purple-400/30",
  "Supplements & Nutrition": "text-lime-400 bg-lime-400/10 border-lime-400/30",
  "CBD & Wellness": "text-teal-400 bg-teal-400/10 border-teal-400/30",
  "Automotive": "text-slate-400 bg-slate-400/10 border-slate-400/30",
  "Other": "text-muted-foreground bg-muted/20 border-border",
};

const HEALTH_BADGE: Record<string, { label: string; class: string; tooltip: string }> = {
  green: { label: "Healthy", class: "text-green-400 bg-green-400/10 border-green-400/30", tooltip: "Good implementation rate, recent audit, low pipeline items" },
  yellow: { label: "At Risk", class: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30", tooltip: "Some concerns: aging audit, low implementation, or pipeline backlog" },
  red: { label: "Needs Attention", class: "text-red-400 bg-red-400/10 border-red-400/30", tooltip: "Stale audit, low implementation rate, or heavy pipeline backlog" },
};

export default function Clients() {
  const { data: clients = [], isLoading } = useClients();
  const { data: healthScores } = useClientHealthScores();
  const addClient = useAddClient();
  const updateClient = useUpdateClient();
  const deleteClient = useDeleteClient();

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterIndustry, setFilterIndustry] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterHealth, setFilterHealth] = useState("all");

  const getClientHealth = (name: string) => healthScores?.[name.toLowerCase().trim()]?.score ?? "yellow";

  const filtered = clients.filter((c) => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.shopify_url.toLowerCase().includes(search.toLowerCase());
    const matchIndustry = filterIndustry === "all" || c.industry === filterIndustry;
    const matchStatus = filterStatus === "all" || c.project_status === filterStatus;
    const matchHealth = filterHealth === "all" || getClientHealth(c.name) === filterHealth;
    return matchSearch && matchIndustry && matchStatus && matchHealth;
  });

  // Group by industry
  const grouped = filtered.reduce<Record<string, Client[]>>((acc, c) => {
    const key = c.industry || "Other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});

  const industryOptions = [...new Set(clients.map((c) => c.industry))].sort();

  const handleAdd = async (data: ClientInsert) => {
    try {
      await addClient.mutateAsync(data);
      toast.success(`${data.name} added to client database`);
      setShowAdd(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to add client");
    }
  };

  const handleUpdate = async (id: string, data: ClientInsert) => {
    try {
      await updateClient.mutateAsync({ id, ...data });
      toast.success("Client updated");
      setEditingId(null);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update client");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    try {
      await deleteClient.mutateAsync(id);
      toast.success(`${name} removed`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to delete client");
    }
  };

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mb-6 animate-fade-in">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary animate-glow-pulse">
            <Users className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gradient">Client Database</h1>
            <p className="text-[13px] text-muted-foreground">
              {clients.length} brand{clients.length !== 1 ? "s" : ""} across {industryOptions.length} industries
            </p>
          </div>
          <button
            onClick={() => { setShowAdd(true); setEditingId(null); }}
            className="ml-auto flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 transition-all"
          >
            <Plus className="h-4 w-4" /> Add Client
          </button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="mb-6 animate-scale-in">
          <ClientForm
            initial={EMPTY_FORM}
            onSave={handleAdd}
            onCancel={() => setShowAdd(false)}
            isSaving={addClient.isPending}
          />
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients…"
            className="w-full rounded-lg border border-border bg-card pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div className="relative">
          <select
            value={filterIndustry}
            onChange={(e) => setFilterIndustry(e.target.value)}
            className="rounded-lg border border-border bg-card pl-3 pr-8 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 appearance-none"
          >
            <option value="all">All Industries</option>
            {industryOptions.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>
        <div className="relative">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-border bg-card pl-3 pr-8 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 appearance-none"
          >
            <option value="all">All Statuses</option>
            {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>
        <div className="relative">
          <select
            value={filterHealth}
            onChange={(e) => setFilterHealth(e.target.value)}
            className="rounded-lg border border-border bg-card pl-3 pr-8 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 appearance-none"
          >
            <option value="all">All Health</option>
            <option value="green">🟢 Healthy</option>
            <option value="yellow">🟡 At Risk</option>
            <option value="red">🔴 Needs Attention</option>
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>
        {filtered.length !== clients.length && (
          <span className="text-[11px] text-muted-foreground">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => <div key={i} className="h-32 rounded-xl bg-card border border-border animate-pulse" />)}
        </div>
      ) : clients.length === 0 ? (
        <div className="glow-card glow-card-electric rounded-xl bg-card border border-border p-16 text-center animate-scale-in">
          <Building2 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-sm font-semibold text-cream mb-1">No clients yet</p>
          <p className="text-[12px] text-muted-foreground mb-5">Add your first brand to start building your client database</p>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Add First Client
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">No clients match your filters.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([industry, industryClients]) => (
            <div key={industry} className="animate-fade-in">
              {/* Industry heading */}
              <div className="flex items-center gap-2 mb-3">
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${INDUSTRY_COLORS[industry] ?? INDUSTRY_COLORS["Other"]}`}>
                  {industry}
                </span>
                <span className="text-[11px] text-muted-foreground">{industryClients.length} client{industryClients.length !== 1 ? "s" : ""}</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {industryClients.map((client) => (
                  <div key={client.id}>
                    {editingId === client.id ? (
                      <ClientForm
                        initial={{
                          name: client.name,
                          shopify_url: client.shopify_url,
                          industry: client.industry,
                          vertical: client.vertical,
                          revenue_tier: client.revenue_tier,
                          project_status: client.project_status,
                          contact_name: client.contact_name,
                          contact_email: client.contact_email,
                          notes: client.notes,
                          tags: client.tags,
                        }}
                        onSave={(data) => handleUpdate(client.id, data)}
                        onCancel={() => setEditingId(null)}
                        isSaving={updateClient.isPending}
                      />
                    ) : (
                      <div className="glow-card rounded-xl bg-card border border-border p-4 flex flex-col gap-3 h-full">
                        {/* Top row */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-cream leading-snug">{client.name}</p>
                              {(() => {
                                const health = getClientHealth(client.name);
                                const badge = HEALTH_BADGE[health];
                                return (
                                  <span
                                    title={badge.tooltip}
                                    className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${badge.class}`}
                                  >
                                    <span className={`h-1.5 w-1.5 rounded-full mr-1 ${health === "green" ? "bg-green-400" : health === "yellow" ? "bg-yellow-400" : "bg-red-400"}`} />
                                    {badge.label}
                                  </span>
                                );
                              })()}
                            </div>
                            {client.vertical && (
                              <p className="text-[11px] text-muted-foreground mt-0.5">{client.vertical}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {client.shopify_url && (
                              <a
                                href={client.shopify_url.startsWith("http") ? client.shopify_url : `https://${client.shopify_url}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground p-1 transition-colors"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                            <button
                              onClick={() => setEditingId(client.id)}
                              className="text-muted-foreground hover:text-foreground p-1 transition-colors"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(client.id, client.name)}
                              className="text-muted-foreground hover:text-destructive p-1 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Badges */}
                        <div className="flex flex-wrap gap-1.5">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_COLORS[client.project_status] ?? STATUS_COLORS["Active"]}`}>
                            {client.project_status}
                          </span>
                          {client.revenue_tier && (
                            <span className="inline-flex items-center rounded-full border border-border bg-muted/20 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                              {client.revenue_tier}
                            </span>
                          )}
                        </div>

                        {/* Contact */}
                        {(client.contact_name || client.contact_email) && (
                          <div className="text-[11px] text-muted-foreground border-t border-border pt-2 mt-auto">
                            {client.contact_name && <p className="font-medium text-foreground/70">{client.contact_name}</p>}
                            {client.contact_email && <p>{client.contact_email}</p>}
                          </div>
                        )}

                        {/* Notes */}
                        {client.notes && (
                          <p className="text-[11px] text-muted-foreground line-clamp-2 border-t border-border pt-2">{client.notes}</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
