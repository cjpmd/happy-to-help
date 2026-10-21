import type { LedgerEntry, Plan } from "./types";

export const PLANS: Record<Plan, { name: string; priceGbp: number; credits: number }> = {
  starter: { name: "Starter", priceGbp: 29, credits: 1500 },
  founder: { name: "Founder", priceGbp: 79, credits: 5000 },
  growth: { name: "Growth", priceGbp: 149, credits: 12000 },
};

export const TOP_UPS = [
  { id: "t10", priceGbp: 10, credits: 500 },
  { id: "t25", priceGbp: 25, credits: 1300 },
  { id: "t50", priceGbp: 50, credits: 2800 },
] as const;

export const LAUNCH_PACK = { priceGbp: 49, credits: 10000 } as const;

export const LOW_BALANCE_THRESHOLD = 0.2;

/** Mirrors the company_credit_balance view: sum of ledger amounts per company. */
export function creditBalance(ledger: LedgerEntry[], companyId: string) {
  return ledger.filter((l) => l.company_id === companyId).reduce((s, l) => s + l.amount, 0);
}

/** Low-balance banner shows when balance is below 20% of the plan's monthly allowance. */
export function isLowBalance(balance: number, plan: Plan) {
  return balance < PLANS[plan].credits * LOW_BALANCE_THRESHOLD;
}

// Mock work estimates; replace with the agent service's quotes before live work.
export const ACTION_COSTS = { chat: 10, image: 120, video: 400, document: 120, email: 30, social: 40, ads: 90, autoHour: 150 } as const;
export function actionQuote(balance: number, credits: number) { return { credits, after: balance - credits, affordable: credits >= 0 && balance >= credits }; }
export function autoModeCost(hours: number) { if (!Number.isInteger(hours) || hours < 1 || hours > 8) throw new Error('Choose 1–8 hours'); return hours * ACTION_COSTS.autoHour; }
