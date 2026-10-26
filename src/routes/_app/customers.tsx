import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { RouteTabs } from "@/components/mission/RouteTabs";
import { VoiceAndPolicy } from "@/components/mission/VoicePolicy";
import { LeadsList } from "@/components/mission/LinkLayer";
import { marketingLabel } from "@/lib/links";
import { PageHeader, Panel, Pill } from "@/components/mission/primitives";
import { Button } from "@/components/ui/button";
import { useCompanyRole, useStore } from "@/lib/store";
import { inboxSummary, shortDuration } from "@/lib/hq";
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
          { value: "feedback", label: "Feedback", content: <Feedback /> },
          { value: "voice", label: "Voice & policy", content: <VoiceAndPolicy /> },
        ]}
      />
    </div>
  );
}

function Inbox() {
  const { db, companyId, now } = useStore();
  const { waiting, total } = inboxSummary(db.emails, companyId, now);
  return (
    <Panel
      title="Waiting for a reply"
      action={<span className="text-xs text-muted-foreground">{total} conversations</span>}
      bodyClassName="p-0"
    >
      <ul>
        {waiting.map((t) => (
          <li key={t.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{t.name}</p>
              <p className="truncate text-xs text-muted-foreground">{t.subject}</p>
            </div>
            <Pill tone={t.hours >= 24 ? "warning" : "neutral"}>{shortDuration(t.hours)}</Pill>
          </li>
        ))}
        {!waiting.length && (
          <li className="p-4 text-sm text-muted-foreground">
            Nothing waiting. Emails, form submissions and messages from your hub page will land
            here, with Sol's draft replies for you to approve.
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
    const added = await importContacts(companyId, rows);
    setBusy(false);
    if (added !== null)
      toast.success(
        `Imported ${added} ${added === 1 ? "contact" : "contacts"}${skipped ? `; skipped ${skipped} rows without a valid email` : ""}.`,
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
                <td className="px-4 py-3 font-medium">{p.name}</td>
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
    </Panel>
  );
}

function Feedback() {
  return (
    <Panel title="Feedback">
      <p className="text-sm text-muted-foreground">
        When customers reply to a feedback request or leave a review, Sol sums up the themes and how
        people feel here, and in your morning brief.
      </p>
    </Panel>
  );
}
