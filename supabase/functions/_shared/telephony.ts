// Calls (Phase 18): Twilio's voice webhooks, free of Deno and network calls so vitest can test it
// (src/test/telephony.test.ts). Requests are checked with Twilio's signature (HMAC-SHA1 of the
// full URL followed by the POST parameters sorted by name, base64), and calls are answered with
// TwiML that plays the recording notice before anything is recorded.

async function hmacSha1Base64(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)),
  );
  return btoa(String.fromCharCode(...sig));
}

/** The X-Twilio-Signature for a request (for tests and the replay script). */
export function twilioSignature(url: string, params: Record<string, string>, authToken: string) {
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  return hmacSha1Base64(authToken, data);
}

export async function verifyTwilio(
  url: string,
  params: Record<string, string>,
  header: string | null,
  authToken: string,
): Promise<boolean> {
  if (!header || !authToken) return false;
  const expected = await twilioSignature(url, params, authToken);
  return (
    expected.length === header.length &&
    [...expected].reduce((d, c, i) => d | (c.charCodeAt(0) ^ header.charCodeAt(i)), 0) === 0
  );
}

export const escapeXml = (s: string) =>
  s.replace(
    /[<>&'"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!,
  );

export interface Routing {
  company: string;
  notice: string;
  forward_to: string | null;
  minutes_left: number;
}

/**
 * How to answer a call. The caller always hears the notice first; the call is recorded only if
 * there's room in today's minutes. With a number to ring, the call is put through (recorded from
 * answer); otherwise the caller can leave a message.
 */
export function voiceResponse(
  r: Routing,
  callbackUrl: string,
): { twiml: string; recorded: boolean } {
  const recorded = r.minutes_left > 0;
  const say = (text: string) => `<Say language="en-GB">${escapeXml(text)}</Say>`;
  const cb = escapeXml(callbackUrl);
  const parts = [recorded ? say(r.notice) : say(`Hello, you've reached ${r.company}.`)];
  if (r.forward_to)
    parts.push(
      recorded
        ? `<Dial record="record-from-answer" recordingStatusCallback="${cb}" recordingStatusCallbackEvent="completed">${escapeXml(r.forward_to)}</Dial>`
        : `<Dial>${escapeXml(r.forward_to)}</Dial>`,
    );
  else if (recorded)
    parts.push(
      say("Please leave a message after the tone."),
      `<Record maxLength="300" playBeep="true" recordingStatusCallback="${cb}" recordingStatusCallbackEvent="completed"/>`,
    );
  else parts.push(say("Sorry, nobody can take your call right now. Please try again later."));
  return {
    twiml: `<?xml version="1.0" encoding="UTF-8"?><Response>${parts.join("")}</Response>`,
    recorded,
  };
}

/** Twilio's call status as ours. */
export function callStatus(
  s: string | undefined,
): "ringing" | "in_progress" | "completed" | "missed" | "failed" {
  switch (s) {
    case "in-progress":
      return "in_progress";
    case "completed":
      return "completed";
    case "busy":
    case "no-answer":
    case "canceled":
      return "missed";
    case "failed":
      return "failed";
    default:
      return "ringing";
  }
}
