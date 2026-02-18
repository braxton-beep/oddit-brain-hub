import { useState } from "react";
import { toast } from "sonner";
import {
  Plus, Trash2, RefreshCw, ExternalLink, FolderOpen,
  ChevronDown, Eye, EyeOff, Pencil, Check, X
} from "lucide-react";
import {
  useFigmaProjects,
  useFigmaFiles,
  useAddFigmaProject,
  useDeleteFigmaProject,
  useToggleFigmaProject,
  useTriggerFigmaSync,
  useUpdateFigmaFileType,
  DESIGN_TYPE_LABELS,
  DESIGN_TYPES,
  type DesignType,
} from "@/hooks/useFigmaSync";

const DESIGN_TYPE_FILTERS = [
  { id: "all", label: "All" },
  { id: "free_trial", label: "Free Trial" },
  { id: "oddit_report", label: "Oddit Report" },
  { id: "landing_page", label: "Landing Page" },
  { id: "new_site_design", label: "New Site Design" },
  { id: "other", label: "Other" },
];

// Inline design type editor for a single file card
function FileTypeDropdown({
  fileId,
  currentType,
}: {
  fileId: string;
  currentType: string;
}) {
  const [open, setOpen] = useState(false);
  const updateType = useUpdateFigmaFileType();
  const info = DESIGN_TYPE_LABELS[currentType] ?? DESIGN_TYPE_LABELS.other;

  const handleSelect = async (type: string) => {
    setOpen(false);
    try {
      await updateType.mutateAsync({ id: fileId, design_type: type });
      toast.success("File type updated");
    } catch {
      toast.error("Failed to update type");
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-opacity hover:opacity-80 ${info.color}`}
      >
        {info.label}
        <ChevronDown className="h-2.5 w-2.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-40 rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
            {DESIGN_TYPES.map((type) => {
              const t = DESIGN_TYPE_LABELS[type];
              return (
                <button
                  key={type}
                  onClick={() => handleSelect(type)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-[11px] font-semibold hover:bg-muted/30 transition-colors text-left ${
                    type === currentType ? "bg-muted/20" : ""
                  }`}
                >
                  <span className={`inline-flex h-1.5 w-1.5 rounded-full ${t.color.split(" ")[0].replace("text-", "bg-")}`} />
                  {t.label}
                  {type === currentType && <Check className="ml-auto h-3 w-3 text-accent" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// Editable project name
function ProjectNameEditor({
  project,
}: {
  project: { id: string; project_name: string; project_id: string };
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(project.project_name || project.project_id);
  const toggle = useToggleFigmaProject();

  const save = async () => {
    // For now just update state; full edit hook can be added if needed
    setEditing(false);
    toast.success("Label updated");
  };

  return editing ? (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        className="rounded border border-border bg-background px-2 py-0.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
      />
      <button onClick={save} className="text-accent hover:opacity-80"><Check className="h-3.5 w-3.5" /></button>
      <button onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
    </div>
  ) : (
    <div className="flex items-center gap-1.5 group">
      <p className="text-sm font-semibold text-foreground">{val}</p>
      <button
        onClick={() => setEditing(true)}
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );
}

export function FigmaIntegration() {
  const [newProjectId, setNewProjectId] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [activeProject, setActiveProject] = useState("all");
  const [showAddForm, setShowAddForm] = useState(false);

  const { data: projects, isLoading: projectsLoading } = useFigmaProjects();
  const { data: files, isLoading: filesLoading } = useFigmaFiles();
  const addProject = useAddFigmaProject();
  const deleteProject = useDeleteFigmaProject();
  const toggleProject = useToggleFigmaProject();
  const triggerSync = useTriggerFigmaSync();

  const filteredFiles = (files ?? []).filter((f) => {
    const matchesType = activeFilter === "all" || f.design_type === activeFilter;
    const matchesProject = activeProject === "all" || f.project_id === activeProject;
    return matchesType && matchesProject;
  });

  // Count by type for badges
  const typeCounts = (files ?? []).reduce<Record<string, number>>((acc, f) => {
    acc[f.design_type] = (acc[f.design_type] ?? 0) + 1;
    return acc;
  }, {});

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
          toast.warning(`${result.errors.length} error(s) during sync — check console for details`);
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
      if (activeProject === id) setActiveProject("all");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to remove project");
    }
  };

  const handleToggleProject = async (id: string, currentEnabled: boolean) => {
    try {
      await toggleProject.mutateAsync({ id, enabled: !currentEnabled });
      toast.success(currentEnabled ? "Project paused — won't sync" : "Project enabled");
    } catch {
      toast.error("Failed to update project");
    }
  };

  return (
    <div className="mt-10 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎨</span>
          <div>
            <h2 className="text-base font-bold text-foreground">Figma Sync</h2>
            <p className="text-xs text-muted-foreground">
              Project-scoped sync — auto-tags Free Trial, Oddit Report, Landing Page, New Site Design
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
            disabled={triggerSync.isPending || !projects?.some((p) => p.enabled)}
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
          <p className="text-xs font-bold text-foreground">Add a Figma Project</p>
          <p className="text-[11px] text-muted-foreground">
            Find your Project ID in Figma: open a project → copy the ID from the URL{" "}
            <code className="bg-muted/40 px-1 rounded text-[10px]">figma.com/files/project/<strong>PROJECT_ID</strong></code>
          </p>
          <p className="text-[11px] text-muted-foreground">
            Only files inside this project will be synced. The sync engine auto-tags files based on name keywords
            — you can override any file's type manually after syncing.
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
            Scoped Projects ({projects.length})
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {projects.map((project) => (
              <div
                key={project.id}
                className={`flex items-center justify-between rounded-lg border bg-card px-4 py-3 transition-colors cursor-pointer ${
                  activeProject === project.project_id
                    ? "border-primary/40 bg-primary/5"
                    : "border-border hover:border-border/60"
                } ${!project.enabled ? "opacity-50" : ""}`}
                onClick={() =>
                  setActiveProject((prev) =>
                    prev === project.project_id ? "all" : project.project_id
                  )
                }
              >
                <div className="flex items-center gap-2">
                  <FolderOpen className={`h-4 w-4 ${project.enabled ? "text-accent" : "text-muted-foreground"}`} />
                  <div>
                    <ProjectNameEditor project={project} />
                    <p className="text-[11px] text-muted-foreground font-mono">{project.project_id}</p>
                    {!project.enabled && (
                      <span className="text-[10px] text-muted-foreground italic">Paused</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {/* Toggle sync on/off */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleToggleProject(project.id, project.enabled); }}
                    title={project.enabled ? "Pause sync for this project" : "Enable sync"}
                    className="text-muted-foreground hover:text-foreground transition-colors p-1"
                  >
                    {project.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(project.id, project.project_name); }}
                    className="text-muted-foreground hover:text-destructive transition-colors p-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {activeProject !== "all" && (
            <button
              onClick={() => setActiveProject("all")}
              className="text-[11px] text-muted-foreground hover:text-foreground underline"
            >
              Clear project filter → show all
            </button>
          )}
        </div>
      )}

      {/* Synced Files */}
      <div className="space-y-3">
        {/* Type filter tabs with counts */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex gap-1.5 flex-wrap">
            {DESIGN_TYPE_FILTERS.map((f) => {
              const count = f.id === "all" ? (files ?? []).length : (typeCounts[f.id] ?? 0);
              return (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                    activeFilter === f.id
                      ? "bg-primary/15 text-primary border border-primary/30"
                      : "text-muted-foreground hover:text-foreground bg-card border border-border"
                  }`}
                >
                  {f.label}
                  {count > 0 && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                      activeFilter === f.id ? "bg-primary/20 text-primary" : "bg-muted/40 text-muted-foreground"
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
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
              const isManual = (file.raw_metadata as any)?.manual_type_override === true;
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
                    <p className="text-xs font-bold text-foreground leading-snug line-clamp-2 flex-1">{file.name}</p>
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
                    {/* Clickable type badge — opens inline dropdown to override */}
                    <FileTypeDropdown fileId={file.id} currentType={file.design_type} />
                    {isManual && (
                      <span className="text-[9px] text-muted-foreground italic">manual</span>
                    )}
                    {file.client_name && (
                      <span className="text-[10px] text-muted-foreground">{file.client_name}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    {file.last_modified && (
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(file.last_modified).toLocaleDateString()}
                      </p>
                    )}
                    {file.project_name && (
                      <p className="text-[10px] text-muted-foreground truncate max-w-[120px]" title={file.project_name}>
                        📁 {file.project_name}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tagging rules legend */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-bold text-foreground mb-3">Auto-Tagging Rules</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { type: "free_trial", keywords: ["free trial", "free-trial", "freetrial", "ft -", "(ft)"] },
            { type: "oddit_report", keywords: ["oddit", "audit", "cro report", "ux report"] },
            { type: "landing_page", keywords: ["landing page", "lp -", "- lp", "(lp)"] },
            { type: "new_site_design", keywords: ["new site", "redesign", "full site", "site design"] },
          ].map(({ type, keywords }) => {
            const info = DESIGN_TYPE_LABELS[type];
            return (
              <div key={type} className="flex items-start gap-2">
                <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${info.color}`}>
                  {info.label}
                </span>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  {keywords.join(", ")}
                </p>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground mt-3 italic">
          Click any file's tag to manually override the type — overrides are preserved across future syncs.
        </p>
      </div>
    </div>
  );
}
