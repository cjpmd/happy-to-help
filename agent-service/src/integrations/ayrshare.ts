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

// Listening (Phase 16): comments on the company's own posts and its Google Business reviews,
// and public replies to them. Ayrshare's comments and reviews endpoints need its Premium or
// Business plan with the platform's account linked; field names differ by platform, so the
// parsers take what's there. Confirm the endpoints on our plan before switching on (HANDOFF 8).

/** A comment or review as receive_listening_item takes it. */
export interface ListeningItem {
  platform: string;
  kind: "comment" | "review";
  externalId: string;
  author: string;
  text: string;
  rating?: number;
  url?: string;
  parent?: string;
  createdAt?: string;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

/** GET /comments/{postId}: { instagram: [{ commentId, comment, username, created }], … }. */
export function parseComments(body: unknown, postId: string): ListeningItem[] {
  const out: ListeningItem[] = [];
  for (const [platform, list] of Object.entries((body ?? {}) as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    for (const c of list as Record<string, unknown>[]) {
      const id = str(c["commentId"]) ?? str(c["id"]);
      const text = str(c["comment"]) ?? str(c["text"]);
      if (!id || !text) continue;
      const from = (c["from"] ?? {}) as Record<string, unknown>;
      const author = str(c["username"]) ?? str(c["userName"]) ?? str(from["name"]) ?? "Someone";
      const created = str(c["created"]) ?? str(c["createdTime"]);
      const url = str(c["commentUrl"]) ?? str(c["url"]);
      out.push({
        platform: platform === "twitter" ? "x" : platform,
        kind: "comment",
        externalId: id,
        author,
        text,
        parent: postId,
        ...(created ? { createdAt: created } : {}),
        ...(url ? { url } : {}),
      });
    }
  }
  return out;
}

/** GET /reviews?platform=gmb: { reviews: [{ reviewId, starRating, comment, reviewer }] }. */
export function parseReviews(body: unknown): ListeningItem[] {
  const list = ((body ?? {}) as { reviews?: unknown }).reviews;
  if (!Array.isArray(list)) return [];
  return (list as Record<string, unknown>[]).flatMap((r) => {
    const id = str(r["reviewId"]) ?? str(r["id"]);
    if (!id) return [];
    const reviewer = (r["reviewer"] ?? {}) as Record<string, unknown>;
    const raw = r["starRating"] ?? r["rating"];
    const rating =
      typeof raw === "number" ? raw : typeof raw === "string" ? (STARS[raw] ?? Number(raw)) : NaN;
    const created = str(r["createTime"]) ?? str(r["created"]);
    return [
      {
        platform: "google",
        kind: "review" as const,
        externalId: id,
        author: str(reviewer["displayName"]) ?? str(r["displayName"]) ?? "A customer",
        // A star rating with no words is still a review.
        text: str(r["comment"]) ?? str(r["review"]) ?? "",
        ...(rating >= 1 && rating <= 5 ? { rating: Math.round(rating) } : {}),
        ...(created ? { createdAt: created } : {}),
      },
    ];
  });
}

export function ayrshareListening(
  apiKey: string,
  profileKey: string,
  fetcher: typeof fetch = fetch,
) {
  const headers = { Authorization: `Bearer ${apiKey}`, "Profile-Key": profileKey };
  const get = async (path: string) => {
    const res = await fetcher(`${API}${path}`, { headers });
    if (!res.ok) throw new Error(`Ayrshare ${path.split("?")[0]} failed (${res.status})`);
    return res.json();
  };
  return {
    comments: async (postId: string) =>
      parseComments(await get(`/comments/${encodeURIComponent(postId)}`), postId),
    reviews: async () => parseReviews(await get("/reviews?platform=gmb")),
  };
}

export function ayrshareReplies(
  apiKey: string,
  profileKey: string,
  fetcher: typeof fetch = fetch,
): Providers["replies"] {
  return {
    async reply(i) {
      const review = i.kind === "review";
      const res = await fetcher(
        review ? `${API}/reviews` : `${API}/comments/reply/${encodeURIComponent(i.externalId)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Profile-Key": profileKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            review
              ? { platform: "gmb", reviewId: i.externalId, reply: i.text }
              : { platforms: [i.platform === "x" ? "twitter" : i.platform], comment: i.text },
          ),
        },
      );
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || data["status"] === "error")
        throw new Error(
          `Ayrshare refused the reply (${res.status}): ${String(data["message"] ?? "no reason given")}`,
        );
      return { externalId: str(data["commentId"]) ?? str(data["id"]) ?? `reply_${i.approvalId}` };
    },
  };
}
