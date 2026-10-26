// The demo's link layer: seed data like supabase/seed.sql, and a form submission with the same
// rules as submit_lead. Pure; tested in src/test/links.test.ts.
import type { Company } from "./types";
import type { DB } from "./storeContext";
import type { HubPage, LeadForm, LeadSubmission, TrackedLink } from "./links";

const DEFAULT_WORDING =
  "Send me occasional news and offers by email. I can unsubscribe at any time.";

export function demoLinkData(companies: Company[], now: Date) {
  const ago = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
  const hub_pages: HubPage[] = companies.map((c) => ({
    company_id: c.id,
    slug: c.slug,
    enabled: c.id === "c5",
    headline: c.name,
    bio:
      c.id === "c5"
        ? "Sourdough, pastries and celebration cakes, baked every morning by the harbour in Taybridge."
        : c.description,
    links:
      c.id === "c5"
        ? [
            { label: "Order for Saturday collection", url: "https://harbourbakes.example/order" },
            { label: "Celebration cakes", url: "https://harbourbakes.example/cakes" },
          ]
        : [],
    show_form: true,
    show_socials: true,
  }));
  const forms: LeadForm[] = companies.map((c) => ({
    id: `form-${c.id}`,
    company_id: c.id,
    name: "Get in touch",
    intro: "",
    ask_phone: false,
    marketing_wording: DEFAULT_WORDING,
    privacy_url: null,
    enabled: true,
  }));
  const link = (
    id: string,
    code: string,
    label: string,
    channel: string,
    medium: string,
    campaign: string,
    destination: string,
    spend: number | null,
    h: number,
  ): TrackedLink => ({
    id,
    company_id: "c5",
    code,
    destination,
    label,
    channel,
    medium,
    campaign,
    content: null,
    spend_gbp: spend,
    created_by_sol: false,
    archived: false,
    created_at: ago(h),
  });
  const tracked_links = [
    link(
      "lk1",
      "HBinsta01",
      "Instagram bio",
      "instagram",
      "social",
      "always-on",
      "/h/harbour-bakes",
      null,
      480,
    ),
    link(
      "lk2",
      "HBflyer01",
      "Wedding fair flyer",
      "print",
      "qr",
      "wedding-fair",
      "/h/harbour-bakes",
      45,
      288,
    ),
    link(
      "lk3",
      "HBtiktok1",
      "Croissant video",
      "tiktok",
      "social",
      "always-on",
      "https://harbourbakes.example/order",
      null,
      144,
    ),
  ];
  const link_stats = [
    { link_id: "lk1", clicks: 140, clicks_7d: 41, leads: 2 },
    { link_id: "lk2", clicks: 38, clicks_7d: 12, leads: 1 },
    { link_id: "lk3", clicks: 90, clicks_7d: 90, leads: 0 },
  ];
  const leads = (
    [
      [
        "ld1",
        "hx4",
        "lk2",
        "print",
        "wedding-fair",
        "Three-tier cake for 80 guests in June.",
        "new",
        5,
      ],
      [
        "ld2",
        "hx5",
        "lk1",
        "instagram",
        "always-on",
        "Pastries for 25 on Friday.",
        "contacted",
        20,
      ],
      ["ld3", "hx2", "lk1", "instagram", "always-on", "Do you deliver on Saturdays?", "won", 360],
    ] as const
  ).map(([id, contact_id, link_id, channel, campaign, message, status, h]) => ({
    id,
    company_id: "c5",
    contact_id,
    link_id,
    channel,
    campaign,
    message,
    status,
    created_at: ago(h),
  }));
  const current_consents = [
    {
      contact_id: "hx4",
      purpose: "marketing" as const,
      status: "granted" as const,
      lawful_basis: "consent",
    },
  ];
  return { hub_pages, forms, tracked_links, link_stats, leads, current_consents };
}

/** A form submission in the demo: the same checks and records as submit_lead. */
export function demoSubmitLead(
  db: DB,
  s: LeadSubmission,
  ctx: { now: Date; uid: (p: string) => string },
): { db: DB } | { error: string } {
  const form = db.forms.find((f) => f.id === s.formId && f.enabled);
  if (!form) return { error: "This form isn't taking enquiries" };
  if (s.trap) return { db };
  const email = s.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address" };
  if (!s.name.trim()) return { error: "Enter your name" };
  const at = ctx.now.toISOString();
  const cid = form.company_id;
  const link = s.linkCode
    ? db.tracked_links.find((l) => l.code === s.linkCode && l.company_id === cid)
    : undefined;
  const existing = db.contacts.find((c) => c.company_id === cid && c.email.toLowerCase() === email);
  const contactId = existing?.id ?? ctx.uid("x");
  const current = db.current_consents.find(
    (c) => c.contact_id === contactId && c.purpose === "marketing",
  );
  const marketing =
    s.marketing || current?.status !== "granted"
      ? [
          {
            contact_id: contactId,
            purpose: "marketing" as const,
            status: s.marketing ? ("granted" as const) : ("not_given" as const),
            lawful_basis: s.marketing ? "consent" : null,
          },
        ]
      : [];
  return {
    db: {
      ...db,
      contacts: existing
        ? db.contacts.map((c) => (c.id === contactId ? { ...c, last: at } : c))
        : [
            ...db.contacts,
            {
              id: contactId,
              company_id: cid,
              name: s.name.trim(),
              email,
              kind: "lead",
              value: s.message.trim().slice(0, 120) || form.name,
              last: at,
              source: "form",
            },
          ],
      current_consents: [
        ...db.current_consents.filter(
          (c) => !(c.contact_id === contactId && marketing.some((m) => m.purpose === c.purpose)),
        ),
        ...marketing,
      ],
      leads: [
        {
          id: ctx.uid("ld"),
          company_id: cid,
          contact_id: contactId,
          link_id: link?.id ?? null,
          channel: link?.channel ?? "direct",
          campaign: link?.campaign ?? "",
          message: s.message,
          status: "new",
          created_at: at,
        },
        ...db.leads,
      ],
      link_stats: link
        ? db.link_stats.map((x) => (x.link_id === link.id ? { ...x, leads: x.leads + 1 } : x))
        : db.link_stats,
      emails: [
        {
          id: ctx.uid("email"),
          company_id: cid,
          subject:
            s.message.split("\n")[0]?.trim().slice(0, 120) || `New enquiry from ${form.name}`,
          name: s.name.trim(),
          address: email,
          mode: "support",
          messages: [{ direction: "received", text: s.message.trim() || "(No message)", date: at }],
        },
        ...db.emails,
      ],
    },
  };
}
