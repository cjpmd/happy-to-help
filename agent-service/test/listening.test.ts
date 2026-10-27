import { describe, expect, it } from "vitest";
import { processJob } from "../src/runner.js";
import { claimNext } from "../src/worker.js";
import { mockRuntime } from "../src/runtime/mock.js";
import { drainApprovals } from "../src/executor/executor.js";
import { mockProviders } from "../src/executor/providers.js";
import { syncListening } from "../src/integrations/index.js";
import { parseComments, parseReviews, type ListeningItem } from "../src/integrations/ayrshare.js";
import { enqueue, testConfig, testDb } from "./local.js";

const db = testDb();
const HARBOUR = "c0000000-0000-4000-8000-000000000005";
const RORY = "a0000000-0000-4000-8000-000000000006";
const RUN = Date.now().toString(36);

const run = async (jobType: string) =>
  processJob(
    { db, config: testConfig(), runtime: mockRuntime },
    (await claimNext(db, "test", [jobType]))!,
  );

async function itemFor(externalId: string) {
  const { data: t } = await db
    .from("email_threads")
    .select("id")
    .eq("company_id", HARBOUR)
    .eq("external_id", externalId)
    .single();
  const { data } = await db
    .from("inbox_items")
    .select("id, channel, status, category, approval_id")
    .eq("thread_id", t!.id)
    .single();
  return data!;
}

describe("Ayrshare listening parsers", () => {
  it("reads comments and reviews whatever the platform calls the fields", () => {
    expect(
      parseComments(
        {
          status: "success",
          instagram: [
            {
              commentId: "c1",
              comment: "Love it",
              username: "kim",
              created: "2026-10-01T10:00:00Z",
            },
          ],
          facebook: [{ id: "c2", text: "Open Sunday?", from: { name: "Sam" } }, { id: "c3" }],
          twitter: [{ commentId: "c4", comment: "Nice" }],
        },
        "post1",
      ).map((c) => [c.platform, c.externalId, c.author, c.text]),
    ).toEqual([
      ["instagram", "c1", "kim", "Love it"],
      ["facebook", "c2", "Sam", "Open Sunday?"],
      ["x", "c4", "Someone", "Nice"],
    ]);
    expect(
      parseReviews({
        reviews: [
          { reviewId: "r1", starRating: "FOUR", comment: "Good", reviewer: { displayName: "Ola" } },
          { id: "r2", rating: 1 },
          { comment: "no id" },
        ],
      }),
    ).toEqual([
      {
        platform: "google",
        kind: "review",
        externalId: "r1",
        author: "Ola",
        text: "Good",
        rating: 4,
      },
      {
        platform: "google",
        kind: "review",
        externalId: "r2",
        author: "A customer",
        text: "",
        rating: 1,
      },
    ]);
  });
});

describe("listening", () => {
  it("brings comments and reviews into the inbox once, and public replies wait for a GO", async () => {
    await db
      .from("listening_settings")
      .upsert({ company_id: HARBOUR, social_comments: true, reviews: true });
    const post = `post_${RUN}`;
    await db.from("social_posts").insert({
      company_id: HARBOUR,
      channel: "Instagram",
      text: "Fresh sourdough today",
      status: "published",
      provider: "ayrshare",
      external_id: post,
    });
    const comment: ListeningItem = {
      platform: "instagram",
      kind: "comment",
      externalId: `c_${RUN}`,
      author: "@kim",
      text: "Do you deliver to Leith?",
    };
    const review: ListeningItem = {
      platform: "google",
      kind: "review",
      externalId: `r_${RUN}`,
      author: "Tom Briggs",
      text: "The cake was late and nobody called.",
      rating: 1,
    };
    const source = {
      comments: async (id: string) => (id === post ? [comment] : []),
      reviews: async () => [review],
    };
    const sourceFor = async (c: string) => (c === HARBOUR ? source : null);
    expect(await syncListening(db, {}, sourceFor)).toBe(2);
    expect(await syncListening(db, {}, sourceFor)).toBe(0);

    const r = await itemFor(review.externalId);
    expect(r).toMatchObject({ channel: "review", status: "new" });
    expect((await itemFor(comment.externalId)).channel).toBe("social");

    await db.from("agent_jobs").update({ status: "done" }).eq("status", "queued");
    await db.from("inbox_items").update({ status: "triaging" }).eq("id", r.id);
    await enqueue(db, HARBOUR, "inbox_triage", { item_id: r.id });
    await run("inbox_triage");
    expect(await itemFor(review.externalId)).toMatchObject({
      status: "drafting",
      category: "review_negative",
    });
    await run("inbox_draft");
    const drafted = await itemFor(review.externalId);
    expect(drafted.status).toBe("awaiting_approval");
    const { data: a } = await db
      .from("approvals")
      .select("action_type, status, payload")
      .eq("id", drafted.approval_id!)
      .single();
    expect(a).toMatchObject({ action_type: "reply_public", status: "pending" });
    expect(a!.payload).toMatchObject({
      platform: "google",
      kind: "review",
      external_id: review.externalId,
    });

    // Not without a GO: an approval nobody decided is blocked.
    await db
      .from("approvals")
      .update({
        status: "approved",
        decided_at: new Date().toISOString(),
        execution_status: "queued",
      })
      .eq("id", drafted.approval_id!);
    expect(await drainApprovals({ db, providers: mockProviders(), workerId: "test" })).toContain(
      "blocked",
    );
    await db
      .from("approvals")
      .update({ decided_by: RORY, execution_status: "queued" })
      .eq("id", drafted.approval_id!);
    expect(await drainApprovals({ db, providers: mockProviders(), workerId: "test" })).toContain(
      "done",
    );
    expect((await itemFor(review.externalId)).status).toBe("sent");
    const { data: sent } = await db
      .from("email_messages")
      .select("body")
      .eq("direction", "sent")
      .eq("thread_id", (a!.payload as { thread_id: string }).thread_id)
      .single();
    expect(sent!.body).toMatch(/Thank you for telling us, Tom\./);
  });
});
