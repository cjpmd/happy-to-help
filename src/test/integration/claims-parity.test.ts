import { describe, expect, it } from "vitest";
import { checkClaims } from "@/lib/workspace";
import { AISHA, STUDYBUDDY, clientAs } from "./local";

// The claims check runs in the browser (to show flags) and in the database (to block
// approval). They must agree, or the UI would show GO for something the server refuses.
const FIXTURES = [
  "Ten minutes a day.",
  "The best revision app in Scotland",
  "We guarantee better grades and will improve your results",
  "Double your marks — 100% success!",
  "It actually works, proven by students",
  "Risk-free and certified",
  "Your weak-spots report is ready",
  "Ask about the Teacher dashboard",
  "Number one, world-leading, most effective",
  "Approved by teachers",
  "Nothing to see here 😀",
  "See you soon.\n\nBest wishes\nRory",
  "All the best, and the best cake in town",
];

describe("claims check parity (TypeScript vs SQL)", () => {
  it("flags the same phrases for the same reasons", async () => {
    const sb = await clientAs(AISHA);
    const { data: docs } = await sb
      .from("documents")
      .select("outcomes")
      .eq("company_id", STUDYBUDDY)
      .eq("title", "Product roadmap")
      .single();
    const unbuilt = ((docs?.outcomes ?? []) as { title: string; complete: boolean }[])
      .filter((o) => !o.complete)
      .map((o) => o.title);
    for (const text of FIXTURES) {
      const { data, error } = await sb.rpc("check_claims", { p_company: STUDYBUDDY, p_text: text });
      expect(error).toBeNull();
      const sql = (data as { phrase: string; reason: string }[])
        .map((f) => `${f.phrase.toLowerCase()}|${f.reason}`)
        .sort();
      const ts = checkClaims(text, "education", unbuilt)
        .map((f) => `${f.phrase.toLowerCase()}|${f.reason}`)
        .sort();
      expect(sql, text).toEqual(ts);
    }
  });
});
