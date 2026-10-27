import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Mic } from "lucide-react";
import { toast } from "sonner";
import { RouteTabs } from "@/components/mission/RouteTabs";
import { PageHeader, Panel, Pill } from "@/components/mission/primitives";
import { AddMeeting, ReviewCard, ShareToggle } from "@/components/mission/Capture";
import { PlanEvidence } from "@/components/mission/SkillButtons";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCompanyRole, useStore } from "@/lib/store";
import { KIND_LABELS, commitmentsDue, type Capture } from "@/lib/capture";
import { fmtDate } from "@/lib/format";
import { pageHead } from "@/lib/seo";

type MeetingsTab = "meetings" | "ideas" | "promises";
const TABS: MeetingsTab[] = ["meetings", "ideas", "promises"];

export const Route = createFileRoute("/_app/meetings")({
  head: () =>
    pageHead("Meetings", "Notes, debriefs and meetings, and everything Sol found in them."),
  validateSearch: (search: Record<string, unknown>): { tab?: Exclude<MeetingsTab, "meetings"> } =>
    search["tab"] === "ideas" || search["tab"] === "promises" ? { tab: search["tab"] } : {},
  component: Meetings,
});

const SOURCE: Record<Capture["source"], string> = {
  voice_note: "Voice note",
  debrief: "Debrief",
  transcript: "Transcript",
  recording: "Recording",
};
const STATUS: Record<
  Capture["status"],
  { label: string; tone: "neutral" | "info" | "warning" | "success" | "destructive" }
> = {
  transcribing: { label: "Transcribing", tone: "info" },
  extracting: { label: "Sol is reading", tone: "info" },
  review: { label: "To review", tone: "warning" },
  done: { label: "Reviewed", tone: "success" },
  failed: { label: "Failed", tone: "destructive" },
};

function Meetings() {
  const { tab = "meetings" } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <div>
      <PageHeader
        title="Meetings"
        description="Talk to Sol after a meeting, or add a transcript or recording. Sol pulls out the actions, decisions, ideas and promises for you to accept."
      />
      <RouteTabs<MeetingsTab>
        label="Meetings"
        value={TABS.includes(tab) ? tab : "meetings"}
        onValueChange={(t) =>
          void navigate({ search: t === "meetings" ? {} : { tab: t }, replace: true })
        }
        tabs={[
          { value: "meetings", label: "Meetings", content: <MeetingList /> },
          { value: "ideas", label: "Ideas", content: <Ideas /> },
          { value: "promises", label: "Promises", content: <Promises /> },
        ]}
      />
    </div>
  );
}

function MeetingList() {
  const { db, companyId } = useStore();
  const role = useCompanyRole(companyId);
  const canEdit = role === "founder" || role === "teammate";
  const captures = db.captures.filter((c) => c.company_id === companyId);
  const [open, setOpen] = useState<string | null>(null);
  if (!canEdit) return <SharedWithMentors />;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        {captures
          .filter((c) => c.status === "review")
          .map((c) => (
            <ReviewCard key={c.id} captureId={c.id} />
          ))}
        <Panel title="All meetings and notes" bodyClassName="p-0">
          <ul>
            {captures.map((c) => {
              const items = db.extracted_items.filter((i) => i.capture_id === c.id);
              const accepted = items.filter((i) => i.status === "accepted").length;
              return (
                <li key={c.id} className="border-t first:border-0">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    aria-expanded={open === c.id}
                    onClick={() => setOpen(open === c.id ? null : c.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.title || SOURCE[c.source]}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmtDate(c.created_at)} · {SOURCE[c.source]}
                        {c.participants.length ? ` · ${c.participants.join(", ")}` : ""} ·{" "}
                        {items.length} found, {accepted} accepted
                      </p>
                    </div>
                    <Pill tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Pill>
                  </button>
                  {open === c.id && <MeetingDetail capture={c} />}
                </li>
              );
            })}
            {!captures.length && (
              <li className="p-4 text-sm text-muted-foreground">
                Nothing yet. After your next meeting, tap Debrief and talk for a minute, or paste
                the transcript here.
              </li>
            )}
          </ul>
        </Panel>
      </div>
      <div className="space-y-4">
        <Button asChild className="w-full">
          <Link to="/debrief">
            <Mic className="h-4 w-4" />
            Debrief now
          </Link>
        </Button>
        <AddMeeting />
        {role === "founder" && <CaptureSettingsPanel />}
      </div>
    </div>
  );
}

function MeetingDetail({ capture }: { capture: Capture }) {
  const { db, loadTranscript, mode } = useStore();
  const [transcript, setTranscript] = useState<string | null | undefined>(undefined);
  const items = db.extracted_items.filter(
    (i) => i.capture_id === capture.id && i.status === "accepted",
  );
  return (
    <div className="space-y-3 bg-soft px-4 py-3">
      {capture.error && <p className="text-sm text-destructive">{capture.error}</p>}
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-2 text-sm">
              <Pill>{KIND_LABELS[i.kind]}</Pill>
              <span className="min-w-0 flex-1">{i.text}</span>
              <ShareToggle item={i} />
            </li>
          ))}
        </ul>
      )}
      {mode === "live" &&
        (transcript === undefined ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => void loadTranscript(capture.id).then(setTranscript)}
          >
            Show transcript
          </Button>
        ) : (
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-tile bg-card p-3 text-xs leading-relaxed">
            {transcript ?? "No transcript yet."}
          </pre>
        ))}
    </div>
  );
}

