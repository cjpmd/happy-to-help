import { describe, expect, it } from "vitest";
import { evidencePlanFor, investorUpdate, missingDeadlines, ukDeadlines } from "@/lib/skills";

describe("UK compliance calendar", () => {
  const d = ukDeadlines("2026-02-10", "2026-10-27", { emailMarketing: true });
  const due = (t: string) => d.find((x) => x.title.startsWith(t))?.due_date;
  it("dates the main statutory deadlines from incorporation", () => {
    expect(due("Confirmation statement")).toBe("2027-02-10");
    expect(due("Annual accounts")).toBe("2027-11-10"); // first accounts: 21 months
    expect(due("Corporation Tax payment")).toBe("2027-11-11"); // 9 months and a day after year end
    expect(due("Corporation Tax return")).toBe("2028-02-10");
    expect(due("ICO data protection fee")).toBe("2027-02-10");
    expect(due("Check marketing consents")).toBe("2027-01-01");
    expect(d.filter((x) => x.statutory)).toHaveLength(5);
  });
  it("doesn't add what's already in the calendar", () => {
    const missing = missingDeadlines(d, [
      { title: "ICO data protection fee", due_date: "2027-02-10" },
    ]);
    expect(missing.some((m) => m.title === "ICO data protection fee")).toBe(false);
    expect(missing).toHaveLength(d.length - 1);
  });
});

describe("evidence plan", () => {
  it("turns an idea into three testable assumptions and a smoke test", () => {
    const p = evidencePlanFor("A revision app for S5 maths.", "S5 students");
    expect(p.assumptions).toHaveLength(3);
    expect(p.assumptions[0]!.title).toContain("S5 students");
    expect(p.assumptions.every((a) => a.test && a.pass)).toBe(true);
    expect(p.smokeTest).toMatch(/before building anything/);
  });
});

describe("investor update", () => {
  it("leads with the numbers and growth", () => {
    const text = investorUpdate({
      company: "StudyBuddy",
      month: "October 2026",
      visitors: 1200,
      signups: 140,
      mrr: 1150,
      previousMrr: 1000,
      wins: ["First school pilot signed"],
      stage: "build",
      asks: [],
    });
    expect(text).toContain("# StudyBuddy: October 2026 update");
    expect(text).toContain("£1,150 (+15% on last month)");
    expect(text).toContain("- First school pilot signed");
  });
});
