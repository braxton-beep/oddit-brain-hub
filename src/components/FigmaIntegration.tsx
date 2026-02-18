import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, RefreshCw, ExternalLink, FolderOpen } from "lucide-react";
import {
  useFigmaProjects,
  useFigmaFiles,
  useAddFigmaProject,
  useDeleteFigmaProject,
  useTriggerFigmaSync,
  DESIGN_TYPE_LABELS,
} from "@/hooks/useFigmaSync";

const DESIGN_TYPE_FILTERS = [
  { id: "all", label: "All" },
  { id: "free_trial", label: "Free Trial" },
  { id: "oddit_report", label: "Oddit Report" },
  { id: "landing_page", label: "Landing Page" },
  { id: "new_site_design", label: "New Site Design" },
  { id: "other", label: "Other" },
];

export function FigmaIntegration() {
  const [newProjectId, setNewProjectId] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [showAddForm, setShowAddForm] = useState(false);

  const { data: projects, isLoading: projectsLoading } = useFigmaProjects();
  const { data: files, isLoading: filesLoading } = useFigmaFiles();
  const addProject = useAddFigmaProject();
  const deleteProject = useDeleteFigmaProject();
  const triggerSync = useTriggerFigmaSync();

  const filteredFiles = (files ?? []).filter(
    (f) => activeFilter === "all" || f.design_type === activeFilter
  );

  const handleAddProject = async () => {
    if (!newProjectId.trim()) {
      toast.error("Please enter a Figma project ID");
      return;
    }
    try {
      await addProject.mutateAsync({
        project_id: newProjectId.trim(),
        project_name: newProjectName.trim() || newProjectId.trim(),
      });
      toast.success("Project added — click Sync to fetch files");
      setNewProjectId("");
      setNewProjectName("");
      setShowAddForm(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to add project");
    }
  };

  const handleSync = async () => {
    try {
      const result = await triggerSync.mutateAsync();
      if (result?.synced !== undefined) {
        toast.success(`Synced ${result.synced} files from Figma`);
        if (result.errors?.length) {
          toast.warning(`${result.errors.length} error(s) during sync`);
        }
      }
    } catch (e: any) {
      toast.error(e.message ?? "Sync failed");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    try {
      await deleteProject.mutateAsync(id);
      toast.success(`Removed "${name}"`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to remove project");
    }
  };

  return (
    <div className="mt-10 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎨</span>
          <div>
            <h2 className="text-base font-bold text-cream">Figma Integration</h2>
            <p className="text-xs text-muted-foreground">
              Sync design files — auto-tagged as Free Trial, Oddit Report, Landing Page, or New Site
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold bg-card border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Project
          </button>
          <button
            onClick={handleSync}
            disabled={triggerSync.isPending || !projects?.length}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold bg-accent text-accent-foreground hover:opacity-90 disabled:opacity-50 transition-all"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${triggerSync.isPending ? "animate-spin" : ""}`} />
            {triggerSync.isPending ? "Syncing…" : "Sync Now"}
          </button>
        </div>
      </div>

      {/* Add Project Form */}
      {showAddForm && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-bold text-cream">Add a Figma Project</p>
          <p className="text-[11px] text-muted-foreground">
            Find your Project ID in Figma: open a project → copy the ID from the URL{" "}
            <code className="bg-muted/40 px-1 rounded text-[10px]">figma.com/files/project/<strong>PROJECT_ID</strong></code>
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Project ID (e.g. 123456789)"
              value={newProjectId}
              onChange={(e) => setNewProjectId(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <input
              type="text"
              placeholder="Label (optional)"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              className="w-40 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button
              onClick={handleAddProject}
              disabled={addProject.isPending}
              className="rounded-lg px-4 py-2 text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Connected Projects */}
      {!projectsLoading && projects && projects.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
            Connected Projects ({projects.length})
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {projects.map((project) => (
              <div
                key={project.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-accent" />
                  <div>
                    <p className="text-sm font-semibold text-cream">{project.project_name || project.project_id}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{project.project_id}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(project.id, project.project_name)}
                  className="text-muted-foreground hover:text-destructive transition-colors p-1"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Synced Files */}
      <div className="space-y-3">
        {/* Filter tabs */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5 flex-wrap">
            {DESIGN_TYPE_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setActiveFilter(f.id)}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  activeFilter === f.id
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "text-muted-foreground hover:text-foreground bg-card border border-border"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">{filteredFiles.length} files</p>
        </div>

        {/* Files Grid */}
        {filesLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-card border border-border animate-pulse" />
            ))}
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {(files ?? []).length === 0
                ? "No files synced yet. Add a project and click Sync Now."
                : "No files match this filter."}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredFiles.map((file) => {
              const typeInfo = DESIGN_TYPE_LABELS[file.design_type] ?? DESIGN_TYPE_LABELS.other;
              return (
                <div
                  key={file.id}
                  className="glow-card rounded-xl bg-card border border-border p-4 flex flex-col gap-2"
                >
                  {file.thumbnail_url && (
                    <img
                      src={file.thumbnail_url}
                      alt={file.name}
                      className="w-full h-24 object-cover rounded-lg bg-muted/20"
                    />
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-bold text-cream leading-snug line-clamp-2 flex-1">{file.name}</p>
                    {file.figma_url && (
                      <a
                        href={file.figma_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground shrink-0"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${typeInfo.color}`}>
                      {typeInfo.label}
                    </span>
                    {file.client_name && (
                      <span className="text-[10px] text-muted-foreground">{file.client_name}</span>
                    )}
                  </div>
                  {file.last_modified && (
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(file.last_modified).toLocaleDateString()}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
