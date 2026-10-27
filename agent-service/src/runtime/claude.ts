// The real runtime: one company agent per run on the Claude Agent SDK (docs/prototype/ shows
// the same loop in miniature). The company's CLAUDE.md and skills load from the workspace; the
// tools are served in-process; the gate decides every tool call; the audit hook records it.
import { createSdkMcpServer, query, tool, type HookCallback } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { ALWAYS_DENIED, BUILT_IN_READ, gate } from "../gate.js";
import { MCP_SERVER, TOOLS, fullName } from "../tools.js";
import type { AgentRuntime, RunOutcome, RunRequest } from "./types.js";

const summarise = (input: unknown) => {
  const s = JSON.stringify(input ?? {});
  return s.length > 160 ? `${s.slice(0, 157)}…` : s;
};

export const claudeRuntime: AgentRuntime = {
  name: "claude",
  async run(req: RunRequest): Promise<RunOutcome> {
    const allowed = TOOLS.filter((t) => req.tools.includes(t.name));
    const server = createSdkMcpServer({
      name: MCP_SERVER,
      version: "1.0.0",
      tools: allowed.map((t) =>
        tool(
          t.name,
          t.description,
          t.shape,
          async (args) => {
            const r = await t.handler(req.ctx, z.object(t.shape).parse(args));
            return {
              content: [{ type: "text" as const, text: r.text }],
              isError: r.isError ?? false,
            };
          },
          { annotations: { readOnlyHint: t.readOnly } },
        ),
      ),
    });

    const audit: HookCallback = async (input) => {
      if (input.hook_event_name === "PostToolUse") {
        const name = input.tool_name.replace(`mcp__${MCP_SERVER}__`, "");
        await req.onStep({ tool: name, summary: summarise(input.tool_input), credits: 0 });
      }
      return {};
    };

    let text = "";
    try {
      for await (const msg of query({
        prompt: req.prompt,
        options: {
          model: req.model,
          cwd: req.cwd,
          settingSources: ["project"],
          skills: req.skills,
          mcpServers: { [MCP_SERVER]: server },
          tools: BUILT_IN_READ,
          // Read tools run without asking; propose_* tools go through the gate.
          allowedTools: [
            ...BUILT_IN_READ,
            ...allowed.filter((t) => t.readOnly).map((t) => fullName(t.name)),
          ],
          disallowedTools: ALWAYS_DENIED,
          canUseTool: async (toolName) => {
            const d = gate(toolName, req.tools);
            return d.behavior === "allow" ? { behavior: "allow" } : d;
          },
          hooks: { PostToolUse: [{ hooks: [audit] }] },
          maxBudgetUsd: req.maxBudgetUsd,
          maxTurns: req.maxTurns,
        },
      })) {
        if (msg.type === "assistant") {
          for (const block of msg.message.content)
            if (block.type === "text" && block.text.trim()) text = block.text.trim();
        } else if (msg.type === "result") {
          const usage = Object.values(msg.modelUsage).reduce(
            (u, m) => ({
              input_tokens:
                u.input_tokens +
                m.inputTokens +
                m.cacheReadInputTokens +
                m.cacheCreationInputTokens,
              output_tokens: u.output_tokens + m.outputTokens,
            }),
            { input_tokens: 0, output_tokens: 0 },
          );
          const status =
            msg.subtype === "success"
              ? "success"
              : msg.subtype === "error_max_budget_usd"
                ? "budget"
                : msg.subtype === "error_max_turns"
                  ? "turns"
                  : "error";
          return {
            status,
            costUsd: msg.total_cost_usd,
            usage,
            text: msg.subtype === "success" ? msg.result || text : text,
            ...(status === "error" ? { error: msg.subtype } : {}),
          };
        }
      }
      return {
        status: "error",
        costUsd: 0,
        usage: { input_tokens: 0, output_tokens: 0 },
        text,
        error: "No result",
      };
    } catch (e) {
      return {
        status: "error",
        costUsd: 0,
        usage: { input_tokens: 0, output_tokens: 0 },
        text,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
};
