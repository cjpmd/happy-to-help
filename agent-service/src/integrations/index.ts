// Which providers each company uses (Phase 7). A provider is real only when the platform has
// its key AND the company's founder switched it on (integration_settings); everything else stays
// on the mocks. Also reports the platform's setup to the app, and syncs analytics back in.
import type { Db } from "../db/client.js";
import { mockProviders, type Providers } from "../executor/providers.js";
import {
  ayrshareAnalytics,
  ayrshareListening,
  ayrshareReplies,
  ayrshareSocial,
  type ListeningItem,
} from "./ayrshare.js";
import { posthogDaily } from "./posthog.js";
import { resendEmail } from "./resend.js";

export interface PlatformKeys {
  resend?: { apiKey: string; sendingDomain: string };
  ayrshare?: { apiKey: string };
  posthog?: { host: string; projectId: string; apiKey: string };
  transcription?: boolean;
}

export function platformKeys(env: NodeJS.ProcessEnv = process.env): PlatformKeys {
  const v = (k: string) => (env[k] ? env[k] : undefined);
  return {
    ...(v("RESEND_API_KEY") && v("RESEND_SENDING_DOMAIN")
      ? { resend: { apiKey: v("RESEND_API_KEY")!, sendingDomain: v("RESEND_SENDING_DOMAIN")! } }
      : {}),
    ...(v("AYRSHARE_API_KEY") ? { ayrshare: { apiKey: v("AYRSHARE_API_KEY")! } } : {}),
    ...(v("POSTHOG_PERSONAL_API_KEY") && v("POSTHOG_PROJECT_ID")
      ? {
          posthog: {
            host: v("POSTHOG_HOST") ?? "https://eu.posthog.com",
            projectId: v("POSTHOG_PROJECT_ID")!,
            apiKey: v("POSTHOG_PERSONAL_API_KEY")!,
          },
        }
      : {}),
    transcription: env["TRANSCRIPTION_PROVIDER"] === "speechmatics" && !!v("SPEECHMATICS_API_KEY"),
  };
}

async function settings(db: Db, companyId: string) {
  const [s, secrets, company, founder] = await Promise.all([
    db.from("integration_settings").select("provider, enabled, config").eq("company_id", companyId),
    db.from("integration_secrets").select("provider, secret").eq("company_id", companyId),
    db.from("companies").select("name, slug").eq("id", companyId).single(),
    db
      .from("company_members")
      .select("profiles(email)")
      .eq("company_id", companyId)
      .eq("role", "founder")
      .limit(1)
      .maybeSingle(),
  ]);
  const on = (p: string) => s.data?.find((x) => x.provider === p && x.enabled);
  return {
    on,
    secret: (p: string) => secrets.data?.find((x) => x.provider === p)?.secret,
    company: company.data,
    founderEmail: (founder.data?.profiles as { email: string } | null)?.email,
  };
}

/** The providers for one company: real where switched on and configured, mock otherwise. */
export async function providersFor(
  db: Db,
  keys: PlatformKeys,
  companyId: string,
): Promise<Providers> {
  const mock = mockProviders();
  const s = await settings(db, companyId);
  const parts: string[] = [];
  let email = mock.email;
  const resend = s.on("resend");
  if (keys.resend && resend && s.company) {
    const cfg = resend.config as { from_name?: string; reply_to?: string };
    email = resendEmail(keys.resend.apiKey, {
      from: `${(cfg.from_name ?? s.company.name).replace(/[<>"]/g, "")} <${s.company.slug}@${keys.resend.sendingDomain}>`,
      replyTo: cfg.reply_to ?? s.founderEmail,
    });
    parts.push("resend");
  }
  let social = mock.social;
  const profileKey = s.secret("ayrshare");
  if (keys.ayrshare && s.on("ayrshare") && profileKey) {
    social = ayrshareSocial(keys.ayrshare.apiKey, profileKey);
    parts.push("ayrshare");
  }
  // Replies go through Ayrshare when the company also switched listening on.
  let replies = mock.replies;
  if (social !== mock.social) {
    const { data: l } = await db
      .from("listening_settings")
      .select("social_comments, reviews")
      .eq("company_id", companyId)
      .maybeSingle();
    if (l?.social_comments || l?.reviews)
      replies = ayrshareReplies(keys.ayrshare!.apiKey, profileKey!);
  }
  return {
    ...mock,
    name: parts.length ? `${parts.join("+")}+mock` : "mock",
    email,
    social,
    replies,
  };
}

/** Tells the app which providers the platform has set up (Settings → Integrations). */
export async function reportPlatform(db: Db, keys: PlatformKeys, stripe = false) {
  const now = new Date().toISOString();
  const row = (provider: string, configured: boolean) => ({
    provider,
    configured,
    mode: configured ? "live" : "mock",
    checked_at: now,
  });
  await db
    .from("platform_integrations")
    .upsert([
      row("resend", !!keys.resend),
      row("ayrshare", !!keys.ayrshare),
      row("posthog", !!keys.posthog),
      row("transcription", !!keys.transcription),
      row("stripe", stripe),
    ]);
}

