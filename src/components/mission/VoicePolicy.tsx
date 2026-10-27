import { useState } from "react";
import { Check, Lock, Mic, Trash2 } from "lucide-react";
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
import { useCompanyRole, useEstimate, useStore } from "@/lib/store";
import {
  CATEGORY_LABELS,
  MODE_LABELS,
  POLICY_CATEGORIES,
  SITUATIONS,
  allowedModes,
  currentVoice,
  defaultSettings,
  isLocked,
  replyReadiness,
  splitList,
  type ResponseMode,
  type Situation,
  type VoiceProfile,
} from "@/lib/voicePolicy";
import { fmtDate } from "@/lib/format";
import { Panel, Pill } from "./primitives";
import { CostButton } from "./WorkControls";
import { ApprovalCard } from "./ApprovalCard";

const SOURCE_LABELS: Record<VoiceProfile["source"], string> = {
  default: "Starting default",
  questionnaire: "From your answers",
  analysis: "Learned from your writing",
  edits: "Learned from your edits",
  manual: "Edited by you",
};

/** Brand voice and response policy for the selected company (SPEC part G). */
export function VoiceAndPolicy() {
  const { db, companyId } = useStore();
  const { approved } = currentVoice(db.voice_profiles, companyId);
  const settings = db.response_settings.find((s) => s.company_id === companyId);
  const ready = replyReadiness(approved, settings);
  return (
    <div className="space-y-4">
      <Panel title="Before Sol replies to customers">
        <ul className="space-y-1.5 text-sm">
          <ChecklistItem done={ready.voiceApproved}>
            Approve a brand voice (learned from your writing, or edited by you)
          </ChecklistItem>
          <ChecklistItem done={ready.policyReviewed}>
            Review the response policy below
          </ChecklistItem>
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          {ready.ready
            ? "You're set. Sol only sends on its own for the categories you've switched to automatic."
            : "Until both are done, Sol drafts every reply for you to approve and sends nothing on its own."}
        </p>
      </Panel>
      <VoicePanel />
      <ExamplesPanel />
      <PolicyPanel />
    </div>
  );
}

function ChecklistItem({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span
        className={
          done
            ? "mt-0.5 grid h-4 w-4 place-items-center rounded-full bg-success text-primary-foreground"
            : "mt-0.5 h-4 w-4 rounded-full border"
        }
        aria-hidden
      >
        {done && <Check className="h-3 w-3" />}
      </span>
      <span className={done ? "text-muted-foreground" : ""}>
        {children}
        <span className="sr-only">{done ? " (done)" : " (to do)"}</span>
      </span>
    </li>
  );
}

function VoicePanel() {
  const { db, companyId, learnVoice } = useStore();
  const role = useCompanyRole(companyId);
  const founder = role === "founder";
  const estimate = useEstimate("voice");
  const { approved, proposed } = currentVoice(db.voice_profiles, companyId);
  const pending = db.approvals.find(
    (a) => a.company_id === companyId && a.status === "pending" && a.action_type === "update_voice",
  );
  const [editing, setEditing] = useState(false);
  return (
    <Panel
      title="Brand voice"
      action={
        approved && (
          <span className="text-xs text-muted-foreground">
            v{approved.version} · {SOURCE_LABELS[approved.source]}
          </span>
        )
      }
    >
      {approved && !editing && <VoiceSummary v={approved} />}
      {approved && editing && <VoiceEditor v={approved} onDone={() => setEditing(false)} />}
      {pending ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Sol has proposed a new version. It only takes effect when you give it a GO.
          </p>
          <ApprovalCard a={pending} />
        </div>
      ) : (
        proposed && (
          <p className="mt-3 text-xs text-muted-foreground">
            Version {proposed.version} is waiting to be reviewed.
          </p>
        )
      )}
      {founder && !editing && (
        <div className="mt-3 flex flex-wrap items-start gap-3">
          <div>
            <CostButton
              cost={estimate}
              label="Learn my voice"
              icon={<Mic className="h-3.5 w-3.5" />}
              disabled={!!pending}
              onConfirm={() => learnVoice(companyId)}
            />
          </div>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Edit it myself
          </Button>
        </div>
      )}
      {!founder && (
        <p className="mt-3 text-xs text-muted-foreground">Only a founder can change the voice.</p>
      )}
    </Panel>
  );
}

