import type { RuntimeName } from "../config.js";
import { claudeRuntime } from "./claude.js";
import { mockRuntime } from "./mock.js";
import type { AgentRuntime } from "./types.js";

export function runtimeFor(name: RuntimeName): AgentRuntime {
  if (name === "claude") {
    if (!process.env["ANTHROPIC_API_KEY"])
      throw new Error("AGENT_RUNTIME=claude needs ANTHROPIC_API_KEY (see docs/HANDOFF.md)");
    return claudeRuntime;
  }
  return mockRuntime;
}
