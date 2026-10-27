// Cost reconciliation (Phase 9): what our runs said they cost (the SDK's figures, in agent_runs)
// against the usage Anthropic reports for the organisation (Admin API usage report, priced with
// model_prices). Needs ANTHROPIC_ADMIN_KEY (an Admin API key, HANDOFF 7); without it nothing is
// imported and the report shows our side only.
//   npm run reconcile -- 2026-10-01 2026-10-31
import type { Db } from "./db/client.js";

export interface UsageRow {
  day: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Flattens the Admin API's daily buckets into one row per day and model. */
export function parseUsageReport(body: unknown): UsageRow[] {
  const out: UsageRow[] = [];
  for (const bucket of ((body as { data?: unknown[] })?.data ?? []) as Record<string, unknown>[]) {
    const day = String(bucket["starting_at"] ?? "").slice(0, 10);
    for (const r of (bucket["results"] ?? []) as Record<string, unknown>[]) {
      const cache = (r["cache_creation"] ?? {}) as Record<string, unknown>;
      out.push({
        day,
        model: String(r["model"] ?? "unknown"),
        input_tokens:
          num(r["uncached_input_tokens"]) +
          num(r["cache_read_input_tokens"]) +
          num(cache["ephemeral_5m_input_tokens"]) +
          num(cache["ephemeral_1h_input_tokens"]),
        output_tokens: num(r["output_tokens"]),
      });
    }
  }
  return out;
}

export async function importAnthropicUsage(
  db: Db,
  adminKey: string,
  from: string,
  to: string,
  fetcher: typeof fetch = fetch,
): Promise<number> {
  const { data: prices } = await db
    .from("model_prices")
    .select("model, input_per_mtok, output_per_mtok");
  let page: string | null = null;
  let n = 0;
  do {
    const q = new URLSearchParams({
      starting_at: `${from}T00:00:00Z`,
      ending_at: `${to}T23:59:59Z`,
      bucket_width: "1d",
      "group_by[]": "model",
      ...(page ? { page } : {}),
    });
    const res = await fetcher(
      `https://api.anthropic.com/v1/organizations/usage_report/messages?${q}`,
      {
        headers: { "x-api-key": adminKey, "anthropic-version": "2023-06-01" },
      },
    );
    if (!res.ok) throw new Error(`Anthropic usage report failed (${res.status})`);
    const body = (await res.json()) as { has_more?: boolean; next_page?: string | null };
    for (const u of parseUsageReport(body)) {
      const p = prices?.find((x) => u.model.startsWith(x.model));
      const cost = p
        ? (u.input_tokens * Number(p.input_per_mtok) +
            u.output_tokens * Number(p.output_per_mtok)) /
          1e6
        : 0;
      await db.from("anthropic_usage").upsert({ ...u, cost_usd: Math.round(cost * 10000) / 10000 });
      n++;
    }
    page = body.has_more ? (body.next_page ?? null) : null;
  } while (page);
  return n;
}

async function main() {
  const { loadConfig } = await import("./config.js");
  const { serviceClient } = await import("./db/client.js");
  const db = serviceClient(loadConfig());
  const today = new Date().toISOString().slice(0, 10);
  const [from = `${today.slice(0, 8)}01`, to = today] = process.argv.slice(2);
  const key = process.env["ANTHROPIC_ADMIN_KEY"];
  if (key) console.log(`Imported ${await importAnthropicUsage(db, key, from, to)} usage rows`);
  else console.log("ANTHROPIC_ADMIN_KEY isn't set: showing our estimates only.");
  const { data, error } = await db.rpc("cost_reconciliation", { p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  console.table(data);
}

if (import.meta.url === `file://${process.argv[1]}`) void main();
