import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useCompanyRole, useStore } from "@/lib/store";

/** What Sol does on its own overnight and weekly (Phase 8). Off until switched on. */
export function AutomationPanel() {
  const { db, companyId, updateAutomation } = useStore();
  const role = useCompanyRole(companyId);
  const canEdit = role === "founder" || role === "teammate";
  const a = db.company_automation.find((x) => x.company_id === companyId) ?? {
    nightly_enabled: false,
    nightly_cap_credits: 300,
    voice_review_enabled: false,
  };
  const [cap, setCap] = useState(String(a.nightly_cap_credits));
  const save = (patch: Parameters<typeof updateAutomation>[1], message: string) =>
    void updateAutomation(companyId, patch).then((ok) => ok && toast.success(message));
  return (
    <section className="mt-8" aria-labelledby="automation">
      <h2 id="automation" className="font-medium">
        While you sleep
      </h2>
      <div className="mt-2 divide-y border-y text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <p>Nightly work</p>
            <p className="text-xs text-muted-foreground">
              From 02:00, Sol works on the most useful open task for your stage, up to the cap.
              Anything external waits for your GO in the morning.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              Cap
              <Input
                className="h-8 w-20"
                inputMode="numeric"
                value={cap}
                disabled={!canEdit}
                aria-label="Nightly credit cap"
                onChange={(e) => setCap(e.target.value.replace(/\D/g, ""))}
                onBlur={() => {
                  const n = Number(cap);
                  if (n !== a.nightly_cap_credits && n >= 0 && n <= 5000)
                    save({ nightly_cap_credits: n }, "Nightly cap saved");
                }}
              />
              CR
            </label>
            <Switch
              checked={a.nightly_enabled}
              disabled={!canEdit}
              aria-label="Nightly work"
              onCheckedChange={(v) =>
                save({ nightly_enabled: v }, v ? "Nightly work is on" : "Nightly work is off")
              }
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 py-4">
          <div>
            <p>Weekly voice review</p>
            <p className="text-xs text-muted-foreground">
              Mondays: if you've edited at least three of Sol's drafts, Sol proposes voice changes
              for your GO.
            </p>
          </div>
          <Switch
            checked={a.voice_review_enabled}
            disabled={!canEdit}
            aria-label="Weekly voice review"
            onCheckedChange={(v) =>
              save(
                { voice_review_enabled: v },
                v ? "Weekly voice review is on" : "Weekly voice review is off",
              )
            }
          />
        </div>
      </div>
    </section>
  );
}
