import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useStore } from "@/lib/store";
import { contactTimeline, type TimelineEvent } from "@/lib/inbox";
import { marketingLabel } from "@/lib/links";
import { fmtDateTime } from "@/lib/format";
import { Pill } from "./primitives";

const KIND: Record<TimelineEvent["kind"], string> = {
  email_in: "From them",
  email_out: "To them",
  lead: "Lead",
  consent: "Consent",
  feedback: "Feedback",
  promise: "Promise",
  meeting: "Meeting",
};

/** Everything about one contact: messages, leads, consent, promises and meetings (Phase 14). */
export function ContactTimeline({
  contactId,
  onClose,
}: {
  contactId: string | null;
  onClose: () => void;
}) {
  const { db } = useStore();
  const c = db.contacts.find((x) => x.id === contactId);
  const events = c
    ? contactTimeline({
        email: c.email,
        threads: db.emails.filter((t) => t.company_id === c.company_id),
        leads: db.leads.filter((l) => l.contact_id === c.id),
        consents: [],
        feedback: [],
        promises: db.commitments
          .filter((p) => p.contact_id === c.id)
          .map((p) => ({ what: p.what, due_date: p.due_date, created_at: p.created_at })),
        meetings: db.extracted_items
          .filter((i) => i.contact_id === c.id && i.status === "accepted")
          .map((i) => ({
            text: i.text,
            at: db.captures.find((x) => x.id === i.capture_id)?.created_at ?? "",
          })),
      })
    : [];
  const marketing =
    c && db.current_consents.find((x) => x.contact_id === c.id && x.purpose === "marketing");
  return (
    <Sheet open={!!c} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetTitle>{c?.name}</SheetTitle>
        <SheetDescription>
          {c?.email} · {c?.kind === "customer" ? "Customer" : "Lead"} · Marketing:{" "}
          {marketingLabel(marketing)}
        </SheetDescription>
        <ol className="mt-4 space-y-3">
          {events.map((e, i) => (
            <li key={i} className="border-l-2 pl-3">
              <div className="flex items-center gap-2">
                <Pill tone={e.kind === "email_in" ? "info" : "neutral"}>{KIND[e.kind]}</Pill>
                {e.at && <span className="text-xs text-muted-foreground">{fmtDateTime(e.at)}</span>}
              </div>
              <p className="mt-1 whitespace-pre-line text-sm">{e.text}</p>
            </li>
          ))}
          {!events.length && <li className="text-sm text-muted-foreground">Nothing yet.</li>}
        </ol>
      </SheetContent>
    </Sheet>
  );
}
