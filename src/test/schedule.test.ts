import { describe, expect, it } from "vitest";
import { localTime, nextRun, pickNextTask, routineDue } from "@/lib/schedule";
import { briefText } from "@/lib/brief";

describe("UK time", () => {
  it("follows British Summer Time", () => {
    // 06:30 UTC is 07:30 in summer and 06:30 in winter.
    expect(localTime(new Date("2026-07-01T06:30:00Z"))).toMatchObject({
      date: "2026-07-01",
      minutes: 450,
    });
    expect(localTime(new Date("2026-12-01T06:30:00Z"))).toMatchObject({
      date: "2026-12-01",
      minutes: 390,
    });
    expect(localTime(new Date("2026-10-26T12:00:00Z"))).toMatchObject({
      weekday: 1,
      week: "2026-W44",
    });
  });
});

describe("routines", () => {
  const mon = (hhmmUtc: string) => new Date(`2026-10-26T${hhmmUtc}:00Z`); // a Monday, GMT
  it("are due from their time, once per period", () => {
    expect(routineDue("daily", "07:00", mon("06:59"))).toEqual({
      due: false,
      period: "2026-10-26",
    });
    expect(routineDue("daily", "07:00", mon("07:00"))).toEqual({ due: true, period: "2026-10-26" });
    expect(routineDue("weekdays", "07:00", new Date("2026-10-25T09:00:00Z")).due).toBe(false); // Sunday
    expect(routineDue("weekly", "07:00", mon("08:00"))).toEqual({ due: true, period: "2026-W44" });
    expect(routineDue("weekly", "07:00", new Date("2026-10-28T08:00:00Z")).due).toBe(true); // catch-up Wednesday
  });

  it("know their next run in UK time", () => {
    expect(nextRun("daily", "07:00", mon("08:00")).toISOString()).toBe("2026-10-27T07:00:00.000Z");
    expect(nextRun("weekdays", "07:00", new Date("2026-10-30T08:00:00Z")).toISOString()).toBe(
      "2026-11-02T07:00:00.000Z",
    );
    // In summer, 07:00 UK is 06:00 UTC.
    expect(nextRun("daily", "07:00", new Date("2026-07-01T05:00:00Z")).toISOString()).toBe(
      "2026-07-01T06:00:00.000Z",
    );
    expect(nextRun("weekly", "07:00", mon("08:00")).toISOString()).toBe("2026-11-02T07:00:00.000Z");
  });
});

describe("nightly loop", () => {
  it("picks Sol's highest-leverage open task and never a person's", () => {
    const tasks = [
      { id: "a", title: "Founder's call", status: "todo", actor: "founder", due: "2026-10-01" },
      { id: "b", title: "Draft FAQ", status: "todo", actor: "sol", due: "2026-11-30" },
      { id: "c", title: "Overdue post", status: "todo", actor: "sol", due: "2026-10-20" },
      {
        id: "d",
        title: "Build signup",
        status: "todo",
        actor: "sol",
        key: true,
        stage: "build",
        due: "2026-12-01",
      },
      { id: "e", title: "Done", status: "done", actor: "sol" },
    ];
    expect(pickNextTask(tasks, "build", "2026-10-26")?.id).toBe("d");
    expect(pickNextTask(tasks, "launch", "2026-10-26")?.id).toBe("c");
    expect(
      pickNextTask(
        tasks.filter((t) => t.actor !== "sol"),
        "build",
        "2026-10-26",
      ),
    ).toBeUndefined();
  });
});

describe("morning brief", () => {
  it("leads with yesterday's meetings and today's promises", () => {
    const text = briefText(
      {
        date: "2026-10-27",
        approvalsWaiting: 2,
        overnight: { runs: 1, credits: 120 },
        meetings: 2,
        actionsFound: 6,
        actionsAccepted: 4,
        promisesDue: [{ to: "Jo", what: "Send the deck" }],
        inboxWaiting: 3,
        newLeads: 1,
        balance: 4200,
      },
      "StudyBuddy",
    );
    expect(text).toContain("Good morning. Here's StudyBuddy for Tuesday 27 Oct.");
    expect(text).toContain(
      "From yesterday: 2 meetings, 6 actions, 4 accepted, 1 promise due today.",
    );
    expect(text).toContain("- Promised to Jo: Send the deck");
    expect(text).toContain("2 things waiting for your GO.");
    expect(text).toContain("Balance: 4,200 credits.");
  });
});
