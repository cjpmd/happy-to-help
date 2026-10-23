import { useState, type ReactNode } from "react";
import {
  Monitor,
  Smartphone,
  ExternalLink,
  Moon,
  Sparkles,
  RotateCcw,
  Hammer,
  Megaphone,
  Inbox,
  Scale,
  Coins,
  Lightbulb,
  CheckCircle2,
  Settings2,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Zap,
  Pause,
  FileText,
  Mail,
  Images,
  ListTodo,
  Shield,
  Users,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useStore, useCompany, useBalance } from "@/lib/store";
import { metrics_daily } from "@/lib/seed";
import { fmtTime, gbp, num } from "@/lib/format";
import { StageBar } from "./StageBar";
import { SolChat } from "./SolChat";
import { ApprovalCard } from "./ApprovalCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { CostButton, Why } from "./WorkControls";
import { defaultLayout, businessDefaults, type Widget } from "@/lib/workspace";
import { autoModeCost } from "@/lib/credits";
import { SolAvatar, Pill } from "./primitives";
import { cn } from "@/lib/utils";

const activityIcon: Record<string, typeof Hammer> = {
  build: Hammer,
  grow: Megaphone,
  run: Inbox,
  legal: Scale,
  refund: RotateCcw,
  evidence: Lightbulb,
  approval: CheckCircle2,
  raise: Coins,
};

function Metric({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: string | undefined;
}) {
  return (
    <div className="min-w-0 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tracking-tight tabular">{value}</p>
      {delta && <p className="text-[11px] text-success tabular">{delta}</p>}
    </div>
  );
}

export function MetricsStrip({ companyId }: { companyId: string }) {
  const rows = metrics_daily.filter((m) => m.company_id === companyId);
  const balance = useBalance(companyId);
  const week = rows.slice(-7),
    prev = rows.slice(-14, -7);
  const sum = (r: typeof rows, k: "visitors" | "signups") => r.reduce((s, x) => s + x[k], 0);
  const last = rows[rows.length - 1];
  const pct = (a: number, b: number) =>
    b ? `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)}% vs last week` : undefined;
  return (
    <div className="grid grid-cols-2 divide-x divide-y rounded-xl border bg-card shadow-card sm:grid-cols-5 sm:divide-y-0 [&>*:nth-child(2n+1)]:border-l-0 sm:[&>*]:border-l">
      <Metric
        label="Visitors · 7d"
        value={num(sum(week, "visitors"))}
        delta={pct(sum(week, "visitors"), sum(prev, "visitors"))}
      />
      <Metric
        label="Signups · 7d"
        value={num(sum(week, "signups"))}
        delta={pct(sum(week, "signups"), sum(prev, "signups"))}
      />
      <Metric label="Paying" value={num(last?.paying_customers ?? 0)} />
      <Metric label="MRR" value={gbp(last?.mrr ?? 0)} />
      <Link to="/billing" className="col-span-2 transition-colors hover:bg-muted/50 sm:col-span-1">
        <Metric label="Credits left" value={num(balance)} />
      </Link>
    </div>
  );
}

