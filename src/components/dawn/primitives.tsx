import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import solImg from "@/assets/sol.png";

export function SolAvatar({ size = 28, className }: { size?: number; className?: string }) {
  return <img src={solImg} alt="Sol" width={size} height={size} className={cn("shrink-0 rounded-full", className)} style={{ width: size, height: size }} />;
}

export function DawnLogo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="relative block h-6 w-6 overflow-hidden rounded-md bg-dawn">
        <span className="absolute bottom-[6px] left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-primary-foreground/90" />
        <span className="absolute bottom-[6px] left-0 right-0 h-[1.5px] bg-primary-foreground/90" />
      </span>
      <span className="text-[15px] font-semibold tracking-tight">Dawn</span>
    </div>
  );
}

type Tone = "neutral" | "primary" | "success" | "warning" | "destructive" | "info";
const tones: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  destructive: "bg-destructive-soft text-destructive",
  info: "bg-info-soft text-info",
};
export function Pill({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", tones[tone], className)}>{children}</span>;
}

export const statusTone: Record<string, Tone> = {
  succeeded: "success", approved: "success", done: "success", validated: "success", published: "success", committed: "success", on_track: "success",
  running: "info", testing: "info", scheduled: "info", in_progress: "info", meeting: "info", diligence: "info", doing: "info",
  queued: "neutral", untested: "neutral", draft: "neutral", upcoming: "neutral", researching: "neutral", todo: "neutral", contacted: "neutral",
  needs_approval: "warning", pending: "warning", awaiting_approval: "warning", needs_attention: "warning", ready: "warning",
  failed: "destructive", declined: "destructive", invalidated: "destructive", overdue: "destructive", passed: "destructive", stalled: "destructive",
};
export const humanise = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
export function StatusPill({ status }: { status: string }) {
  return <Pill tone={statusTone[status] ?? "neutral"}>{humanise(status)}</Pill>;
}

export function Panel({ title, action, children, className, bodyClassName }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn("rounded-xl border bg-card shadow-card", className)}>
      {title && (
        <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-sm font-medium">{title}</h2>
          {action}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
