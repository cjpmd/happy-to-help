import { describe, expect, it } from "vitest";
import { contactTimeline, decideMode, draftReply, triageMessage } from "@/lib/inbox";

describe("triage", () => {
  it("reads the category, sentiment and urgency", () => {
    expect(triageMessage("Prices", "How much is a wedding cake for 80?")).toMatchObject({
      category: "pricing_question",
      urgency: "normal",
    });
    expect(triageMessage("Table", "Can I book a table for 4 on Friday?").category).toBe("booking");
    expect(triageMessage("Late", "Really disappointed, my order never arrived").category).toBe(
      "complaint",
    );
    expect(triageMessage("Thanks!", "Loved it, great service, five stars").category).toBe(
      "review_positive",
    );
    expect(triageMessage("SEO", "We offer SEO services and backlinks").category).toBe("spam");
  });

  it("raises the flags that force escalation", () => {
    expect(triageMessage("Refund", "I want my money back").flags.money).toBe(true);
    expect(triageMessage("x", "I'll be speaking to my solicitor").category).toBe("legal_threat");
    expect(
      triageMessage("x", "My son had an allergic reaction after eating your cake").flags.safety,
    ).toBe(true);
    expect(triageMessage("x", "Please delete my data under GDPR").flags.data_request).toBe(true);
    expect(triageMessage("x", "I'm really struggling at the moment").flags.vulnerable).toBe(true);
    expect(
      triageMessage("x", "Your website said it was guaranteed gluten free").flags.unverified_claim,
    ).toBe(true);
  });
});

describe("policy decision", () => {
  it("applies the hard rules before the company's policy", () => {
    expect(decideMode({ category: "refund_request", flags: {} }, "auto_send").mode).toBe(
      "escalate",
    );
    expect(decideMode({ category: "legal_threat", flags: {} }, "auto_send").mode).toBe("escalate");
    expect(decideMode({ category: "booking", flags: { safety: true } }, "auto_send")).toMatchObject(
      { mode: "escalate", reason: expect.stringMatching(/safety/) },
    );
    expect(decideMode({ category: "booking", flags: {} }, "auto_send").mode).toBe("auto_send");
    expect(decideMode({ category: "pricing_question", flags: {} }, "draft").mode).toBe("draft");
  });
});

describe("drafts and timeline", () => {
  it("drafts in the company's voice", () => {
    const d = draftReply({
      name: "Fiona Reid",
      category: "pricing_question",
      company: "Harbour Bakes",
      signOff: "Best wishes\nRory",
    });
    expect(d).toMatch(/^Hi Fiona,\n\nThanks for asking about prices/);
    expect(d.endsWith("Best wishes\nRory")).toBe(true);
  });

  it("puts everything about a contact in one timeline, newest first", () => {
    const t = contactTimeline({
      email: "Jo@Example.com",
      threads: [
        {
          address: "jo@example.com",
          subject: "Cake",
          messages: [
            { direction: "received", text: "Hi", date: "2026-10-01T10:00:00Z" },
            { direction: "sent", text: "Hello", date: "2026-10-02T10:00:00Z" },
          ],
        },
        {
          address: "other@example.com",
          subject: "x",
          messages: [{ direction: "received", text: "no", date: "2026-10-05T10:00:00Z" }],
        },
      ],
      leads: [{ message: "Cake?", channel: "print", created_at: "2026-09-30T10:00:00Z" }],
      consents: [{ status: "granted", lawful_basis: "consent", at: "2026-09-30T10:00:01Z" }],
      feedback: [],
      promises: [
        { what: "Send prices", due_date: "2026-10-03", created_at: "2026-10-02T11:00:00Z" },
      ],
      meetings: [],
    });
    expect(t.map((e) => e.kind)).toEqual(["promise", "email_out", "email_in", "consent", "lead"]);
  });
});
