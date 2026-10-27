// PostHog: daily visitors and signups for each company's pages, into metrics_daily (Phase 7).
// One platform project (EU cloud): the hub page and company sites tag events with company_slug,
// only after the visitor allows analytics (see src/components/mission/LinkLayer.tsx).

export interface DailyMetric {
  date: string;
  visitors: number;
  signups: number;
}

export async function posthogDaily(
  cfg: { host: string; projectId: string; apiKey: string },
  companySlug: string,
  days: number,
  fetcher: typeof fetch = fetch,
): Promise<DailyMetric[]> {
  const res = await fetcher(`${cfg.host.replace(/\/$/, "")}/api/projects/${cfg.projectId}/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: {
        kind: "HogQLQuery",
        query: `select toDate(timestamp) as day, count(distinct person_id) as visitors, countIf(event = 'signed_up') as signups
          from events
          where properties.company_slug = {company} and timestamp > now() - interval {days} day
            and event in ('$pageview', 'signed_up')
          group by day order by day`,
        values: { company: companySlug, days },
      },
    }),
  });
  if (!res.ok) throw new Error(`PostHog query failed (${res.status})`);
  const { results } = (await res.json()) as { results?: unknown[][] };
  return (results ?? []).map((r) => ({
    date: String(r[0]).slice(0, 10),
    visitors: Number(r[1] ?? 0),
    signups: Number(r[2] ?? 0),
  }));
}