function VoiceSummary({ v }: { v: VoiceProfile }) {
  const row = (k: string, val: React.ReactNode) => (
    <div className="flex gap-3 text-sm">
      <span className="w-28 shrink-0 text-xs text-muted-foreground">{k}</span>
      <span className="min-w-0 break-words">{val}</span>
    </div>
  );
  return (
    <div className="space-y-2">
      <p className="text-sm leading-relaxed">{v.summary}</p>
      {row(
        "Traits",
        <span className="flex flex-wrap gap-1">
          {v.traits.map((t) => (
            <Pill key={t}>{t}</Pill>
          ))}
        </span>,
      )}
      {v.use_phrases.length > 0 && row("Says", v.use_phrases.join(", "))}
      {v.avoid_phrases.length > 0 && row("Never says", v.avoid_phrases.join(", "))}
      {row("Sign-off", v.sign_off ?? "None")}
      {row("Emoji", v.emoji === "none" ? "None" : v.emoji === "sparing" ? "Sparingly" : "Often")}
      {row("Spelling", `${v.spelling} · ${v.reading_level} reading level`)}
    </div>
  );
}

function VoiceEditor({ v, onDone }: { v: VoiceProfile; onDone: () => void }) {
  const { companyId, saveVoiceProfile } = useStore();
  const [summary, setSummary] = useState(v.summary);
  const [traits, setTraits] = useState(v.traits.join(", "));
  const [use, setUse] = useState(v.use_phrases.join(", "));
  const [avoid, setAvoid] = useState(v.avoid_phrases.join(", "));
  const [signOff, setSignOff] = useState(v.sign_off ?? "");
  const [emoji, setEmoji] = useState<VoiceProfile["emoji"]>(v.emoji);
  const save = async () => {
    const t = splitList(traits, 8);
    if (!summary.trim() || !t.length) {
      toast.error("Add a short description and at least one trait.");
      return;
    }
    const ok = await saveVoiceProfile(companyId, {
      summary: summary.trim(),
      traits: t,
      use_phrases: splitList(use),
      avoid_phrases: splitList(avoid),
      sign_off: signOff.trim() || null,
      emoji,
    });
    if (ok) {
      toast.success("Brand voice saved. Sol uses it from the next draft.");
      onDone();
    }
  };
  return (
    <div className="space-y-3 text-sm">
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">How you sound, in a sentence or two</span>
        <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Traits (up to 8, comma-separated)</span>
        <Input value={traits} onChange={(e) => setTraits(e.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Phrases you use</span>
        <Input value={use} onChange={(e) => setUse(e.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Phrases Sol must never use</span>
        <Input value={avoid} onChange={(e) => setAvoid(e.target.value)} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Sign-off</span>
          <Input
            value={signOff}
            onChange={(e) => setSignOff(e.target.value)}
            placeholder="e.g. Thanks, Rory"
          />
        </label>
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Emoji</span>
          <Select value={emoji} onValueChange={(e) => setEmoji(e as VoiceProfile["emoji"])}>
            <SelectTrigger aria-label="Emoji">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="sparing">Sparingly</SelectItem>
              <SelectItem value="often">Often</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void save()}>
          Save voice
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ExamplesPanel() {
  const { db, companyId, addVoiceExample, removeVoiceExample } = useStore();
  const role = useCompanyRole(companyId);
  const canEdit = role === "founder" || role === "teammate";
  const examples = db.voice_examples.filter((x) => x.company_id === companyId);
  const [situation, setSituation] = useState<Situation>("general_enquiry");
  const [body, setBody] = useState("");
  const add = async () => {
    if (!body.trim()) return;
    if (await addVoiceExample(companyId, situation, body)) setBody("");
  };
  return (
    <Panel title="Example replies">
      <p className="text-xs text-muted-foreground">
        Replies you're happy with. Sol uses them as models when drafting for the same situation.
      </p>
      <ul className="mt-2 space-y-2">
        {examples.map((x) => (
          <li key={x.id} className="rounded-tile bg-soft p-3 text-sm shadow-tile">
            <div className="mb-1 flex items-center justify-between gap-2">
              <Pill tone="info">{CATEGORY_LABELS[x.situation]}</Pill>
              {canEdit && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  aria-label="Remove example"
                  onClick={() => void removeVoiceExample(x.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <p className="whitespace-pre-line leading-relaxed">{x.body}</p>
          </li>
        ))}
        {!examples.length && <li className="text-sm text-muted-foreground">No examples yet.</li>}
      </ul>
      {canEdit && (
        <div className="mt-3 space-y-2">
          <Select value={situation} onValueChange={(s) => setSituation(s as Situation)}>
            <SelectTrigger aria-label="Situation" className="sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SITUATIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {CATEGORY_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Paste a reply you'd send again"
            aria-label="Example reply"
          />
          <Button size="sm" variant="outline" disabled={!body.trim()} onClick={() => void add()}>
            Add example
          </Button>
        </div>
      )}
    </Panel>
  );
}

function PolicyPanel() {
  const { db, companyId, setResponsePolicy, updateResponseSettings } = useStore();
  const founder = useCompanyRole(companyId) === "founder";
  const policies = db.response_policies.filter((p) => p.company_id === companyId);
  const settings =
    db.response_settings.find((s) => s.company_id === companyId) ?? defaultSettings(companyId);
  const [disclosure, setDisclosure] = useState(settings.disclosure_text);
  const modeOf = (c: (typeof POLICY_CATEGORIES)[number]): ResponseMode =>
    policies.find((p) => p.category === c)?.mode ?? (isLocked(c) ? "escalate" : "draft");
  return (
    <Panel
      title="Response policy"
      action={
        <span className="text-xs text-muted-foreground">
          {settings.policy_reviewed_at
            ? `Reviewed ${fmtDate(settings.policy_reviewed_at)}`
            : "Not reviewed yet"}
        </span>
      }
      bodyClassName="p-0"
    >
      <p className="px-4 pt-1 text-xs text-muted-foreground">
        What Sol may do with each kind of message. Anything involving money, legal matters, safety,
        personal data or someone who seems vulnerable always comes to you.
      </p>
      <ul className="mt-2">
        {POLICY_CATEGORIES.map((c) => (
          <li
            key={c}
            className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5"
          >
            <span className="flex items-center gap-1.5 text-sm">
              {CATEGORY_LABELS[c]}
              {isLocked(c) && (
                <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Always escalates" />
              )}
            </span>
            {founder && !isLocked(c) ? (
              <Select
                value={modeOf(c)}
                onValueChange={(m) => void setResponsePolicy(companyId, c, m as ResponseMode)}
              >
                <SelectTrigger aria-label={`${CATEGORY_LABELS[c]} policy`} className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allowedModes(c).map((m) => (
                    <SelectItem key={m} value={m}>
                      {MODE_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Pill tone={modeOf(c) === "auto_send" ? "success" : "neutral"}>
                {MODE_LABELS[modeOf(c)]}
              </Pill>
            )}
          </li>
        ))}
      </ul>
      <div className="space-y-3 border-t px-4 py-3">
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">
            AI disclosure, added to every reply Sol sends on its own
          </span>
          <div className="flex gap-2">
            <Input
              value={disclosure}
              disabled={!founder}
              onChange={(e) => setDisclosure(e.target.value)}
              aria-label="AI disclosure"
            />
            {founder && (
              <Button
                size="sm"
                variant="outline"
                disabled={disclosure.trim() === settings.disclosure_text}
                onClick={() =>
                  void updateResponseSettings(companyId, { disclosure_text: disclosure }).then(
                    (ok) => ok && toast.success("Disclosure saved"),
                  )
                }
              >
                Save
              </Button>
            )}
          </div>
        </label>
        <InboxBudget founder={founder} current={settings.inbox_daily_cap} />
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Also add it to replies I approve</span>
          <Switch
            checked={settings.disclosure_on_approved}
            disabled={!founder}
            onCheckedChange={(v) =>
              void updateResponseSettings(companyId, { disclosure_on_approved: v })
            }
          />
        </label>
        {founder && (
          <Button
            size="sm"
            onClick={() =>
              void updateResponseSettings(companyId, { mark_reviewed: true }).then(
                (ok) => ok && toast.success("Policy marked as reviewed"),
              )
            }
          >
            <Check className="h-3.5 w-3.5" />
            I've reviewed this policy
          </Button>
        )}
      </div>
    </Panel>
  );
}

/** The daily inbox budget (Phase 14): 0 means Sol only reads messages when asked. */
function InboxBudget({ founder, current }: { founder: boolean; current: number }) {
  const { companyId, updateResponseSettings } = useStore();
  const [value, setValue] = useState(String(current));
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">
        Daily inbox budget: credits Sol may spend reading and answering new messages by itself
        (about 20 each). 0 means only when you ask.
      </span>
      <div className="flex gap-2">
        <Input
          className="w-28"
          inputMode="numeric"
          value={value}
          disabled={!founder}
          aria-label="Daily inbox budget"
          onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
        />
        {founder && (
          <Button
            size="sm"
            variant="outline"
            disabled={Number(value) === current}
            onClick={() =>
              void updateResponseSettings(companyId, { inbox_daily_cap: Number(value) }).then(
                (ok) => ok && toast.success("Inbox budget saved"),
              )
            }
          >
            Save
          </Button>
        )}
      </div>
    </label>
  );
}
