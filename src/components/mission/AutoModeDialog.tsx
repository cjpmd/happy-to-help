import { useState } from "react";
import { useStore } from "@/lib/store";
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
  const { work } = useStore();
  const [hours, setHours] = useState(AUTO_MODE_DEFAULT_HOURS);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Auto Mode</DialogTitle>
          <DialogDescription>
            Choose a work period for Sol. This demo previews one work cycle; it does not run
            unattended jobs.
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
          cost={autoModeCost(hours)}
          onConfirm={() => {
            onOpenChange(false);
            return work(companyId, `Auto Mode: ${hours}-hour plan`, autoModeCost(hours), "auto");
          }}
        />
        <Why reason="A time-boxed work period keeps the credit commitment visible and bounded. The hourly demo estimate and your available balance determine the cost before you start." />
      </DialogContent>
    </Dialog>
  );
}
