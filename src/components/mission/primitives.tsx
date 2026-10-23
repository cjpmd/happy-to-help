import type { ReactNode } from "react";
import { PRODUCT_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";
import solImg from "@/assets/sol.png";

export function SolAvatar({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <img
      src={solImg}
      alt="Sol"
      width={size}
      height={size}
      className={cn("shrink-0 rounded-full", className)}
      style={{ width: size, height: size }}
    />
  );
}

export function BrandLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "block px-2 py-1 font-display text-[17px] font-bold uppercase tracking-[0.3em]",
        className,
      )}
    >
      {PRODUCT_NAME}
    </span>
  );
}

type Tone = "neutral" | "primary" | "success" | "warning" | "destructive" | "info";
// Colour only carries meaning: green = done or verified, amber = needs the founder,
// red = an error. "primary" and "info" are the outlined "in progress" style.
const tones: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  primary: "border border-ink text-ink",
  success: "bg-go-bg text-go",
  warning: "bg-hold-bg text-hold",
  destructive: "bg-destructive-soft text-destructive",
  info: "border border-ink text-ink",
};
export function Pill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "label-caps inline-flex items-center gap-1 whitespace-nowrap rounded-pill px-2 py-0.5 text-[11px] leading-[1.35]",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export const statusTone: Record<string, Tone> = {
  succeeded: "success",
  approved: "success",
  done: "success",
  validated: "success",
  published: "success",
  committed: "success",
  on_track: "success",
  running: "info",
  testing: "info",
  scheduled: "info",
  in_progress: "info",
  meeting: "info",
  diligence: "info",
  doing: "info",
  queued: "neutral",
  untested: "neutral",
  draft: "neutral",
  upcoming: "neutral",
  researching: "neutral",
  todo: "neutral",
  contacted: "neutral",
  needs_approval: "warning",
  pending: "warning",
  awaiting_approval: "warning",
  needs_attention: "warning",
  ready: "warning",
  failed: "destructive",
  overdue: "warning",
  stalled: "warning",
  declined: "neutral",
  invalidated: "neutral",
  passed: "neutral",
};
export const humanise = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
export function StatusPill({ status }: { status: string }) {
  return <Pill tone={statusTone[status] ?? "neutral"}>{humanise(status)}</Pill>;
}

export function Panel({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-card border bg-card shadow-card", className)}>
      {title && (
        <header className="flex items-baseline justify-between gap-2 px-3.5 pt-3">
          <h2 className="label-caps text-[13px] tracking-[0.16em]">{title}</h2>
          {action}
        </header>
      )}
      <div className={cn("px-3.5 pb-3 pt-2", !title && "pt-3", bodyClassName)}>{children}</div>
    </section>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="display-num text-[40px] uppercase leading-[0.95] tracking-[0.02em]">
          {title}
        </h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

// A tile inside a card: soft background, small depth.
export function Tile({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-tile bg-soft p-2.5 shadow-tile", className)}>{children}</div>;
}

// A labelled big number: Barlow label above a Barlow Semi Condensed figure.
export function Readout({
  label,
  value,
  unit,
  note,
  size = 26,
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: ReactNode;
  note?: ReactNode;
  size?: 26 | 30 | 34;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="label-caps text-[11px] tracking-[0.14em] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "display-num",
          size === 26 ? "text-[26px]" : size === 30 ? "text-[30px]" : "text-[34px]",
        )}
      >
        {value}
        {unit && <span className="text-[16px] text-muted-foreground"> {unit}</span>}
      </div>
      {note && <div className="text-xs">{note}</div>}
    </div>
  );
}
