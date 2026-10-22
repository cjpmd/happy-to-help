// One company agent, one run: the nightly loop in miniature.
//   npm start -- studybuddy "Grow the waitlist: plan and publish today's social post"
import { query, type HookCallback, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { appendFile } from "node:fs/promises";
import path from "node:path";
import { socialServer } from "./social-server.js";
import { approvalGate } from "./approval.js";

const companyId = process.argv[2] ?? "studybuddy";
const task = process.argv[3] ?? "Grow the waitlist: plan and publish today's social post.";
const model = process.env.MODEL ?? "claude-sonnet-5-5";
const maxBudgetUsd = Number(process.env.MAX_BUDGET_USD ?? "0.50");
const companyDir = path.resolve("companies", companyId);
const logFile = path.join(companyDir, "data", "runs.jsonl");

// Audit hook: every tool call is logged, the basis of HQ's activity feed.
const audit: HookCallback = async (input) => {
  if (input.hook_event_name === "PostToolUse") {
    await appendFile(logFile, JSON.stringify({ at: new Date().toISOString(), event: "tool", tool: input.tool_name, input: input.tool_input }) + "\n");
    console.log(`  · used ${input.tool_name}`);
  }
  return {};
};

console.log(`\n▶ ${companyId} | ${model} | budget $${maxBudgetUsd.toFixed(2)}\n▶ Task: ${task}\n`);

let result: SDKResultMessage | undefined;

for await (const msg of query({
  prompt: task,
  options: {
    model,
    cwd: companyDir,                 // the company's own workspace
    settingSources: ["project"],     // load its CLAUDE.md (memory) and .claude/skills
    skills: ["social-post"],         // our playbook
    mcpServers: { social: socialServer(companyDir) },
    allowedTools: ["Read", "Glob", "mcp__social__get_metrics"],  // safe, read-only: run freely
    disallowedTools: ["Bash", "Write", "Edit", "WebFetch", "WebSearch"],
    canUseTool: approvalGate,        // everything else goes through the approval queue
    hooks: { PostToolUse: [{ hooks: [audit] }] },
    maxBudgetUsd,                    // hard per-run spending cap
    maxTurns: 15,
  },
})) {
  if (msg.type === "assistant") {
    for (const block of msg.message.content) {
      if (block.type === "text" && block.text.trim()) console.log(`\n${block.text.trim()}`);
    }
  } else if (msg.type === "result") {
    result = msg;
  }
}

if (!result) throw new Error("No result returned");

// Cost report: what this run actually cost, by model.
console.log("\n──────── Run summary ────────");
console.log(`Status:   ${result.subtype}`);
console.log(`Turns:    ${result.num_turns}`);
console.log(`Time:     ${(result.duration_ms / 1000).toFixed(1)}s`);
for (const [m, u] of Object.entries(result.modelUsage)) {
  console.log(`${m}: in ${u.inputTokens} | cache read ${u.cacheReadInputTokens} | cache write ${u.cacheCreationInputTokens} | out ${u.outputTokens} | $${u.costUSD.toFixed(4)}`);
}
console.log(`Total:    $${result.total_cost_usd.toFixed(4)} (estimate)`);

await appendFile(logFile, JSON.stringify({
  at: new Date().toISOString(), event: "run", task, model,
  status: result.subtype, turns: result.num_turns, cost_usd: result.total_cost_usd, usage: result.modelUsage,
}) + "\n");
