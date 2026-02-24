import { useState, useRef, useCallback } from "react";
import { AlertTriangle, Sparkles, GripVertical } from "lucide-react";

interface BeforeAfterSliderProps {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
}

export function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeLabel = "Before",
  afterLabel = "After",
  className = "",
}: BeforeAfterSliderProps) {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const updatePosition = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clientX - rect.left;
    const pct = Math.max(5, Math.min(95, (x / rect.width) * 100));
    setPosition(pct);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updatePosition(e.clientX);
  }, [updatePosition]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    updatePosition(e.clientX);
  }, [updatePosition]);

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative select-none overflow-hidden rounded-xl border border-border cursor-col-resize ${className}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ touchAction: "none" }}
    >
      {/* After image (full background) */}
      <img
        src={afterSrc}
        alt={afterLabel}
        className="block w-full h-auto object-cover pointer-events-none"
        draggable={false}
      />

      {/* Before image (clipped) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${position}%` }}
      >
        <img
          src={beforeSrc}
          alt={beforeLabel}
          className="block w-full h-full object-cover pointer-events-none"
          style={{ width: `${containerRef.current?.offsetWidth ?? 0}px`, maxWidth: "none" }}
          draggable={false}
        />
      </div>

      {/* Divider line */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-cream/80 shadow-[0_0_8px_rgba(255,255,255,0.3)]"
        style={{ left: `${position}%`, transform: "translateX(-50%)" }}
      >
        {/* Handle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-card border-2 border-cream/60 shadow-lg">
          <GripVertical className="h-4 w-4 text-cream/80" />
        </div>
      </div>

      {/* Labels */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-destructive/80 backdrop-blur-sm px-2.5 py-1">
        <AlertTriangle className="h-3 w-3 text-destructive-foreground" />
        <span className="text-[10px] font-bold text-destructive-foreground uppercase tracking-wider">{beforeLabel}</span>
      </div>
      <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-accent/80 backdrop-blur-sm px-2.5 py-1">
        <Sparkles className="h-3 w-3 text-accent-foreground" />
        <span className="text-[10px] font-bold text-accent-foreground uppercase tracking-wider">{afterLabel}</span>
      </div>
    </div>
  );
}