function SitePreview({ companyId }: { companyId: string }) {
  const c = useCompany(companyId);
  const [mode, setMode] = useState<"live" | "preview">("live");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const url = mode === "live" ? c.website_live_url : c.website_preview_url;
  const seg = (active: boolean) =>
    cn(
      "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
      active
        ? "bg-card text-foreground shadow-card"
        : "text-muted-foreground hover:text-foreground",
    );
  return (
    <section className="flex min-h-[520px] flex-col overflow-hidden rounded-xl border bg-card shadow-card">
      <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <div className="flex rounded-lg bg-muted p-0.5">
          <Button
            variant="ghost"
            size="sm"
            className={seg(mode === "live")}
            onClick={() => setMode("live")}
          >
            Live
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={seg(mode === "preview")}
            onClick={() => setMode("preview")}
          >
            Preview
          </Button>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-xs text-muted-foreground">
          <span
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              mode === "live" ? "bg-success" : "bg-warning",
            )}
          />
          <span className="truncate font-mono">
            {c.slug}.app{mode === "preview" ? " · preview" : ""}
          </span>
        </div>
        <div className="flex rounded-lg bg-muted p-0.5">
          <Button
            variant="ghost"
            size="sm"
            className={seg(device === "desktop")}
            onClick={() => setDevice("desktop")}
            aria-label="Desktop"
          >
            <Monitor className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={seg(device === "mobile")}
            onClick={() => setDevice("mobile")}
            aria-label="Mobile"
          >
            <Smartphone className="h-3.5 w-3.5" />
          </Button>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="p-1 text-muted-foreground hover:text-foreground"
          aria-label="Open in new tab"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </header>
      <div className="flex flex-1 justify-center bg-muted/50 p-3">
        <iframe
          key={url}
          src={url}
          title={`${c.name} website`}
          className={cn(
            "h-full min-h-[460px] rounded-lg border bg-background transition-all",
            device === "mobile" ? "w-full max-w-[375px]" : "w-full",
          )}
        />
      </div>
    </section>
  );
}

