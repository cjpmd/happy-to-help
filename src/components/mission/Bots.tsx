// Run → Bots (Phase 17): founders add bots from templates, switch them on, choose how emails are
// approved, cap their credits and reword their steps. Every step a bot takes is listed.
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCompanyRole, useStore } from "@/lib/store";
import type { Bot } from "@/lib/storeContext";
import { describeStep, describeTrigger, type BotStep } from "@/lib/bots";
import { fmtShortDate } from "@/lib/format";
import { Panel, Pill, StatusPill } from "./primitives";

export function BotsPage() {
  const { companyId, db, createBot, mode } = useStore();
  const founder = useCompanyRole(companyId) === "founder";
  const bots = db.bots.filter((b) => b.company_id === companyId);
  const available = db.bot_templates.filter((t) => !bots.some((b) => b.template === t.key));
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Bots take care of routine follow-ups. Each one starts switched off. Emails wait for your GO
        unless you approve a bot's wording; marketing emails go only to people who opted in, and
        each bot has a weekly credit cap.
        {mode === "demo" ? " In the demo you can set bots up; they run on the live service." : ""}
      </p>
      {bots.map((b) => (
        <BotPanel key={b.id} b={b} founder={founder} />
      ))}
      {available.length ? (
        <Panel title="Add a bot">
          <ul className="grid gap-3 md:grid-cols-2">
            {available.map((t) => (
              <li key={t.key} className="space-y-2 rounded-card border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{t.name}</span>
                  {t.needs ? <Pill>Needs {t.needs === "stripe" ? "Stripe" : t.needs}</Pill> : null}
                </div>
                <p className="text-sm text-muted-foreground">{t.description}</p>
                <p className="text-xs">{describeTrigger(t.trigger)}</p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!founder}
                  onClick={() =>
                    void createBot(companyId, t.key).then(
                      (ok) => ok && toast.success(`${t.name} added. It's switched off.`),
                    )
                  }
                >
                  Add
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}

function BotPanel({ b, founder }: { b: Bot; founder: boolean }) {
  const { db, updateBot, deleteBot } = useStore();
  const [editing, setEditing] = useState(false);
  const runs = db.bot_runs.filter((r) => r.bot_id === b.id && r.status !== "pending");
  const planned = db.bot_runs.filter((r) => r.bot_id === b.id && r.status === "pending").length;
  const name = (id: string | null) =>
    id ? (db.contacts.find((c) => c.id === id)?.name ?? "A contact") : "Weekly";
  const hasEmail = b.steps.some((s) => s.kind === "email");
  return (
    <Panel
      title={
        <span className="flex flex-wrap items-center gap-2">
          {b.name} <StatusPill status={b.enabled ? "on" : "off"} />
        </span>
      }
      action={
        <label className="flex items-center gap-2 text-xs">
          {b.enabled ? "On" : "Off"}
          <Switch
            aria-label={`Switch ${b.name} ${b.enabled ? "off" : "on"}`}
            checked={b.enabled}
            disabled={!founder}
            onCheckedChange={(v) => void updateBot(b.id, { enabled: v })}
          />
        </label>
      }
    >
      <div className="space-y-4 text-sm">
        <div>
          <p className="font-medium">{describeTrigger(b.trigger)}</p>
          {editing ? (
            <StepsEditor b={b} onDone={() => setEditing(false)} />
          ) : (
            <ol className="mt-1 list-decimal space-y-0.5 pl-5">
              {b.steps.map((s, i) => (
                <li key={i}>{describeStep(s)}</li>
              ))}
            </ol>
          )}
          {b.conditions.stop_if_replied || b.conditions.stop_if_won ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Stops when they {b.conditions.stop_if_replied ? "reply" : ""}
              {b.conditions.stop_if_replied && b.conditions.stop_if_won ? " or " : ""}
              {b.conditions.stop_if_won ? "become a customer" : ""}.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-end gap-4">
          {hasEmail ? (
            <label className="space-y-1">
              <span className="block text-xs text-muted-foreground">Emails</span>
              <Select
                value={b.approval_level}
                disabled={!founder}
                onValueChange={(v) =>
                  void updateBot(b.id, { approval_level: v as Bot["approval_level"] }).then(
                    (ok) =>
                      ok &&
                      v === "approved_wording" &&
                      toast.success("Wording approved. Emails will go without asking each time."),
                  )
                }
              >
                <SelectTrigger className="w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="each">Ask me before every email</SelectItem>
                  <SelectItem value="approved_wording">
                    Send with the wording I approve now
                  </SelectItem>
                </SelectContent>
              </Select>
            </label>
          ) : null}
          <label className="space-y-1">
            <span className="block text-xs text-muted-foreground">Weekly credit cap</span>
            <Input
              type="number"
              min={0}
              max={2000}
              className="w-24"
              disabled={!founder}
              defaultValue={b.cap_credits_week}
              onBlur={(e) => {
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= 0 && n <= 2000 && n !== b.cap_credits_week)
                  void updateBot(b.id, { cap_credits_week: n });
              }}
            />
          </label>
          {founder && !editing && b.steps.some((s) => s.kind !== "summary") ? (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Edit steps
            </Button>
          ) : null}
          {founder ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void deleteBot(b.id).then((ok) => ok && toast.success("Bot removed"))}
            >
              Remove
            </Button>
          ) : null}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">
            {runs.length || planned
              ? `${planned} step${planned === 1 ? "" : "s"} planned. Recent:`
              : "Nothing yet."}
          </p>
          {runs.length ? (
            <ul className="mt-1 space-y-1">
              {runs.slice(0, 6).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 text-xs">
                  <span>{name(r.contact_id)}</span>
                  <span className="text-muted-foreground">step {r.step + 1}</span>
                  <StatusPill status={r.status} />
                  {r.reason ? <span className="text-muted-foreground">{r.reason}</span> : null}
                  {r.finished_at ? (
                    <span className="text-muted-foreground">{fmtShortDate(r.finished_at)}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}

function StepsEditor({ b, onDone }: { b: Bot; onDone: () => void }) {
  const { updateBot } = useStore();
  const [steps, setSteps] = useState<BotStep[]>(b.steps);
  const set = (i: number, patch: Partial<BotStep>) =>
    setSteps((xs) => xs.map((s, j) => (j === i ? ({ ...s, ...patch } as BotStep) : s)));
  return (
    <div className="mt-2 space-y-3">
      {steps.map((s, i) => (
        <div key={i} className="space-y-2 rounded-card border p-3">
          <label className="flex items-center gap-2 text-xs">
            Step {i + 1}: after
            <Input
              type="number"
              min={0}
              max={90}
              className="w-20"
              aria-label={`Days before step ${i + 1}`}
              value={s.after_days}
              onChange={(e) => set(i, { after_days: Number(e.target.value) })}
            />
            days
          </label>
          {s.kind === "email" ? (
            <>
              <Input
                aria-label={`Subject of step ${i + 1}`}
                value={s.subject}
                onChange={(e) => set(i, { subject: e.target.value })}
              />
              <Textarea
                aria-label={`Message of step ${i + 1}`}
                rows={5}
                value={s.body}
                onChange={(e) => set(i, { body: e.target.value })}
              />
            </>
          ) : s.kind === "task" ? (
            <Input
              aria-label={`Task of step ${i + 1}`}
              value={s.title}
              onChange={(e) => set(i, { title: e.target.value })}
            />
          ) : (
            <p className="text-xs text-muted-foreground">{describeStep(s)}</p>
          )}
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Use {"{first_name}"} and {"{company}"} to fill in names. Changing the wording means
        approving it again.
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => void updateBot(b.id, { steps }).then((ok) => ok && onDone())}
        >
          Save steps
        </Button>
        <Button size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
