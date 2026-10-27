// Paid ads (Phase 19, off unless ADS_ENABLED=1): each hour, read every live ad's spend from its
// platform into ad_spend_daily (which updates the ad's tracked link, so cost per lead shows in
// attribution, and pauses everything at the monthly cap), then make sure paused ads are paused
// on the platform too.
import type { Db } from "./db/client.js";
import type { Providers } from "./executor/providers.js";

export async function syncAds(
  db: Db,
  providersFor: (companyId: string) => Promise<Providers>,
  now = new Date(),
) {
  const { data: ads, error } = await db
    .from("ad_campaigns")
    .select("id, company_id, platform, status, external_id, created_at")
    .in("status", ["active", "paused"])
    .not("external_id", "is", null);
  if (error) throw new Error(`ads: ${error.message}`);
  const out = { synced: 0, capped: 0, paused: 0 };
  const today = now.toISOString().slice(0, 10);
  // The last week of spend (platforms revise recent days).
  const weekAgo = new Date(now.getTime() - 6 * 86_400_000).toISOString().slice(0, 10);
  for (const ad of ads ?? []) {
    const providers = await providersFor(ad.company_id);
    const since = ad.created_at.slice(0, 10) > weekAgo ? ad.created_at.slice(0, 10) : weekAgo;
    const days = await providers.ads.spend(ad.platform, ad.external_id!, since, today);
    for (const d of days) {
      const { data: capped, error: e } = await db.rpc("record_ad_spend", {
        p_ad: ad.id,
        p_day: d.day,
        p_spend: d.spendGbp,
        p_clicks: d.clicks,
        p_impressions: d.impressions,
      });
      if (e) throw new Error(`ad spend: ${e.message}`);
      if (capped) out.capped++;
    }
    out.synced++;
  }
  // Paused here (by a founder, or the monthly cap): paused there too. Pausing is idempotent.
  const { data: paused } = await db
    .from("ad_campaigns")
    .select("company_id, platform, external_id")
    .eq("status", "paused")
    .not("external_id", "is", null);
  for (const ad of paused ?? []) {
    await (await providersFor(ad.company_id)).ads.pause(ad.platform, ad.external_id!);
    out.paused++;
  }
  return out;
}
