import { describe, expect, it } from "vitest";
import { approvals } from "@/lib/seed";
import { approvalText } from "@/lib/types";

describe("approvalText", () => {
  it("reads a post's text and an email's body", () => {
    expect(approvalText(approvals.find((a) => a.id === "a1")!)).toContain("Higher Maths prelim");
    expect(approvalText(approvals.find((a) => a.id === "a2")!)).toContain("Thanks for joining");
  });
  it("is empty for actions with no public-facing text", () => {
    expect(approvalText(approvals.find((a) => a.id === "a3")!)).toBe("");
  });
});
