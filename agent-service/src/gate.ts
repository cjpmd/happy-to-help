// The approval gate (canUseTool). A job may use only the tools its spec lists. Read tools and
// propose_* tools are allowed: proposing only writes a pending approval, which the founder
// decides in GO / NO-GO and the executor carries out (CLAUDE.md rule 4). Everything else,
// including the SDK's own shell, file-writing and web tools, is denied.
import { MCP_SERVER, fullName } from "./tools.js";

/** Built-in SDK tools a company agent may use: reading its own workspace. */
export const BUILT_IN_READ = ["Read", "Glob", "Grep"];
/** Built-in tools that are never available to a company agent. */
export const ALWAYS_DENIED = [
  "Bash",
  "Write",
  "Edit",
  "NotebookEdit",
  "WebFetch",
  "WebSearch",
  "Task",
];

export type GateDecision = { behavior: "allow" } | { behavior: "deny"; message: string };

export function gate(toolName: string, allowedTools: string[]): GateDecision {
  if (BUILT_IN_READ.includes(toolName)) return { behavior: "allow" };
  const prefix = `mcp__${MCP_SERVER}__`;
  if (toolName.startsWith(prefix) && allowedTools.map(fullName).includes(toolName))
    return { behavior: "allow" };
  return {
    behavior: "deny",
    message: `${toolName} isn't available for this job. Use a propose_* tool for anything that publishes, sends or spends.`,
  };
}
