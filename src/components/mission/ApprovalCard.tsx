import { useState } from "react";
import { Megaphone, Mail, PoundSterling, FileText, Globe, Mic, Brain } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useStore, labelFor, useClaimsCheck, useCompanyRole, personName } from "@/lib/store";
import { approvalText, type Approval } from "@/lib/types";
import { fmtDateTime, num } from "@/lib/format";
import { Pill, StatusPill } from "./primitives";
import { ClaimsCheck, Why, CostButton } from "./WorkControls";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const icons = {
  publish_post: Megaphone,
  send_email: Mail,
  ad_spend: PoundSterling,
  file_document: FileText,
  publish_site: Globe,
  update_voice: Mic,
  update_memory: Brain,
};
const titles = {
  publish_post: "Publish a post",
  send_email: "Send an email",
  ad_spend: "Spend on ads",
  file_document: "File a document",
  publish_site: "Publish site change",
  update_voice: "Adopt a new brand voice",
  update_memory: "Remember this",
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
    case "update_voice":
      return (
        <div className="space-y-1.5">
          {row("Version", `v${a.payload.version}`)}
          {row("Voice", a.payload.summary)}
          {a.payload.changes && row("Changes", a.payload.changes)}
        </div>
      );
    case "update_memory":
      return (
        <p className="rounded-tile bg-soft p-3 text-sm leading-relaxed shadow-tile">
          {a.payload.fact}
        </p>
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
    case "update_voice":
      return a.payload.summary;
    case "update_memory":
      return a.payload.fact;
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
  const { db, decideApproval, askWhy } = useStore();
  const role = useCompanyRole(a.company_id);
  const text = approvalText(a);
  const flagged = useClaimsCheck(a.company_id)(text).length > 0;
  const editable =
    a.status === "pending" &&
    !readOnly &&
    role !== "viewer" &&
    (a.action_type === "publish_post" || a.action_type === "send_email");
  const [editing, setEditing] = useState(false);
  const Icon = icons[a.action_type];
  // The toast only follows a decision that really happened (bug B1).
  const decide = async (s: "approved" | "declined") => {
    if (!(await decideApproval(a.id, s))) return;
    toast.success(
      s === "approved" ? "GO given. Sol will carry it out." : "NO-GO. Sol won't proceed.",
      {
        description: labelFor(a),
      },
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
      {editing ? (
        <DraftEditor a={a} onDone={() => setEditing(false)} />
      ) : (
        text && <ClaimsCheck text={text} companyId={a.company_id} />
      )}
      <Why
        reason={
          a.payload.reason
            ? `${a.payload.reason}${/[.!?]$/.test(a.payload.reason) ? "" : "."} The current company records inform this proposal; review the evidence before approval.`
            : undefined
        }
      />
      {flagged && a.status === "pending" && !editing && (
        <p className="mt-2 text-xs text-warning">
          Resolve flagged claims before approval{editable ? ": edit the wording." : "."}
        </p>
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
          {editable && !editing && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => void askWhy(a.id)}
            aria-label="Ask Sol why"
          >
            Why
          </Button>
        </div>
      ) : a.status !== "pending" ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {a.status === "approved" ? "Approved" : "Declined"} by {personName(db, a.decided_by)} ·{" "}
          {a.decided_at && fmtDateTime(a.decided_at)}
          {a.decision_note && ` · “${a.decision_note}”`}
          <ExecutionNote a={a} />
        </p>
      ) : (
        <Pill className="mt-3">Awaiting founder</Pill>
      )}
    </article>
  );
}

/** Rewords a pending draft. Only the public text can change; recipients and channels can't. */
function DraftEditor({ a, onDone }: { a: Approval; onDone: () => void }) {
  const { editApproval } = useStore();
  const [subject, setSubject] = useState(a.action_type === "send_email" ? a.payload.subject : "");
  const [body, setBody] = useState(
    a.action_type === "send_email"
      ? a.payload.body
      : a.action_type === "publish_post"
        ? a.payload.text
        : "",
  );
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const ok = await editApproval(
      a.id,
      a.action_type === "send_email" ? { subject, body } : { text: body },
    );
    setSaving(false);
    if (ok) {
      toast.success("Draft updated. The claims check has run again.");
      onDone();
    }
  };
  return (
    <div className="mt-3 space-y-2">
      {a.action_type === "send_email" && (
        <Input aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      )}
      <Textarea
        aria-label={a.action_type === "send_email" ? "Email body" : "Post text"}
        value={body}
        rows={5}
        onChange={(e) => setBody(e.target.value)}
      />
      <ClaimsCheck
        text={a.action_type === "send_email" ? `${subject}\n${body}` : body}
        companyId={a.company_id}
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void save()} disabled={saving || !body.trim()}>
          Save draft
        </Button>
        <Button size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** What happened after GO: queued for the executor, carried out, blocked by a rule, or failed. */
function ExecutionNote({ a }: { a: Approval }) {
  if (a.status !== "approved" || !a.execution_status || a.execution_status === "not_started")
    return null;
  switch (a.execution_status) {
    case "queued":
    case "executing":
      return <span className="block">Sol is carrying it out…</span>;
    case "done":
      return (
        <span className="block text-go">
          Carried out{a.executed_at ? ` · ${fmtDateTime(a.executed_at)}` : ""}
        </span>
      );
    case "blocked":
      return <span className="block text-hold">Not carried out: {a.execution_error}</span>;
    case "failed":
      return (
        <span className="block text-destructive">
          Couldn't be carried out: {a.execution_error}. Nothing was charged.
        </span>
      );
  }
}
