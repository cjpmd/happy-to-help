import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/integrations/supabase/client";
import { demoCrewStats, roster, type CrewStat } from "./crew";
import { useStore } from "./storeContext";

/** The company's crew with each member's figures (crew_stats in live mode; the demo counts the
 *  same things from its own data). */
export function useCrew(companyId: string, now: Date = new Date()) {
  const { mode, db } = useStore();
  const [live, setLive] = useState<CrewStat[] | null>(null);
  // Refetch when runs, approvals or the crew change (the store reloads them on Realtime events).
  const version = `${db.agent_runs.length}:${db.approvals.filter((a) => a.status === "pending").length}:${db.agents
    .map((a) => a.status + a.budget_per_month_credits)
    .join()}`;
  useEffect(() => {
    if (mode !== "live" || !companyId) return;
    let active = true;
    void getSupabase()
      .rpc("crew_stats", { p_company: companyId })
      .then(({ data }) => {
        if (active && data) setLive(data as unknown as CrewStat[]);
      });
    return () => {
      active = false;
    };
  }, [mode, companyId, version]);
  const nowKey = Math.floor(now.getTime() / 60_000);
  const stats = useMemo(
    () =>
      mode === "live" ? (live ?? []) : demoCrewStats(db, companyId, new Date(nowKey * 60_000)),
    [mode, live, db, companyId, nowKey],
  );
  return {
    stats,
    loading: mode === "live" && live === null,
    ...roster(db.agents, stats, db.agent_catalogue, companyId),
  };
}
