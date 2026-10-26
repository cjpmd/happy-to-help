import { useEffect, useState } from "react";
import { getSupabase } from "@/integrations/supabase/client";
import { demoCreditSummary, type CreditSummary } from "./credits";
import { useStore } from "./storeContext";

/** A company's credits by bucket, with holds, the next expiry and cohort headroom. */
export function useCreditSummary(companyId: string): CreditSummary {
  const { mode, db } = useStore();
  const fallback = demoCreditSummary(db.credit_ledger, companyId);
  const [live, setLive] = useState<CreditSummary | null>(null);
  // Refetch whenever the ledger changes (the store reloads it on Realtime events).
  const ledgerSize = db.credit_ledger.length;
  useEffect(() => {
    if (mode !== "live" || !companyId) return;
    let active = true;
    void getSupabase()
      .rpc("credit_summary", { p_company: companyId })
      .then(({ data }) => {
        // credit_summary returns this shape as jsonb.
        if (active && data) setLive(data as unknown as CreditSummary);
      });
    return () => {
      active = false;
    };
  }, [mode, companyId, ledgerSize]);
  return mode === "live" ? (live ?? fallback) : fallback;
}
