// The plain versions of three skills (Phase 9): UK compliance deadlines, an evidence plan for an
// idea, and a monthly investor update. The mock runtime uses these; the real skills
// (agent-service/skills/*) use them as the facts to write from. Pure; tested in
// src/test/skills.test.ts.

export interface Deadline {
  title: string;
  category: string;
  due_date: string;
  statutory: boolean;
}

const addMonths = (iso: string, months: number) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
};

/** The next occurrence on or after today of a yearly date that started at `from`. */
const nextYearly = (from: string, months: number, today: string) => {
  let d = addMonths(from, months);
  while (d < today) d = addMonths(d, 12);
  return d;
};

/**
 * The UK deadlines a small limited company should have in its calendar, from when it started
 * (taken as incorporation, with the first year end 12 months later). Not tax advice: the skill
 * tells the founder to confirm dates with their accountant.
 */
export function ukDeadlines(
  startedAt: string,
  today: string,
  opts: { emailMarketing: boolean },
): Deadline[] {
  const yearEnd = (n: number) => addMonths(startedAt, 12 * n);
  const firstYearEnd = yearEnd(1);
  const nextYearEnd = (() => {
    let n = 1;
    while (addMonths(yearEnd(n), 12) < today) n++;
    return yearEnd(n);
  })();
  const out: Deadline[] = [
    {
      title: "Confirmation statement to Companies House",
      category: "Companies House",
      due_date: nextYearly(startedAt, 12, today),
      statutory: true,
    },
    {
      title: "Annual accounts to Companies House",
      category: "Companies House",
      // First accounts: 21 months after incorporation; then 9 months after each year end.
      due_date:
        addMonths(nextYearEnd, 9) < addMonths(startedAt, 21)
          ? addMonths(startedAt, 21)
          : addMonths(nextYearEnd, 9),
      statutory: true,
    },
    {
      title: "Corporation Tax payment to HMRC",
      category: "HMRC",
      due_date: addDays(addMonths(nextYearEnd, 9), 1),
      statutory: true,
    },
    {
      title: "Corporation Tax return (CT600) to HMRC",
      category: "HMRC",
      due_date: addMonths(nextYearEnd, 12),
      statutory: true,
    },
    {
      title: "ICO data protection fee",
      category: "Data protection",
      due_date: nextYearly(startedAt, 12, today),
      statutory: true,
    },
    {
      title: "Review the privacy notice",
      category: "Data protection",
      due_date: nextYearly(startedAt, 6, today),
      statutory: false,
    },
  ];
  if (opts.emailMarketing)
    out.push({
      title: "Check marketing consents and unsubscribes (PECR)",
      category: "Data protection",
      due_date: nextQuarter(today),
      statutory: false,
    });
  void firstYearEnd;
  return out.sort((a, b) => a.due_date.localeCompare(b.due_date));
}

function addDays(iso: string, n: number) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

function nextQuarter(today: string) {
  const d = new Date(`${today}T00:00:00Z`);
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return new Date(Date.UTC(d.getUTCFullYear(), q * 3, 1)).toISOString().slice(0, 10);
}

/** Deadlines not already in the calendar (by title), so a re-run adds nothing twice. */
export function missingDeadlines(
  wanted: Deadline[],
  existing: { title: string; due_date: string }[],
) {
  return wanted.filter(
    (w) => !existing.some((e) => e.title === w.title && e.due_date >= w.due_date.slice(0, 7)),
  );
}

export interface EvidencePlan {
  assumptions: { title: string; test: string; pass: string }[];
  smokeTest: string;
}

/** An idea turned into testable assumptions and a smoke test (the evidence-plan skill). */
export function evidencePlanFor(idea: string, customer: string): EvidencePlan {
  const who = customer || "your target customers";
  const short = idea.replace(/\.$/, "");
  return {
    assumptions: [
      {
        title: `${who} have the problem "${short}" solves`,
        test: `Interview five ${who} about how they handle it today.`,
        pass: "At least three describe the problem without prompting.",
      },
      {
        title: `${who} would try "${short}"`,
        test: "Show a one-page description and ask them to join a waitlist.",
        pass: "At least 20% of people who see it join.",
      },
      {
        title: `${who} would pay for "${short}"`,
        test: "Offer a pre-order or deposit at the intended price.",
        pass: "At least two pre-orders from ten conversations.",
      },
    ],
    smokeTest: `A landing page for "${short}" with a waitlist form and a tracked link per channel. Run it for two weeks before building anything.`,
  };
}

export interface InvestorUpdateFacts {
  company: string;
  month: string;
  visitors: number;
  signups: number;
  mrr: number;
  previousMrr: number;
  wins: string[];
  stage: string;
  asks: string[];
}

/** A short monthly investor update in the usual shape: numbers, wins, what's next, asks. */
export function investorUpdate(f: InvestorUpdateFacts): string {
  const growth =
    f.previousMrr > 0 ? Math.round(((f.mrr - f.previousMrr) / f.previousMrr) * 100) : null;
  return [
    `# ${f.company}: ${f.month} update`,
    "",
    "## Numbers",
    `- Monthly recurring revenue: £${f.mrr.toLocaleString("en-GB")}${growth === null ? "" : ` (${growth >= 0 ? "+" : ""}${growth}% on last month)`}`,
    `- Visitors: ${f.visitors.toLocaleString("en-GB")} · signups: ${f.signups.toLocaleString("en-GB")}`,
    `- Stage: ${f.stage}`,
    "",
    "## Wins",
    ...(f.wins.length ? f.wins.map((w) => `- ${w}`) : ["- (Add this month's wins.)"]),
    "",
    "## Asks",
    ...(f.asks.length
      ? f.asks.map((a) => `- ${a}`)
      : ["- Introductions to early customers in our target market."]),
  ].join("\n");
}
