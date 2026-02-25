import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { toast } from "sonner";
import {
  Loader2,
  Store,
  CheckCircle2,
  FileCode,
  RefreshCw,
  Plus,
  Trash2,
} from "lucide-react";

/* ─── types (manual until codegen catches up) ──────────────────────────────── */
interface ShopifyConnection {
  id: string;
  client_id: string | null;
  shop_domain: string;
  access_token: string;
  scopes: string;
  theme_id: string | null;
  connected_at: string;
  status: string;
}

interface ThemeFile {
  id: string;
  connection_id: string;
  filename: string;
  content: string;
  updated_at: string;
}

/* ─── hooks ────────────────────────────────────────────────────────────────── */
function useConnections() {
  return useQuery({
    queryKey: ["shopify_connections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shopify_connections" as any)
        .select("*")
        .order("connected_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ShopifyConnection[];
    },
  });
}

function useThemeFiles(connectionId: string | null) {
  return useQuery({
    queryKey: ["shopify_theme_files", connectionId],
    enabled: !!connectionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shopify_theme_files" as any)
        .select("*")
        .eq("connection_id", connectionId!)
        .order("filename");
      if (error) throw error;
      return (data ?? []) as unknown as ThemeFile[];
    },
  });
}

/* ─── page ─────────────────────────────────────────────────────────────────── */
export default function ShopifyConnect() {
  const qc = useQueryClient();
  const { data: connections = [], isLoading } = useConnections();
  const [selected, setSelected] = useState<string | null>(null);
  const { data: files = [], isLoading: filesLoading } = useThemeFiles(selected);

  /* ── connect form state ──────────────────────────────────────────────────── */
  const [form, setForm] = useState({ shop_domain: "", access_token: "" });
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.shop_domain.trim() || !form.access_token.trim()) return;

    setConnecting(true);
    try {
      const domain = form.shop_domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");

      // Fetch active theme from Shopify
      const themeRes = await fetch(
        `https://${domain}/admin/api/2024-01/themes.json`,
        {
          headers: {
            "X-Shopify-Access-Token": form.access_token.trim(),
            "Content-Type": "application/json",
          },
        }
      );

      let themeId: string | null = null;
      if (themeRes.ok) {
        const { themes } = await themeRes.json();
        const active = themes?.find((t: any) => t.role === "main");
        themeId = active?.id ? String(active.id) : null;
      }

      const { error } = await supabase.from("shopify_connections" as any).insert({
        shop_domain: domain,
        access_token: form.access_token.trim(),
        scopes: "read_themes",
        theme_id: themeId,
        status: themeId ? "connected" : "connected_no_theme",
      } as any);

      if (error) throw error;

      toast.success(`Connected to ${domain}${themeId ? ` (theme ${themeId})` : ""}`);
      setForm({ shop_domain: "", access_token: "" });
      qc.invalidateQueries({ queryKey: ["shopify_connections"] });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to connect");
    } finally {
      setConnecting(false);
    }
  };

  /* ── pull theme files ────────────────────────────────────────────────────── */
  const pullMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const { data, error } = await supabase.functions.invoke("shopify-pull-theme", {
        body: { connection_id: connectionId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Pulled ${data?.pulled ?? 0} theme files`);
      qc.invalidateQueries({ queryKey: ["shopify_theme_files"] });
    },
    onError: (err: any) => toast.error(err.message || "Pull failed"),
  });

  /* ── delete connection ───────────────────────────────────────────────────── */
  const handleDelete = async (id: string) => {
    await supabase.from("shopify_connections" as any).delete().eq("id", id);
    if (selected === id) setSelected(null);
    qc.invalidateQueries({ queryKey: ["shopify_connections"] });
    toast.success("Connection removed");
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-4xl">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Store className="h-6 w-6 text-primary" />
            Shopify Connect
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect a Shopify store and pull theme files for CRO analysis.
          </p>
        </div>

        {/* Connect form */}
        <form
          onSubmit={handleConnect}
          className="rounded-xl border border-border bg-card p-5 space-y-4"
        >
          <h2 className="text-sm font-semibold text-foreground">Add Connection</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Shop domain
              </label>
              <input
                type="text"
                value={form.shop_domain}
                onChange={(e) => setForm((f) => ({ ...f, shop_domain: e.target.value }))}
                placeholder="my-store.myshopify.com"
                required
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/50 text-sm focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Admin API access token
              </label>
              <input
                type="password"
                value={form.access_token}
                onChange={(e) => setForm((f) => ({ ...f, access_token: e.target.value }))}
                placeholder="shpat_xxxx…"
                required
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/50 text-sm focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={connecting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 transition"
          >
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Connect Store
          </button>
        </form>

        {/* Connections list */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Connections</h2>

          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}

          {!isLoading && connections.length === 0 && (
            <p className="text-sm text-muted-foreground">No connections yet.</p>
          )}

          {connections.map((conn) => (
            <div
              key={conn.id}
              className={`rounded-xl border p-4 cursor-pointer transition-all ${
                selected === conn.id
                  ? "border-primary/60 bg-primary/5"
                  : "border-border bg-card hover:border-primary/30"
              }`}
              onClick={() => setSelected(conn.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="font-medium text-sm text-foreground">{conn.shop_domain}</span>
                  {conn.theme_id && (
                    <span className="text-xs text-muted-foreground">
                      Theme #{conn.theme_id}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      pullMutation.mutate(conn.id);
                    }}
                    disabled={pullMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/10 text-accent-foreground hover:bg-accent/20 transition disabled:opacity-40"
                  >
                    {pullMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Pull Theme Files
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(conn.id);
                    }}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Connected {new Date(conn.connected_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>

        {/* Theme files list */}
        {selected && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <FileCode className="h-4 w-4 text-primary" />
              Theme Files
            </h2>

            {filesLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            )}

            {!filesLoading && files.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No files yet. Click "Pull Theme Files" above.
              </p>
            )}

            {files.length > 0 && (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Filename</th>
                      <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground w-24">Size</th>
                      <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground w-36">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((f) => (
                      <tr key={f.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition">
                        <td className="px-4 py-2 font-mono text-xs text-foreground">{f.filename}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {(f.content.length / 1024).toFixed(1)} KB
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {new Date(f.updated_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
