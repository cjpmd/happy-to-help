import { describe, expect, it } from "vitest";
import {
  evidenceSummary,
  inboxSummary,
  leadsSummary,
  responseTimes,
  shortDuration,
} from "@/lib/hq";
import { dashboardCards, isLayout, layoutFor, defaultLayout } from "@/lib/workspace";
import type { EmailThread } from "@/lib/workspace";

const now = new Date("2026-10-21T12:00:00Z");
const h = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();
const thread = (
  id: string,
  msgs: [EmailThread["messages"][number]["direction"], number][],
): EmailThread => ({
  id,
  company_id: "c",
  subject: id,
  name: id,
  address: `${id}@example.com`,
  mode: "support",
  messages: msgs.map(([direction, hoursAgo]) => ({ direction, text: "x", date: h(hoursAgo) })),
});

describe("stage-aware dashboards", () => {
  it("starts Keep going companies on leads, inbox, response times and campaigns", () => {
    expect(dashboardCards({ entry_path: "keep_going", stage: "grow" })).toEqual([
      "GO / NO-GO",
      "Leads",
      "Inbox",
      "Response times",
      "Campaigns",
      "Telemetry",
    ]);
  });
  it("shows the evidence while a Start up company proves demand, then the vehicle", () => {
    expect(dashboardCards({ entry_path: "start_up", stage: "evidence" })).toContain("Evidence");
    expect(dashboardCards({ entry_path: "start_up", stage: "build" })).toContain("Vehicle");
    expect(dashboardCards({ entry_path: "start_up", stage: "build" })).not.toContain("Evidence");
  });
  it("keeps a saved layout only if it has this dashboard's cards", () => {
    const keepGoing = { entry_path: "keep_going" as const, stage: "grow" as const };
    const saved = [...defaultLayout(keepGoing)].reverse();
    expect(layoutFor(saved, keepGoing)).toEqual(saved);
    expect(layoutFor(saved, { entry_path: "start_up", stage: "build" })).toEqual(
      defaultLayout({ entry_path: "start_up", stage: "build" }),
    );
    expect(isLayout(saved)).toBe(true);
    expect(isLayout([{ id: "Nope", visible: true }])).toBe(false);
  });
});

describe("Keep going cards", () => {
  const emails = [
    thread("waiting-long", [["received", 30]]),
    thread("waiting-short", [["received", 2]]),
    thread("answered", [
      ["received", 10],
      ["sent", 7],
    ]),
    thread("answered-fast", [
      ["received", 5],
      ["sent", 4],
    ]),
  ];
  it("lists conversations waiting for a reply, oldest first", () => {
    const i = inboxSummary(emails, "c", now);
    expect(i.waiting.map((t) => t.id)).toEqual(["waiting-long", "waiting-short"]);
    expect(i.total).toBe(4);
  });
  it("measures the median time to a first reply", () => {
    expect(responseTimes(emails, "c", now)).toEqual({ median: 2, count: 2 });
    expect(responseTimes([], "c", now)).toEqual({ median: null, count: 0 });
  });
  it("counts this week's leads and the customers", () => {
    const l = leadsSummary(
      [
        { id: "1", company_id: "c", name: "A", email: "", kind: "lead", value: "", last: h(5) },
        {
          id: "2",
          company_id: "c",
          name: "B",
          email: "",
          kind: "lead",
          value: "",
          last: h(24 * 9),
        },
        { id: "3", company_id: "c", name: "C", email: "", kind: "customer", value: "", last: h(1) },
      ],
      "c",
      now,
    );
    expect([l.leads.map((x) => x.id), l.week, l.customers]).toEqual([["1", "2"], 1, 1]);
  });
  it("sums the evidence board", () => {
    const e = evidenceSummary(
      [
        { id: "1", company_id: "c", type: "assumption", title: "", data: {}, status: "validated" },
        { id: "2", company_id: "c", type: "interview", title: "", data: {}, status: null },
        {
          id: "3",
          company_id: "c",
          type: "waitlist",
          title: "",
          data: { count: 64 },
          status: null,
        },
      ],
      "c",
    );
    expect(e).toMatchObject({ validated: 1, interviews: 1, waitlist: 64, preorders: 0 });
  });
  it("writes durations briefly", () => {
    expect([shortDuration(0.2), shortDuration(5), shortDuration(72)]).toEqual(["12m", "5h", "3d"]);
  });
});
