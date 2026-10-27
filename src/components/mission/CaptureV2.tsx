// Capture v2 (Phase 18): Meetings → the notetaker (calendars and which meetings Sol joins), and
// Customers → Calls (the company number, its recording notice and recent calls). Both behind
// feature flags until the platform sets up the providers.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useCompanyRole, useStore } from "@/lib/store";
import type { CalendarEvent, PhoneNumber } from "@/lib/storeContext";
import { fmtDateTime, fmtShortDate } from "@/lib/format";
import { Panel, Pill, StatusPill } from "./primitives";

const BOT: Record<CalendarEvent["bot_status"], string> = {
  none: "",
  scheduled: "Sol will join",
  recording: "Recording",
  done: "Recorded",
  failed: "Couldn't join",
  cancelled: "Cancelled",
  skipped: "Skipped",
};

export function NotetakerPanel() {
  const {
    companyId,
    db,
    user,
    now,
    connectCalendar,
    disconnectCalendar,
    setMeetingRecording,
    updateMinutesCap,
  } = useStore();
  const role = useCompanyRole(companyId);
  const founder = role === "founder";
  const conns = db.calendar_connections.filter(
    (c) => c.company_id === companyId && c.status === "connected",
  );
  const events = db.calendar_events
    .filter((e) => e.company_id === companyId && Date.parse(e.ends_at) > now.getTime() - 86_400_000)
    .slice(0, 12);
  const cap = db.capture_settings.find((s) => s.company_id === companyId)?.daily_minutes_cap ?? 120;
  const mine = (connectionId: string) =>
    founder || conns.find((c) => c.id === connectionId)?.user_id === user.id;
  return (
    <Panel title="Notetaker">
      <div className="space-y-4 text-sm">
        <p className="text-xs text-muted-foreground">
          Sol joins only the meetings you choose, by name, and tells everyone it's recording. Its
          notes come back here to review like any meeting.
        </p>
        {conns.length ? (
          <ul className="space-y-1">
            {conns.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
                <span>
                  {c.provider === "mock"
                    ? "Demo calendar"
                    : `${c.provider === "google" ? "Google" : "Microsoft"} · ${c.account_email}`}
                </span>
                {mine(c.id) ? (
                  <Button size="sm" variant="ghost" onClick={() => void disconnectCalendar(c.id)}>
                    Disconnect
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void connectCalendar(companyId, "google")}
          >
            Connect Google
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void connectCalendar(companyId, "microsoft")}
          >
            Connect Microsoft
          </Button>
          {!conns.some((c) => c.provider === "mock") ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void connectCalendar(companyId, "mock")}
            >
              Try a demo calendar
            </Button>
          ) : null}
        </div>
        {events.length ? (
          <ul className="divide-y">
            {events.map((e) => (
              <li key={e.id} className="space-y-1 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{e.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDateTime(e.starts_at)}
                      {e.attendees.length ? ` · ${e.attendees.length} invited` : ""}
                      {e.meeting_url ? "" : " · no video link"}
                    </p>
                  </div>
                  <Switch
                    aria-label={`Sol joins ${e.title}`}
                    checked={e.record}
                    disabled={
                      !e.meeting_url ||
                      !mine(e.connection_id) ||
                      Date.parse(e.starts_at) < now.getTime()
                    }
                    onCheckedChange={(v) => void setMeetingRecording(e.id, v)}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {e.series_id && e.meeting_url && mine(e.connection_id) ? (
                    <label className="flex items-center gap-1.5">
                      <Checkbox
                        checked={e.record}
                        onCheckedChange={(v) =>
                          void setMeetingRecording(e.id, v === true, true).then(
                            (ok) =>
                              ok &&
                              toast.success(
                                v === true
                                  ? "Sol will join every one"
                                  : "Sol won't join this series",
                              ),
                          )
                        }
                      />
                      Every time
                    </label>
                  ) : null}
                  {BOT[e.bot_status] ? <Pill>{BOT[e.bot_status]}</Pill> : null}
                  {e.bot_note ? <span className="text-muted-foreground">{e.bot_note}</span> : null}
                  {e.capture_id ? (
                    <Link to="/meetings" className="underline">
                      Review notes
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : conns.length ? (
          <p className="text-xs text-muted-foreground">No meetings in the next week.</p>
        ) : null}
        <label className="flex items-center gap-2 text-xs">
          Recorded minutes a day (notetaker and calls)
          <Input
            type="number"
            min={0}
            max={1440}
            className="w-20"
            disabled={!founder}
            defaultValue={cap}
            onBlur={(e) => {
              const n = Number(e.target.value);
              if (n !== cap) void updateMinutesCap(companyId, n);
            }}
          />
        </label>
      </div>
    </Panel>
  );
}

export function CallsPage() {
  const { companyId, db, addDemoPhoneNumber } = useStore();
  const founder = useCompanyRole(companyId) === "founder";
  const number = db.phone_numbers.find((n) => n.company_id === companyId);
  const calls = db.call_sessions.filter((c) => c.company_id === companyId);
  const company = db.companies.find((c) => c.id === companyId)?.name ?? "";
  const name = (id: string | null, from: string) =>
    db.contacts.find((c) => c.id === id)?.name ?? from;
  if (!number)
    return (
      <Panel title="Calls">
        <p className="text-sm text-muted-foreground">
          A company phone number for sales and customer calls. Callers hear that the call is
          recorded before they're put through; Sol reads each call like a meeting and links it to
          the contact.
        </p>
        {founder ? (
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            onClick={() => void addDemoPhoneNumber(companyId)}
          >
            Add a demo number
          </Button>
        ) : null}
      </Panel>
    );
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Panel title="Recent calls" bodyClassName="p-0">
        <ul>
          {calls.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center gap-2 border-t px-4 py-3 text-sm first:border-0"
            >
              <span className="font-medium">{name(c.contact_id, c.from_number)}</span>
              <span className="text-xs text-muted-foreground">{fmtShortDate(c.started_at)}</span>
              <StatusPill status={c.status} />
              {c.duration_seconds ? (
                <span className="text-xs text-muted-foreground tabular">
                  {Math.floor(c.duration_seconds / 60)}:
                  {String(c.duration_seconds % 60).padStart(2, "0")}
                </span>
              ) : null}
              {c.recorded ? <Pill>Recorded</Pill> : null}
              {c.capture_id ? (
                <Link to="/meetings" className="text-xs underline">
                  Review
                </Link>
              ) : null}
            </li>
          ))}
          {!calls.length && <li className="p-4 text-sm text-muted-foreground">No calls yet.</li>}
        </ul>
      </Panel>
      <NumberSettings key={number.id} number={number} founder={founder} company={company} />
    </div>
  );
}

function NumberSettings({
  number,
  founder,
  company,
}: {
  number: PhoneNumber;
  founder: boolean;
  company: string;
}) {
  const { companyId, updatePhoneSettings } = useStore();
  const [notice, setNotice] = useState(number.recording_notice);
  const [forward, setForward] = useState(number.forward_to ?? "");
  return (
    <Panel title="Your number">
      <div className="space-y-3 text-sm">
        <p className="text-lg font-semibold tabular">
          {number.number.replace(/^\+44/, "0").replace(/^(\d{5})(\d{3})(\d+)$/, "$1 $2 $3")}
        </p>
        {number.provider === "mock" ? (
          <p className="text-xs text-muted-foreground">A demo number: it never rings.</p>
        ) : null}
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Ring this number (your phone)</span>
          <Input
            value={forward}
            disabled={!founder}
            placeholder="+44 7700 900123"
            onChange={(e) => setForward(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">What callers hear first</span>
          <Textarea
            rows={3}
            value={notice}
            disabled={!founder}
            onChange={(e) => setNotice(e.target.value)}
          />
          <span className="text-xs text-muted-foreground">
            Callers hear: “{notice.replaceAll("{company}", company)}”
          </span>
        </label>
        {founder ? (
          <Button
            size="sm"
            onClick={() =>
              void updatePhoneSettings(companyId, {
                forward_to: forward,
                recording_notice: notice,
              }).then((ok) => ok && toast.success("Saved"))
            }
          >
            Save
          </Button>
        ) : null}
      </div>
    </Panel>
  );
}
