// Listening (Phase 16): Grow → Listening shows how customers feel and what they talk about, from
// comments on the company's own posts, reviews and feedback; Customers → Feedback lists what
// they said and the opt-in feedback requests.
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useCompanyRole, useStore } from "@/lib/store";
import { DEFAULT_LISTENING, type DB } from "@/lib/storeContext";
import { triageMessage } from "@/lib/inbox";
import {
  sentimentFromRating,
  sentimentTrend,
  topThemes,
  type Heard,
  type Sentiment,
} from "@/lib/listening";
import { fmtDate, fmtShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Panel, Pill, StatusPill } from "./primitives";

const WEEKS = 8;
const SENTIMENTS: { key: Sentiment; label: string; fill: string }[] = [
  { key: "positive", label: "Positive", fill: "bg-go" },
  { key: "neutral", label: "Neutral", fill: "bg-sentiment-neutral" },
  { key: "negative", label: "Negative", fill: "bg-destructive" },
];

/** Comments and reviews in the inbox, with what they said and how they felt. */
function heardItems(db: DB, companyId: string) {
  return db.inbox_items
    .filter((i) => i.company_id === companyId && (i.channel === "social" || i.channel === "review"))
    .flatMap((i) => {
      const t = db.emails.find((x) => x.id === i.thread_id);
      if (!t) return [];
      const text = t.messages.find((m) => m.direction === "received")?.text ?? "";
      const sentiment: Sentiment =
        (i.sentiment as Sentiment | null) ??
        (t.rating ? sentimentFromRating(t.rating) : triageMessage(t.subject, text).sentiment);
      return [{ item: i, thread: t, text, sentiment, at: i.created_at }];
    });
}

function useHeard(companyId: string) {
  const { db } = useStore();
  return useMemo(() => {
    const items = heardItems(db, companyId);
    const feedback = db.feedback.filter((f) => f.company_id === companyId);
    const all: Heard[] = [
      ...items.map((i) => ({ at: i.at, text: i.text, sentiment: i.sentiment })),
      ...feedback.map((f) => ({ at: f.created_at, text: f.body, sentiment: f.sentiment })),
    ];
    return { items, feedback, all };
  }, [db, companyId]);
}

function useListening(companyId: string) {
  const { db } = useStore();
  return (
    db.listening_settings.find((s) => s.company_id === companyId) ?? {
      company_id: companyId,
      ...DEFAULT_LISTENING,
    }
  );
}

export function ListeningPage() {
  const { companyId, now } = useStore();
  const { items, all } = useHeard(companyId);
  const trend = sentimentTrend(all, WEEKS, now);
  const themes = topThemes(all, 6);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Panel title="How customers feel">
          <SentimentChart rows={trend} />
        </Panel>
        <Panel title="What they talk about">
          {themes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Themes appear as comments, reviews and feedback come in.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {themes.map((t) => (
                <li key={t.theme} className="flex items-baseline justify-between gap-3">
                  <span>{t.theme}</span>
                  <span className="text-xs text-muted-foreground tabular">
                    {t.count} {t.count === 1 ? "mention" : "mentions"}
                    {t.negative ? ` · ${t.negative} unhappy` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <Panel title="Comments and reviews">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing yet. Switch on comments and reviews below once your accounts are connected.
          </p>
        ) : (
          <ul className="divide-y">
            {items.slice(0, 20).map(({ item, thread, text, sentiment }) => (
              <li key={item.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Pill>{thread.channel === "review" ? "Review" : "Comment"}</Pill>
                  <span className="capitalize">{thread.platform}</span>
                  {thread.rating ? <Stars n={thread.rating} /> : null}
                  <span className="text-muted-foreground">{fmtShortDate(item.created_at)}</span>
                  <StatusPill status={item.status} />
                  <span className="sr-only">{sentiment}</span>
                </div>
                <p className="text-sm">
                  <span className="font-medium">{thread.name}:</span> {text}
                </p>
              </li>
            ))}
          </ul>
        )}
        <Link to="/customers" className="label-caps mt-3 inline-block text-[11px] hover:opacity-80">
          Reply from the inbox
        </Link>
      </Panel>
      <ListeningSettingsPanel />
    </div>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${n} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          aria-hidden
          className={cn("h-3 w-3", i < n ? "fill-current" : "text-muted-foreground/40")}
        />
      ))}
    </span>
  );
}

