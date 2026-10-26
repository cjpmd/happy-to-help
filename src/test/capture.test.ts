import { describe, expect, it } from "vitest";
import {
  acceptableInBulk,
  captureEstimate,
  commitmentsDue,
  extractItems,
  followUpQuestions,
  groupForReview,
  matchContact,
  matchTask,
  missingDetails,
  parseDue,
} from "@/lib/capture";

// A Wednesday.
const NOW = new Date("2026-10-21T09:00:00Z");

describe("parseDue", () => {
  it("reads relative days, weekdays and dates", () => {
    expect(parseDue("do it today", NOW)).toBe("2026-10-21");
    expect(parseDue("by tomorrow", NOW)).toBe("2026-10-22");
    expect(parseDue("by Friday", NOW)).toBe("2026-10-23");
    expect(parseDue("on Wednesday", NOW)).toBe("2026-10-28");
    expect(parseDue("next week", NOW)).toBe("2026-10-28");
    expect(parseDue("by 30 Oct", NOW)).toBe("2026-10-30");
    expect(parseDue("by 3rd January", NOW)).toBe("2027-01-03");
    expect(parseDue("soon", NOW)).toBeUndefined();
  });
});

describe("extractItems", () => {
  const note = [
    "We decided to keep the sourdough at £4.",
    "I'll send Morag the wholesale price list by Friday.",
    "Aisha will update the opening hours on the website.",
    "Sol, can you draft a post about the new rye loaf?",
    "Maybe we could do a TikTok at some point.",
    "We need to sort the van insurance.",
    "The customer said the croissants were the best in town.",
    "What do we charge for weddings?",
    "My mum's back in hospital so I'll be out Monday.",
  ].join(" ");
  const items = extractItems(note, {
    now: NOW,
    teammates: ["Aisha Khan"],
    contacts: ["Morag Reid"],
  });
  const kind = (k: string) => items.filter((i) => i.kind === k);

  it("finds decisions, promises, feedback, ideas and questions", () => {
    expect(kind("decision")[0]?.text).toContain("sourdough");
    expect(kind("commitment")[0]).toMatchObject({
      contact_name: "Morag Reid",
      due_date: "2026-10-23",
    });
    expect(kind("feedback")).toHaveLength(1);
    expect(kind("question")[0]?.text).toContain("weddings");
  });

  it("makes vague musings ideas, never tasks", () => {
    expect(kind("idea")[0]?.text).toContain("TikTok");
    expect(kind("action").some((a) => a.text.includes("TikTok"))).toBe(false);
  });

  it("assigns owners only when it's clear, and doesn't guess dates", () => {
    const actions = kind("action");
    expect(actions.find((a) => a.text.includes("opening hours"))).toMatchObject({
      owner: "teammate",
      owner_name: "Aisha",
      department: "build",
    });
    expect(actions.find((a) => a.text.includes("rye loaf"))?.owner).toBe("sol");
    const van = actions.find((a) => a.text.includes("van insurance"));
    expect(van?.owner).toBe("unknown");
    expect(van?.due_date).toBeUndefined();
    expect(van?.department).toBe("legal");
  });

  it("marks personal matters as sensitive", () => {
    expect(items.find((i) => i.text.includes("hospital"))?.sensitive).toBe(true);
  });
});

describe("matching", () => {
  const tasks = [
    { id: "t1", title: "Update opening hours on the website", status: "todo" },
    { id: "t2", title: "Post about the rye loaf", status: "done" },
  ];
  it("prefers an existing open task over a duplicate", () => {
    expect(matchTask("Update the opening hours on the website", tasks)?.id).toBe("t1");
    expect(matchTask("Draft a post about the rye loaf", tasks)).toBeUndefined();
    expect(matchTask("Sort the van insurance", tasks)).toBeUndefined();
  });
  it("links a contact only when there's exactly one match", () => {
    const people = [
      { id: "a", name: "Morag Reid" },
      { id: "b", name: "Jo Smith" },
      { id: "c", name: "Jo Brown" },
    ];
    expect(matchContact("Morag", people)?.id).toBe("a");
    expect(matchContact("Jo Smith", people)?.id).toBe("b");
    expect(matchContact("Jo", people)).toBeUndefined();
  });
});

describe("review", () => {
  it("asks for owners and dates, at most two questions", () => {
    expect(missingDetails({ kind: "action", owner: "unknown" })).toEqual(["owner", "due"]);
    expect(missingDetails({ kind: "action", owner: "sol" })).toEqual([]);
    expect(missingDetails({ kind: "commitment", owner: "founder" })).toEqual(["due"]);
    const qs = followUpQuestions([
      { kind: "action", owner: "unknown", text: "Sort the van" },
      { kind: "commitment", text: "Send Morag prices" },
    ]);
    expect(qs).toHaveLength(2);
    expect(qs[0]?.question).toBe('Who\'s doing "Sort the van"?');
  });

  it("groups low confidence under Possibly and keeps sensitive items apart", () => {
    const g = groupForReview([
      { confidence: 0.9 },
      { confidence: 0.4 },
      { confidence: 0.9, sensitive: true },
    ]);
    expect([g.main.length, g.possibly.length, g.sensitive.length]).toEqual([1, 1, 1]);
  });

  it("accepts in bulk only complete, confident, non-sensitive items", () => {
    expect(acceptableInBulk({ kind: "decision", confidence: 0.8 })).toBe(true);
    expect(acceptableInBulk({ kind: "action", owner: "unknown", confidence: 0.8 })).toBe(false);
    expect(acceptableInBulk({ kind: "idea", confidence: 0.4 })).toBe(false);
    expect(acceptableInBulk({ kind: "decision", confidence: 0.9, sensitive: true })).toBe(false);
  });
});

describe("costs and promises", () => {
  it("charges transcription by the started minute plus extraction", () => {
    expect(captureEstimate(61, 3, 40)).toBe(46);
    expect(captureEstimate(null, 3, 40)).toBe(40);
  });
  it("lists open promises due by a day", () => {
    const due = commitmentsDue(
      [
        { status: "open", due_date: "2026-10-22" },
        { status: "open", due_date: "2026-10-20" },
        { status: "done", due_date: "2026-10-19" },
      ],
      "2026-10-21",
    );
    expect(due).toEqual([{ status: "open", due_date: "2026-10-20" }]);
  });
});
