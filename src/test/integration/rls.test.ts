import { describe, expect, it } from "vitest";
import { AISHA, CALLUM, JAMIE, KELPIE, MORAG, STUDYBUDDY, THRIFT, clientAs } from "./local";
import { ALL_GROUPS, loadGroups } from "@/lib/live/load";

// Row-level security through the real API, as the app sees it. pgTAP covers every table and
// rule in depth (supabase/tests/database); this checks the live store's loader end to end.
describe("live store through the API", () => {
  it("a founder loads their own companies and nobody else's", async () => {
    const sb = await clientAs(AISHA);
    const { data: me } = await sb.auth.getUser();
    const db = await loadGroups(sb, me.user!.id, ALL_GROUPS);
    const ids = db.companies!.map((c) => c.id).sort();
    expect(ids).toEqual([STUDYBUDDY, KELPIE].sort());
    expect(db.approvals!.every((a) => ids.includes(a.company_id))).toBe(true);
    expect(db.credit_ledger!.some((l) => l.company_id === THRIFT)).toBe(false);
    expect(db.preferences![me.user!.id]).toBeDefined();
  });

  it("a cohort mentor reads every company in the cohort", async () => {
    const sb = await clientAs(MORAG);
    const { data } = await sb.from("companies").select("id");
    expect(data!.length).toBe(4);
  });

  it("a non-member cannot read or write another company's rows", async () => {
    const sb = await clientAs(CALLUM); // founder of Kelpie, Thrift Loop and Croft Care
    const { data: tasks } = await sb.from("tasks").select("id").eq("company_id", STUDYBUDDY);
    expect(tasks).toEqual([]);
    const { error } = await sb
      .from("evidence_items")
      .insert({ company_id: STUDYBUDDY, type: "interview", title: "Sneaky" });
    expect(error?.code).toBe("42501");
    const res = await sb.rpc("enqueue_job", { p_company: STUDYBUDDY, p_job_type: "task" });
    expect(res.error?.message).toMatch(/founders and teammates/);
  });

  it("a teammate can add evidence but not decide approvals", async () => {
    const sb = await clientAs(JAMIE);
    const add = await sb
      .from("evidence_items")
      .insert({ company_id: STUDYBUDDY, type: "interview", title: "Integration test interview" })
      .select("id")
      .single();
    expect(add.error).toBeNull();
    await sb.from("evidence_items").delete().eq("id", add.data!.id);
    const res = await sb.rpc("decide_approval", {
      p_approval: "f0000000-0000-4000-8000-000000000003",
      p_decision: "declined",
    });
    expect(res.error?.message).toMatch(/founder or mentor/);
  });

  it("nobody writes the ledger from the app", async () => {
    const sb = await clientAs(AISHA);
    const { error } = await sb
      .from("credit_ledger")
      .insert({ company_id: STUDYBUDDY, entry_type: "grant", amount: 1000000 });
    expect(error?.code).toBe("42501");
  });
});