/** Weekly stacked bars, positive at the base; a legend and a table carry the same numbers. */
function SentimentChart({ rows }: { rows: ReturnType<typeof sentimentTrend> }) {
  const max = Math.max(1, ...rows.map((r) => r.positive + r.neutral + r.negative));
  const total = rows.reduce((n, r) => n + r.positive + r.neutral + r.negative, 0);
  if (!total)
    return (
      <p className="text-sm text-muted-foreground">
        The trend appears once comments, reviews or feedback come in.
      </p>
    );
  return (
    <figure className="space-y-3">
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {SENTIMENTS.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn("h-2 w-2 rounded-full", s.fill)} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="flex h-40 items-end gap-2 border-b border-line" aria-hidden>
        {rows.map((r) => {
          const n = r.positive + r.neutral + r.negative;
          return (
            <div
              key={r.week}
              className="group relative mx-auto flex h-full w-full max-w-7 flex-1 flex-col-reverse gap-[2px]"
              title={`Week of ${fmtShortDate(r.week)}: ${r.positive} positive, ${r.neutral} neutral, ${r.negative} negative`}
            >
              {SENTIMENTS.map((s, i) =>
                r[s.key] ? (
                  <div
                    key={s.key}
                    className={cn(
                      s.fill,
                      "w-full",
                      // Rounded only at the data end (the top of the stack).
                      SENTIMENTS.slice(i + 1).every((x) => !r[x.key]) && "rounded-t-[4px]",
                    )}
                    style={{ height: `${(r[s.key] / max) * 100}%` }}
                  />
                ) : null,
              )}
              {n ? (
                <span className="pointer-events-none absolute -top-5 left-1/2 hidden -translate-x-1/2 text-[11px] tabular group-hover:block">
                  {n}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 text-[11px] text-muted-foreground" aria-hidden>
        {rows.map((r, i) => (
          <span key={r.week} className="flex-1 text-center tabular">
            {i % 2 === 1 || i === rows.length - 1 ? fmtShortDate(r.week) : ""}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Comments, reviews and feedback by week</caption>
        <thead>
          <tr>
            <th>Week of</th>
            <th>Positive</th>
            <th>Neutral</th>
            <th>Negative</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.week}>
              <td>{fmtDate(r.week)}</td>
              <td>{r.positive}</td>
              <td>{r.neutral}</td>
              <td>{r.negative}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <figcaption className="text-xs text-muted-foreground">
        Last {WEEKS} weeks: {total} comments, reviews and feedback responses.
      </figcaption>
    </figure>
  );
}

function ListeningSettingsPanel() {
  const { companyId, db, updateListening } = useStore();
  const s = useListening(companyId);
  const founder = useCompanyRole(companyId) === "founder";
  const ayrshare = db.integration_settings.some(
    (i) => i.company_id === companyId && i.provider === "ayrshare" && i.enabled,
  );
  const row = (
    label: string,
    help: string,
    checked: boolean,
    key: "social_comments" | "reviews",
  ) => (
    <label className="flex items-start justify-between gap-4">
      <span>
        <span className="block text-sm">{label}</span>
        <span className="block text-xs text-muted-foreground">{help}</span>
      </span>
      <Switch
        checked={checked}
        disabled={!founder}
        onCheckedChange={(v) => void updateListening(companyId, { [key]: v })}
      />
    </label>
  );
  return (
    <Panel title="What Sol listens to">
      <div className="space-y-4">
        {row(
          "Comments on your posts",
          "New comments on posts Sol published for you come into the inbox.",
          s.social_comments,
          "social_comments",
        )}
        {row(
          "Google reviews",
          "New reviews of your Google Business Profile come into the inbox.",
          s.reviews,
          "reviews",
        )}
        <p className="text-xs text-muted-foreground">
          {ayrshare
            ? "Through your connected social accounts."
            : "Connect your social accounts in Settings → Integrations first."}{" "}
          Public replies always wait for your GO. Sol doesn't search the wider web for mentions.
          {s.last_synced_at ? ` Last checked ${fmtDate(s.last_synced_at)}.` : ""}
        </p>
      </div>
    </Panel>
  );
}

/** Customers → Feedback. */
export function FeedbackPage() {
  const { companyId, db, updateListening } = useStore();
  const { feedback } = useHeard(companyId);
  const s = useListening(companyId);
  const founder = useCompanyRole(companyId) === "founder";
  const requests = db.feedback_requests.filter((r) => r.company_id === companyId);
  const name = (id: string | null) => db.contacts.find((c) => c.id === id)?.name ?? "A customer";
  return (
    <div className="space-y-4">
      <Panel title="Feedback">
        {feedback.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            When customers answer a feedback request, what they said appears here, and the themes in
            Grow → Listening and your morning brief.
          </p>
        ) : (
          <ul className="divide-y">
            {feedback.map((f) => (
              <li key={f.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {f.rating ? <Stars n={f.rating} /> : <Pill>{f.source}</Pill>}
                  <span>{name(f.contact_id)}</span>
                  <span className="text-muted-foreground">{fmtShortDate(f.created_at)}</span>
                  {f.sentiment ? <StatusPill status={f.sentiment} /> : null}
                </div>
                {f.body ? <p className="text-sm">{f.body}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Feedback requests">
        <div className="space-y-4">
          <label className="flex items-start justify-between gap-4">
            <span>
              <span className="block text-sm">Ask after a purchase or booking</span>
              <span className="block text-xs text-muted-foreground">
                Sol drafts a short email a few days after a lead is won or a booking is answered.
                Only to customers who opted in to emails from you, at most once every 90 days, and
                each one waits for your GO.
              </span>
            </span>
            <Switch
              checked={s.feedback_requests}
              disabled={!founder}
              onCheckedChange={(v) => void updateListening(companyId, { feedback_requests: v })}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            Days to wait
            <Input
              type="number"
              min={0}
              max={30}
              className="w-20"
              disabled={!founder}
              defaultValue={s.feedback_delay_days}
              onBlur={(e) => {
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= 0 && n <= 30 && n !== s.feedback_delay_days)
                  void updateListening(companyId, { feedback_delay_days: n });
              }}
            />
          </label>
          {requests.length ? (
            <ul className="space-y-1 text-sm">
              {requests.slice(0, 10).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <span>{name(r.contact_id)}</span>
                  <span className="text-xs text-muted-foreground">
                    {fmtShortDate(r.created_at)}
                  </span>
                  <StatusPill status={r.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              You can also ask one customer from their contact timeline.
            </p>
          )}
        </div>
      </Panel>
    </div>
  );
}
