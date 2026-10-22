// A mock social media MCP server, running in-process.
// In production these two tools would call Ayrshare (or similar) instead of local files.
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export function socialServer(companyDir: string) {
  const metricsFile = path.join(companyDir, "data", "metrics.json");
  const outboxFile = path.join(companyDir, "data", "outbox.json");

  return createSdkMcpServer({
    name: "social",
    version: "0.1.0",
    tools: [
      tool(
        "get_metrics",
        "Get recent social media performance for this company: posts by angle, clicks and signups.",
        {},
        async () => ({
          content: [{ type: "text", text: await readFile(metricsFile, "utf8") }],
        }),
        { annotations: { readOnlyHint: true } },
      ),
      tool(
        "publish_post",
        "Publish a post to the company's social account. Requires founder approval.",
        {
          platform: z.enum(["instagram", "linkedin", "tiktok", "facebook"]),
          text: z.string().min(10).max(2200),
          angle: z.string().describe("Which message angle this post tests"),
        },
        async ({ platform, text, angle }) => {
          let outbox: unknown[] = [];
          try { outbox = JSON.parse(await readFile(outboxFile, "utf8")); } catch {}
          const post = { id: `post_${Date.now()}`, platform, angle, text, published_at: new Date().toISOString() };
          outbox.push(post);
          await writeFile(outboxFile, JSON.stringify(outbox, null, 2));
          return { content: [{ type: "text", text: `Published ${post.id} to ${platform} (mock).` }] };
        },
        { annotations: { destructiveHint: true } },
      ),
    ],
  });
}
