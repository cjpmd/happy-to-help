import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  callStatus,
  escapeXml,
  twilioSignature,
  verifyTwilio,
  voiceResponse,
} from "../../supabase/functions/_shared/telephony";

const url = "https://example.supabase.co/functions/v1/call-webhook?event=voice";
const params = {
  CallSid: "CA123",
  From: "+447700900001",
  To: "+447700900999",
  Caller: "+447700900001",
};

describe("Twilio signatures", () => {
  it("matches Twilio's scheme: HMAC-SHA1 of the URL and sorted parameters, base64", async () => {
    const data =
      url + "CallSidCA123" + "Caller+447700900001" + "From+447700900001" + "To+447700900999";
    const expected = createHmac("sha1", "token").update(data).digest("base64");
    expect(await twilioSignature(url, params, "token")).toBe(expected);
  });

  it("accepts a good signature and refuses anything changed", async () => {
    const sig = await twilioSignature(url, params, "token");
    expect(await verifyTwilio(url, params, sig, "token")).toBe(true);
    expect(await verifyTwilio(url, { ...params, To: "+447700900111" }, sig, "token")).toBe(false);
    expect(await verifyTwilio(url, params, sig, "other")).toBe(false);
    expect(await verifyTwilio(url, params, null, "token")).toBe(false);
    expect(await verifyTwilio(url, params, sig, "")).toBe(false);
  });
});

describe("answering a call", () => {
  const routing = {
    company: "Harbour & Co",
    notice: "Hello, you've reached Harbour & Co. This call is recorded.",
    forward_to: "+447700900500",
    minutes_left: 30,
  };

  it("plays the notice before putting the call through, recorded", () => {
    const r = voiceResponse(routing, "https://x/call-webhook?event=recording");
    expect(r.recorded).toBe(true);
    const say = r.twiml.indexOf("<Say");
    const dial = r.twiml.indexOf("<Dial");
    expect(say).toBeGreaterThan(0);
    expect(dial).toBeGreaterThan(say);
    expect(r.twiml).toContain("Harbour &amp; Co. This call is recorded.");
    expect(r.twiml).toContain('record="record-from-answer"');
    expect(r.twiml).toContain('recordingStatusCallback="https://x/call-webhook?event=recording"');
  });

  it("takes a message when there's no number to ring", () => {
    const r = voiceResponse({ ...routing, forward_to: null }, "https://x/cb");
    expect(r.twiml).toContain("<Record ");
    expect(r.twiml.indexOf("This call is recorded")).toBeLessThan(r.twiml.indexOf("<Record"));
  });

  it("doesn't record once today's minutes are used, and says nothing about recording", () => {
    const r = voiceResponse({ ...routing, minutes_left: 0 }, "https://x/cb");
    expect(r.recorded).toBe(false);
    expect(r.twiml).not.toContain("record");
    expect(r.twiml).toContain("<Dial>+447700900500</Dial>");
  });

  it("maps statuses and escapes XML", () => {
    expect(callStatus("no-answer")).toBe("missed");
    expect(callStatus("in-progress")).toBe("in_progress");
    expect(callStatus(undefined)).toBe("ringing");
    expect(escapeXml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;",
    );
  });
});
