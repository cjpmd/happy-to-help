// The approval queue. Here it asks in the terminal; in HQ it would be an
// approval card that waits for the founder (or mentor) to tap Approve.
import type { CanUseTool } from "@anthropic-ai/claude-agent-sdk";
import { createInterface } from "node:readline/promises";

// Actions that touch the outside world. Everything else not explicitly allowed is denied.
const NEEDS_APPROVAL = new Set(["mcp__social__publish_post"]);

export const approvalGate: CanUseTool = async (toolName, input) => {
  if (!NEEDS_APPROVAL.has(toolName)) {
    return { behavior: "deny", message: `${toolName} isn't enabled for this company.` };
  }

  console.log("\n┌─ APPROVAL NEEDED ─────────────────────────────");
  console.log(`│ Action:   ${toolName}`);
  for (const [k, v] of Object.entries(input)) console.log(`│ ${k.padEnd(9)} ${String(v).replace(/\n/g, "\n│           ")}`);
  console.log("└───────────────────────────────────────────────");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question("Approve? [y/N] ")).trim().toLowerCase();
  rl.close();

  return answer === "y"
    ? { behavior: "allow", updatedInput: input }
    : { behavior: "deny", message: "The founder declined this action. Don't retry; report the draft and ask what to change." };
};
