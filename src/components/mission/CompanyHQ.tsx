import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, GripVertical, Mic, RotateCcw } from "lucide-react";
import { useCompany, useStore } from "@/lib/store";
import { defaultLayout, layoutFor, type Widget } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { MissionHeader } from "./MissionHeader";
import { AskSolBar } from "./AskSolBar";
import { AttributionCard } from "./LinkLayer";
import { BriefCard } from "./BriefCard";
import {
  ChannelsCard,
  EvidenceCard,
  FlightPlanCard,
  InboxCard,
  LeadsCard,
  ResponseTimesCard,
  GoNoGoCard,
  NextWindowsCard,
  OvernightBurnCard,
  TelemetryCard,
  VehicleCard,
} from "./HQCards";

/**
 * Mission HQ (docs/DESIGN.md section 4): header, Ask Sol, the flight plan and a
 * grid of six cards that founders can hide and reorder. Mentors see it read-only.
 * The cards depend on the entry path and stage (Phase 10, `dashboardCards`).
 */
export function CompanyHQ({
  companyId,
  readOnly,
}: {
  companyId: string;
  readOnly?: boolean | undefined;
}) {
  const { db, user, saveLayout } = useStore();
  const company = useCompany(companyId);
  const [chatOpen, setChatOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [drag, setDrag] = useState<Widget | null>(null);
  const layout = layoutFor(db.layouts[user.id], company);
  const keepGoing = company.entry_path === "keep_going";

  const reorder = (from: Widget, to: Widget) => {
    const next = [...layout];
    const index = next.findIndex((w) => w.id === from);
    const target = next.findIndex((w) => w.id === to);
    if (index < 0 || target < 0) return;
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(target, 0, item);
    saveLayout(next);
  };

  const card = (id: Widget): ReactNode => {
    switch (id) {
      case "GO / NO-GO":
        return (
          <GoNoGoCard
            companyId={companyId}
            readOnly={readOnly}
            onAskWhy={() => setChatOpen(true)}
          />
        );
      case "Telemetry":
        return <TelemetryCard companyId={companyId} />;
      case "Vehicle":
        return <VehicleCard companyId={companyId} />;
      case "Channels":
        return <ChannelsCard companyId={companyId} />;
      case "Overnight burn":
        return <OvernightBurnCard companyId={companyId} />;
      case "Next windows":
        return <NextWindowsCard companyId={companyId} />;
      case "Evidence":
        return <EvidenceCard companyId={companyId} />;
      case "Leads":
        return <LeadsCard companyId={companyId} />;
      case "Inbox":
        return <InboxCard companyId={companyId} />;
      case "Response times":
        return <ResponseTimesCard companyId={companyId} />;
      case "Campaigns":
        return <AttributionCard companyId={companyId} />;
    }
  };

  return (
    <div className="flex flex-col gap-3.5">
      <MissionHeader
        companyId={companyId}
        readOnly={readOnly}
        onCustomise={readOnly ? undefined : () => setEditing(true)}
      />
      {!readOnly && <AskSolBar companyId={companyId} open={chatOpen} onOpenChange={setChatOpen} />}
      {!readOnly && <BriefCard companyId={companyId} />}
      {/* Debrief is a phone thing: straight after a meeting (SPEC P). */}
      {!readOnly && (
        <Button asChild variant="outline" className="tab:hidden">
          <Link to="/debrief">
            <Mic className="h-4 w-4" />
            Debrief a meeting
          </Link>
        </Button>
      )}
      {/* Start up companies steer by the flight plan; Keep going ones by leads and replies. */}
      {!keepGoing && <FlightPlanCard companyId={companyId} readOnly={readOnly} />}
      <div className="grid items-start gap-3 tab:grid-cols-2 desk:grid-cols-3">
        {layout
          .filter((w) => w.visible)
          .map((w) => (
            <div key={w.id} className="min-w-0">
              {card(w.id)}
            </div>
          ))}
      </div>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Customise HQ</DialogTitle>
            <DialogDescription>Choose which cards show, and their order.</DialogDescription>
          </DialogHeader>
          <div className="divide-y">
            {layout.map((w, i) => (
              <div
                key={w.id}
                draggable
                onDragStart={() => setDrag(w.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (drag) reorder(drag, w.id);
                  setDrag(null);
                }}
                className="flex items-center gap-2 py-2"
              >
                <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" />
                <span className="flex-1 text-sm">{w.id}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={i === 0}
                  aria-label={`Move ${w.id} up`}
                  onClick={() => {
                    const before = layout[i - 1];
                    if (before) reorder(w.id, before.id);
                  }}
                >
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={i === layout.length - 1}
                  aria-label={`Move ${w.id} down`}
                  onClick={() => {
                    const after = layout[i + 1];
                    if (after) reorder(w.id, after.id);
                  }}
                >
                  <ArrowDown className="h-3 w-3" />
                </Button>
                <Switch
                  checked={w.visible}
                  aria-label={`Show ${w.id}`}
                  onCheckedChange={(visible) =>
                    saveLayout(layout.map((x) => (x.id === w.id ? { ...x, visible } : x)))
                  }
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between gap-3">
            <Button variant="outline" onClick={() => saveLayout(defaultLayout(company))}>
              <RotateCcw className="h-4 w-4" />
              Restore default
            </Button>
            <Button onClick={() => setEditing(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
