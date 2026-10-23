import { Megaphone, Mail, PoundSterling, FileText, Globe } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useStore, labelFor, useBalance, useCompany } from "@/lib/store";
import { approvalText, type Approval } from "@/lib/types";
import { fmtDateTime, num } from "@/lib/format";
import { Pill, StatusPill } from "./primitives";
import { ClaimsCheck, Why, CostButton } from "./WorkControls";
import { checkClaims } from "@/lib/workspace";
import { cn } from "@/lib/utils";

const icons = {
  publish_post: Megaphone,
  send_email: Mail,
  ad_spend: PoundSterling,
  file_document: FileText,
  publish_site: Globe,
};
const titles = {
  publish_post: "Publish a post",
  send_email: "Send an email",
  ad_spend: "Spend on ads",
  file_document: "File a document",
  publish_site: "Publish site change",
};

function Preview({ a }: { a: Approval }) {
  const row = (k: string, v: string) => (
    <div className="flex gap-3 text-xs">
      <span className="w-20 shrink-0 text-muted-foreground">{k}</span>
      <span className="min-w-0 break-words">{v}</span>
    </div>
  );
  switch (a.action_type) {
    case "publish_post":
      return (
        <div className="space-y-2">
          {row("Channel", a.payload.channel)}
          {a.payload.scheduled_for && row("When", a.payload.scheduled_for)}
          <p className="rounded-tile bg-soft p-3 text-sm leading-relaxed shadow-tile">
            {a.payload.text}
          </p>
        </div>
      );
    case "send_email":
      return (
        <div className="space-y-2">
          {row("To", a.payload.to)}
          {row("Subject", a.payload.subject)}
          <p className="whitespace-pre-line rounded-tile bg-soft p-3 text-sm leading-relaxed shadow-tile">
            {a.payload.body}
          </p>
        </div>
      );
    case "ad_spend":
      return (
        <div className="space-y-1.5">
          {row("Platform", a.payload.platform)}
          {row("Budget", `£${a.payload.amount_gbp} over ${a.payload.duration}`)}
          {row("Audience", a.payload.audience)}
          {row("Creative", a.payload.creative)}
        </div>
      );
    case "file_document":
      return (
        <div className="space-y-1.5">
          {row("Document", a.payload.document)}
          {row("Destination", a.payload.destination)}
        </div>
      );
    case "publish_site":
      return (
        <div className="space-y-1.5">
          {row("Change", a.payload.change)}
          {row("Preview", a.payload.url)}
        </div>
      );
  }
}

function summary(a: Approval) {
  switch (a.action_type) {
    case "publish_post":
      return a.payload.text;
    case "send_email":
      return a.payload.subject;
    case "ad_spend":
      return `${a.payload.platform} ${a.payload.audience}`;
    case "file_document":
      return a.payload.document;
    case "publish_site":
      return a.payload.change;
  }
}

export function ApprovalCard({
  a,
  compact,
  readOnly,
}: {
  a: Approval;
  compact?: boolean | undefined;
  readOnly?: boolean | undefined;
}) {
  const { decideApproval, askWhy } = useStore();
  const c = useCompany(a.company_id);
  const text = approvalText(a);
  const flagged = checkClaims(text, c.sector).length > 0;
  const Icon = icons[a.action_type];
  const decide = (s: "approved" | "declined") => {
    decideApproval(a.id, s);
    toast.success(
      s === "approved" ? "Approved — Sol will carry it out" : "Declined — Sol won't proceed",
      { description: labelFor(a) },
    );
  };
  return (
    <article
      className={cn("rounded-card border bg-card shadow-card", compact ? "p-3" : "p-4 sm:p-5")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-tile bg-soft text-ink shadow-tile">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="label-caps truncate text-[13px] tracking-[0.14em]">
              {titles[a.action_type]}
            </p>
            <p className="text-xs text-muted-foreground tabular">
              {num(a.estimated_credits)} credits est.
            </p>
          </div>
        </div>
        {a.status !== "pending" && <StatusPill status={a.status} />}
      </div>
      {!compact && (
        <div className="mt-4">
          <Preview a={a} />
        </div>
      )}
      {compact && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{summary(a)}</p>}
      {text && <ClaimsCheck text={text} />}
      <Why
        reason={
          a.payload.reason
            ? `${a.payload.reason}${/[.!?]$/.test(a.payload.reason) ? "" : "."} The current company records inform this proposal; review the evidence before approval.`
            : undefined
        }
      />
      {flagged && a.status === "pending" && (
        <p className="mt-2 text-xs text-warning">Resolve flagged claims before approval.</p>
      )}
      {a.status === "pending" && !readOnly ? (
        <div className={cn("mt-3 flex flex-wrap items-start gap-2", !compact && "mt-5")}>
          <div className="min-w-0 flex-1">
            <CostButton
              label="GO"
              icon={null}
              variant="default"
              cost={a.estimated_credits}
              disabled={flagged}
              onConfirm={() => decide("approved")}
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="sm:flex-none"
            onClick={() => decide("declined")}
          >
            NO-GO
          </Button>
          <Button size="sm" variant="outline" onClick={() => askWhy(a.id)} aria-label="Ask Sol why">
            Why
          </Button>
        </div>
      ) : a.status !== "pending" ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {a.status === "approved" ? "Approved" : "Declined"} by {a.decided_by} ·{" "}
          {a.decided_at && fmtDateTime(a.decided_at)}
        </p>
      ) : (
        <Pill className="mt-3">Awaiting founder</Pill>
      )}
    </article>
  );
}
