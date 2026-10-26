// The executor's rules: checked again just before acting, whatever the approval says. Pure, so
// they're tested directly (test/executorRules.test.ts). The claims re-check needs the database
// and lives in executor.ts.

export interface ExecutorLimits {
  /** No daily ad budget above this, ever (a platform-wide hard cap), in £. */
  adMaxDailyGbp: number;
  /** No outreach batch larger than this, ever. */
  outreachMaxBatch: number;
}

export const DEFAULT_LIMITS: ExecutorLimits = { adMaxDailyGbp: 100, outreachMaxBatch: 50 };

/** The strictest of the company founders' escalation settings (user_preferences). */
export interface FounderRules {
  /** "Ad change alert (£)": bigger daily budgets need a founder's GO. */
  adThreshold: number;
  /** "Outreach volume alert (recipients)": bigger batches need a founder's GO. */
  outreachThreshold: number;
  /** "Ask before publishing": posts and site changes need a founder's GO. */
  publishing: boolean;
}

export interface ApprovalForRules {
  action_type: "publish_post" | "send_email" | "ad_spend" | "file_document" | "publish_site";
  payload: Record<string, unknown>;
  /** The decider's role in the company. */
  deciderRole: "founder" | "mentor" | "teammate" | "viewer" | null;
}

export type RuleResult = { ok: true } | { ok: false; reason: string; needsFounder: boolean };

/** Email addresses in a recipients field, or the count in "9 new waitlist signups". */
export function recipients(to: string): { emails: string[]; count: number } {
  const emails = to.match(/[^\s,;<>"]+@[^\s,;<>"]+\.[^\s,;<>"]+/g) ?? [];
  if (emails.length) return { emails, count: emails.length };
  const n = /(\d+)/.exec(to);
  return { emails: [], count: n ? Number(n[1]) : 1 };
}

export function checkRules(
  a: ApprovalForRules,
  founder: FounderRules,
  limits: ExecutorLimits = DEFAULT_LIMITS,
): RuleResult {
  const byFounder = a.deciderRole === "founder";
  const p = a.payload;
  if (a.deciderRole !== "founder" && a.deciderRole !== "mentor")
    return {
      ok: false,
      reason: "Only a founder or mentor can approve actions.",
      needsFounder: true,
    };

  if (a.action_type === "ad_spend") {
    const daily = Number(p["daily_budget"] ?? p["amount_gbp"] ?? 0);
    const cap = Number(p["hard_cap"] ?? daily);
    if (!Number.isFinite(daily) || daily < 0)
      return { ok: false, reason: "The budget isn't a valid amount.", needsFounder: false };
    if (daily > cap)
      return {
        ok: false,
        reason: `The daily budget (£${daily}) is over its hard cap (£${cap}).`,
        needsFounder: false,
      };
    if (cap > limits.adMaxDailyGbp)
      return {
        ok: false,
        reason: `Daily ad budgets are capped at £${limits.adMaxDailyGbp} on Gumption.`,
        needsFounder: false,
      };
    if (daily > founder.adThreshold && !byFounder)
      return {
        ok: false,
        reason: `£${daily} a day is over the founder's ad alert (£${founder.adThreshold}), so a founder must give the GO.`,
        needsFounder: true,
      };
  }

  if (a.action_type === "send_email") {
    const { count } = recipients(String(p["to"] ?? ""));
    if (p["outreach"]) {
      if (count > limits.outreachMaxBatch)
        return {
          ok: false,
          reason: `Outreach batches are limited to ${limits.outreachMaxBatch} recipients. Split it up.`,
          needsFounder: false,
        };
      if (count > founder.outreachThreshold && !byFounder)
        return {
          ok: false,
          reason: `${count} recipients is over the founder's outreach alert (${founder.outreachThreshold}), so a founder must give the GO.`,
          needsFounder: true,
        };
    }
  }

  if (
    (a.action_type === "publish_post" || a.action_type === "publish_site") &&
    founder.publishing &&
    !byFounder
  )
    return {
      ok: false,
      reason: "The founder asked to approve publishing themselves.",
      needsFounder: true,
    };

  return { ok: true };
}
