import { useState } from "react";
import { toast } from "sonner";
import {
  Plus, Trash2, RefreshCw, ExternalLink, FolderOpen,
  Eye, EyeOff, ChevronDown, Check, FileText,
} from "lucide-react";
import {
  useDriveFolders,
  useDriveFiles,
  useAddDriveFolder,
  useDeleteDriveFolder,
  useToggleDriveFolder,
  useUpdateDriveFileType,
  useTriggerDriveSync,
  DOC_TYPE_LABELS,
  DOC_TYPES,
  MIME_LABELS,
} from "@/hooks/useGoogleDriveSync";

const DOC_TYPE_FILTERS = [
  { id: "all", label: "All" },
  { id: "cro_audit", label: "CRO Audit" },
  { id: "free_trial", label: "Free Trial" },
  { id: "client_report", label: "Client Report" },
  { id: "template", label: "Template" },
  { id: "meeting_notes", label: "Meeting Notes" },
  { id: "strategy_doc", label: "Strategy Doc" },
  { id: "other", label: "Other" },
];

function DocTypeDropdown({ fileId, currentType }: { fileId: string; currentType: string }) {
  const [open, setOpen] = useState(false);
  const updateType = useUpdateDriveFileType();
  const info = DOC_TYPE_LABELS[currentType] ?? DOC_TYPE_LABELS.other;

  const handleSelect = async (type: string) => {
    setOpen(false);
    try {
      await updateType.mutateAsync({ id: fileId, doc_type: type });
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
          <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
            {DOC_TYPES.map((type) => {
              const t = DOC_TYPE_LABELS[type];
              return (
                <button
                  key={type}
                  onClick={() => handleSelect(type)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-[11px] font-semibold hover:bg-muted/30 transition-colors text-left ${
                    type === currentType ? "bg-muted/20" : ""
                  }`}
                >
                  <span>{t.icon}</span>
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

export function GoogleDriveIntegration() {
  const [newFolderId, setNewFolderId] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [activeFolder, setActiveFolder] = useState("all");
  const [showAddForm, setShowAddForm] = useState(false);

  const { data: folders, isLoading: foldersLoading } = useDriveFolders();
  const { data: files, isLoading: filesLoading } = useDriveFiles();
  const addFolder = useAddDriveFolder();
  const deleteFolder = useDeleteDriveFolder();
  const toggleFolder = useToggleDriveFolder();
  const triggerSync = useTriggerDriveSync();

  const filteredFiles = (files ?? []).filter((f) => {
    const matchesType = activeFilter === "all" || f.doc_type === activeFilter;
    const matchesFolder = activeFolder === "all" || f.folder_id === activeFolder;
    return matchesType && matchesFolder;
  });

  const typeCounts = (files ?? []).reduce<Record<string, number>>((acc, f) => {
    acc[f.doc_type] = (acc[f.doc_type] ?? 0) + 1;
    return acc;
  }, {});

  const handleAddFolder = async () => {
    if (!newFolderId.trim()) {
      toast.error("Please enter a Google Drive folder ID");
      return;
    }
    try {
      await addFolder.mutateAsync({
        folder_id: newFolderId.trim(),
        folder_name: newFolderName.trim() || newFolderId.trim(),
      });
      toast.success("Folder added — click Sync to fetch files");
      setNewFolderId("");
      setNewFolderName("");
      setShowAddForm(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to add folder");
    }
  };

  const handleSync = async () => {
    try {
      const result = await triggerSync.mutateAsync();
      if (result?.synced !== undefined) {
        toast.success(`Synced ${result.synced} files from Google Drive`);
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
      await deleteFolder.mutateAsync(id);
      toast.success(`Removed "${name}"`);
      if (activeFolder === id) setActiveFolder("all");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to remove folder");
    }
  };

  const handleToggle = async (id: string, current: boolean) => {
    try {
      await toggleFolder.mutateAsync({ id, enabled: !current });
      toast.success(current ? "Folder paused" : "Folder enabled");
    } catch {
      toast.error("Failed to update folder");
    }
  };

  return (
    <div className="mt-10 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📁</span>
          <div>
            <h2 className="text-base font-bold text-foreground">Google Drive Sync</h2>
            <p className="text-xs text-muted-foreground">
              Folder-scoped sync — auto-tags CRO Audits, Free Trials, Reports, Templates, Meeting Notes
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold bg-card border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Folder
          </button>
          <button
            onClick={handleSync}
            disabled={triggerSync.isPending || !folders?.some((f) => f.enabled)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold bg-accent text-accent-foreground hover:opacity-90 disabled:opacity-50 transition-all"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${triggerSync.isPending ? "animate-spin" : ""}`} />
            {triggerSync.isPending ? "Syncing…" : "Sync Now"}
          </button>
        </div>
      </div>

      {/* Add Folder Form */}
      {showAddForm && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-bold text-foreground">Add a Google Drive Folder</p>
          <p className="text-[11px] text-muted-foreground">
            Find your Folder ID in Google Drive: right-click a folder → Get link → copy the ID from the URL{" "}
            <code className="bg-muted/40 px-1 rounded text-[10px]">drive.google.com/drive/folders/<strong>FOLDER_ID</strong></code>
          </p>
          <p className="text-[11px] text-muted-foreground">
            Only files directly inside this folder will be synced. Files are auto-tagged by name — you can override any file's type manually after syncing.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Folder ID"
              value={newFolderId}
              onChange={(e) => setNewFolderId(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <input
              type="text"
              placeholder="Label (optional)"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="w-40 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button
              onClick={handleAddFolder}
              disabled={addFolder.isPending}
              className="rounded-lg px-4 py-2 text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Scoped Folders */}
      {!foldersLoading && folders && folders.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
            Scoped Folders ({folders.length})
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {folders.map((folder) => (
              <div
                key={folder.id}
                onClick={() =>
                  setActiveFolder((prev) =>
                    prev === folder.folder_id ? "all" : folder.folder_id
                  )
                }
                className={`flex items-center justify-between rounded-lg border bg-card px-4 py-3 cursor-pointer transition-colors ${
                  activeFolder === folder.folder_id
                    ? "border-primary/40 bg-primary/5"
                    : "border-border hover:border-border/60"
                } ${!folder.enabled ? "opacity-50" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <FolderOpen className={`h-4 w-4 ${folder.enabled ? "text-accent" : "text-muted-foreground"}`} />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{folder.folder_name || folder.folder_id}</p>
                    <p className="text-[11px] text-muted-foreground font-mono truncate max-w-[160px]">{folder.folder_id}</p>
                    {!folder.enabled && <span className="text-[10px] text-muted-foreground italic">Paused</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleToggle(folder.id, folder.enabled); }}
                    title={folder.enabled ? "Pause sync" : "Enable sync"}
                    className="text-muted-foreground hover:text-foreground transition-colors p-1"
                  >
                    {folder.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(folder.id, folder.folder_name); }}
                    className="text-muted-foreground hover:text-destructive transition-colors p-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {activeFolder !== "all" && (
            <button
              onClick={() => setActiveFolder("all")}
              className="text-[11px] text-muted-foreground hover:text-foreground underline"
            >
              Clear folder filter → show all
            </button>
          )}
        </div>
      )}

      {/* Files */}
      <div className="space-y-3">
        {/* Type filter tabs */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex gap-1.5 flex-wrap">
            {DOC_TYPE_FILTERS.map((f) => {
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

        {/* Files list */}
        {filesLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-card border border-border animate-pulse" />
            ))}
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {(files ?? []).length === 0
                ? "No files synced yet. Add a folder and click Sync Now."
                : "No files match this filter."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredFiles.map((file) => {
              const isManual = (file.raw_metadata as any)?.manual_type_override === true;
              const mimeLabel = MIME_LABELS[file.mime_type] ?? "File";
              return (
                <div
                  key={file.id}
                  className="glow-card rounded-xl bg-card border border-border px-4 py-3 flex items-center gap-3"
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-foreground leading-snug truncate">{file.name}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <DocTypeDropdown fileId={file.id} currentType={file.doc_type} />
                      <span className="text-[10px] text-muted-foreground bg-muted/30 rounded px-1.5 py-0.5">
                        {mimeLabel}
                      </span>
                      {isManual && <span className="text-[9px] text-muted-foreground italic">manual</span>}
                      {file.client_name && (
                        <span className="text-[10px] text-muted-foreground">{file.client_name}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {file.last_modified && (
                      <p className="text-[10px] text-muted-foreground hidden sm:block">
                        {new Date(file.last_modified).toLocaleDateString()}
                      </p>
                    )}
                    {file.drive_url && (
                      <a
                        href={file.drive_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
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
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { type: "cro_audit",     keywords: ["oddit", "audit", "cro report", "ux report"] },
            { type: "free_trial",    keywords: ["free trial", "freetrial", "(ft)", "ft -"] },
            { type: "client_report", keywords: ["proposal", "report", "deck", "summary", "results"] },
            { type: "template",      keywords: ["template", "framework", "playbook", "sop", "checklist"] },
            { type: "meeting_notes", keywords: ["notes", "transcript", "call", "meeting", "discovery"] },
            { type: "strategy_doc",  keywords: ["brief", "strategy", "plan", "roadmap"] },
          ].map(({ type, keywords }) => {
            const info = DOC_TYPE_LABELS[type];
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
          Click any file's tag to manually override — overrides survive future syncs.
        </p>
      </div>
    </div>
  );
}
