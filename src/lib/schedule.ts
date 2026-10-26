// When scheduled work is due (Phase 8), in UK time whatever the server's clock. Shared by the
// agent worker's scheduler and the app (to show the next run). Pure; tested in
// src/test/schedule.test.ts.

export const TZ = "Europe/London";

export interface LocalTime {
  /** YYYY-MM-DD in UK time. */
  date: string;
  /** 0 Sunday … 6 Saturday. */
  weekday: number;
  /** Minutes since local midnight. */
  minutes: number;
  /** ISO week, e.g. 2026-W44. */
  week: string;
}

export function localTime(at: Date, tz = TZ): LocalTime {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const date = `${parts["year"]}-${parts["month"]}-${parts["day"]}`;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts["weekday"]!);
  return {
    date,
    weekday,
    minutes: Number(parts["hour"]) * 60 + Number(parts["minute"]),
    week: isoWeek(date),
  };
}

function isoWeek(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export type Cadence = "daily" | "weekdays" | "weekly";

/** "07:00" or "07:00:00" → minutes. */
export const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/**
 * Whether a routine is due now, and the period it's due for (the key that makes it run once).
 * Daily and weekday routines are due from their time on their day; weekly ones from Monday at
 * their time until the week ends, so a worker that was down on Monday still runs them.
 */
export function routineDue(
  cadence: Cadence,
  runAt: string,
  now: Date,
): { due: boolean; period: string } {
  const t = localTime(now);
  const after = t.minutes >= minutesOf(runAt);
  if (cadence === "weekly")
    return { due: t.weekday === 1 ? after : t.weekday !== 0, period: t.week };
  if (cadence === "weekdays")
    return { due: t.weekday >= 1 && t.weekday <= 5 && after, period: t.date };
  return { due: after, period: t.date };
}

/** The next time a routine runs, for display ("Next: Tue 28 Oct, 07:00"). */
export function nextRun(cadence: Cadence, runAt: string, now: Date): Date {
  // Step forward a minute at a time would be slow; step through local days at the run time.
  const target = minutesOf(runAt);
  for (let day = 0; day < 9; day++) {
    const probe = new Date(now.getTime() + day * 86_400_000);
    const t = localTime(probe);
    const okDay =
      cadence === "daily" ||
      (cadence === "weekdays" ? t.weekday >= 1 && t.weekday <= 5 : t.weekday === 1);
    if (!okDay) continue;
    // The UTC instant of that local date at the run time (UK offset is 0 or +1 hour).
    for (const offset of [0, -60]) {
      const at = new Date(Date.parse(`${t.date}T00:00:00Z`) + (target + offset) * 60_000);
      const lt = localTime(at);
      if (lt.date === t.date && lt.minutes === target && at > now) return at;
    }
  }
  return now;
}

/** The nightly loop runs from 02:00 UK time, once a night. */
export const NIGHTLY_AT = "02:00";
/** The weekly voice review runs on Mondays from 06:00. */
export const VOICE_REVIEW_AT = "06:00";

interface PickableTask {
  id: string;
  title: string;
  status: string;
  actor?: string | null;
  key?: boolean | null;
  stage?: string | null;
  due?: string | null;
}

/**
 * The highest-leverage task for the nightly loop: Sol's own open work, key tasks for the current
 * stage first, then anything overdue, then the soonest due. Never someone else's task.
 */
export function pickNextTask<T extends PickableTask>(
  tasks: T[],
  stage: string,
  today: string,
): T | undefined {
  const mine = tasks.filter((t) => t.status === "todo" && (t.actor ?? "sol") === "sol");
  const score = (t: T) =>
    (t.key && t.stage === stage ? 0 : 1) * 4 +
    (t.due && t.due < today ? 0 : 1) * 2 +
    (t.due ? 0 : 1);
  return [...mine].sort(
    (a, b) => score(a) - score(b) || (a.due ?? "9999").localeCompare(b.due ?? "9999"),
  )[0];
}
