// Runs one job end to end against the local Supabase stack and the seeded StudyBuddy company:
// enqueue → claim → reserve → run (mock runtime unless AGENT_RUNTIME=claude) → propose → settle.
//
//   npx supabase start && npx supabase db reset
//   cd agent-service && npm run run-once            # a social post
//   npm run run-once -- chat "How's the waitlist?"   # or another job type
import { execFileSync } from "node:child_process";
import { loadConfig } from "../src/config.js";
import { serviceClient } from "../src/db/client.js";
import { drain } from "../src/worker.js";
import { runtimeFor } from "../src/runtime/index.js";

const STUDYBUDDY = "c0000000-0000-4000-8000-000000000001";
const AISHA = "a0000000-0000-4000-8000-000000000001";
const [jobType = "social_post", text = "Write today's social post"] = process.argv.slice(2);

if (!process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
  const status = JSON.parse(
    execFileSync("npx", ["supabase", "status", "-o", "json"], { cwd: "..", encoding: "utf8" }),
  );
  process.env["SUPABASE_URL"] = status.API_URL;
  process.env["SUPABASE_SERVICE_ROLE_KEY"] = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
}
const config = loadConfig({ workerId: "dev-run" });
const db = serviceClient(config);

const before = await db.rpc("credit_summary", { p_company: STUDYBUDDY });
let payload: Record<string, string> = { title: text };
if (jobType === "chat") {
  const { data } = await db
    .from("chat_messages")
    .insert({ company_id: STUDYBUDDY, sender: "founder", author_id: AISHA, content: text })
    .select("id")
    .single();
  payload = { message_id: data!.id };
}
const { data: job } = await db
  .from("agent_jobs")
  .insert({ company_id: STUDYBUDDY, job_type: jobType, payload, created_by: AISHA })
  .select("id")
  .single();
console.log(`Queued ${jobType} job ${job!.id}`);
await drain({ db, config, runtime: runtimeFor(config.runtime), types: [jobType] });

const { data: run } = await db
  .from("agent_runs")
  .select("*")
  .eq("job_id", job!.id)
  .order("created_at", { ascending: false })
  .limit(1)
  .single();
const { data: approvals } = await db
  .from("approvals")
  .select("action_type, payload, status")
  .eq("run_id", run!.id);
const after = await db.rpc("credit_summary", { p_company: STUDYBUDDY });
console.log("\n──────── Run summary ────────");
console.log(`Status:    ${run!.status} (${run!.model})`);
console.log(`Steps:     ${(run!.steps as { tool: string }[]).map((s) => s.tool).join(" → ")}`);
console.log(`Cost:      $${run!.cost_usd} = ${run!.credits_charged} credits`);
console.log(
  `Balance:   ${(before.data as { balance: number }).balance} → ${(after.data as { balance: number }).balance}`,
);
for (const a of approvals ?? [])
  console.log(
    `Proposed:  ${a.action_type} (${a.status}): ${JSON.stringify(a.payload).slice(0, 200)}`,
  );
