// The link layer (SPEC part H), shaped like the hub_pages, forms, tracked_links, link_stats,
// leads and current_consents tables. Pure helpers, tested in src/test/links.test.ts.
import type { Contact } from "./types";

export interface HubLink {
  label: string;
  url: string;
}

export interface HubPage {
  company_id: string;
  slug: string;
  enabled: boolean;
  headline: string;
  bio: string;
  links: HubLink[];
  show_form: boolean;
  show_socials: boolean;
}

export interface LeadForm {
  id: string;
  company_id: string;
  name: string;
  intro: string;
  ask_phone: boolean;
  marketing_wording: string;
  privacy_url: string | null;
  enabled: boolean;
}

export interface TrackedLink {
  id: string;
  company_id: string;
  code: string;
  destination: string;
  label: string;
  channel: string;
  medium: string;
  campaign: string;
  content: string | null;
  spend_gbp: number | null;
  created_by_sol: boolean;
  archived: boolean;
  created_at: string;
}

export interface LinkStat {
  link_id: string;
  clicks: number;
  clicks_7d: number;
  leads: number;
}

export interface Lead {
  id: string;
  company_id: string;
  contact_id: string;
  link_id: string | null;
  channel: string;
  campaign: string;
  message: string;
  status: "new" | "contacted" | "won" | "lost";
  created_at: string;
}

/** A contact's current consent for a purpose (the current_consents view). */
export interface ConsentState {
  contact_id: string;
  purpose: "marketing" | "service";
  status: "granted" | "withdrawn" | "not_given";
  lawful_basis: string | null;
}

/** What a public hub page shows (get_hub). */
export interface PublicHub {
  slug: string;
  name: string;
  headline: string;
  bio: string;
  links: HubLink[];
  website: string | null;
  socials: Record<string, string>;
  form: PublicForm | null;
}

export interface PublicForm {
  id: string;
  name: string;
  intro: string;
  ask_phone: boolean;
  marketing_wording: string;
  privacy_url: string | null;
  company?: string;
}

export interface NewLink {
  destination: string;
  label: string;
  channel: string;
  campaign?: string;
  medium?: string;
  content?: string;
  spend_gbp?: number;
}

export interface LeadSubmission {
  formId: string;
  name: string;
  email: string;
  message: string;
  marketing: boolean;
  phone?: string;
  linkCode?: string;
  page?: string;
  trap?: string;
}

export const CHANNELS = [
  "instagram",
  "tiktok",
  "facebook",
  "linkedin",
  "x",
  "email",
  "print",
  "event",
  "website",
  "other",
] as const;

export const isWebAddress = (s: string) => /^https?:\/\/[^\s]+\.[^\s]+$/.test(s.trim());

/** The short link people share. Live: the link Edge Function; demo: the app's /l route. */
export function shortUrl(code: string, base: string) {
  return `${base.replace(/\/$/, "")}/${code}`;
}

/** The destination with its UTM tags, as the link function sends people (mirrors the SQL). */
export function taggedUrl(
  l: Pick<TrackedLink, "destination" | "channel" | "medium" | "campaign" | "content" | "code">,
) {
  const enc = (s: string) => s.replace(/ /g, "+");
  const parts = [
    `utm_source=${enc(l.channel)}`,
    `utm_medium=${enc(l.medium)}`,
    ...(l.campaign ? [`utm_campaign=${enc(l.campaign)}`] : []),
    ...(l.content ? [`utm_content=${enc(l.content)}`] : []),
    ...(/\/(h|f)\/[A-Za-z0-9-]+/.test(l.destination) ? [`l=${l.code}`] : []),
  ];
  return `${l.destination}${l.destination.includes("?") ? "&" : "?"}${parts.join("&")}`;
}

export interface AttributionRow {
  campaign: string;
  channel: string;
  clicks: number;
  leads: number;
  customers: number;
  spend_gbp: number | null;
  cost_per_lead_gbp: number | null;
  cost_per_lead_credits: number | null;
}

/**
 * Clicks → leads → customers per campaign and channel, with cost per lead where the spend is
 * known (mirrors the attribution SQL function). Leads with no link count as "direct".
 */
export function attributionRows(
  links: TrackedLink[],
  stats: LinkStat[],
  leads: Lead[],
  contacts: Pick<Contact, "id" | "kind">[],
  creditValueGbp = 0.01,
): AttributionRow[] {
  const key = (campaign: string, channel: string) => `${campaign}\u0000${channel}`;
  const rows = new Map<string, AttributionRow>();
  const row = (campaign: string, channel: string) => {
    const k = key(campaign, channel);
    let r = rows.get(k);
    if (!r) {
      r = {
        campaign,
        channel,
        clicks: 0,
        leads: 0,
        customers: 0,
        spend_gbp: null,
        cost_per_lead_gbp: null,
        cost_per_lead_credits: null,
      };
      rows.set(k, r);
    }
    return r;
  };
  for (const l of links) {
    const r = row(l.campaign, l.channel);
    r.clicks += stats.find((s) => s.link_id === l.id)?.clicks ?? 0;
    if (l.spend_gbp !== null) r.spend_gbp = (r.spend_gbp ?? 0) + l.spend_gbp;
  }
  const customer = new Set(contacts.filter((c) => c.kind === "customer").map((c) => c.id));
  for (const ld of leads) {
    const r = row(ld.campaign, ld.channel);
    r.leads++;
    if (ld.status === "won" || customer.has(ld.contact_id)) r.customers++;
  }
  for (const r of rows.values())
    if (r.spend_gbp !== null && r.leads > 0) {
      r.cost_per_lead_gbp = Math.round((r.spend_gbp / r.leads) * 100) / 100;
      r.cost_per_lead_credits = Math.ceil(r.spend_gbp / r.leads / creditValueGbp);
    }
  return [...rows.values()].sort((a, b) => b.leads - a.leads || b.clicks - a.clicks);
}

/** The iframe snippet for putting a lead form on the company's own website. */
export function embedCode(formUrl: string, name: string) {
  return `<iframe src="${formUrl}" title="${name.replace(/"/g, "&quot;")}" style="width:100%;max-width:480px;height:560px;border:0" loading="lazy"></iframe>`;
}

/** A contact's marketing permission, in words. */
export function marketingLabel(c: ConsentState | undefined) {
  if (!c || c.status === "not_given") return "Service only";
  if (c.status === "withdrawn") return "Opted out";
  return c.lawful_basis === "soft_opt_in" ? "Soft opt-in" : "Opted in";
}
