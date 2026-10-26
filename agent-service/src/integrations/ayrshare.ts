// Ayrshare: publishes approved posts to the company's own social accounts, and reads back post
// analytics (Phase 7). One platform Business account; each company is an Ayrshare profile with
// its own profile key (in integration_secrets).
import type { Providers, PublishPostInput } from "../executor/providers.js";

const API = "https://api.ayrshare.com/api";
const PLATFORM: Record<string, string> = {
  Instagram: "instagram",
  TikTok: "tiktok",
  LinkedIn: "linkedin",
  X: "twitter",
};

export function ayrshareSocial(
  apiKey: string,
  profileKey: string,
  fetcher: typeof fetch = fetch,
): Providers["social"] {
  return {
    async publish(i: PublishPostInput) {
      const platform = PLATFORM[i.channel];
      if (!platform) throw new Error(`Ayrshare doesn't publish to ${i.channel}`);
      const res = await fetcher(`${API}/post`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Profile-Key": profileKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          post: i.text,
          platforms: [platform],
          ...(i.scheduledFor ? { scheduleDate: i.scheduledFor } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        id?: string;
        postIds?: { postUrl?: string }[];
        message?: string;
      };
      if (!res.ok || data.status === "error" || !data.id)
        throw new Error(
          `Ayrshare refused the post (${res.status}): ${data.message ?? "no reason given"}`,
        );
      const url = data.postIds?.[0]?.postUrl;
      return {
        externalId: data.id,
        ...(url ? { url } : {}),
        status: i.scheduledFor ? "scheduled" : "published",
      };
    },
  };
}

/** A post's numbers, summed across platforms: what Grow shows and Sol reads. */
export interface PostMetrics {
  impressions: number;
  likes: number;
  clicks: number;
}

/** Reads one post's analytics. Field names vary by platform, so it takes what's there. */
export async function ayrshareAnalytics(
  apiKey: string,
  profileKey: string,
  postId: string,
  channel: string,
  fetcher: typeof fetch = fetch,
): Promise<PostMetrics> {
  const res = await fetcher(`${API}/analytics/post`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Profile-Key": profileKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: postId, platforms: [PLATFORM[channel] ?? channel.toLowerCase()] }),
  });
  if (!res.ok) throw new Error(`Ayrshare analytics failed (${res.status})`);
  return sumAnalytics(await res.json());
}

export function sumAnalytics(body: unknown): PostMetrics {
  const out: PostMetrics = { impressions: 0, likes: 0, clicks: 0 };
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  for (const platform of Object.values((body ?? {}) as Record<string, unknown>)) {
    const a = ((platform as { analytics?: unknown })?.analytics ?? {}) as Record<string, unknown>;
    out.impressions +=
      num(a["impressions"]) || num(a["impressionCount"]) || num(a["views"]) || num(a["videoViews"]);
    out.likes += num(a["likes"]) || num(a["likeCount"]) || num(a["reactions"]);
    out.clicks += num(a["clicks"]) || num(a["clickCount"]) || num(a["linkClicks"]);
  }
  return out;
}
