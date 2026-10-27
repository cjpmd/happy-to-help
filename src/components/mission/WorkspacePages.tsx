import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Plus,
  Mail,
  ImagePlus,
  Film,
  FileText,
  Download,
  ExternalLink,
  Users,
  ShieldCheck,
  Pause,
  Play,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useStore, useCompany, useBalance, useEstimate, useCompanyRole } from "@/lib/store";
import { FLAGS } from "@/lib/flags";
import { actionQuote } from "@/lib/credits";
import type { ThemePref } from "@/lib/theme";
import { cn } from "@/lib/utils";
import {
  defaultPreferences,
  defaultSharing,
  monthlyCost,
  type Routine,
  type Preferences,
} from "@/lib/workspace";
import { fmtDateTime, gbp } from "@/lib/format";
import { PageHeader, Pill, StatusPill } from "./primitives";
import { CostButton, ClaimsCheck, Why } from "./WorkControls";
import { IntegrationsSection } from "./Integrations";
import { AutomationPanel } from "./Automation";
import { PlatformHealthSection } from "./PlatformHealth";
import { nextRun } from "@/lib/schedule";

const selectClass = "h-9 rounded-md border bg-background px-2 text-sm";
/** A page's title, or just its description when it's shown inside another page's tab. */
function Heading({
  embedded,
  title,
  description,
}: {
  embedded?: boolean | undefined;
  title: string;
  description?: string | undefined;
}) {
  if (!embedded) return <PageHeader title={title} {...(description ? { description } : {})} />;
  return description ? <p className="mb-4 text-sm text-muted-foreground">{description}</p> : null;
}

export function RoutinesPage({ embedded }: { embedded?: boolean }) {
  const { db, companyId, addRoutine, toggleRoutine, mode, now } = useStore();
  const balance = useBalance();
  const [title, setTitle] = useState("");
  const [cadence, setCadence] = useState<Routine["cadence"]>("weekdays");
  return (
    <>
      <Heading embedded={embedded} title="Routines" description="Your recurring work" />
      <div className="mb-6 flex flex-wrap gap-2">
        <Input
          aria-label="Routine name"
          placeholder="New routine"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="max-w-sm"
        />
        <select
          aria-label="Cadence"
          className={selectClass}
          value={cadence}
          onChange={(e) => setCadence(e.target.value as Routine["cadence"])}
        >
          <option value="daily">Daily</option>
          <option value="weekdays">Weekdays</option>
          <option value="weekly">Weekly</option>
        </select>
        <Button
          disabled={!title.trim()}
          onClick={() => {
            addRoutine(title.trim(), cadence, 40);
            setTitle("");
          }}
        >
          <Plus className="h-4 w-4" />
          Add routine
        </Button>
      </div>
      <div className="divide-y border-y">
        {db.routines
          .filter((r) => r.company_id === companyId)
          .map((r) => {
            const cost = monthlyCost(r.cadence, r.credits);
            return (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-5">
                <div>
                  <h2 className="text-sm font-medium">{r.title}</h2>
                  <p className="mt-1 text-xs text-muted-foreground capitalize">
                    {r.cadence} · ≈ {r.credits} credits / run · ≈ {cost} / month
                  </p>
                  {r.enabled && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Next:{" "}
                      {fmtDateTime(nextRun(r.cadence, r.run_at ?? "07:00", now).toISOString())}
                      {r.last_run_at ? ` · last ran ${fmtDateTime(r.last_run_at)}` : ""}
                    </p>
                  )}
                  <Why reason="A recurring small task keeps progress consistent without a large one-off push. The selected cadence and per-run estimate determine the monthly budget." />
                </div>
                <div>
                  <Pill tone={r.enabled ? "success" : "neutral"}>
                    {r.enabled ? (mode === "live" ? "On" : "Enabled in demo") : "Paused"}
                  </Pill>
                  {r.enabled ? (
                    <Button
                      className="ml-3"
                      size="sm"
                      variant="outline"
                      onClick={() => void toggleRoutine(r.id)}
                    >
                      <Pause className="h-3 w-3" />
                      Pause
                    </Button>
                  ) : (
                    <CostButton
                      label="Enable routine"
                      cost={cost}
                      onConfirm={async () => {
                        if (!(await toggleRoutine(r.id))) toast.error("Not enough credits");
                        else
                          toast.success(
                            mode === "live"
                              ? "On. Sol runs it on schedule (UK time)."
                              : "Enabled in demo — scheduling needs your connected service",
                          );
                      }}
                    />
                  )}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Monthly forecast: {balance - cost} CR left
                  </p>
                </div>
              </div>
            );
          })}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        {mode === "live"
          ? "Routines run on schedule in UK time; each run's credits show in the log. "
          : "Schedules are demo settings; no background jobs run yet. "}
        Forecast uses 30 daily, 22 weekday or 4 weekly runs.
      </p>
      <AutomationPanel />
    </>
  );
}

