import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { RouteTabs } from "@/components/mission/RouteTabs";
import { VoiceAndPolicy } from "@/components/mission/VoicePolicy";
import { LeadsList } from "@/components/mission/LinkLayer";
import { marketingLabel } from "@/lib/links";
import { PageHeader, Panel, Pill, humanise } from "@/components/mission/primitives";
import { ContactTimeline } from "@/components/mission/ContactTimeline";
import { FeedbackPage } from "@/components/mission/Listening";
import { Checkbox } from "@/components/ui/checkbox";
import type { InboxItem } from "@/lib/storeContext";
import { Button } from "@/components/ui/button";
import { useCompanyRole, useEstimate, useStore } from "@/lib/store";
import { shortDuration } from "@/lib/hq";
import { parseContactsCsv } from "@/lib/voice";
import { fmtDate } from "@/lib/format";
import { pageHead } from "@/lib/seo";

type CustomersTab = "inbox" | "leads" | "contacts" | "feedback" | "voice";
const TABS: CustomersTab[] = ["inbox", "leads", "contacts", "feedback", "voice"];

export const Route = createFileRoute("/_app/customers")({
  head: () =>
    pageHead("Customers", "Your inbox, contacts, customer feedback and brand voice in one place."),
  // ?tab=leads|contacts|feedback|voice; the inbox has no param.
  validateSearch: (search: Record<string, unknown>): { tab?: Exclude<CustomersTab, "inbox"> } =>
    search["tab"] === "leads" ||
    search["tab"] === "contacts" ||
    search["tab"] === "feedback" ||
    search["tab"] === "voice"
      ? { tab: search["tab"] }
      : {},
  component: Customers,
});

function Customers() {
  const { tab = "inbox" } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <div>
      <PageHeader
        title="Customers"
        description="Everyone who's been in touch: messages, contacts and what they think."
      />
      <RouteTabs<CustomersTab>
        label="Customers"
        value={TABS.includes(tab) ? tab : "inbox"}
        onValueChange={(t) =>
          void navigate({ search: t === "inbox" ? {} : { tab: t }, replace: true })
        }
        tabs={[
          { value: "inbox", label: "Inbox", content: <Inbox /> },
          { value: "leads", label: "Leads", content: <LeadsList /> },
          { value: "contacts", label: "Contacts", content: <Contacts /> },
          { value: "feedback", label: "Feedback", content: <FeedbackPage /> },
          { value: "voice", label: "Voice & policy", content: <VoiceAndPolicy /> },
        ]}
      />
    </div>
  );
}

const STATUS: Record<
  InboxItem["status"],
  { label: string; tone: "neutral" | "info" | "warning" | "success" | "destructive" }
> = {
  new: { label: "New", tone: "info" },
  waiting_for_budget: { label: "Waiting for budget", tone: "neutral" },
  triaging: { label: "Sol is reading", tone: "info" },
  drafting: { label: "Sol is drafting", tone: "info" },
  awaiting_approval: { label: "Reply waiting for GO", tone: "warning" },
  sent: { label: "Replied", tone: "success" },
  escalated: { label: "Needs you", tone: "destructive" },
  spam: { label: "Spam", tone: "neutral" },
  closed: { label: "Closed", tone: "neutral" },
};
const OPEN: InboxItem["status"][] = [
  "new",
  "waiting_for_budget",
  "triaging",
  "drafting",
  "awaiting_approval",
  "escalated",
];

