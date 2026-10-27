// The outside world, behind one interface per channel (Phase 5). Mock providers first; Phase 7
// adds Resend, Ayrshare and others behind per-company feature flags. Providers only talk to the
// outside world: the executor records outcomes in the database itself.

export interface PublishPostInput {
  companyId: string;
  approvalId: string;
  channel: string;
  text: string;
  scheduledFor?: string;
}
export interface SendEmailInput {
  companyId: string;
  approvalId: string;
  to: string[];
  subject: string;
  body: string;
  /** Extra headers, e.g. List-Unsubscribe on marketing email. */
  headers?: Record<string, string>;
}
export interface SetBudgetInput {
  companyId: string;
  approvalId: string;
  platform: string;
  dailyBudget: number;
  hardCap: number;
}
export interface PublishSiteInput {
  companyId: string;
  approvalId: string;
  change: string;
  url: string;
}
export interface FileDocumentInput {
  companyId: string;
  approvalId: string;
  document: string;
  destination: string;
}

/** A public reply to a comment on the company's own post, or to a review (Phase 16). */
export interface PublicReplyInput {
  companyId: string;
  approvalId: string;
  platform: string;
  kind: "comment" | "review";
  /** The provider's id for the comment or review being answered. */
  externalId: string;
  text: string;
}

export interface Providers {
  name: string;
  social: {
    publish(
      i: PublishPostInput,
    ): Promise<{ externalId: string; url?: string; status: "published" | "scheduled" }>;
  };
  email: { send(i: SendEmailInput): Promise<{ messageIds: string[] }> };
  ads: { setDailyBudget(i: SetBudgetInput): Promise<{ reference: string }> };
  site: { publish(i: PublishSiteInput): Promise<{ version: string; previewUrl: string }> };
  documents: { file(i: FileDocumentInput): Promise<{ reference: string }> };
  replies: { reply(i: PublicReplyInput): Promise<{ externalId: string }> };
}

/**
 * Mock providers: nothing leaves the building. Each call is idempotent on the approval id (a
 * retried call returns the same reference), as real providers will be through their own
 * idempotency keys. A text or subject containing "[provider-fail]" simulates an outage.
 */
export function mockProviders(): Providers {
  const fail = (s: string) => {
    if (s.includes("[provider-fail]")) throw new Error("Mock provider outage");
  };
  const ref = (kind: string, id: string) => `mock_${kind}_${id.slice(0, 8)}`;
  return {
    name: "mock",
    social: {
      async publish(i) {
        fail(i.text);
        return {
          externalId: ref("post", i.approvalId),
          status: i.scheduledFor ? "scheduled" : "published",
        };
      },
    },
    email: {
      async send(i) {
        fail(i.subject + i.body);
        return { messageIds: i.to.map((_, n) => `${ref("email", i.approvalId)}_${n}`) };
      },
    },
    ads: {
      async setDailyBudget(i) {
        return { reference: ref("ads", i.approvalId) };
      },
    },
    site: {
      async publish(i) {
        fail(i.change);
        return { version: ref("site", i.approvalId), previewUrl: i.url };
      },
    },
    documents: {
      async file(i) {
        return { reference: ref("filing", i.approvalId) };
      },
    },
    replies: {
      async reply(i) {
        fail(i.text);
        return { externalId: ref("reply", i.approvalId) };
      },
    },
  };
}
