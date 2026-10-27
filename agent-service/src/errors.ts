// Error monitoring (Phase 9): failures are logged and recorded in error_events, which platform
// admins see in Settings → Platform health. Recording never throws: monitoring mustn't take the
// worker down.
import type { Db } from "./db/client.js";
import type { Json } from "./db/types.js";

export type ErrorSource = "worker" | "executor" | "scheduler";

export async function reportError(
  db: Db,
  source: ErrorSource,
  error: unknown,
  context: { companyId?: string; [k: string]: unknown } = {},
) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${source}] ${message}`);
  const { companyId, ...rest } = context;
  try {
    await db.from("error_events").insert({
      source,
      message: message.slice(0, 2000),
      context: rest as { [k: string]: Json },
      ...(companyId ? { company_id: companyId } : {}),
    });
  } catch {
    // The database itself may be the problem; the console line above is the fallback.
  }
}
