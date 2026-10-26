import { describe, expect, it } from "vitest";
import {
  attributionRows,
  embedCode,
  isWebAddress,
  marketingLabel,
  shortUrl,
  taggedUrl,
  type TrackedLink,
} from "@/lib/links";
import { demoDb } from "@/lib/demoDb";
import { demoSubmitLead } from "@/lib/demoLinks";

const link = (over: Partial<TrackedLink>): TrackedLink => ({
  id: "l1",
  company_id: "c",
  code: "ABCDEFGH",
  destination: "https://shop.example/h/shop",
  label: "Bio",
  channel: "instagram",
  medium: "social",
  campaign: "spring sale",
  content: null,
  spend_gbp: null,
  created_by_sol: false,
  archived: false,
  created_at: "2026-10-01T00:00:00Z",
  ...over,
});

describe("links", () => {
  it("tags destinations like the database does, adding the code for hub pages", () => {
    expect(taggedUrl(link({}))).toBe(
      "https://shop.example/h/shop?utm_source=instagram&utm_medium=social&utm_campaign=spring+sale&l=ABCDEFGH",
    );
    expect(taggedUrl(link({ destination: "https://shop.example/buy?x=1", campaign: "" }))).toBe(
      "https://shop.example/buy?x=1&utm_source=instagram&utm_medium=social",
    );
    expect(shortUrl("ABCDEFGH", "https://x.example/functions/v1/link/")).toBe(
      "https://x.example/functions/v1/link/ABCDEFGH",
    );
  });

  it("checks web addresses and builds the embed snippet", () => {
    expect(isWebAddress("https://a.example")).toBe(true);
    expect(isWebAddress("a.example")).toBe(false);
    expect(embedCode("https://app/f/1", 'Say "hi"')).toContain('title="Say &quot;hi&quot;"');
  });

  it("adds up clicks, leads, customers and cost per lead", () => {
    const rows = attributionRows(
      [
        link({ id: "a", spend_gbp: 30 }),
        link({ id: "b", code: "B", spend_gbp: 10 }),
        link({ id: "c", channel: "print", campaign: "fair" }),
      ],
      [
        { link_id: "a", clicks: 10, clicks_7d: 1, leads: 0 },
        { link_id: "b", clicks: 5, clicks_7d: 0, leads: 0 },
        { link_id: "c", clicks: 3, clicks_7d: 0, leads: 0 },
      ],
      [
        {
          id: "1",
          company_id: "c",
          contact_id: "x",
          link_id: "a",
          channel: "instagram",
          campaign: "spring sale",
          message: "",
          status: "new",
          created_at: "",
        },
        {
          id: "2",
          company_id: "c",
          contact_id: "y",
          link_id: "a",
          channel: "instagram",
          campaign: "spring sale",
          message: "",
          status: "won",
          created_at: "",
        },
        {
          id: "3",
          company_id: "c",
          contact_id: "z",
          link_id: null,
          channel: "direct",
          campaign: "",
          message: "",
          status: "new",
          created_at: "",
        },
      ],
      [{ id: "z", kind: "customer" }],
    );
    expect(rows[0]).toEqual({
      campaign: "spring sale",
      channel: "instagram",
      clicks: 15,
      leads: 2,
      customers: 1,
      spend_gbp: 40,
      cost_per_lead_gbp: 20,
      cost_per_lead_credits: 2000,
    });
    expect(rows.find((r) => r.channel === "direct")).toMatchObject({ leads: 1, customers: 1 });
    expect(rows.find((r) => r.channel === "print")).toMatchObject({
      clicks: 3,
      leads: 0,
      cost_per_lead_gbp: null,
    });
  });

  it("describes marketing permission", () => {
    expect(marketingLabel(undefined)).toBe("Service only");
    expect(
      marketingLabel({
        contact_id: "x",
        purpose: "marketing",
        status: "granted",
        lawful_basis: "consent",
      }),
    ).toBe("Opted in");
    expect(
      marketingLabel({
        contact_id: "x",
        purpose: "marketing",
        status: "withdrawn",
        lawful_basis: null,
      }),
    ).toBe("Opted out");
  });
});

describe("demo lead form", () => {
  const ctx = { now: new Date("2026-10-21T09:00:00Z"), uid: (p: string) => `${p}_new` };
  it("creates a contact and an attributed lead, with marketing off unless ticked", () => {
    const db = demoDb();
    const r = demoSubmitLead(
      db,
      {
        formId: "form-c5",
        name: "Jo",
        email: "Jo@Example.com",
        message: "Cake for 20?",
        marketing: false,
        linkCode: "HBflyer01",
      },
      ctx,
    );
    if ("error" in r) throw new Error(r.error);
    const contact = r.db.contacts.find((c) => c.email === "jo@example.com")!;
    expect(contact).toMatchObject({ kind: "lead", source: "form", company_id: "c5" });
    expect(r.db.leads[0]).toMatchObject({
      contact_id: contact.id,
      channel: "print",
      campaign: "wedding-fair",
    });
    expect(r.db.current_consents.find((c) => c.contact_id === contact.id)?.status).toBe(
      "not_given",
    );
    expect(r.db.emails[0]?.subject).toBe("Cake for 20?");
  });

  it("keeps an existing opt-in, rejects bad emails and ignores bots", () => {
    const db = demoDb();
    const again = demoSubmitLead(
      db,
      {
        formId: "form-c5",
        name: "Fiona",
        email: "fiona.reid@example.com",
        message: "",
        marketing: false,
      },
      ctx,
    );
    if ("error" in again) throw new Error(again.error);
    expect(again.db.current_consents.find((c) => c.contact_id === "hx4")?.status).toBe("granted");
    expect(
      demoSubmitLead(
        db,
        { formId: "form-c5", name: "X", email: "nope", message: "", marketing: false },
        ctx,
      ),
    ).toEqual({
      error: "Enter a valid email address",
    });
    const bot = demoSubmitLead(
      db,
      {
        formId: "form-c5",
        name: "B",
        email: "b@b.example",
        message: "",
        marketing: true,
        trap: "x",
      },
      ctx,
    );
    expect("db" in bot && bot.db).toBe(db);
  });
});
