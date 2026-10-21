import { Check, X, HelpCircle, Megaphone, Mail, PoundSterling, FileText, Globe } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useStore, labelFor } from "@/lib/store";
import type { Approval } from "@/lib/types";
import { fmtDateTime, num } from "@/lib/format";
import { Pill, StatusPill } from "./primitives";
import { cn } from "@/lib/utils";

const icons = { publish_post: Megaphone, send_email: Mail, ad_spend: PoundSterling, file_document: FileText, publish_site: Globe };
const titles = { publish_post: "Publish a post", send_email: "Send an email", ad_spend: "Spend on ads", file_document: "File a document", publish_site: "Publish site change" };

function Preview({ a }: { a: Approval }) {
  const p = a.payload;
  const row = (k: string, v: string) => (
    <div className="flex gap-3 text-xs"><span className="w-20 shrink-0 text-muted-foreground">{k}</span><span className="min-w-0 break-words">{v}</span></div>
  );
  switch (a.action_type) {
    case "publish_post":
      return <div className="space-y-2">{row("Channel", p.channel)}{p.scheduled_for && row("When", p.scheduled_for)}<p className="rounded-lg bg-muted p-3 text-sm leading-relaxed">{p.text}</p></div>;
    case "send_email":
      return <div className="space-y-2">{row("To", p.to)}{row("Subject", p.subject)}<p className="whitespace-pre-line rounded-lg bg-muted p-3 text-sm leading-relaxed">{p.body}</p></div>;
    case "ad_spend":
      return <div className="space-y-1.5">{row("Platform", p.platform)}{row("Budget", `£${p.amount_gbp} over ${p.duration}`)}{row("Audience", p.audience)}{row("Creative", p.creative)}</div>;
    case "file_document":
      return <div className="space-y-1.5">{row("Document", p.document)}{row("Destination", p.destination)}</div>;
    case "publish_site":
      return <div className="space-y-1.5">{row("Change", p.change)}{row("Preview", p.url)}</div>;
  }
}

export function ApprovalCard({ a, compact, readOnly }: { a: Approval; compact?: boolean; readOnly?: boolean }) {
  const { decideApproval, askWhy } = useStore();
  const Icon = icons[a.action_type];
  const decide = (s: "approved" | "declined") => {
    decideApproval(a.id, s);
    toast.success(s === "approved" ? "Approved — Sol will carry it out" : "Declined — Sol won't proceed", { description: labelFor(a) });
  };
  return (
    <article className={cn("rounded-xl border bg-card shadow-card", compact ? "p-3" : "p-4 sm:p-5")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"><Icon className="h-4 w-4" /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{titles[a.action_type]}</p>
            <p className="text-xs text-muted-foreground tabular">{num(a.estimated_credits)} credits est.</p>
          </div>
        </div>
        {a.status !== "pending" && <StatusPill status={a.status} />}
      </div>
      {!compact && <div className="mt-4"><Preview a={a} /></div>}
      {compact && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{a.payload.text ?? a.payload.subject ?? `${a.payload.platform ?? ""} ${a.payload.audience ?? a.payload.change ?? ""}`}</p>}
      {a.status === "pending" && !readOnly ? (
        <div className={cn("mt-3 flex gap-2", !compact && "mt-5")}>
          <Button size="sm" className="flex-1 sm:flex-none" onClick={() => decide("approved")}><Check className="h-4 w-4" />Approve</Button>
          <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => decide("declined")}><X className="h-4 w-4" />Decline</Button>
          <Button size="sm" variant="ghost" onClick={() => askWhy(a.id)} aria-label="Ask why"><HelpCircle className="h-4 w-4" />{!compact && "Ask why"}</Button>
        </div>
      ) : a.status !== "pending" ? (
        <p className="mt-3 text-xs text-muted-foreground">{a.status === "approved" ? "Approved" : "Declined"} by {a.decided_by} · {a.decided_at && fmtDateTime(a.decided_at)}</p>
      ) : (
        <Pill className="mt-3">Awaiting founder</Pill>
      )}
    </article>
  );
}
