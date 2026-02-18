import { CheckCircle2 } from "lucide-react";
import odditLogo from "@/assets/oddit-eyes-icon.png";

export default function OrderSuccess() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="orb orb-accent w-[500px] h-[500px] top-0 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      </div>

      <div className="relative z-10 text-center max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <img src={odditLogo} alt="Oddit" className="w-8 h-8 object-contain" />
          <span className="font-bold text-lg text-foreground tracking-tight">Oddit</span>
        </div>

        <div className="w-16 h-16 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-8 h-8 text-accent" />
        </div>

        <h1 className="text-2xl font-bold text-foreground mb-3">You're all set!</h1>
        <p className="text-muted-foreground text-sm leading-relaxed mb-2">
          Payment confirmed. We're already spinning up your report setup — Figma file, screenshots, the whole thing.
        </p>
        <p className="text-muted-foreground text-sm">
          You'll hear from us soon. 🎉
        </p>
      </div>
    </div>
  );
}
