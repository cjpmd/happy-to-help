import { useState } from "react";
import { useStore, useEstimate } from "@/lib/store";
import { autoModeCost } from "@/lib/credits";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { CostButton, Why } from "./WorkControls";

export const AUTO_MODE_DEFAULT_HOURS = 2;

export function AutoModeDialog({
  companyId,
  open,
  onOpenChange,
}: {
  companyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { startAutoMode, mode } = useStore();
  const autoPerHour = useEstimate("autoHour");
  const [hours, setHours] = useState(AUTO_MODE_DEFAULT_HOURS);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Auto Mode</DialogTitle>
          <DialogDescription>
            {mode === "live"
              ? "Sol works on its own for the time you choose and stops at the credit cap, whichever comes first. You can stop it at any time."
              : "Choose a work period for Sol. This demo previews one work cycle; it does not run unattended jobs."}
          </DialogDescription>
        </DialogHeader>
        <label className="text-sm font-medium">
          Work for {hours} {hours === 1 ? "hour" : "hours"}
        </label>
        <Slider
          aria-label="Auto Mode hours"
          min={1}
          max={8}
          step={1}
          value={[hours]}
          onValueChange={(v) => setHours(v[0] ?? 1)}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>1 hour</span>
          <span>8 hours</span>
        </div>
        <CostButton
          label={`Start ${hours}-hour session`}
          cost={autoModeCost(hours, autoPerHour)}
          onConfirm={() => {
            onOpenChange(false);
            // The cost shown is the cap: Sol never spends more than this in the session.
            return startAutoMode(companyId, hours, autoModeCost(hours, autoPerHour));
          }}
        />
        <Why reason="A time-boxed work period keeps the credit commitment visible and bounded. The cost shown is the cap: the session stops when it's spent or the time is up." />
      </DialogContent>
    </Dialog>
  );
}