/** What a mentor sees: the actions and decisions the founders chose to share. */
function SharedWithMentors() {
  const { db, companyId } = useStore();
  const items = db.extracted_items.filter((i) => i.company_id === companyId && i.shared);
  return (
    <Panel title="Shared with you">
      <p className="text-xs text-muted-foreground">
        Founders share the actions and decisions from their meetings that they want you to see.
        Recordings and transcripts stay private.
      </p>
      <ul className="mt-2 space-y-2">
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-2 text-sm">
            <Pill>{KIND_LABELS[i.kind]}</Pill>
            {i.text}
          </li>
        ))}
        {!items.length && <li className="text-sm text-muted-foreground">Nothing shared yet.</li>}
      </ul>
    </Panel>
  );
}

function CaptureSettingsPanel() {
  const { db, companyId, updateCaptureSettings } = useStore();
  const s = db.capture_settings.find((x) => x.company_id === companyId) ?? {
    keep_audio_days: 0,
    auto_accept_own_notes: false,
  };
  return (
    <Panel title="Recordings and privacy">
      <div className="space-y-3 text-sm">
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Keep audio after it's transcribed</span>
          <Select
            value={String(s.keep_audio_days)}
            onValueChange={(v) =>
              void updateCaptureSettings(companyId, { keep_audio_days: Number(v) }).then(
                (ok) => ok && toast.success("Saved"),
              )
            }
          >
            <SelectTrigger aria-label="Keep audio">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Delete straight away</SelectItem>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="flex items-center justify-between gap-3">
          <span>Accept clear items from my own voice notes without asking</span>
          <Switch
            checked={s.auto_accept_own_notes}
            onCheckedChange={(v) =>
              void updateCaptureSettings(companyId, { auto_accept_own_notes: v })
            }
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Sol never records silently, and mentors never see recordings or transcripts.
        </p>
      </div>
    </Panel>
  );
}

function Ideas() {
  const { db, companyId, setIdeaStatus } = useStore();
  const ideas = db.ideas.filter((i) => i.company_id === companyId);
  return (
    <Panel title="Idea inbox" bodyClassName="p-0">
      <ul>
        {ideas.map((i) => (
          <li key={i.id} className="border-t px-4 py-3 first:border-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 text-sm font-medium">{i.title}</span>
              <Select
                value={i.status}
                onValueChange={(v) => void setIdeaStatus(i.id, v as typeof i.status)}
              >
                <SelectTrigger className="h-8 w-36" aria-label={`Status of ${i.title}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inbox">Inbox</SelectItem>
                  <SelectItem value="hypothesis">Testing</SelectItem>
                  <SelectItem value="parked">Parked</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {i.evidence_plan && (
              <p className="mt-1 text-xs text-muted-foreground">{i.evidence_plan}</p>
            )}
            {i.status === "hypothesis" && (
              <div className="mt-2">
                <PlanEvidence idea={i.title} />
              </div>
            )}
          </li>
        ))}
        {!ideas.length && (
          <li className="p-4 text-sm text-muted-foreground">
            Ideas you mention in meetings land here. For a new business, each becomes something to
            test before building.
          </li>
        )}
      </ul>
    </Panel>
  );
}

function Promises() {
  const { db, companyId, completeCommitment, now } = useStore();
  const all = db.commitments.filter((c) => c.company_id === companyId);
  const today = now.toISOString().slice(0, 10);
  const due = new Set(commitmentsDue(all, today).map((c) => c.id));
  const open = all.filter((c) => c.status === "open");
  return (
    <Panel title="Promises you made" bodyClassName="p-0">
      <ul>
        {open.map((c) => (
          <li key={c.id} className="border-t px-4 py-3 first:border-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{c.what}</p>
                <p className="text-xs text-muted-foreground">
                  To {c.to_name} · by {fmtDate(c.due_date)}
                </p>
              </div>
              {due.has(c.id) && <Pill tone="warning">Due</Pill>}
              <Button size="sm" variant="outline" onClick={() => void completeCommitment(c.id)}>
                Done
              </Button>
            </div>
            {c.followup_draft && (
              <p className="mt-2 whitespace-pre-line rounded-tile bg-soft p-2 text-xs">
                {c.followup_draft}
              </p>
            )}
          </li>
        ))}
        {!open.length && (
          <li className="p-4 text-sm text-muted-foreground">
            No open promises. When you tell someone "I'll send it Friday", Sol tracks it here and
            drafts the follow-up.
          </li>
        )}
      </ul>
    </Panel>
  );
}
