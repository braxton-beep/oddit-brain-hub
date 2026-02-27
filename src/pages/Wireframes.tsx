import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles,
  Loader2,
  FileText,
  Globe,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Layout,
} from "lucide-react";

interface WireframeBrief {
  id: string;
  client_name: string;
  site_url: string | null;
  asana_notes: string | null;
  status: string;
  sections: any;
  brand_context: any;
  error: string | null;
  created_at: string;
}

const statusConfig: Record<string, { icon: typeof Clock; color: string; label: string }> = {
  pending: { icon: Clock, color: "text-muted-foreground", label: "Pending" },
  generating: { icon: Loader2, color: "text-primary", label: "Generating…" },
  complete: { icon: CheckCircle2, color: "text-accent", label: "Complete" },
  error: { icon: AlertCircle, color: "text-destructive", label: "Error" },
};

const Wireframes = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [clientName, setClientName] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [asanaNotes, setAsanaNotes] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: briefs, isLoading } = useQuery({
    queryKey: ["wireframe-briefs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wireframe_briefs")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as WireframeBrief[];
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("generate-wireframe", {
        body: { client_name: clientName, site_url: siteUrl || undefined, asana_notes: asanaNotes || undefined },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "Wireframe brief generated!", description: `Brief ID: ${data.brief_id}` });
      qc.invalidateQueries({ queryKey: ["wireframe-briefs"] });
      setClientName("");
      setSiteUrl("");
      setAsanaNotes("");
    },
    onError: (e) => {
      toast({ title: "Generation failed", description: e.message, variant: "destructive" });
    },
  });

  return (
    <DashboardLayout>
      <div className="mb-8 animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary animate-glow-pulse">
            <Layout className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-cream">AI Wireframes</h1>
            <p className="text-[13px] text-muted-foreground">Generate landing page content briefs from client notes + site scraping</p>
          </div>
        </div>

        {/* Generator Form */}
        <div className="glow-card rounded-2xl bg-card p-6 border border-primary/10 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-4 w-4 text-accent" />
            <span className="text-xs font-bold text-accent uppercase tracking-wider">New Wireframe Brief</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Client Name *</label>
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g. Buckle Guy"
                className="bg-background"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Website URL</label>
              <Input
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                placeholder="https://buckleguy.com"
                className="bg-background"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Asana Notes / Brief</label>
            <Textarea
              value={asanaNotes}
              onChange={(e) => setAsanaNotes(e.target.value)}
              placeholder="Paste the Asana card notes or project brief here…"
              className="bg-background min-h-[100px]"
            />
          </div>
          <Button
            onClick={() => generate.mutate()}
            disabled={!clientName.trim() || generate.isPending}
            className="mt-4"
          >
            {generate.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Wireframe Brief
              </>
            )}
          </Button>
        </div>

        {/* Briefs List */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-cream uppercase tracking-wider flex items-center gap-2">
            <FileText className="h-4 w-4 text-accent" />
            Generated Briefs
          </h2>

          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Loading briefs…</div>
          ) : !briefs?.length ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No wireframe briefs yet. Generate your first one above!
            </div>
          ) : (
            briefs.map((brief) => {
              const config = statusConfig[brief.status] || statusConfig.pending;
              const StatusIcon = config.icon;
              const isExpanded = expandedId === brief.id;
              const sections = brief.sections;
              const sectionList = Array.isArray(sections?.sections) ? sections.sections : Array.isArray(sections) ? sections : [];

              return (
                <div key={brief.id} className="glow-card rounded-xl bg-card border border-border overflow-hidden">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : brief.id)}
                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/5 transition-colors"
                  >
                    <StatusIcon className={`h-4 w-4 shrink-0 ${config.color} ${brief.status === "generating" ? "animate-spin" : ""}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-cream truncate">{brief.client_name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(brief.created_at).toLocaleDateString()} · {config.label}
                        {brief.site_url && (
                          <> · <Globe className="inline h-3 w-3" /> {brief.site_url}</>
                        )}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">{sectionList.length} sections</span>
                    {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border p-4 space-y-4">
                      {brief.error && (
                        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
                          {brief.error}
                        </div>
                      )}

                      {sections?.page_title && (
                        <div>
                          <p className="text-xs font-bold text-muted-foreground uppercase mb-1">Page Title</p>
                          <p className="text-sm text-cream">{sections.page_title}</p>
                        </div>
                      )}
                      {sections?.primary_goal && (
                        <div>
                          <p className="text-xs font-bold text-muted-foreground uppercase mb-1">Primary Goal</p>
                          <p className="text-sm text-cream">{sections.primary_goal}</p>
                        </div>
                      )}
                      {sections?.target_audience && (
                        <div>
                          <p className="text-xs font-bold text-muted-foreground uppercase mb-1">Target Audience</p>
                          <p className="text-sm text-cream">{sections.target_audience}</p>
                        </div>
                      )}

                      {sectionList.length > 0 && (
                        <div>
                          <p className="text-xs font-bold text-muted-foreground uppercase mb-2">Sections</p>
                          <div className="space-y-3">
                            {sectionList.map((s: any, i: number) => (
                              <div key={i} className="rounded-lg bg-background p-4 border border-border">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-[10px] font-bold text-primary uppercase bg-primary/10 px-2 py-0.5 rounded">
                                    {s.section_type}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">{s.layout_hint}</span>
                                </div>
                                <p className="text-sm font-bold text-cream mb-1">{s.headline}</p>
                                {s.subheadline && <p className="text-xs text-accent mb-2">{s.subheadline}</p>}
                                {s.body_copy && <p className="text-xs text-muted-foreground mb-2 leading-relaxed">{s.body_copy}</p>}
                                {s.cta_text && (
                                  <span className="inline-block text-[10px] font-bold bg-primary/20 text-primary px-3 py-1 rounded-full">
                                    {s.cta_text}
                                  </span>
                                )}
                                {s.design_notes && (
                                  <p className="text-[10px] text-muted-foreground/60 mt-2 italic">💡 {s.design_notes}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {sections?.brand_voice_notes && (
                        <div>
                          <p className="text-xs font-bold text-muted-foreground uppercase mb-1">Brand Voice</p>
                          <p className="text-xs text-muted-foreground">{sections.brand_voice_notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Wireframes;
