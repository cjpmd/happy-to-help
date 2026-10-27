import { describe, expect, it } from "vitest";
import {
  describeStep,
  describeTrigger,
  fillTemplate,
  stepDue,
  weekKey,
  weeklySummary,
} from "@/lib/bots";
import { checkClaims } from "@/lib/workspace";

describe("bots", () => {
  it("describes triggers and steps in plain words", () => {
    expect(describeTrigger({ event: "lead_created" })).toBe("When a new lead comes in");
    expect(describeTrigger({ event: "lapsed", days: 90 })).toBe(
      "When a customer hasn't been in touch for 90 days",
    );
    expect(describeTrigger({ schedule: "weekly" })).toBe("Every Monday at 09:00");
    expect(
      describeStep({ kind: "email", after_days: 5, subject: "Hi", body: "", marketing: true }),
    ).toBe('After 5 days: email "Hi" (only to people who opted in)');
    expect(describeStep({ kind: "task", after_days: 0, title: "Call" })).toBe(
      'Straight away: a task for you, "Call"',
    );
  });

  it("fills in names and leaves anything else alone", () => {
    expect(
      fillTemplate("Hello {first_name}, from {company}. {other}", {
        name: "Ola Ade",
        company: "Harbour",
      }),
    ).toBe("Hello Ola, from Harbour. {other}");
    expect(fillTemplate("Hello {first_name}", { name: " ", company: "" })).toBe("Hello there");
  });

  it("works out due dates, weeks and the summary", () => {
    expect(stepDue("2026-01-01T10:00:00.000Z", 2)).toBe("2026-01-03T10:00:00.000Z");
    expect(weekKey(new Date("2026-01-11T23:00:00Z"))).toBe("2026-01-05");
    expect(weekKey(new Date("2026-01-12T00:00:00Z"))).toBe("2026-01-12");
    const s = weeklySummary(
      { leads: 1, customers: 0, posts: 3, replies: 2, credits: 40, approvalsWaiting: 1 },
      "Harbour Bakes",
    );
    expect(s).toBe(
      "Here's last week at Harbour Bakes.\n1 new lead, 0 new customers, 3 posts published and 2 replies sent.\nSol used 40 credits.\n1 thing still waiting for your GO.",
    );
    expect(checkClaims(s)).toEqual([]);
  });
});