/** Pulls post analytics from Ayrshare into social_posts.metrics, for companies that use it. */
export async function syncSocialAnalytics(
  db: Db,
  keys: PlatformKeys,
  fetcher: typeof fetch = fetch,
) {
  if (!keys.ayrshare) return 0;
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: posts } = await db
    .from("social_posts")
    .select("id, company_id, channel, external_id, metrics")
    .eq("provider", "ayrshare")
    .not("external_id", "is", null)
    .gte("created_at", since)
    .limit(200);
  let n = 0;
  for (const post of posts ?? []) {
    const s = await settings(db, post.company_id);
    const profileKey = s.secret("ayrshare");
    if (!s.on("ayrshare") || !profileKey) continue;
    try {
      const m = await ayrshareAnalytics(
        keys.ayrshare.apiKey,
        profileKey,
        post.external_id!,
        post.channel,
        fetcher,
      );
      const old = post.metrics as { signups?: number };
      await db
        .from("social_posts")
        .update({
          metrics: { ...m, signups: old.signups ?? 0 },
          metrics_synced_at: new Date().toISOString(),
        })
        .eq("id", post.id);
      n++;
    } catch {
      // One post's failure doesn't stop the rest; it's retried next time.
    }
  }
  return n;
}

/** Pulls the last two weeks of visitors and signups from PostHog into metrics_daily. */
export async function syncPostHog(db: Db, keys: PlatformKeys, fetcher: typeof fetch = fetch) {
  if (!keys.posthog) return 0;
  const { data: on } = await db
    .from("integration_settings")
    .select("company_id, companies(slug)")
    .eq("provider", "posthog")
    .eq("enabled", true);
  let n = 0;
  for (const row of on ?? []) {
    const company_id = row.company_id;
    const slug = (row.companies as { slug: string } | null)?.slug;
    if (!slug) continue;
    try {
      const days = await posthogDaily(keys.posthog, slug, 14, fetcher);
      for (const d of days) {
        const { data: existing } = await db
          .from("metrics_daily")
          .select("company_id")
          .eq("company_id", company_id)
          .eq("date", d.date)
          .maybeSingle();
        if (existing)
          await db
            .from("metrics_daily")
            .update({ visitors: d.visitors, signups: d.signups })
            .eq("company_id", company_id)
            .eq("date", d.date);
        else
          await db
            .from("metrics_daily")
            .insert({ company_id, date: d.date, visitors: d.visitors, signups: d.signups });
      }
      n++;
    } catch {
      // Retried at the next sync.
    }
  }
  return n;
}

/** What a listening source returns; the Ayrshare client, or a fake in tests. */
export interface ListeningSource {
  comments(postId: string): Promise<ListeningItem[]>;
  reviews(): Promise<ListeningItem[]>;
}

/**
 * Pulls new comments on the company's own recent posts and its reviews into the inbox (Phase 16),
 * for companies that switched listening on and use Ayrshare. Items already here are skipped.
 * Returns how many new items arrived.
 */
export async function syncListening(
  db: Db,
  keys: PlatformKeys,
  sourceFor?: (companyId: string) => Promise<ListeningSource | null>,
) {
  const { data: companies } = await db
    .from("listening_settings")
    .select("company_id, social_comments, reviews")
    .or("social_comments.eq.true,reviews.eq.true");
  let n = 0;
  for (const c of companies ?? []) {
    const source = sourceFor
      ? await sourceFor(c.company_id)
      : await (async () => {
          if (!keys.ayrshare) return null;
          const s = await settings(db, c.company_id);
          const profileKey = s.secret("ayrshare");
          return s.on("ayrshare") && profileKey
            ? ayrshareListening(keys.ayrshare.apiKey, profileKey)
            : null;
        })();
    if (!source) continue;
    const items: ListeningItem[] = [];
    try {
      if (c.social_comments) {
        const { data: posts } = await db
          .from("social_posts")
          .select("external_id")
          .eq("company_id", c.company_id)
          .not("external_id", "is", null)
          .gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
          .limit(50);
        for (const p of posts ?? []) items.push(...(await source.comments(p.external_id!)));
      }
      if (c.reviews) items.push(...(await source.reviews()));
    } catch {
      // Retried at the next sync; what arrived before the failure is still recorded.
    }
    for (const i of items) {
      const { data } = await db.rpc("receive_listening_item", {
        p_company: c.company_id,
        p_platform: i.platform,
        p_kind: i.kind,
        p_external_id: i.externalId,
        p_author: i.author,
        p_text: i.text,
        ...(i.rating ? { p_rating: i.rating } : {}),
        ...(i.url ? { p_url: i.url } : {}),
        ...(i.parent ? { p_parent: i.parent } : {}),
        ...(i.createdAt ? { p_created_at: i.createdAt } : {}),
      });
      if (data) n++;
    }
    await db
      .from("listening_settings")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("company_id", c.company_id);
  }
  return n;
}
