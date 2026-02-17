import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
}

export function MetricCard({ title, value, change, changeType = "neutral", icon: Icon }: MetricCardProps) {
  const changeColor =
    changeType === "positive"
      ? "text-success"
      : changeType === "negative"
      ? "text-destructive"
      : "text-muted-foreground";

  return (
    <div className="glow-card rounded-lg bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{title}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-3 flex items-end gap-2">
        <span className="text-2xl font-bold text-card-foreground">{value}</span>
        {change && <span className={`text-xs font-medium ${changeColor}`}>{change}</span>}
      </div>
    </div>
  );
}
