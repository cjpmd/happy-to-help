import { describe, expect, it } from "vitest";
import {
  draftPublicReply,
  reviewTriage,
  sentimentTrend,
  themesFor,
  topThemes,
} from "@/lib/listening";
import { triageMessage } from "@/lib/inbox";
import { checkClaims } from "@/lib/workspace";

describe("themes", () => {
  it("finds what feedback is about", () => {
    expect(themesFor("Lovely bread but a bit pricey, and the staff were rude")).toEqual([
      "Price and value",
      "Staff and service",
    ]);
    expect(themesFor("Thanks!")).toEqual([]);
  });

  it("ranks themes by mentions, counting the unhappy ones", () => {
    const t = topThemes([
      { at: "", text: "Delivery was late", sentiment: "negative" },
      { at: "", text: "Slow delivery", sentiment: "negative" },
      { at: "", text: "Friendly staff", sentiment: "positive" },
    ]);
    expect(t[0]).toEqual({ theme: "Delivery", count: 2, negative: 2 });
    expect(t.find((x) => x.theme === "Waiting and speed")).toEqual({
      theme: "Waiting and speed",
      count: 2,
      negative: 2,
    });
  });
});

describe("sentiment trend", () => {
  // Wednesday 21 Jan 2026; the week starts on Monday 19 Jan.
  const now = new Date("2026-01-21T12:00:00Z");
  it("buckets by week, oldest first, and ignores anything older or untriaged", () => {
    const rows = sentimentTrend(
      [
        { at: "2026-01-19T00:00:00Z", text: "", sentiment: "positive" },
        { at: "2026-01-18T23:59:00Z", text: "", sentiment: "negative" },
        { at: "2026-01-12T00:00:00Z", text: "", sentiment: "neutral" },
        { at: "2025-06-01T00:00:00Z", text: "", sentiment: "positive" },
        { at: "2026-01-20T00:00:00Z", text: "", sentiment: null },
      ],
      3,
      now,
    );
    expect(rows.map((r) => r.week)).toEqual(["2026-01-05", "2026-01-12", "2026-01-19"]);
    expect(rows[2]).toMatchObject({ positive: 1, neutral: 0, negative: 0 });
    expect(rows[1]).toMatchObject({ positive: 0, neutral: 1, negative: 1 });
    expect(rows[0]).toMatchObject({ positive: 0, neutral: 0, negative: 0 });
  });
});

describe("reviews and public replies", () => {
  it("lets the stars settle a review's category", () => {
    const words = triageMessage("Review", "It was fine I suppose");
    expect(reviewTriage(words, 1)).toMatchObject({
      category: "review_negative",
      sentiment: "negative",
    });
    expect(reviewTriage(words, 5)).toMatchObject({ category: "review_positive" });
    const legal = triageMessage("Review", "My solicitor will be in touch");
    expect(reviewTriage(legal, 5).category).toBe("legal_threat");
  });

  it("drafts short public replies that pass the claims check", () => {
    for (const category of [
      "review_positive",
      "review_negative",
      "complaint",
      "booking",
    ] as const) {
      const r = draftPublicReply({ name: "Priya Shah", category, company: "Harbour Bakes" });
      expect(r).toMatch(/– Harbour Bakes$/);
      expect(r).not.toMatch(/\n/);
      expect(checkClaims(r)).toEqual([]);
    }
    expect(
      draftPublicReply({ name: "Someone", category: "general_enquiry", company: "X" }),
    ).toMatch(/^Thank you\./);
  });
});
