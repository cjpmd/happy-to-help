import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Mic, Pencil, Share2, Square, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCompanyRole, useEstimate, useStore } from "@/lib/store";
import type { ItemChanges } from "@/lib/storeContext";
import {
  KIND_LABELS,
  followUpQuestions,
  groupForReview,
  missingDetails,
  acceptableInBulk,
  type CaptureSource,
  type ExtractedItem,
} from "@/lib/capture";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Panel, Pill } from "./primitives";

const FROM: Record<CaptureSource, string> = {
  voice_note: "From your note",
  debrief: "From your debrief",
  transcript: "From your meeting",
  recording: "From your meeting",
};

/** The team someone can assign an action to, plus Sol. */
function useOwners(companyId: string) {
  const { db } = useStore();
  return db.company_members
    .filter((m) => m.company_id === companyId && (m.role === "founder" || m.role === "teammate"))
    .map((m) => ({
      id: m.user_id,
      role: m.role as "founder" | "teammate",
      name: db.profiles.find((p) => p.id === m.user_id)?.full_name ?? "Someone",
    }));
}

const at = (s: number | undefined) =>
  s === undefined ? "" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** "From your meeting": review what Sol found. Nothing is created until it's accepted. */
export function ReviewCard({ captureId }: { captureId: string }) {
  const { db, acceptAllItems } = useStore();
  const cap = db.captures.find((c) => c.id === captureId);
  const items = db.extracted_items.filter((i) => i.capture_id === captureId);
  const pending = items.filter((i) => i.status === "pending");
  const groups = groupForReview(pending);
  const bulk = pending.filter(acceptableInBulk).length;
  const [showPossibly, setShowPossibly] = useState(false);
  const canEdit = ["founder", "teammate"].includes(useCompanyRole(cap?.company_id) ?? "");
  if (!cap) return null;
  return (
    <section className="rounded-card border bg-card shadow-card" aria-label={FROM[cap.source]}>
      <header className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-3">
        <div>
          <h2 className="label-caps text-[13px] tracking-[0.16em]">{FROM[cap.source]}</h2>
          <p className="text-xs text-muted-foreground">
            {cap.title ? `${cap.title} · ` : ""}
            {fmtDate(cap.created_at)} · {pending.length} to review
          </p>
        </div>
        {canEdit && bulk > 0 && (
          <Button
            size="sm"
            onClick={() =>
              void acceptAllItems(captureId).then(
                (n) => n !== null && toast.success(`Accepted ${n} ${n === 1 ? "item" : "items"}.`),
              )
            }
          >
            <Check className="h-3.5 w-3.5" />
            Accept all ({bulk})
          </Button>
        )}
      </header>
      <ul className="mt-2">
        {groups.main.map((i) => (
          <ItemRow key={i.id} item={i} canEdit={canEdit} />
        ))}
        {!groups.main.length && !groups.possibly.length && !groups.sensitive.length && (
          <li className="border-t px-4 py-3 text-sm text-muted-foreground">
            All reviewed. Accepted items are in your tasks, ideas and promises.
          </li>
        )}
      </ul>
      {groups.possibly.length > 0 && (
        <div className="border-t">
          <button
            type="button"
            className="flex w-full items-center gap-1.5 px-4 py-2.5 text-left text-xs text-muted-foreground"
            aria-expanded={showPossibly}
            onClick={() => setShowPossibly((v) => !v)}
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition", showPossibly && "rotate-180")} />
            Possibly ({groups.possibly.length}): Sol isn't sure these were meant
          </button>
          {showPossibly && (
            <ul>
              {groups.possibly.map((i) => (
                <ItemRow key={i.id} item={i} canEdit={canEdit} />
              ))}
            </ul>
          )}
        </div>
      )}
      {groups.sensitive.length > 0 && (
        <div className="border-t">
          <p className="px-4 pt-2.5 text-xs text-muted-foreground">
            Sounds personal ({groups.sensitive.length}): not filed unless you choose to.
          </p>
          <ul>
            {groups.sensitive.map((i) => (
              <ItemRow key={i.id} item={i} canEdit={canEdit} sensitive />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ItemRow({
  item,
  canEdit,
  sensitive = false,
}: {
  item: ExtractedItem;
  canEdit: boolean;
  sensitive?: boolean;
}) {
  const { decideItem } = useStore();
  const solCost = useEstimate("task");
  const owners = useOwners(item.company_id);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  const first = (n: string) => n.split(" ")[0]?.toLowerCase();
  const [owner, setOwner] = useState<string>(
    item.owner === "sol"
      ? "sol"
      : item.owner_name
        ? (owners.find((o) => first(o.name) === first(item.owner_name!))?.id ?? "")
        : "",
  );
  const [due, setDue] = useState(item.due_date ?? "");
  const missing = missingDetails({
    kind: item.kind,
    ...(owner === "sol"
      ? { owner: "sol" as const }
      : owner
        ? { owner: "founder" as const }
        : item.owner
          ? { owner: item.owner }
          : {}),
    ...(due ? { due_date: due } : {}),
  });
  const needsOwner = item.kind === "action" && (!item.owner || item.owner === "unknown");
  const needsDue = (item.kind === "action" || item.kind === "commitment") && !item.due_date;

  const accept = async () => {
    const changes: ItemChanges = {};
    if (text.trim() && text.trim() !== item.text) changes.text = text.trim();
    if (owner && (needsOwner || editing)) {
      if (owner === "sol") changes.owner = "sol";
      else {
        const o = owners.find((x) => x.id === owner);
        if (o) Object.assign(changes, { owner: o.role, owner_id: o.id, owner_name: o.name });
      }
    }
    if (due && due !== item.due_date) changes.due_date = due;
    const ok = await decideItem(item.id, "accept", changes, sensitive);
    if (ok) toast.success(acceptedMessage(item, owner === "sol" || item.owner === "sol"));
  };

  return (
    <li className="border-t px-4 py-3">
      <div className="flex flex-wrap items-start gap-2">
        <Pill
          tone={
            item.kind === "action" ? "info" : item.kind === "commitment" ? "warning" : "neutral"
          }
        >
          {KIND_LABELS[item.kind]}
        </Pill>
        {item.match_task_id && <Pill tone="success">Updates a task</Pill>}
        {item.kind === "action" && (item.owner === "sol" || owner === "sol") && (
          <span className="text-[11px] text-muted-foreground">Sol · ≈ {solCost} CR</span>
        )}
        {item.at_seconds !== undefined && (
          <span className="text-[11px] text-muted-foreground">at {at(item.at_seconds)}</span>
        )}
      </div>
      {editing ? (
        <Textarea
          className="mt-2"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Item text"
        />
      ) : (
        <p className="mt-1.5 text-sm leading-relaxed">{item.text}</p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        {[
          item.owner && item.owner !== "unknown" && !editing
            ? `Owner: ${item.owner === "sol" ? "Sol" : (item.owner_name ?? (item.owner === "founder" ? "you" : "a teammate"))}`
            : "",
          item.due_date ? `Due ${fmtDate(item.due_date)}` : "",
          item.contact_name ? `To ${item.contact_name}` : "",
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {canEdit && (needsOwner || needsDue || editing) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {(needsOwner || (editing && item.kind === "action")) && (
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger className="h-8 w-48" aria-label="Who's doing it">
                <SelectValue placeholder="Who's doing it?" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sol">Sol</SelectItem>
                {owners.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {(needsDue || editing) && (item.kind === "action" || item.kind === "commitment") && (
            <Input
              type="date"
              className="h-8 w-40"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              aria-label="Due date"
            />
          )}
        </div>
      )}
      {canEdit && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="sm" disabled={missing.length > 0} onClick={() => void accept()}>
            <Check className="h-3.5 w-3.5" />
            {sensitive ? "File it anyway" : "Accept"}
          </Button>
          {!editing && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => void decideItem(item.id, "dismiss")}>
            <X className="h-3.5 w-3.5" />
            Dismiss
          </Button>
          {missing.length > 0 && (
            <span className="self-center text-xs text-hold">
              {missing[0] === "owner" ? "Say who's doing it" : "Add a date"} to accept
            </span>
          )}
        </div>
      )}
    </li>
  );
}

function acceptedMessage(item: ExtractedItem, sol: boolean) {
  switch (item.kind) {
    case "action":
      return item.match_task_id
        ? "Updated the existing task."
        : sol
          ? "Queued for Sol."
          : "Added to the task list.";
    case "commitment":
      return "Tracked. Sol is drafting the follow-up for your GO.";
    case "idea":
      return "Added to your ideas.";
    case "memory_fact":
      return "Sol will remember it once you give it a GO.";
    case "feedback":
      return "Saved to customer feedback.";
    default:
      return "Accepted.";
  }
}

/** Debrief mode: Sol asks up to two questions when owners or dates are missing. */
export function FollowUpQuestions({ captureId }: { captureId: string }) {
  const { db, decideItem } = useStore();
  const owners = useOwners(db.captures.find((c) => c.id === captureId)?.company_id ?? "");
  const pending = db.extracted_items.filter(
    (i) => i.capture_id === captureId && i.status === "pending" && !i.sensitive,
  );
  const qs = followUpQuestions(pending);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  if (!qs.length) return null;
  return (
    <Panel title="Sol has a question">
      <ul className="space-y-3">
        {qs.map((q) => {
          const item = pending[q.index]!;
          const key = `${item.id}:${q.field}`;
          const value = answers[key] ?? "";
          const answer = async () => {
            const changes: ItemChanges = {};
            if (q.field === "due") changes.due_date = value;
            else if (value === "sol") changes.owner = "sol";
            else {
              const o = owners.find((x) => x.id === value);
              if (o) Object.assign(changes, { owner: o.role, owner_id: o.id, owner_name: o.name });
            }
            // Accept only if this answer completes it; otherwise the card keeps it for later.
            const rest = missingDetails({ ...item, ...changes }).filter((f) => f !== q.field);
            if (!rest.length && (await decideItem(item.id, "accept", changes)))
              toast.success("Thanks, that's filed.");
            else setAnswers((a) => ({ ...a, [key]: value }));
          };
          return (
            <li key={key} className="space-y-2">
              <p className="text-sm">{q.question}</p>
              <div className="flex flex-wrap gap-2">
                {q.field === "due" ? (
                  <Input
                    type="date"
                    className="h-9 w-44"
                    value={value}
                    aria-label={q.question}
                    onChange={(e) => setAnswers((a) => ({ ...a, [key]: e.target.value }))}
                  />
                ) : (
                  <Select
                    value={value}
                    onValueChange={(v) => setAnswers((a) => ({ ...a, [key]: v }))}
                  >
                    <SelectTrigger className="h-9 w-48" aria-label={q.question}>
                      <SelectValue placeholder="Choose someone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sol">Sol</SelectItem>
                      {owners.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button size="sm" variant="outline" disabled={!value} onClick={() => void answer()}>
                  Answer
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/** Records audio with the browser's MediaRecorder. Nothing leaves the device until it's sent. */
export function useRecorder() {
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState<{ blob: Blob; seconds: number } | null>(null);
  const supported =
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;
  useEffect(() => () => rec.current?.stream.getTracks().forEach((t) => t.stop()), []);
  const start = async () => {
    if (!supported) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const seconds = Math.max(1, Math.round((Date.now() - started.current) / 1000));
        setResult({
          blob: new Blob(chunks.current, { type: r.mimeType || "audio/webm" }),
          seconds,
        });
      };
      started.current = Date.now();
      r.start();
      rec.current = r;
      setResult(null);
      setRecording(true);
      return true;
    } catch {
      toast.error("Couldn't use the microphone. Check the browser's permission.");
      return false;
    }
  };
  const stop = () => {
    rec.current?.stop();
    rec.current = null;
    setRecording(false);
  };
  return { supported, recording, result, start, stop, reset: () => setResult(null) };
}

/** Reads an audio file's length in seconds, for the estimate. */
function audioSeconds(file: Blob): Promise<number> {
  return new Promise((resolve) => {
    const a = document.createElement("audio");
    a.preload = "metadata";
    a.onloadedmetadata = () => {
      URL.revokeObjectURL(a.src);
      resolve(Number.isFinite(a.duration) ? Math.ceil(a.duration) : 0);
    };
    a.onerror = () => resolve(0);
    a.src = URL.createObjectURL(file);
  });
}

/** Add a meeting: paste a transcript or upload a recording, with consent and the cost shown. */
export function AddMeeting({ onAdded }: { onAdded?: (id: string) => void }) {
  const { companyId, createCapture, estimateCapture, mode } = useStore();
  const [kind, setKind] = useState<"transcript" | "recording">("transcript");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [platform, setPlatform] = useState(false);
  const [informed, setInformed] = useState(false);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void estimateCapture(kind === "recording" ? seconds : undefined).then(setEstimate);
  }, [kind, seconds, estimateCapture]);
  const ready =
    (informed || platform) &&
    (kind === "transcript" ? text.trim().length > 0 : !!file && seconds > 0);
  const submit = async () => {
    setBusy(true);
    const id = await createCapture({
      companyId,
      source: kind,
      consent: platform ? "platform_transcript" : "participants_informed",
      title,
      ...(kind === "transcript" ? { text } : file ? { audio: file, durationSeconds: seconds } : {}),
    });
    setBusy(false);
    if (id) {
      toast.success("Sol is reading it. The review card will appear here.");
      setText("");
      setFile(null);
      setTitle("");
      onAdded?.(id);
    }
  };
  return (
    <Panel title="Add a meeting">
      <div className="space-y-3 text-sm">
        <div className="flex gap-1.5" role="radiogroup" aria-label="What are you adding?">
          {(["transcript", "recording"] as const).map((k) => (
            <Button
              key={k}
              size="sm"
              role="radio"
              aria-checked={kind === k}
              variant={kind === k ? "default" : "outline"}
              onClick={() => setKind(k)}
            >
              {k === "transcript" ? "Paste a transcript" : "Upload a recording"}
            </Button>
          ))}
        </div>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What was it? e.g. Call with the Quay Café"
          aria-label="Meeting title"
        />
        {kind === "transcript" ? (
          <Textarea
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the transcript (Zoom, Meet and Teams transcripts work as they are)"
            aria-label="Transcript"
          />
        ) : (
          <div className="space-y-1">
            <label className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-muted-foreground" />
              <input
                type="file"
                accept="audio/*,video/mp4,video/webm"
                aria-label="Recording"
                disabled={mode === "demo"}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f) void audioSeconds(f).then(setSeconds);
                }}
              />
            </label>
            {mode === "demo" && (
              <p className="text-xs text-muted-foreground">The demo can't transcribe audio.</p>
            )}
            {file && seconds > 0 && (
              <p className="text-xs text-muted-foreground">
                {Math.ceil(seconds / 60)} min. The audio is deleted once it's transcribed.
              </p>
            )}
          </div>
        )}
        <label className="flex items-start gap-2">
          <Checkbox checked={platform} onCheckedChange={(v) => setPlatform(v === true)} />
          <span>Zoom, Meet or Teams recorded it, with their recording notice</span>
        </label>
        {!platform && (
          <label className="flex items-start gap-2">
            <Checkbox checked={informed} onCheckedChange={(v) => setInformed(v === true)} />
            <span>Everyone in the meeting knew it was being recorded</span>
          </label>
        )}
        <Button disabled={!ready || busy} onClick={() => void submit()}>
          Send to Sol{estimate !== null ? ` · ≈ ${estimate} CR` : ""}
        </Button>
      </div>
    </Panel>
  );
}

/** Record or type a debrief (mobile-first). */
export function DebriefRecorder({ onAdded }: { onAdded: (id: string) => void }) {
  const { companyId, createCapture, estimateCapture, mode } = useStore();
  const rec = useRecorder();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [estimate, setEstimate] = useState<number | null>(null);
  const audio = mode === "live" && rec.supported;
  useEffect(() => {
    void estimateCapture(rec.result?.seconds).then(setEstimate);
  }, [rec.result, estimateCapture]);
  const send = async () => {
    setBusy(true);
    const id = await createCapture({
      companyId,
      source: "debrief",
      consent: "own_voice",
      ...(rec.result ? { audio: rec.result.blob, durationSeconds: rec.result.seconds } : { text }),
    });
    setBusy(false);
    if (id) {
      rec.reset();
      setText("");
      onAdded(id);
    }
  };
  return (
    <div className="space-y-4">
      {audio && (
        <div className="flex flex-col items-center gap-2 py-4">
          <button
            type="button"
            onClick={() => (rec.recording ? rec.stop() : void rec.start())}
            aria-label={rec.recording ? "Stop recording" : "Start recording"}
            className={cn(
              "grid h-24 w-24 place-items-center rounded-full border-2 shadow-card transition",
              rec.recording ? "border-hold bg-hold-bg text-hold" : "bg-surface text-ink",
            )}
          >
            {rec.recording ? <Square className="h-8 w-8" /> : <Mic className="h-9 w-9" />}
          </button>
          <p className="text-sm text-muted-foreground">
            {rec.recording
              ? "Recording… tap to stop"
              : rec.result
                ? `Recorded ${rec.result.seconds}s`
                : "Tap and talk for a minute or two about what happened"}
          </p>
        </div>
      )}
      {!rec.result && (
        <Textarea
          rows={audio ? 3 : 6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={audio ? "Or type it" : "What happened? Who's doing what, and by when?"}
          aria-label="Debrief"
        />
      )}
      <Button
        className="w-full"
        disabled={busy || rec.recording || (!rec.result && !text.trim())}
        onClick={() => void send()}
      >
        Send to Sol{estimate !== null ? ` · ≈ ${estimate} CR` : ""}
      </Button>
    </div>
  );
}

/** Share an accepted action or decision with the cohort's mentors (founders only). */
export function ShareToggle({ item }: { item: ExtractedItem }) {
  const { shareItem } = useStore();
  const founder = useCompanyRole(item.company_id) === "founder";
  if (!founder || item.status !== "accepted" || !["action", "decision"].includes(item.kind))
    return null;
  return (
    <Button
      size="sm"
      variant={item.shared ? "default" : "ghost"}
      className="h-7"
      aria-pressed={item.shared}
      onClick={() => void shareItem(item.id, !item.shared)}
    >
      <Share2 className="h-3.5 w-3.5" />
      {item.shared ? "Shared with mentors" : "Share with mentors"}
    </Button>
  );
}
