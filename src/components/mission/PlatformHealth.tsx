import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import type { PlatformHealth as Health } from "@/lib/storeContext";
import { fmtDateTime } from "@/lib/format";
import { Pill } from "./primitives";

/** Settings → Platform health, for platform admins: recent errors and the cost check (Phase 9). */
export function PlatformHealthSection() {
  const { user, mode, loadPlatformHealth } = useStore();
  const [health, setHealth] = useState<Health | null | undefined>(undefined);
  useEffect(() => {
    if (user.role === "admin" && mode === "live") void loadPlatformHealth().then(setHealth);
  }, [user.role, mode, loadPlatformHealth]);
  if (user.role !== "admin") return null;
  const totals = (health?.costs ?? []).reduce(
    (t, c) => ({ est: t.est + c.estimated_usd, act: t.act + c.actual_usd }),
    { est: 0, act: 0 },
  );
  return (
    <>
      <h2 className="mt-8 font-medium" id="platform-health">
        Platform health
      </h2>
      {mode !== "live" ? (
        <p className="mt-1 text-sm text-muted-foreground">Live mode only.</p>
      ) : health === undefined ? (
        <p className="mt-1 text-sm text-muted-foreground">Loading…</p>
      ) : health === null ? (
        <p className="mt-1 text-sm text-muted-foreground">Couldn't load platform health.</p>
      ) : (
        <div className="mt-2 space-y-4 text-sm">
          <div>
            <p className="font-medium">Cost check, last 30 days</p>
            <p className="text-xs text-muted-foreground">
              What our runs reported ${totals.est.toFixed(2)} · Anthropic usage $
              {totals.act.toFixed(2)}
              {totals.act > 0 &&
                ` · difference ${(((totals.act - totals.est) / totals.act) * 100).toFixed(1)}%`}
              {totals.act === 0 && " · import usage with an Admin API key to compare"}
            </p>
          </div>
          <div>
            <p className="font-medium">Recent errors</p>
            <ul className="mt-1 divide-y border-y">
              {health.errors.map((e) => (
                <li key={e.id} className="flex items-start gap-2 py-2">
                  <Pill>{e.source}</Pill>
                  <span className="min-w-0 flex-1 break-words">{e.message}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {fmtDateTime(e.created_at)}
                  </span>
                </li>
              ))}
              {!health.errors.length && (
                <li className="py-2 text-muted-foreground">No errors recorded.</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
