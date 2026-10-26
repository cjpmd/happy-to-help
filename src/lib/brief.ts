// The 07:00 morning brief (Phase 8): the facts come from the database, the words from Sol.
// This builds the plain version (the mock runtime's, and the facts the real one writes from).
// Pure; tested in src/test/schedule.test.ts.

export interface BriefFacts {
  date: string;
  approvalsWaiting: number;
  overnight: { runs: number; credits: number };
  meetings: number;
  actionsFound: number;
  actionsAccepted: number;
  promisesDue: { to: string; what: string }[];
  inboxWaiting: number;
  newLeads: number;
  balance: number;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function briefText(f: BriefFacts, company: string): string {
  const lines = [`Good morning. Here's ${company} for ${fmt(f.date)}.`];
  if (f.meetings || f.promisesDue.length)
    lines.push(
      `From yesterday: ${plural(f.meetings, "meeting")}, ${plural(f.actionsFound, "action")}, ${f.actionsAccepted} accepted, ${plural(f.promisesDue.length, "promise")} due today.`,
    );
  for (const p of f.promisesDue.slice(0, 3)) lines.push(`- Promised to ${p.to}: ${p.what}`);
  if (f.overnight.runs)
    lines.push(
      `Overnight I did ${plural(f.overnight.runs, "piece")} of work for ${plural(f.overnight.credits, "credit")}.`,
    );
  if (f.approvalsWaiting) lines.push(`${plural(f.approvalsWaiting, "thing")} waiting for your GO.`);
  if (f.inboxWaiting) lines.push(`${plural(f.inboxWaiting, "customer")} waiting for a reply.`);
  if (f.newLeads) lines.push(`${plural(f.newLeads, "new lead")} since yesterday.`);
  lines.push(`Balance: ${f.balance.toLocaleString("en-GB")} credits.`);
  return lines.join("\n");
}

const fmt = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
