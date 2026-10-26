import { useEffect, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import QRCode from "qrcode";
import { Archive, Copy, Download, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCompanyRole, useStore } from "@/lib/store";
import {
  CHANNELS,
  attributionRows,
  embedCode,
  isWebAddress,
  shortUrl,
  type HubLink,
  type Lead,
  type PublicForm,
} from "@/lib/links";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { HQCard } from "./HQCards";
import { Panel, Pill } from "./primitives";

const copy = (text: string, what: string) =>
  void navigator.clipboard
    ?.writeText(text)
    .then(() => toast.success(`${what} copied`))
    .catch(() => toast.error("Couldn't copy. Select and copy it instead."));

/** The public lead form: a separate, unticked marketing opt-in, and its words stored. */
export function LeadFormView({
  form,
  linkCode,
  page,
}: {
  form: PublicForm;
  linkCode?: string | undefined;
  page: string;
}) {
  const { submitLead } = useStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [marketing, setMarketing] = useState(false);
  const [trap, setTrap] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await submitLead({
      formId: form.id,
      name,
      email,
      message,
      marketing,
      page,
      ...(phone ? { phone } : {}),
      ...(linkCode ? { linkCode } : {}),
      ...(trap ? { trap } : {}),
    });
    setBusy(false);
    if (ok) setSent(true);
  };
  if (sent)
    return (
      <div className="rounded-card border bg-card p-5 shadow-card" role="status">
        <p className="font-medium">Thanks, {name.split(" ")[0]}. We've got your message.</p>
        <p className="mt-1 text-sm text-muted-foreground">We'll reply to {email} soon.</p>
      </div>
    );
  return (
    <form onSubmit={submit} className="space-y-3 rounded-card border bg-card p-5 shadow-card">
      <h2 className="text-lg font-semibold">{form.name}</h2>
      {form.intro && <p className="text-sm text-muted-foreground">{form.intro}</p>}
      <label className="block space-y-1 text-sm">
        <span>Name</span>
        <Input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Email</span>
        <Input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </label>
      {form.ask_phone && (
        <label className="block space-y-1 text-sm">
          <span>Phone (optional)</span>
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
          />
        </label>
      )}
      <label className="block space-y-1 text-sm">
        <span>Message</span>
        <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>
      {/* Hidden from people; bots fill it in. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
        value={trap}
        onChange={(e) => setTrap(e.target.value)}
      />
      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          checked={marketing}
          onCheckedChange={(v) => setMarketing(v === true)}
          aria-label="Marketing opt-in"
        />
        <span>{form.marketing_wording}</span>
      </label>
      <p className="text-xs text-muted-foreground">
        We'll use your details to reply to you.
        {form.privacy_url && (
          <>
            {" "}
            <a href={form.privacy_url} className="underline" target="_blank" rel="noreferrer">
              Privacy notice
            </a>
          </>
        )}
      </p>
      <Button type="submit" disabled={busy}>
        Send
      </Button>
    </form>
  );
}

const COOKIE_KEY = "gumption-cookie-choice";

/** Whether the visitor allowed analytics on public pages. Nothing else is stored before that. */
export function analyticsAllowed(): boolean {
  try {
    return localStorage.getItem(COOKIE_KEY) === "accepted";
  } catch {
    return false;
  }
}

/** Cookie consent on public pages (PECR). Only strictly necessary storage until they accept. */
export function CookieBanner() {
  const [choice, setChoice] = useState<string | null>("unknown");
  useEffect(() => {
    try {
      setChoice(localStorage.getItem(COOKIE_KEY));
    } catch {
      setChoice(null);
    }
  }, []);
  const decide = (c: "accepted" | "rejected") => {
    try {
      localStorage.setItem(COOKIE_KEY, c);
    } catch {
      // Private browsing: the choice holds for this page view only.
    }
    setChoice(c);
  };
  if (choice !== null) return null;
  return (
    <div
      role="region"
      aria-label="Cookies"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-lg rounded-card border bg-card p-4 text-sm shadow-card"
    >
      <p>
        We don't use cookies to track you. With your permission we'd count visits anonymously to see
        what's useful.
      </p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={() => decide("accepted")}>
          Allow
        </Button>
        <Button size="sm" variant="outline" onClick={() => decide("rejected")}>
          No thanks
        </Button>
      </div>
    </div>
  );
}

/** A QR code for a short link, as PNG or SVG (for print and events). */
function QrDownload({ url, name }: { url: string; name: string }) {
  const save = async (kind: "png" | "svg") => {
    const href =
      kind === "png"
        ? await QRCode.toDataURL(url, { width: 1024, margin: 2 })
        : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(await QRCode.toString(url, { type: "svg", margin: 2 }))}`;
    const a = document.createElement("a");
    a.href = href;
    a.download = `${name.replace(/[^\w-]+/g, "-").toLowerCase()}-qr.${kind}`;
    a.click();
  };
  return (
    <>
      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => void save("png")}>
        <Download className="h-3.5 w-3.5" />
        QR PNG
      </Button>
      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => void save("svg")}>
        SVG
      </Button>
    </>
  );
}

/** Grow → Links: attribution, tracked links, the hub page and the lead form. */
export function LinksPage() {
  return (
    <div className="space-y-4">
      <AttributionPanel />
      <LinksPanel />
      <div className="grid gap-4 lg:grid-cols-2">
        <HubPanel />
        <FormPanel />
      </div>
    </div>
  );
}

function useAttribution(companyId: string) {
  const { db } = useStore();
  return attributionRows(
    db.tracked_links.filter((l) => l.company_id === companyId),
    db.link_stats,
    db.leads.filter((l) => l.company_id === companyId),
    db.contacts.filter((c) => c.company_id === companyId),
  );
}

function AttributionPanel() {
  const { companyId } = useStore();
  const rows = useAttribution(companyId);
  return (
    <Panel title="What's working" bodyClassName="p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-2 font-medium">Campaign</th>
              <th className="px-4 py-2 font-medium">Channel</th>
              <th className="px-4 py-2 text-right font-medium">Clicks</th>
              <th className="px-4 py-2 text-right font-medium">Leads</th>
              <th className="px-4 py-2 text-right font-medium">Customers</th>
              <th className="px-4 py-2 text-right font-medium">Cost per lead</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.campaign}|${r.channel}`} className="border-b last:border-0">
                <td className="px-4 py-2.5">{r.campaign || "—"}</td>
                <td className="px-4 py-2.5 capitalize">{r.channel}</td>
                <td className="px-4 py-2.5 text-right tabular">{r.clicks}</td>
                <td className="px-4 py-2.5 text-right tabular">{r.leads}</td>
                <td className="px-4 py-2.5 text-right tabular">{r.customers}</td>
                <td className="px-4 py-2.5 text-right tabular">
                  {r.cost_per_lead_gbp !== null
                    ? `£${r.cost_per_lead_gbp.toFixed(2)} · ${r.cost_per_lead_credits} CR`
                    : "—"}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-muted-foreground">
                  Create a tracked link for each post, flyer or campaign to see which ones bring
                  leads and customers.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function LinksPanel() {
  const { db, companyId, createLink, updateLink, shortLinkBase } = useStore();
  const role = useCompanyRole(companyId);
  const canEdit = role === "founder" || role === "teammate";
  const links = db.tracked_links.filter((l) => l.company_id === companyId && !l.archived);
  const hub = db.hub_pages.find((h) => h.company_id === companyId);
  const hubUrl =
    hub && typeof window !== "undefined" ? `${window.location.origin}/h/${hub.slug}` : "";
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState("");
  const [label, setLabel] = useState("");
  const [channel, setChannel] = useState<string>("instagram");
  const [campaign, setCampaign] = useState("");
  const [spend, setSpend] = useState("");
  const create = async () => {
    const dest = destination.trim() || hubUrl;
    if (!isWebAddress(dest)) {
      toast.error("Enter a full web address, starting with https://");
      return;
    }
    const made = await createLink(companyId, {
      destination: dest,
      label: label.trim() || channel,
      channel,
      campaign: campaign.trim(),
      medium:
        channel === "print" || channel === "event"
          ? "qr"
          : channel === "email"
            ? "email"
            : "social",
      ...(spend ? { spend_gbp: Number(spend) } : {}),
    });
    if (made) {
      copy(shortUrl(made.code, shortLinkBase), "Short link");
      setOpen(false);
      setDestination("");
      setLabel("");
      setCampaign("");
      setSpend("");
    }
  };
  return (
    <Panel
      title="Tracked links"
      action={
        canEdit && (
          <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
            <Plus className="h-3.5 w-3.5" />
            New link
          </Button>
        )
      }
      bodyClassName="p-0"
    >
      {open && (
        <div className="grid gap-2 border-b px-4 py-3 sm:grid-cols-2">
          <Input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder={hubUrl ? `Destination (blank for your hub page)` : "https://…"}
            aria-label="Destination"
            className="sm:col-span-2"
          />
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="What is it? e.g. Wedding fair flyer"
            aria-label="Link name"
          />
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger aria-label="Channel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHANNELS.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
            placeholder="Campaign (optional)"
            aria-label="Campaign"
          />
          <Input
            value={spend}
            onChange={(e) => setSpend(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="Spent on it, £ (optional)"
            aria-label="Spend"
            inputMode="decimal"
          />
          <div className="sm:col-span-2">
            <Button size="sm" onClick={() => void create()}>
              Create and copy
            </Button>
          </div>
        </div>
      )}
      <ul>
        {links.map((l) => {
          const st = db.link_stats.find((s) => s.link_id === l.id);
          const url = shortUrl(l.code, shortLinkBase);
          return (
            <li
              key={l.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-3 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{l.label}</p>
                <p className="truncate text-xs text-muted-foreground">
                  <span className="capitalize">{l.channel}</span>
                  {l.campaign ? ` · ${l.campaign}` : ""} · {url}
                </p>
              </div>
              <span className="text-xs tabular text-muted-foreground">
                {st?.clicks ?? 0} clicks · {st?.leads ?? 0} leads
              </span>
              <div className="flex items-center">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={() => copy(url, "Short link")}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </Button>
                <QrDownload url={url} name={l.label} />
                {canEdit && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    aria-label={`Archive ${l.label}`}
                    onClick={() => void updateLink(l.id, { archived: true })}
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </li>
          );
        })}
        {!links.length && (
          <li className="p-4 text-sm text-muted-foreground">
            No links yet. Each link counts its clicks and the leads it brings.
          </li>
        )}
      </ul>
    </Panel>
  );
}

function HubPanel() {
  const { db, companyId, saveHubPage } = useStore();
  const founder = useCompanyRole(companyId) === "founder";
  const hub = db.hub_pages.find((h) => h.company_id === companyId);
  const [bio, setBio] = useState(hub?.bio ?? "");
  const [links, setLinks] = useState<HubLink[]>(hub?.links ?? []);
  if (!hub) return null;
  const url =
    typeof window !== "undefined" ? `${window.location.origin}/h/${hub.slug}` : `/h/${hub.slug}`;
  const save = async (patch: Parameters<typeof saveHubPage>[1], message: string) => {
    if (await saveHubPage(companyId, patch)) toast.success(message);
  };
  return (
    <Panel
      title="Hub page"
      action={
        <Pill tone={hub.enabled ? "success" : "neutral"}>
          {hub.enabled ? "Live" : "Not published"}
        </Pill>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">
          One link for your bio: who you are, your links and a contact form.{" "}
          {hub.enabled && (
            <a href={url} target="_blank" rel="noreferrer" className="underline">
              {url}
            </a>
          )}
        </p>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Short bio</span>
          <Textarea
            rows={2}
            value={bio}
            disabled={!founder}
            onChange={(e) => setBio(e.target.value)}
          />
        </label>
        <div className="space-y-2">
          <span className="text-xs text-muted-foreground">Links</span>
          {links.map((l, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={l.label}
                disabled={!founder}
                aria-label="Link label"
                onChange={(e) =>
                  setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                }
              />
              <Input
                value={l.url}
                disabled={!founder}
                aria-label="Link address"
                onChange={(e) =>
                  setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))
                }
              />
            </div>
          ))}
          {founder && links.length < 12 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setLinks([...links, { label: "", url: "https://" }])}
            >
              <Plus className="h-3.5 w-3.5" />
              Add a link
            </Button>
          )}
        </div>
        <label className="flex items-center justify-between gap-3">
          <span>Show the contact form</span>
          <Switch
            checked={hub.show_form}
            disabled={!founder}
            onCheckedChange={(v) => void save({ show_form: v }, "Saved")}
          />
        </label>
        {founder && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const clean = links.filter((l) => l.label.trim() || l.url.trim() !== "https://");
                if (clean.some((l) => !l.label.trim() || !isWebAddress(l.url))) {
                  toast.error("Each link needs a label and a full web address");
                  return;
                }
                void save({ bio, links: clean }, "Hub page saved");
              }}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant={hub.enabled ? "ghost" : "default"}
              onClick={() =>
                void save(
                  { enabled: !hub.enabled },
                  hub.enabled ? "Hub page taken down" : "Hub page is live",
                )
              }
            >
              {hub.enabled ? "Unpublish" : "Publish"}
            </Button>
          </div>
        )}
      </div>
    </Panel>
  );
}

function FormPanel() {
  const { db, companyId, saveForm } = useStore();
  const founder = useCompanyRole(companyId) === "founder";
  const form = db.forms.find((f) => f.company_id === companyId);
  const [wording, setWording] = useState(form?.marketing_wording ?? "");
  const [privacy, setPrivacy] = useState(form?.privacy_url ?? "");
  if (!form) return null;
  const url =
    typeof window !== "undefined" ? `${window.location.origin}/f/${form.id}` : `/f/${form.id}`;
  return (
    <Panel title="Lead form">
      <div className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">
          On your hub page, and on your own website with the embed code. Every submission becomes a
          contact and a lead, with the marketing choice and its exact wording kept.
        </p>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">
            Marketing opt-in wording (always unticked)
          </span>
          <Textarea
            rows={2}
            value={wording}
            disabled={!founder}
            onChange={(e) => setWording(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Privacy notice link</span>
          <Input
            value={privacy}
            disabled={!founder}
            placeholder="https://…"
            onChange={(e) => setPrivacy(e.target.value)}
          />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span>Ask for a phone number</span>
          <Switch
            checked={form.ask_phone}
            disabled={!founder}
            onCheckedChange={(v) => void saveForm(form.id, { ask_phone: v })}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {founder && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (privacy && !isWebAddress(privacy)) {
                  toast.error("The privacy link must be a full web address");
                  return;
                }
                void saveForm(form.id, {
                  marketing_wording: wording,
                  privacy_url: privacy || null,
                }).then((ok) => ok && toast.success("Form saved"));
              }}
            >
              Save
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => copy(embedCode(url, form.name), "Embed code")}
          >
            <Copy className="h-3.5 w-3.5" />
            Copy embed code
          </Button>
        </div>
      </div>
    </Panel>
  );
}

/** HQ "Campaigns" card for trading businesses: clicks → leads → customers. */
export function AttributionCard({ companyId }: { companyId: string }) {
  const rows = useAttribution(companyId);
  const total = rows.reduce(
    (t, r) => ({
      clicks: t.clicks + r.clicks,
      leads: t.leads + r.leads,
      customers: t.customers + r.customers,
    }),
    { clicks: 0, leads: 0, customers: 0 },
  );
  return (
    <HQCard
      title="Campaigns"
      meta={
        <span className="label-caps text-[11px] text-muted-foreground tabular">
          {total.clicks} → {total.leads} → {total.customers}
        </span>
      }
    >
      {rows.length === 0 ? (
        <p className="text-muted-foreground">Tracked links show which campaigns bring leads.</p>
      ) : (
        <dl className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-[7px]">
          {rows.slice(0, 4).map((r, i) => (
            <div
              key={`${r.campaign}|${r.channel}`}
              className={cn("contents", i >= 2 && "shorter:hidden")}
            >
              <dt className="truncate">
                {r.campaign || r.channel}{" "}
                <span className="text-muted-foreground capitalize">· {r.channel}</span>
              </dt>
              <dd className="text-xs text-muted-foreground tabular">
                {r.clicks} clicks · {r.leads} leads
              </dd>
            </div>
          ))}
        </dl>
      )}
      <Link
        to="/grow"
        search={{ tab: "links" }}
        className="label-caps self-start text-[11px] hover:opacity-80"
      >
        Clicks → leads → customers
      </Link>
    </HQCard>
  );
}

/** Customers → Leads: every form lead with where it came from. */
export function LeadsList() {
  const { db, companyId, setLeadStatus } = useStore();
  const role = useCompanyRole(companyId);
  const canEdit = role === "founder" || role === "teammate";
  const leads = db.leads.filter((l) => l.company_id === companyId);
  const links = new Map(db.tracked_links.map((l) => [l.id, l.label]));
  return (
    <Panel title="Leads" bodyClassName="p-0">
      <ul>
        {leads.map((l) => {
          const c = db.contacts.find((x) => x.id === l.contact_id);
          return (
            <li
              key={l.id}
              className="flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c?.name ?? "Someone"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {fmtDate(l.created_at)} ·{" "}
                  {l.link_id ? (links.get(l.link_id) ?? l.channel) : "Direct"}
                  {l.campaign ? ` · ${l.campaign}` : ""}
                  {l.message ? ` · ${l.message}` : ""}
                </p>
              </div>
              {canEdit ? (
                <Select
                  value={l.status}
                  onValueChange={(v) => void setLeadStatus(l.id, v as Lead["status"])}
                >
                  <SelectTrigger className="h-8 w-32" aria-label={`Status of ${c?.name ?? "lead"}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="contacted">Contacted</SelectItem>
                    <SelectItem value="won">Won</SelectItem>
                    <SelectItem value="lost">Lost</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Pill>{l.status}</Pill>
              )}
            </li>
          );
        })}
        {!leads.length && (
          <li className="p-4 text-sm text-muted-foreground">
            Leads from your hub page and website form appear here, with where they came from.
          </li>
        )}
      </ul>
    </Panel>
  );
}