export function CompanyHQ({
  companyId,
  readOnly,
}: {
  companyId: string;
  readOnly?: boolean | undefined;
}) {
  const { db, user, solTyping, saveLayout, stopAuto } = useStore();
  const c = useCompany(companyId);
  const balance = useBalance(companyId);
  const pending = db.approvals.filter((a) => a.company_id === companyId && a.status === "pending");
  const overnight = db.activity_events
    .filter((e) => e.company_id === companyId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 6);
  const layout = db.layouts[user.id] ?? defaultLayout();
  const [editing, setEditing] = useState(false);
  const [drag, setDrag] = useState<Widget | null>(null);
  const [auto, setAuto] = useState(false);
  const [hours, setHours] = useState(2);
  const { work } = useStore();
  const currentRun = db.agent_runs.find(
    (r) => r.company_id === companyId && r.status === "running",
  );
  const latest = overnight[0];
  const status = solTyping
    ? "working"
    : currentRun
      ? "working"
      : pending.length
        ? "waiting for you"
        : "idle";
  const summary = solTyping
    ? (latest?.summary ?? "Sol is working…")
    : currentRun
      ? currentRun.task
      : pending.length
        ? "Waiting for your approval"
        : "Sol is idle";
  const reorder = (from: Widget, to: Widget) => {
    const next = [...layout];
    const index = next.findIndex((w) => w.id === from);
    const target = next.findIndex((w) => w.id === to);
    if (index < 0 || target < 0) return;
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(target, 0, item);
    saveLayout(next);
  };
  const linkWidget = (title: string, to: string, icon: typeof Mail, content: ReactNode) => {
    const Icon = icon;
    return (
      <section className="rounded-lg border bg-card shadow-card">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Icon className="h-4 w-4 text-muted-foreground" />
            {title}
          </h2>
          <Link to={to} className="text-xs text-primary">
            Open →
          </Link>
        </header>
        <div className="p-4 text-sm">{content}</div>
      </section>
    );
  };
  const render = (id: Widget): ReactNode => {
    switch (id) {
      case "Sol":
        return <SolChat companyId={companyId} readOnly={readOnly} />;
      case "Stage & gates":
        return <StageBar companyId={companyId} canApprove={readOnly} />;
      case "Live preview":
        return <SitePreview companyId={companyId} />;
      case "Metrics":
        return <MetricsStrip companyId={companyId} />;
      case "Approvals":
        return (
          <section>
            <div className="mb-3 flex justify-between">
              <h2 className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-primary" />
                Needs your approval <Pill tone="primary">{pending.length}</Pill>
              </h2>
              <Link to="/approvals" className="text-xs text-muted-foreground">
                View all
              </Link>
            </div>
            <div className="space-y-2">
              {pending.length ? (
                pending.map((a) => <ApprovalCard key={a.id} a={a} compact readOnly={readOnly} />)
              ) : (
                <p className="border-b py-4 text-sm text-muted-foreground">
                  All clear. Nothing waiting on you.
                </p>
              )}
            </div>
          </section>
        );
      case "Overnight":
        return (
          <section className="rounded-lg border bg-card p-4 shadow-card">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Moon className="h-4 w-4" />
              Overnight
            </h2>
            <ol className="space-y-3">
              {overnight.map((e) => {
                const Icon = activityIcon[e.type] ?? Sparkles;
                return (
                  <li key={e.id} className="flex gap-3 text-sm">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">{e.summary}</span>
                    <span className="text-xs text-muted-foreground">{fmtTime(e.created_at)}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      case "Tasks":
        return linkWidget(
          "Tasks",
          "/build",
          ListTodo,
          <ul className="space-y-2">
            {db.tasks
              .filter((t) => t.company_id === companyId && t.status !== "done")
              .slice(0, 4)
              .map((t) => (
                <li key={t.id}>{t.title}</li>
              ))}
          </ul>,
        );
      case "Documents":
        return linkWidget(
          "Documents",
          "/documents",
          FileText,
          <ul className="space-y-2">
            {db.documents
              .filter((d) => d.company_id === companyId)
              .map((d) => (
                <li key={d.id} className="flex justify-between gap-2">
                  <span>{d.title}</span>
                  <span className="text-muted-foreground">v{d.versions.length}</span>
                </li>
              ))}
          </ul>,
        );
      case "Email": {
        const emails = db.emails.filter((e) => e.company_id === companyId);
        return linkWidget(
          "Email",
          "/email",
          Mail,
          <>
            <p>hello@{c.slug}.app</p>
            <p className="mt-2 text-muted-foreground">{emails.length} threads · not connected</p>
          </>,
        );
      }
      case "Social channels":
        return linkWidget(
          "Social channels",
          "/grow",
          Megaphone,
          <div className="flex flex-wrap gap-2">
            {(c.channels ?? businessDefaults(c.customer_type)).map((ch) => (
              <Pill key={ch}>{ch}</Pill>
            ))}
          </div>,
        );
      case "Media":
        return linkWidget(
          "Media",
          "/media",
          Images,
          <p>
            {db.media.filter((m) => m.company_id === companyId && m.status === "ready").length}{" "}
            assets ready
          </p>,
        );
      case "Ads": {
        const ad = db.ads.find((a) => a.company_id === companyId);
        return linkWidget(
          "Meta Ads",
          "/ads",
          Megaphone,
          <>
            <Pill tone="warning">Not connected</Pill>
            <p className="mt-3">
              {gbp(ad?.daily_budget ?? 0)} / day · cap {gbp(ad?.hard_cap ?? 50)}
            </p>
          </>,
        );
      }
      case "Compliance due":
        return linkWidget(
          "Compliance due",
          "/legal",
          Shield,
          <p>Review company obligations and upcoming deadlines.</p>,
        );
      case "Investors":
        return linkWidget(
          "Investors",
          "/raise",
          Users,
          <p>{db.investors.filter((i) => i.company_id === companyId).length} in your pipeline</p>,
        );
      case "Credits":
        return linkWidget(
          "Credits",
          "/billing",
          Coins,
          <p className="text-2xl font-semibold tabular">
            {num(balance)} <span className="text-sm font-normal text-muted-foreground">left</span>
          </p>,
        );
    }
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase text-muted-foreground">Company HQ</p>
          <h1 className="text-2xl font-semibold">{c.name}</h1>
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Settings2 className="h-4 w-4" />
              Edit dashboard
            </Button>
            <Button size="sm" onClick={() => setAuto(true)}>
              <Zap className="h-4 w-4" />
              Auto Mode
            </Button>
          </div>
        )}
      </div>
      {c.sector && c.sector !== "general" && (
        <div className="flex items-center gap-2 border-l-2 border-warning bg-warning-soft px-3 py-2 text-xs text-warning">
          <Shield className="h-4 w-4" />
          Regulated sector · {c.sector} · stricter claims checks
        </div>
      )}
      <div className="flex items-center gap-3 border-y py-2.5">
        <div className="relative">
          <SolAvatar size={26} />
          <span
            className={cn(
              "absolute bottom-0 right-0 h-2 w-2 rounded-full ring-2 ring-background",
              status === "working"
                ? "bg-success"
                : status === "idle"
                  ? "bg-muted-foreground"
                  : "bg-warning",
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">{summary}</p>
          <p className="text-[10px] text-muted-foreground">{status} · demo work stream</p>
        </div>
        {solTyping && !readOnly && (
          <Button size="icon" variant="ghost" aria-label="Stop Auto Mode" onClick={stopAuto}>
            <Pause className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        {layout
          .filter((w) => w.visible)
          .map((w) => (
            <div
              key={w.id}
              className={cn(
                (w.id === "Stage & gates" || w.id === "Metrics" || w.id === "Live preview") &&
                  "lg:col-span-2",
              )}
            >
              {render(w.id)}
            </div>
          ))}
      </div>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit dashboard</DialogTitle>
            <DialogDescription>Choose your widgets and their order.</DialogDescription>
          </DialogHeader>
          <div className="divide-y">
            {layout.map((w, i) => (
              <div
                key={w.id}
                draggable
                onDragStart={() => setDrag(w.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (drag) reorder(drag, w.id);
                  setDrag(null);
                }}
                className="flex items-center gap-2 py-2"
              >
                <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" />
                <span className="flex-1 text-sm">{w.id}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={i === 0}
                  aria-label={`Move ${w.id} up`}
                  onClick={() => {
                    const before = layout[i - 1];
                    if (before) reorder(w.id, before.id);
                  }}
                >
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={i === layout.length - 1}
                  aria-label={`Move ${w.id} down`}
                  onClick={() => {
                    const after = layout[i + 1];
                    if (after) reorder(w.id, after.id);
                  }}
                >
                  <ArrowDown className="h-3 w-3" />
                </Button>
                <Switch
                  checked={w.visible}
                  aria-label={`Show ${w.id}`}
                  onCheckedChange={(visible) =>
                    saveLayout(layout.map((x) => (x.id === w.id ? { ...x, visible } : x)))
                  }
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between gap-3">
            <Button variant="outline" onClick={() => saveLayout(defaultLayout())}>
              <RotateCcw className="h-4 w-4" />
              Restore default layout
            </Button>
            <Button onClick={() => setEditing(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={auto} onOpenChange={setAuto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Auto Mode</DialogTitle>
            <DialogDescription>
              Choose a work period for Sol. This demo previews one work cycle; it does not run
              unattended jobs.
            </DialogDescription>
          </DialogHeader>
          <label className="text-sm font-medium">
            Work for {hours} {hours === 1 ? "hour" : "hours"}
          </label>
          <Slider
            aria-label="Auto Mode hours"
            min={1}
            max={8}
            step={1}
            value={[hours]}
            onValueChange={(v) => setHours(v[0] ?? 1)}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>1 hour</span>
            <span>8 hours</span>
          </div>
          <CostButton
            label={`Start ${hours}-hour session`}
            cost={autoModeCost(hours)}
            onConfirm={() => {
              setAuto(false);
              return work(companyId, `Auto Mode: ${hours}-hour plan`, autoModeCost(hours), "auto");
            }}
          />
          <Why reason="A time-boxed work period keeps the credit commitment visible and bounded. The hourly demo estimate and your available balance determine the cost before you start." />
        </DialogContent>
      </Dialog>
    </div>
  );
}
