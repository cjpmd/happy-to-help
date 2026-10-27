import { describe, expect, it } from "vitest";
import { analyseVoice, parseContactsCsv } from "@/lib/voice";

describe("voice read", () => {
  const emails = [
    "Hi Sarah,\n\nThanks for your order! Your sourdough will be ready on Saturday. Fresh from the oven, as always.\n\nBest wishes\nRory",
    "Hi Tom,\n\nWe've got your favourite cinnamon buns back this week. Fresh from the oven, as always.\n\nBest wishes\nRory",
    "Hello! Our centre-of-town bakery is open from 7am. Pop in and say hello 🥐",
  ];
  const read = analyseVoice(emails)!;
  it("finds the sign-off, spelling, emoji and repeated phrases", () => {
    expect(read.signOff).toBe("Best wishes");
    expect(read.spelling).toBe("UK");
    expect(read.usesEmoji).toBe(true);
    expect(read.phrases).toContain("fresh from the oven");
  });
  it("describes the reading level and traits in plain words", () => {
    expect(read.readingLevel).toBe("plain");
    expect(read.traits).toContain("Upbeat");
    expect(read.summary).toMatch(/Signs off with “Best wishes”/);
  });
  it("returns nothing without samples", () => expect(analyseVoice(["  "])).toBeNull());
});

describe("contacts CSV", () => {
  it("reads name and email columns in any order, with quotes and commas", () => {
    const { rows, skipped } = parseContactsCsv(
      'Email,Full name,Status,Notes\nsarah@example.com,"Patel, Sarah",Customer,Weekly box\nnot-an-email,Bad,,\nTOM@example.com,,lead,\n',
    );
    expect(skipped).toBe(1);
    expect(rows).toEqual([
      { name: "Patel, Sarah", email: "sarah@example.com", kind: "customer", value: "Weekly box" },
      { name: "tom", email: "tom@example.com", kind: "lead", value: "" },
    ]);
  });
  it("needs an email column", () => expect(parseContactsCsv("name\nSarah").rows).toEqual([]));
});
