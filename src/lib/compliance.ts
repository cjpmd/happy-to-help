import type { ComplianceItem } from "./types";

export type ComplianceTone = "destructive" | "warning" | "success" | "info" | "neutral";

/**
 * Overdue statutory deadlines (confirmation statement, accounts, tax, ICO fee)
 * carry legal penalties, so they are red. Other overdue items are amber, like
 * anything due soon.
 */
export function complianceTone(item: Pick<ComplianceItem, "status" | "statutory">): ComplianceTone {
  if (item.status === "overdue") return item.statutory ? "destructive" : "warning";
  if (item.status === "done") return "success";
  if (item.status === "in_progress") return "info";
  return "neutral";
}
