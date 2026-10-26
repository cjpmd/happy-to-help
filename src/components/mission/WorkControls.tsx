import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Zap, ShieldCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useBalance, useClaimsCheck, useStore } from "@/lib/store";
import { actionQuote } from "@/lib/credits";
import { defaultPreferences, type Proof, hasProof } from "@/lib/workspace";
import { Pill } from "./primitives";
export function Why({
  reason = "This action advances the next company milestone. The current company records and customer feedback inform the draft.",
}: {
  reason?: string | undefined;
}) {
  const { db, user } = useStore();
  const level = (db.preferences[user.id] ?? defaultPreferences()).explanation;
  return (
    <details className="mt-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer">Why?</summary>
      <p className="mt-2 leading-relaxed">{reason}</p>
      {level === "more" && (
        <p className="mt-2 leading-relaxed">
          Treat this as a test, not a guarantee. Compare the result with the previous baseline
          before spending more.
        </p>
      )}
    </details>
  );
}
export function ClaimsCheck({ text, companyId }: { text: string; companyId?: string }) {
  const flags = useClaimsCheck(companyId)(text);
  let cursor = 0;
  const fragments: ReactNode[] = [];
  for (const f of flags) {
    if (f.start < cursor) continue;
    fragments.push(text.slice(cursor, f.start));
    fragments.push(
      <mark key={f.start} className="bg-warning-soft text-warning" title={f.reason}>
        {f.phrase}
      </mark>,
    );
    cursor = f.end;
  }
  fragments.push(text.slice(cursor));
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer">
        <Pill tone={flags.length ? "warning" : "success"}>
          {flags.length ? <ShieldAlert className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
          Claims check · {flags.length ? "flagged" : "passed"}
        </Pill>
      </summary>
      {flags.length > 0 && (
        <div className="mt-2 space-y-2">
          <p className="leading-relaxed">{fragments}</p>
          {flags.map((f, i) => (
            <p key={i} className="text-warning">
              “{f.phrase}” — {f.reason}
            </p>
          ))}
        </div>
      )}
      <p className="mt-2 text-muted-foreground">
        Demo wording check; not independent verification or legal clearance.
      </p>
    </details>
  );
}
export function CostButton({
  cost,
  label,
  onConfirm,
  disabled = false,
  icon,
  variant = "outline",
}: {
  cost: number;
  label: string;
  onConfirm: () => void | Promise<unknown>;
  disabled?: boolean;
  /** Pass null for no icon. */
  icon?: ReactNode | null;
  /** "default" makes it the primary (ink) button, e.g. GO. */
  variant?: "default" | "outline";
}) {
  const balance = useBalance();
  const { solTyping } = useStore();
  const q = actionQuote(balance, cost);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant={variant}
        disabled={disabled || solTyping}
        onClick={() => setOpen(true)}
      >
        {icon === null ? null : (icon ?? <Zap className="h-3.5 w-3.5" />)}
        <span>
          {label} · ≈ {cost} CR
        </span>
      </Button>
      <span className="block mt-1 text-[11px] text-muted-foreground">
        {q.affordable
          ? `${q.after.toLocaleString("en-GB")} CR left after`
          : "Not enough credits. Top up to continue."}
      </span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{q.affordable ? label : "Top up to continue"}</DialogTitle>
            <DialogDescription>
              ≈ {cost} CR · balance {balance.toLocaleString("en-GB")} CR ·{" "}
              {q.affordable
                ? `${q.after.toLocaleString("en-GB")} CR left after`
                : `${cost - balance} CR more needed`}
              . Demo work only.
            </DialogDescription>
          </DialogHeader>
          {q.affordable ? (
            <Button
              onClick={() => {
                setOpen(false);
                void onConfirm();
              }}
            >
              Confirm · ≈ {cost} CR
            </Button>
          ) : (
            <Button asChild>
              <Link to="/billing">Top up credits</Link>
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
export function ProofOfDone({ proof }: { proof?: Proof | undefined }) {
  return hasProof(proof) ? (
    <div className="mt-2 space-y-2 text-xs">
      <Pill tone="success">
        Checks passed · {proof?.passed}/{proof?.total}
      </Pill>
      {proof?.screenshot && (
        <img
          src={proof.screenshot}
          alt="Completion evidence"
          className="max-h-36 rounded-tile border"
        />
      )}
      <div className="flex gap-4">
        <a href={proof?.preview} target="_blank" rel="noreferrer" className="text-ink underline">
          Preview
        </a>
        <a href={proof?.pr} target="_blank" rel="noreferrer" className="text-ink underline">
          Pull request
        </a>
      </div>
    </div>
  ) : (
    <Pill className="mt-2" tone="warning">
      Unverified
    </Pill>
  );
}
