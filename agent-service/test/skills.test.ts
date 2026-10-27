import { describe, expect, it } from "vitest";
import { processJob } from "../src/runner.js";
import { claimNext } from "../src/worker.js";
import { mockRuntime } from "../src/runtime/mock.js";
import { reportError } from "../src/errors.js";
import { importAnthropicUsage, parseUsageReport } from "../src/reconcile.js";
import { enqueue, testConfig, testDb } from "./local.js";

const db = testDb();
const CROFT = "c0000000-0000-4000-8000-000000000004";
// Unique per run, so these tests can run again without a database reset.
const RUN = Date.now().toString(36);
const DAY = new Date(
  Date.UTC(
    2031 + Math.floor(Math.random() * 60),
    Math.floor(Math.random() * 12),
    1 + Math.floor(Math.random() * 28),
  ),
)
  .toISOString()
  .slice(0, 10);

async function run(jobType: string, payload: Record<string, string> = {}) {
  await db.from("agent_jobs").update({ status: "done" }).eq("status", "queued");
  await enqueue(db, CROFT, jobType, payload);
  return processJob(
    { db, config: testConfig(), runtime: mockRuntime },
    (await claimNext(db, "test", [jobType]))!,
  );
}

describe("compliance calendar", () => {
  it("adds the usual UK deadlines once and flags anything overdue", async () => {
    await db.from("compliance_items").insert({
      company_id: CROFT,
      title: `File the old return ${RUN}`,
      category: "HMRC",
      due_date: "2026-01-01",
      status: "upcoming",
    });
    const { count: before } = await db
      .from("compliance_items")
      .select("id", { count: "exact", head: true })
      .eq("company_id", CROFT)
      .eq("source", "sol");
    expect((await run("compliance_review")).outcome).toBe("done");
    const { data: added } = await db
      .from("compliance_items")
      .select("title, statutory")
      .eq("company_id", CROFT)
      .eq("source", "sol");
    expect(added!.map((a) => a.title)).toContain("Confirmation statement to Companies House");
    expect(added!.filter((a) => a.statutory).length).toBeGreaterThanOrEqual(5);
    const { data: old } = await db
      .from("compliance_items")
      .select("status")
      .eq("company_id", CROFT)
      .eq("title", `File the old return ${RUN}`)
      .single();
    expect(old!.status).toBe("overdue");
    await run("compliance_review");
    const { count } = await db
      .from("compliance_items")
      .select("id", { count: "exact", head: true })
      .eq("company_id", CROFT)
      .eq("source", "sol");
    expect(count).toBe(added!.length);
    expect(added!.length).toBeGreaterThanOrEqual(before ?? 0);
  });
});

describe("investor update and evidence plan", () => {
  it("drafts the investor update as a document for the founder to send", async () => {
    const res = await run("investor_update");
    expect(res.outcome).toBe("done");
    const { data: doc } = await db
      .from("documents")
      .select("id, document_versions(content)")
      .eq("company_id", CROFT)
      .eq("title", "Investor updates")
      .single();
    const versions = doc!.document_versions as { content: string }[];
    expect(versions[versions.length - 1]!.content).toMatch(/^# .+ update\n\n## Numbers/);
    const { count } = await db
      .from("approvals")
      .select("id", { count: "exact", head: true })
      .eq("run_id", res.runId!);
    expect(count).toBe(0); // nothing is sent
  });

  it("turns an idea into assumptions on the evidence board", async () => {
    expect(
      (await run("evidence_plan", { target: `Seasonal veg boxes for offices ${RUN}` })).outcome,
    ).toBe("done");
    const { data } = await db
      .from("evidence_items")
      .select("title, status, data")
      .eq("company_id", CROFT)
      .eq("type", "assumption");
    const mine = (data ?? []).filter(
      (e) => (e.data as { idea?: string }).idea === `Seasonal veg boxes for offices ${RUN}`,
    );
    expect(mine).toHaveLength(3);
    expect(mine.every((e) => e.status === "untested")).toBe(true);
  });
});

describe("monitoring", () => {
  it("records errors, including a run that failed for good", async () => {
    await reportError(db, "scheduler", new Error(`Test failure ${RUN}`), {
      companyId: CROFT,
      step: "test",
    });
    const { data } = await db
      .from("error_events")
      .select("source, message, context")
      .eq("company_id", CROFT)
      .eq("message", `Test failure ${RUN}`)
      .single();
    expect(data).toMatchObject({ source: "scheduler", context: { step: "test" } });
    await db.from("agent_jobs").update({ status: "done" }).eq("status", "queued");
    const job = await enqueue(db, CROFT, "task", { title: "This will fail" });
    await db.from("agent_jobs").update({ attempts: 1, max_attempts: 1 }).eq("id", job.id);
    const res = await processJob(
      { db, config: testConfig(), runtime: mockRuntime },
      (await claimNext(db, "test", ["task"]))!,
    );
    expect(res.outcome).toBe("failed");
    const { count } = await db
      .from("error_events")
      .select("id", { count: "exact", head: true })
      .eq("company_id", CROFT)
      .eq("source", "worker");
    expect(count).toBeGreaterThan(0);
  });
});

describe("cost reconciliation", () => {
  it("imports Anthropic's daily usage and compares it with what our runs reported", async () => {
    const body = {
      data: [
        {
          starting_at: `${DAY}T00:00:00Z`,
          results: [
            {
              model: "claude-sonnet-5-5",
              uncached_input_tokens: 400_000,
              cache_read_input_tokens: 100_000,
              output_tokens: 50_000,
            },
          ],
        },
      ],
      has_more: false,
    };
    expect(parseUsageReport(body)).toEqual([
      {
        day: DAY,
        model: "claude-sonnet-5-5",
        input_tokens: 500_000,
        output_tokens: 50_000,
      },
    ]);
    const fetcher = (async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;
    expect(await importAnthropicUsage(db, "admin-key", DAY, DAY, fetcher)).toBe(1);
    await db.from("agent_runs").insert({
      company_id: CROFT,
      task: "Reconciliation test",
      pillar: "run",
      model: "claude-sonnet-5-5",
      status: "succeeded",
      started_at: `${DAY}T10:00:00Z`,
      cost_usd: 1.2,
    });
    const { data } = await db.rpc("cost_reconciliation", {
      p_from: DAY,
      p_to: DAY,
    });
    // 0.5M input × $2 + 0.05M output × $10 = $1.50 reported; our runs said $1.20.
    expect(data).toEqual([
      {
        day: DAY,
        model: "claude-sonnet-5-5",
        runs: 1,
        estimated_usd: 1.2,
        actual_usd: 1.5,
        difference_usd: 0.3,
        difference_pct: 20,
      },
    ]);
  });
});
