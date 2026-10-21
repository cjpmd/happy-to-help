import { useState } from "react";
import { Monitor, Smartphone, ExternalLink, Moon, Sparkles, RotateCcw, Hammer, Megaphone, Inbox, Scale, Coins, Lightbulb, CheckCircle2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useStore, useCompany, useBalance } from "@/lib/store";
import { metrics_daily } from "@/lib/seed";
import { fmtTime, gbp, num } from "@/lib/format";
import { StageBar } from "./StageBar";
import { SolChat } from "./SolChat";
import { ApprovalCard } from "./ApprovalCard";
import { cn } from "@/lib/utils";

const activityIcon: Record<string, typeof Hammer> = { build: Hammer, grow: Megaphone, run: Inbox, legal: Scale, refund: RotateCcw, evidence: Lightbulb, approval: CheckCircle2, raise: Coins };

function Metric({ label, value, delta }: { label: string; value: string; delta?: string }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight tabular">{value}</p>
      {delta && <p className="text-[11px] text-success tabular">{delta}</p>}
    </div>
  );
}

export function MetricsStrip({ companyId }: { companyId: string }) {
  const rows = metrics_daily.filter((m) => m.company_id === companyId);
  const balance = useBalance(companyId);
  const week = rows.slice(-7), prev = rows.slice(-14, -7);
  const sum = (r: typeof rows, k: "visitors" | "signups") => r.reduce((s, x) => s + x[k], 0);
  const last = rows[rows.length - 1];
  const pct = (a: number, b: number) => (b ? `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)}% vs last week` : undefined);
  return (
    <div className="grid grid-cols-2 divide-x divide-y rounded-xl border bg-card shadow-card sm:grid-cols-5 sm:divide-y-0 [&>*:nth-child(2n+1)]:border-l-0 sm:[&>*]:border-l">
      <Metric label="Visitors · 7d" value={num(sum(week, "visitors"))} delta={pct(sum(week, "visitors"), sum(prev, "visitors"))} />
      <Metric label="Signups · 7d" value={num(sum(week, "signups"))} delta={pct(sum(week, "signups"), sum(prev, "signups"))} />
      <Metric label="Paying" value={num(last?.paying_customers ?? 0)} />
      <Metric label="MRR" value={gbp(last?.mrr ?? 0)} />
      <Link to="/billing" className="col-span-2 transition-colors hover:bg-muted/50 sm:col-span-1"><Metric label="Credits left" value={num(balance)} /></Link>
    </div>
  );
}

function SitePreview({ companyId }: { companyId: string }) {
  const c = useCompany(companyId);
  const [mode, setMode] = useState<"live" | "preview">("live");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const url = mode === "live" ? c.website_live_url : c.website_preview_url;
  const seg = (active: boolean) => cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors", active ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground");
  return (
    <section className="flex min-h-[520px] flex-col overflow-hidden rounded-xl border bg-card shadow-card">
      <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <div className="flex rounded-lg bg-muted p-0.5">
          <button className={seg(mode === "live")} onClick={() => setMode("live")}>Live</button>
          <button className={seg(mode === "preview")} onClick={() => setMode("preview")}>Preview</button>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-xs text-muted-foreground">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", mode === "live" ? "bg-success" : "bg-warning")} />
          <span className="truncate font-mono">{c.slug}.app{mode === "preview" ? " · preview" : ""}</span>
        </div>
        <div className="flex rounded-lg bg-muted p-0.5">
          <button className={seg(device === "desktop")} onClick={() => setDevice("desktop")} aria-label="Desktop"><Monitor className="h-3.5 w-3.5" /></button>
          <button className={seg(device === "mobile")} onClick={() => setDevice("mobile")} aria-label="Mobile"><Smartphone className="h-3.5 w-3.5" /></button>
        </div>
        <a href={url} target="_blank" rel="noreferrer" className="p-1 text-muted-foreground hover:text-foreground" aria-label="Open in new tab"><ExternalLink className="h-4 w-4" /></a>
      </header>
      <div className="flex flex-1 justify-center bg-muted/50 p-3">
        <iframe key={url} src={url} title={`${c.name} website`} className={cn("h-full min-h-[460px] rounded-lg border bg-background transition-all", device === "mobile" ? "w-[375px]" : "w-full")} />
      </div>
    </section>
  );
}

export function CompanyHQ({ companyId, readOnly }: { companyId: string; readOnly?: boolean }) {
  const { db } = useStore();
  const c = useCompany(companyId);
  const pending = db.approvals.filter((a) => a.company_id === companyId && a.status === "pending");
  const overnight = db.activity_events.filter((e) => e.company_id === companyId).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Company HQ</p>
          <h1 className="text-2xl font-semibold tracking-tight">{c.name}</h1>
        </div>
        <p className="max-w-md text-sm text-muted-foreground">{c.description}</p>
      </div>
      <StageBar companyId={companyId} canApprove={readOnly} />
      <MetricsStrip companyId={companyId} />
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="order-2 xl:order-1"><SitePreview companyId={companyId} /></div>
        <aside className="order-1 space-y-4 xl:order-2">
          <SolChat companyId={companyId} readOnly={readOnly} />
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-medium"><Sparkles className="h-4 w-4 text-primary" />Needs your approval
                {pending.length > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground tabular">{pending.length}</span>}</h2>
              {!readOnly && <Link to="/approvals" className="text-xs text-muted-foreground hover:text-foreground">View all</Link>}
            </div>
            <div className="space-y-2">
              {pending.length === 0 && <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">All clear. Nothing waiting on you.</p>}
              {pending.map((a) => <ApprovalCard key={a.id} a={a} compact readOnly={readOnly} />)}
            </div>
          </section>
          <section className="rounded-xl border bg-card p-4 shadow-card">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-medium"><Moon className="h-4 w-4 text-muted-foreground" />Overnight</h2>
            <ol className="space-y-3">
              {overnight.map((e) => {
                const I = activityIcon[e.type] ?? Sparkles;
                return (
                  <li key={e.id} className="flex gap-3 text-sm">
                    <I className={cn("mt-0.5 h-4 w-4 shrink-0", e.type === "refund" ? "text-warning" : "text-muted-foreground")} />
                    <span className="flex-1 leading-snug">{e.summary}</span>
                    <span className="text-xs text-muted-foreground tabular">{fmtTime(e.created_at)}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
