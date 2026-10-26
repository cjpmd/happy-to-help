import { describe, expect, it } from "vitest";
import { svixSignature, verifySvix } from "../../supabase/functions/_shared/svix";
import {
  checkUnsubscribeToken,
  unsubscribeToken,
  unsubscribeUrl,
} from "../../supabase/functions/_shared/unsubscribe";

const SECRET = "whsec_bG9jYWwtb25seS1yZXNlbmQtc2VjcmV0";

describe("Svix (Resend) signatures", () => {
  it("accepts a signed event and rejects tampering, old timestamps and other secrets", async () => {
    const body = '{"type":"email.received"}';
    const sig = await svixSignature(SECRET, "msg_1", 1_000_000, body);
    const h = { id: "msg_1", timestamp: "1000000", signature: sig };
    expect(await verifySvix(SECRET, h, body, 1_000_010)).toBe(true);
    expect(await verifySvix(SECRET, h, body + "x", 1_000_010)).toBe(false);
    expect(await verifySvix(SECRET, { ...h, id: "msg_2" }, body, 1_000_010)).toBe(false);
    expect(await verifySvix(SECRET, h, body, 1_000_400)).toBe(false);
    expect(await verifySvix("whsec_b3RoZXI=", h, body, 1_000_010)).toBe(false);
    // Several signatures during rotation: any match is enough.
    expect(await verifySvix(SECRET, { ...h, signature: `v1,bad ${sig}` }, body, 1_000_010)).toBe(
      true,
    );
  });
});

describe("unsubscribe links", () => {
  it("are tied to the company and address", async () => {
    const t = await unsubscribeToken("s", "co-1", "Jo@Example.com");
    expect(t).toHaveLength(32);
    expect(await checkUnsubscribeToken("s", "co-1", "jo@example.com", t)).toBe(true);
    expect(await checkUnsubscribeToken("s", "co-2", "jo@example.com", t)).toBe(false);
    expect(await checkUnsubscribeToken("s", "co-1", "al@example.com", t)).toBe(false);
    expect(await checkUnsubscribeToken("other", "co-1", "jo@example.com", t)).toBe(false);
    const url = new URL(
      await unsubscribeUrl("https://p.supabase.co/", "s", "co-1", "Jo@Example.com"),
    );
    expect(url.pathname).toBe("/functions/v1/unsubscribe");
    expect(url.searchParams.get("e")).toBe("jo@example.com");
  });
});