export function EmailPage({ embedded }: { embedded?: boolean }) {
  const { db, companyId, work, draftOutreach } = useStore();
  const emailCost = useEstimate("email");
  const c = useCompany();
  const [mode, setMode] = useState<"support" | "outreach">("support");
  const [selected, setSelected] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState("");
  const [consent, setConsent] = useState(false);
  const threads = db.emails.filter((e) => e.company_id === companyId && e.mode === mode);
  const thread = threads.find((e) => e.id === selected) ?? threads[0];
  const messages = db.emails.filter((e) => e.company_id === companyId).flatMap((e) => e.messages);
  return (
    <>
      <Heading
        embedded={embedded}
        title="Company email"
        description={`hello@${c.slug}.app · proposed address, not connected`}
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Pill>Received {messages.filter((m) => m.direction === "received").length}</Pill>
        <Pill>Sent / drafted {messages.filter((m) => m.direction === "sent").length}</Pill>
        <div className="flex gap-1">
          {(["support", "outreach"] as const).map((m) => (
            <Button
              key={m}
              size="sm"
              variant={m === mode ? "default" : "outline"}
              onClick={() => {
                setMode(m);
                setSelected(null);
              }}
            >
              {m === "support" ? "Support replies" : "Outreach"}
            </Button>
          ))}
        </div>
      </div>
      {mode === "outreach" && (
        <div className="mb-5 border-l-2 border-warning bg-warning-soft p-4 text-sm text-warning">
          UK PECR: confirm consent or a valid exemption, identify the sender and offer an opt-out.
          Sole traders and some partnerships need different treatment from corporate subscribers.
          Every batch requires your approval.
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          {threads.map((e) => (
            <Button
              key={e.id}
              variant={e.id === thread?.id ? "secondary" : "ghost"}
              className="h-auto w-full justify-start py-3 text-left"
              onClick={() => setSelected(e.id)}
            >
              <Mail className="h-4 w-4 shrink-0" />
              <span className="min-w-0 whitespace-normal">
                <span className="block text-sm">{e.subject}</span>
                <span className="block text-xs text-muted-foreground">{e.name}</span>
              </span>
            </Button>
          ))}
          {!threads.length && <p className="text-sm text-muted-foreground">No threads yet.</p>}
        </div>
        <section>
          {thread && (
            <>
              <h2 className="text-lg font-medium">{thread.subject}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{thread.address}</p>
              <div className="mt-5 space-y-5">
                {thread.messages.map((m, i) => (
                  <div key={i} className="border-l-2 pl-4">
                    <p className="text-xs text-muted-foreground">
                      {m.direction} · {m.date.slice(0, 10)}
                    </p>
                    <p className="mt-2 text-sm">{m.text}</p>
                    <ClaimsCheck text={m.text} />
                  </div>
                ))}
              </div>
              <div className="mt-5">
                <CostButton
                  label="Draft support reply"
                  cost={emailCost}
                  disabled={mode !== "support"}
                  onConfirm={() =>
                    work(companyId, "Draft support reply", emailCost, "email", thread.id)
                  }
                />
                <Why />
              </div>
            </>
          )}
          {mode === "outreach" && (
            <div className="mt-6 space-y-3 border-t pt-5">
              <h2 className="font-medium">New outreach batch</h2>
              <Input
                aria-label="Recipients"
                value={recipients}
                onChange={(e) => setRecipients(e.target.value)}
                placeholder="Reviewed recipients"
              />
              <Textarea
                aria-label="Outreach message"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Batch message — include an opt-out"
              />
              <ClaimsCheck text={body} />
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                I have reviewed PECR eligibility and included an opt-out.
              </label>
              <CostButton
                label="Prepare batch for approval"
                cost={30}
                disabled={!consent || !body.trim() || !recipients.trim()}
                onConfirm={async () => {
                  if (await draftOutreach(body, recipients)) {
                    toast.success("Batch added to approvals — nothing sent");
                    setBody("");
                    setRecipients("");
                    setConsent(false);
                  }
                }}
              />
              <Link to="/approvals" className="block text-xs text-primary">
                Review approvals →
              </Link>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

export function MediaPage({ embedded }: { embedded?: boolean }) {
  const { db, companyId, work } = useStore();
  const imageCost = useEstimate("image");
  const videoCost = useEstimate("video");
  const postCost = useEstimate("social");
  const [prompt, setPrompt] = useState("Daily revision quiz campaign");
  return (
    <>
      <Heading embedded={embedded} title="Media library" description="Company creative assets" />
      <div className="flex flex-wrap items-start gap-3 border-b pb-5">
        <Input
          className="max-w-md"
          aria-label="Creative prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the asset"
        />
        <div>
          <CostButton
            label="Generate image"
            icon={<ImagePlus className="h-4 w-4" />}
            cost={imageCost}
            disabled={!prompt.trim()}
            onConfirm={() => work(companyId, prompt, imageCost, "image")}
          />
        </div>
        <div>
          <CostButton
            label="Generate video"
            icon={<Film className="h-4 w-4" />}
            cost={videoCost}
            disabled={!prompt.trim()}
            onConfirm={() => work(companyId, prompt, videoCost, "video")}
          />
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Demo generation uses a sample creative; video assets are storyboards, not rendered films.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {db.media
          .filter((m) => m.company_id === companyId)
          .map((m) => (
            <article key={m.id} className="overflow-hidden rounded-lg border bg-card">
              <div className="flex aspect-[4/3] items-center justify-center bg-muted">
                {m.url ? (
                  <img src={m.url} alt={m.title} className="h-full w-full object-cover" />
                ) : m.status === "generating" ? (
                  <span className="animate-pulse text-sm text-muted-foreground">Generating…</span>
                ) : (
                  <ImagePlus className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-sm font-medium break-words">{m.title}</h2>
                  <StatusPill status={m.status} />
                </div>
                <p className="text-xs text-muted-foreground capitalize">
                  {m.kind}
                  {m.kind === "video" ? " · demo storyboard" : ""}
                </p>
                {m.reason && <p className="text-xs text-destructive">{m.reason}</p>}
                {m.status === "failed" ? (
                  <CostButton
                    label="Retry"
                    cost={m.kind === "image" ? 120 : 400}
                    onConfirm={() =>
                      work(
                        companyId,
                        m.title.replace(/fail/gi, "retry"),
                        m.kind === "image" ? 120 : 400,
                        m.kind,
                        m.id,
                      )
                    }
                  />
                ) : m.status === "ready" ? (
                  <CostButton
                    label="Use in post"
                    cost={postCost}
                    onConfirm={() =>
                      work(companyId, "Draft post with media", postCost, "social", m.id)
                    }
                  />
                ) : null}
                <Why />
              </div>
            </article>
          ))}
      </div>
      {!db.media.some((m) => m.company_id === companyId) && (
        <div className="mt-8 flex items-center gap-3 border-b py-8 text-muted-foreground">
          <ImagePlus className="h-8 w-8" />
          <p className="text-sm">No creative assets yet.</p>
        </div>
      )}
    </>
  );
}

export function AdsPage({ embedded }: { embedded?: boolean }) {
  const { db, companyId, proposeBudget } = useStore();
  const ad = db.ads.find((a) => a.company_id === companyId);
  const [budget, setBudget] = useState(String(ad?.daily_budget ?? 0));
  const [cap, setCap] = useState(String(ad?.hard_cap ?? 50));
  if (!ad) return null;
  const valid =
    Number.isFinite(+budget) &&
    Number.isFinite(+cap) &&
    +budget >= 0 &&
    +cap >= 0 &&
    +budget <= +cap;
  return (
    <>
      <Heading
        embedded={embedded}
        title="Meta Ads"
        description="Acquisition with a firm spending limit"
      />
      <Pill tone="warning">Not connected · sample campaign results</Pill>
      <div className="my-6 grid grid-cols-2 gap-5 border-y py-6 lg:grid-cols-4">
        {[
          ["Spend to date", gbp(ad.spend)],
          ["Clicks", ad.clicks],
          ["Signups", ad.signups],
          ["Cost / signup", ad.signups ? gbp(ad.spend / ad.signups) : "—"],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular">{value}</p>
          </div>
        ))}
      </div>
      <section className="max-w-xl space-y-4">
        <h2 className="font-medium">Budget controls</h2>
        <p className="text-sm text-muted-foreground">
          Current: {gbp(ad.daily_budget)} / day · hard cap {gbp(ad.hard_cap)} / day
        </p>
        <div className="grid grid-cols-2 gap-4">
          <label className="text-sm">
            Daily budget (£)
            <Input
              aria-label="Daily budget"
              type="number"
              min="0"
              max={cap}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Hard daily cap (£)
            <Input
              aria-label="Hard daily cap"
              type="number"
              min="0"
              value={cap}
              onChange={(e) => setCap(e.target.value)}
            />
          </label>
        </div>
        {!valid && (
          <p className="text-sm text-destructive">
            Budget must be non-negative and at or below the hard cap.
          </p>
        )}
        <CostButton
          label="Request budget change"
          cost={90}
          disabled={!valid}
          onConfirm={async () => {
            if (await proposeBudget(+budget, +cap))
              toast.success("Budget change awaiting approval");
          }}
        />
        <Why reason="Every budget change stays under your explicit daily cap and requires approval. Clicks and signups provide the baseline for deciding whether the test is worth extending." />
        <Link to="/approvals" className="block text-sm text-primary">
          Review budget approvals →
        </Link>
      </section>
      {FLAGS.ads ? <PaidAds /> : null}
    </>
  );
}

export function DocumentsPage({
  embedded,
  only,
}: {
  embedded?: boolean;
  /** Show only these documents, by title, e.g. the privacy policy on Stay legal. */
  only?: string[];
}) {
  const { db, companyId, work } = useStore();
  const docCost = useEstimate("document");
  const docs = db.documents.filter(
    (d) => d.company_id === companyId && (!only || only.includes(d.title)),
  );
  const single = docs.length === 1;
  const [selected, setSelected] = useState<string | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const doc = docs.find((d) => d.id === selected) ?? docs[0];
  const current = doc?.versions.find((v) => v.version === version) ?? doc?.versions.at(-1);
  return (
    <>
      <Heading
        embedded={embedded}
        title="Documents"
        description={single ? undefined : "Company knowledge, with a version history"}
      />
      <div className={cn("grid gap-6", !single && "lg:grid-cols-[250px_1fr]")}>
        <div className={cn("space-y-1", single && "hidden")}>
          {docs.map((d) => (
            <Button
              variant={doc?.id === d.id ? "secondary" : "ghost"}
              key={d.id}
              className="h-auto w-full justify-start py-3 text-left"
              onClick={() => {
                setSelected(d.id);
                setVersion(null);
              }}
            >
              <FileText className="h-4 w-4 shrink-0" />
              <span className="whitespace-normal">{d.title}</span>
            </Button>
          ))}
        </div>
        {doc && (
          <section>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-medium">{doc.title}</h2>
              <select
                className={selectClass}
                aria-label="Document version"
                value={current?.version}
                onChange={(e) => setVersion(+e.target.value)}
              >
                {doc.versions.map((v) => (
                  <option key={v.version} value={v.version}>
                    Version {v.version} · {v.date.slice(0, 10)}
                  </option>
                ))}
              </select>
            </div>
            {doc.outcomes && (
              <div className="mt-5">
                <Pill tone="info">
                  {doc.outcomes.filter((o) => o.complete).length} of {doc.outcomes.length} outcomes
                  complete
                </Pill>
                <ul className="mt-3 space-y-2">
                  {doc.outcomes.map((o) => (
                    <li key={o.title} className="flex gap-2 text-sm">
                      <ShieldCheck
                        className={`h-4 w-4 ${o.complete ? "text-success" : "text-muted-foreground"}`}
                      />
                      {o.title}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-5 whitespace-pre-line border-y py-6 text-sm leading-relaxed">
              {current?.content}
            </div>
            <ClaimsCheck text={current?.content ?? ""} />
            <div className="mt-5">
              <CostButton
                label="Ask Sol to update"
                cost={docCost}
                onConfirm={() =>
                  work(companyId, `Update ${doc.title}`, docCost, "document", doc.id)
                }
              />
              <Why reason="Keeping one versioned source prevents conflicting company information. Current company records and the previous document version form the evidence for this update." />
            </div>
          </section>
        )}
      </div>
    </>
  );
}

const themeOptions: { value: ThemePref; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Match system" },
];

export function SettingsPage() {
  const { db, user, updatePreferences, themePref, setThemePref } = useStore();
  const prefs = db.preferences[user.id] ?? defaultPreferences();
  const numeric = (key: keyof Preferences, label: string) => (
    <label className="flex flex-wrap items-center justify-between gap-3 border-b py-4 text-sm">
      {label}
      <Input
        type="number"
        min="0"
        max={key === "signupDrop" ? 100 : undefined}
        className="w-24"
        aria-label={label}
        value={String(prefs[key])}
        onChange={(e) => {
          const n = +e.target.value;
          if (Number.isFinite(n) && n >= 0 && (key !== "signupDrop" || n <= 100))
            updatePreferences({ [key]: n });
        }}
      />
    </label>
  );
  return (
    <>
      <PageHeader title="Settings" />
      <section className="max-w-2xl">
        <h2 className="font-medium" id="appearance">
          Appearance
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Light is the default. Match system follows your device&rsquo;s setting.
        </p>
        <div className="my-4 flex flex-wrap gap-2" role="group" aria-labelledby="appearance">
          {themeOptions.map((o) => (
            <Button
              key={o.value}
              variant={themePref === o.value ? "default" : "outline"}
              aria-pressed={themePref === o.value}
              onClick={() => setThemePref(o.value)}
            >
              {o.label}
            </Button>
          ))}
        </div>
        <h2 className="mt-8 font-medium">Learning mode</h2>
        <div className="my-4 flex gap-2">
          <Button
            variant={prefs.explanation === "brief" ? "default" : "outline"}
            onClick={() => updatePreferences({ explanation: "brief" })}
          >
            Brief
          </Button>
          <Button
            variant={prefs.explanation === "more" ? "default" : "outline"}
            onClick={() => updatePreferences({ explanation: "more" })}
          >
            Teach me more
          </Button>
        </div>
        <h2 className="mt-8 font-medium">When should Sol ask me?</h2>
        {numeric("adThreshold", "Ad change alert (£)")}
        {numeric("outreachThreshold", "Outreach volume alert (recipients)")}
        <div className="flex items-center justify-between border-b py-4 text-sm">
          <span>Ask before publishing</span>
          <Switch
            checked={prefs.publishing}
            onCheckedChange={(publishing) => updatePreferences({ publishing })}
            aria-label="Ask before publishing"
          />
        </div>
        {numeric("signupDrop", "Signup drop alert (% week-on-week)")}
        <p className="mt-3 text-xs text-muted-foreground">
          Demo preferences only. All ad changes and outreach batches still require approval,
          regardless of thresholds.
        </p>
        <h2 className="mt-8 font-medium">Channels for Sol</h2>
        {(["whatsapp", "slack"] as const).map((key) => (
          <div key={key} className="flex items-center justify-between gap-3 border-b py-4">
            <div>
              <p className="text-sm">{key === "whatsapp" ? "WhatsApp" : "Slack"}</p>
              <p className="text-xs text-muted-foreground">
                Morning brief & quick approvals · placeholder
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                updatePreferences({ [key]: !prefs[key] });
                toast.info("Placeholder connection — no messages will be sent");
              }}
            >
              {prefs[key] ? "Disconnect placeholder" : "Connect"}
            </Button>
          </div>
        ))}
        <IntegrationsSection />
        <PlatformHealthSection />
      </section>
    </>
  );
}

export function TeamPage() {
  const { db, companyId, invite, user, mode } = useStore();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"founder" | "teammate" | "mentor" | "viewer">("teammate");
  return (
    <>
      <PageHeader title="Team" description="The people building alongside you" />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (
            db.team.some(
              (t) => t.company_id === companyId && t.email.toLowerCase() === email.toLowerCase(),
            )
          ) {
            toast.error("Already invited");
            return;
          }
          void invite(email, role).then((ok) => {
            if (!ok) return;
            setEmail("");
            toast.success(
              mode === "demo"
                ? "Demo invitation added — no email sent"
                : "Invited. They join when they sign in with that email.",
            );
          });
        }}
        className="flex flex-wrap gap-2 border-b pb-6"
      >
        <Input
          aria-label="Teammate email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="colleague@example.com"
          className="max-w-sm"
        />
        <select
          aria-label="Team role"
          className={selectClass}
          value={role}
          onChange={(e) => setRole(e.target.value as typeof role)}
        >
          {["founder", "teammate", "mentor", "viewer"].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <Button type="submit">
          <Users className="h-4 w-4" />
          Invite
        </Button>
      </form>
      <div className="divide-y">
        <div className="flex flex-wrap justify-between gap-3 py-5">
          <div>
            <p className="text-sm font-medium">{user.full_name}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
          <Pill>Founder · demo account</Pill>
        </div>
        {db.team
          .filter((t) => t.company_id === companyId)
          .map((t) => (
            <div key={t.id} className="flex flex-wrap justify-between gap-3 py-5">
              <p className="text-sm">{t.email}</p>
              <div className="flex gap-3">
                <Pill>{t.role}</Pill>
                <StatusPill status={t.status} />
              </div>
            </div>
          ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Invitations and access enforcement require your connected service.
      </p>
    </>
  );
}

export function OwnershipPage() {
  const { db, companyId, user, mode } = useStore();
  const c = useCompany();
  const sharing = db.sharing[companyId] ?? defaultSharing();
  const { updateSharing } = useStore();
  const [exporting, setExporting] = useState(false);
  async function exportAll() {
    setExporting(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const csv = (rows: unknown[]) => {
        if (!rows.length) return "";
        const keys = Object.keys(rows[0] as object);
        const cell = (v: unknown) => {
          const value = typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
          return '"' + (/^[=+\-@]/.test(value) ? "'" : "") + value.replace(/"/g, '""') + '"';
        };
        return [
          keys.map(cell).join(","),
          ...rows.map((r) => keys.map((k) => cell((r as Record<string, unknown>)[k])).join(",")),
        ].join("\n");
      };
      for (const [table, values] of Object.entries(db)) {
        if (Array.isArray(values)) {
          const rows = (values as Record<string, unknown>[]).filter(
            (v) =>
              v["company_id"] === companyId || (table === "companies" && v["id"] === companyId),
          );
          zip.file(`data/${table}.csv`, csv(rows));
        }
      }
      for (const doc of db.documents.filter((d) => d.company_id === companyId)) {
        for (const v of doc.versions)
          zip.file(
            `documents/${doc.title.replace(/[^a-z0-9 -]/gi, "")}/v${v.version}.txt`,
            v.content,
          );
      }
      zip.file(
        "ownership.txt",
        `${c.name}\nFounder: ${user.full_name}\nGitHub repository: not connected — add the real repository link after connection.\nDomain: ${c.slug}.app (proposed only)\n${mode === "demo" ? "All exported records are demo data." : `Exported ${new Date().toISOString()}.`}`,
      );
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${c.slug}-export.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Export downloaded");
    } finally {
      setExporting(false);
    }
  }
  return (
    <>
      <PageHeader
        title="Your company, your stuff"
        actions={
          <Button disabled={exporting} onClick={() => void exportAll()}>
            <Download className="h-4 w-4" />
            {exporting ? "Exporting…" : "Export everything"}
          </Button>
        }
      />
      <div className="divide-y border-y">
        {[
          "GitHub repository",
          "Database",
          "Domain",
          "Stripe account",
          ...(c.channels ?? []).filter((ch) => ["LinkedIn", "Instagram", "TikTok"].includes(ch)),
        ].map((item) => (
          <div key={item} className="flex flex-wrap justify-between gap-3 py-5">
            <div>
              <p className="text-sm font-medium">{item}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {item === "Domain" ? `${c.slug}.app · proposed, not registered` : "Not connected"}
              </p>
            </div>
            <div className="text-right">
              <Pill>Intended owner · founder</Pill>
              <p className="mt-1 text-xs text-muted-foreground">Ownership not yet verified</p>
            </div>
          </div>
        ))}
      </div>
      <section className="mt-8 max-w-2xl">
        <div className="flex justify-between">
          <h2 className="font-medium">Build in public</h2>
          <Switch
            aria-label="Enable public progress"
            checked={sharing.enabled}
            onCheckedChange={(enabled) => updateSharing({ enabled })}
          />
        </div>
        <div className="mt-4 divide-y">
          {(["stage", "milestones", "visitors", "signups", "mrr"] as const).map((key) => (
            <label key={key} className="flex justify-between py-3 text-sm capitalize">
              {key}
              <Switch
                checked={sharing[key]}
                onCheckedChange={(v) => updateSharing({ [key]: v })}
                aria-label={`Share ${key}`}
              />
            </label>
          ))}
        </div>
        {sharing.enabled && (
          <Link
            to="/progress/$slug"
            params={{ slug: c.slug }}
            className="mt-3 inline-flex items-center gap-2 text-sm text-primary"
          >
            View progress page
            <ExternalLink className="h-4 w-4" />
          </Link>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Export contains document versions and company data as CSV. Repo link and durable public
          sharing need your connected accounts.
        </p>
      </section>
    </>
  );
}

/** Phase 19 (behind VITE_ADS_ENABLED): ads launched from campaigns, their spend, and the caps. */
function PaidAds() {
  const { db, companyId, pauseAd, updateAdsMonthlyCap } = useStore();
  const founder = useCompanyRole(companyId) === "founder";
  const ads = db.ad_campaigns.filter((a) => a.company_id === companyId && a.status !== "declined");
  const acct = db.ads.find((a) => a.company_id === companyId);
  return (
    <section className="mt-4 space-y-3 rounded-card border bg-card p-4 shadow-card">
      <h2 className="label-caps text-[13px]">Paid ads</h2>
      <p className="text-xs text-muted-foreground">
        Launch an ad from a campaign's ad copy (Grow → Campaigns). Each launch waits for your GO,
        stays within your daily cap, and every ad pauses when the month's spend reaches the monthly
        cap. Spend shows against the ad's link in Links &amp; forms, as cost per lead.
      </p>
      {acct?.paused_reason ? (
        <p className="text-xs text-destructive">{acct.paused_reason}</p>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        Monthly cap (£)
        <Input
          type="number"
          min={0}
          className="w-28"
          disabled={!founder}
          defaultValue={acct?.monthly_cap ?? 300}
          onBlur={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && n >= 0 && n !== acct?.monthly_cap)
              void updateAdsMonthlyCap(companyId, n);
          }}
        />
      </label>
      {ads.length ? (
        <ul className="divide-y text-sm">
          {ads.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="font-medium">{a.name}</span>
              <span className="text-xs text-muted-foreground">
                {a.platform === "meta" ? "Meta" : "Google"} · £{a.daily_budget} a day · £{a.spend}{" "}
                spent · {a.clicks} clicks
              </span>
              <StatusPill status={a.status === "pending" ? "awaiting_approval" : a.status} />
              {a.paused_reason ? (
                <span className="text-xs text-muted-foreground">{a.paused_reason}</span>
              ) : null}
              {founder && (a.status === "active" || a.status === "pending") ? (
                <Button size="sm" variant="ghost" onClick={() => void pauseAd(a.id)}>
                  Pause
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No paid ads yet.</p>
      )}
    </section>
  );
}