function Inbox() {
  const { db, companyId, now, processInboxItem, closeInboxItem } = useStore();
  const role = useCompanyRole(companyId);
  const canEdit = role === "founder" || role === "teammate";
  const cost = useEstimate("email");
  const [showAll, setShowAll] = useState(false);
  const items = db.inbox_items
    .filter((i) => i.company_id === companyId && (showAll || OPEN.includes(i.status)))
    .sort((a, b) => {
      // Escalations first, then the oldest waiting.
      const pa = a.status === "escalated" ? 0 : 1;
      const pb = b.status === "escalated" ? 0 : 1;
      return pa - pb || a.created_at.localeCompare(b.created_at);
    });
  const settings = db.response_settings.find((s) => s.company_id === companyId);
  return (
    <Panel
      title="Inbox"
      action={
        <button
          type="button"
          className="text-xs text-muted-foreground underline"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? "Open only" : "Show all"}
        </button>
      }
      bodyClassName="p-0"
    >
      <p className="px-4 pb-1 text-xs text-muted-foreground">
        {settings?.inbox_daily_cap
          ? `Sol reads new messages as they arrive, up to ${settings.inbox_daily_cap} credits a day.`
          : "Sol reads messages when you ask. Set a daily budget in Voice & policy to have it reply as they arrive."}
      </p>
      <ul>
        {items.map((i) => {
          const t = db.emails.find((x) => x.id === i.thread_id);
          const last = t?.messages.filter((m) => m.direction === "received").pop();
          const hours = last ? (now.getTime() - new Date(last.date).getTime()) / 3_600_000 : 0;
          return (
            <li key={i.id} className="border-t px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {t?.name || t?.address || "Someone"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{t?.subject}</p>
                </div>
                <Pill tone={STATUS[i.status].tone}>{STATUS[i.status].label}</Pill>
                {OPEN.includes(i.status) && (
                  <Pill tone={hours >= 24 ? "warning" : "neutral"}>{shortDuration(hours)}</Pill>
                )}
              </div>
              {i.category && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {humanise(i.category)}
                  {i.urgency === "high" ? " · urgent" : ""}
                  {i.sentiment === "negative" ? " · unhappy" : ""}
                  {Object.keys(i.flags).length
                    ? ` · ${Object.keys(i.flags).map(humanise).join(", ")}`
                    : ""}
                  {i.reason ? ` · ${i.reason}` : ""}
                </p>
              )}
              {last && <p className="mt-1 line-clamp-2 text-sm">{last.text}</p>}
              {canEdit && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(i.status === "new" || i.status === "waiting_for_budget") && (
                    <Button size="sm" variant="outline" onClick={() => void processInboxItem(i.id)}>
                      Let Sol handle it · ≈ {cost} CR
                    </Button>
                  )}
                  {i.status === "awaiting_approval" && (
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/approvals">Review the reply</Link>
                    </Button>
                  )}
                  {OPEN.includes(i.status) && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => void closeInboxItem(i.id)}>
                        Close
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void closeInboxItem(i.id, "spam")}
                      >
                        Spam
                      </Button>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {!items.length && (
          <li className="border-t p-4 text-sm text-muted-foreground">
            Nothing waiting. Emails, form submissions and messages from your hub page land here,
            with Sol's draft replies for you to approve.
          </li>
        )}
      </ul>
    </Panel>
  );
}

function Contacts() {
  const { db, companyId, importContacts } = useStore();
  const role = useCompanyRole(companyId);
  const canEdit = role === "founder" || role === "teammate";
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [softOptIn, setSoftOptIn] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const people = db.contacts
    .filter((c) => c.company_id === companyId)
    .sort((a, b) => b.last.localeCompare(a.last));

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    const { rows, skipped } = parseContactsCsv(await f.text());
    if (!rows.length) {
      setBusy(false);
      toast.error("No contacts found. The CSV needs an email column.");
      return;
    }
    const r = await importContacts(companyId, rows, softOptIn);
    setBusy(false);
    if (r)
      toast.success(
        `Imported ${r.added} ${r.added === 1 ? "contact" : "contacts"}${skipped ? `; skipped ${skipped} rows without a valid email` : ""}.`,
        r.service_only
          ? {
              description: `${r.service_only} have no recorded marketing permission, so they'll only get service messages. There's a task in Stay legal.`,
            }
          : undefined,
      );
    if (file.current) file.current.value = "";
  };

  return (
    <Panel
      title="Contacts"
      action={
        canEdit && (
          <>
            <input
              ref={file}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              aria-label="Contacts CSV"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => file.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              Import CSV
            </Button>
            <label
              className="ml-2 flex items-center gap-1.5 text-xs text-muted-foreground"
              title="PECR soft opt-in: they bought from you, it's about similar products, and they could opt out when you took their details and in every message."
            >
              <Checkbox
                checked={softOptIn}
                onCheckedChange={(v) => setSoftOptIn(v === true)}
                aria-label="Soft opt-in applies to existing customers"
              />
              Soft opt-in applies to customers
            </label>
          </>
        )
      }
      bodyClassName="p-0"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Value</th>
              <th className="px-4 py-2 font-medium">Source</th>
              <th className="px-4 py-2 font-medium">Marketing</th>
              <th className="px-4 py-2 font-medium">Last contact</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    className="text-left hover:underline"
                    onClick={() => setOpen(p.id)}
                  >
                    {p.name}
                  </button>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{p.email}</td>
                <td className="px-4 py-3">
                  <Pill tone={p.kind === "customer" ? "success" : "info"}>
                    {p.kind === "customer" ? "Customer" : "Lead"}
                  </Pill>
                </td>
                <td className="px-4 py-3">{p.value}</td>
                <td className="px-4 py-3 capitalize text-muted-foreground">
                  {p.source ?? "manual"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {marketingLabel(
                    db.current_consents.find(
                      (c) => c.contact_id === p.id && c.purpose === "marketing",
                    ),
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{fmtDate(p.last)}</td>
              </tr>
            ))}
            {!people.length && (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-muted-foreground">
                  No contacts yet. Import a CSV with name and email columns to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ContactTimeline contactId={open} onClose={() => setOpen(null)} />
    </Panel>
  );
}
