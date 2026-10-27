import { useState } from "react";
import { FlaskConical, Scale, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useCompanyRole, useEstimate, useStore } from "@/lib/store";
import { CostButton } from "./WorkControls";

/** Stay legal: Sol checks the calendar against the usual UK deadlines (compliance-calendar). */
export function CheckDeadlinesButton() {
  const { companyId, work } = useStore();
  const cost = useEstimate("compliance");
  const role = useCompanyRole(companyId);
  if (role !== "founder" && role !== "teammate") return null;
  return (
    <div>
      <CostButton
        label="Check my deadlines"
        cost={cost}
        icon={<Scale className="h-3.5 w-3.5" />}
        onConfirm={() => work(companyId, "Check the compliance calendar", cost, "compliance")}
      />
    </div>
  );
}

/** Raise: Sol drafts this month's investor update as a document (investor-update). */
export function InvestorUpdateButton() {
  const { companyId, work } = useStore();
  const cost = useEstimate("investor");
  const role = useCompanyRole(companyId);
  if (role !== "founder" && role !== "teammate") return null;
  return (
    <div>
      <CostButton
        label="Draft investor update"
        cost={cost}
        icon={<TrendingUp className="h-3.5 w-3.5" />}
        onConfirm={() => work(companyId, "Draft this month's investor update", cost, "investor")}
      />
    </div>
  );
}

/** Evidence: turn an idea into assumptions and a smoke test (evidence-plan). */
export function PlanEvidence({ idea: preset }: { idea?: string }) {
  const { companyId, work } = useStore();
  const cost = useEstimate("evidence");
  const role = useCompanyRole(companyId);
  const [idea, setIdea] = useState(preset ?? "");
  if (role !== "founder" && role !== "teammate") return null;
  return (
    <div className="flex flex-wrap items-start gap-2">
      {preset === undefined && (
        <Input
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="An idea to test, e.g. a revision app for parents"
          aria-label="Idea to test"
          className="max-w-sm"
        />
      )}
      <div>
        <CostButton
          label="Plan the evidence"
          cost={cost}
          disabled={!idea.trim()}
          icon={<FlaskConical className="h-3.5 w-3.5" />}
          onConfirm={() =>
            work(companyId, `Evidence plan: ${idea.trim()}`, cost, "evidence", idea.trim())
          }
        />
      </div>
    </div>
  );
}
