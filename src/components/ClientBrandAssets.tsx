import { useState, useRef } from "react";
import { toast } from "sonner";
import { ImagePlus, Trash2, Loader2, ChevronDown, X } from "lucide-react";
import {
  useClientBrandAssets,
  useUploadBrandAsset,
  useDeleteBrandAsset,
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
  type AssetType,
} from "@/hooks/useClientBrandAssets";

interface Props {
  clientId: string;
  clientName: string;
}

export function ClientBrandAssets({ clientId, clientName }: Props) {
  const { data: assets = [], isLoading } = useClientBrandAssets(clientId);
  const upload = useUploadBrandAsset();
  const remove = useDeleteBrandAsset();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedType, setSelectedType] = useState<AssetType>("logo");
  const [expanded, setExpanded] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name} is not an image`);
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} exceeds 10 MB`);
        continue;
      }
      try {
        await upload.mutateAsync({ clientId, file, assetType: selectedType });
        toast.success(`${file.name} uploaded`);
      } catch (e: any) {
        toast.error(`Upload failed: ${e.message}`);
      }
    }
  };

  const handleDelete = async (asset: typeof assets[0]) => {
    try {
      await remove.mutateAsync({ id: asset.id, storagePath: asset.storage_path, clientId });
      toast.success(`${asset.file_name} removed`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="border-t border-border pt-3 mt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors w-full"
      >
        <ImagePlus className="h-3.5 w-3.5" />
        Brand Assets ({assets.length})
        <ChevronDown className={`h-3 w-3 ml-auto transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 animate-fade-in">
          {/* Upload area */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as AssetType)}
                className="rounded-lg border border-border bg-background pl-2 pr-6 py-1.5 text-[11px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 appearance-none"
              >
                {ASSET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ASSET_TYPE_LABELS[t].icon} {ASSET_TYPE_LABELS[t].label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={upload.isPending}
              className="flex items-center gap-1 rounded-lg bg-primary/10 border border-primary/20 px-3 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              {upload.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ImagePlus className="h-3 w-3" />
              )}
              Upload
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>

          {/* Asset grid */}
          {isLoading ? (
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="aspect-square rounded-lg bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : assets.length === 0 ? (
            <p className="text-[11px] text-muted-foreground text-center py-4">
              No brand assets yet — upload logos, product images, etc.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className="group relative aspect-square rounded-lg border border-border bg-background overflow-hidden"
                >
                  <img
                    src={asset.file_url}
                    alt={asset.file_name}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                    <span className="text-[9px] font-bold text-foreground truncate max-w-[90%] px-1">
                      {asset.file_name}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {ASSET_TYPE_LABELS[asset.asset_type]?.icon} {ASSET_TYPE_LABELS[asset.asset_type]?.label ?? asset.asset_type}
                    </span>
                    <button
                      onClick={() => handleDelete(asset)}
                      disabled={remove.isPending}
                      className="mt-1 flex items-center gap-1 rounded bg-destructive/10 border border-destructive/20 px-2 py-0.5 text-[9px] font-semibold text-destructive hover:bg-destructive/20 transition-colors"
                    >
                      <Trash2 className="h-2.5 w-2.5" /> Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
