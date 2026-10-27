// Simulates a phone call against the local call-webhook function (Phase 18), signed like Twilio.
// Needs CALLS_ENABLED=1 in supabase/functions/.env, `npx supabase functions serve`, and a company
// number (Customers → Calls → Add a demo number, or add_mock_phone_number).
// Usage: node scripts/dev/replay-call.mjs +447700900123 [+447700900456]
import { createHmac, randomUUID } from "node:crypto";

const to = process.argv[2];
const from = process.argv[3] ?? "+447700900456";
if (!to) {
  console.error("Usage: node scripts/dev/replay-call.mjs <company number> [caller]");
  process.exit(1);
}
const base = process.env.CALLS_WEBHOOK_URL ?? "http://127.0.0.1:54321/functions/v1/call-webhook";
const token = process.env.TWILIO_AUTH_TOKEN ?? "local-only-twilio-token";
const sid = `CA${randomUUID().replaceAll("-", "")}`;

async function post(event, params) {
  const url = `${base}?event=${event}`;
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": createHmac("sha1", token).update(data).digest("base64"),
    },
    body: new URLSearchParams(params),
  });
  console.log(`${event}: ${res.status}\n${await res.text()}\n`);
}

const call = { CallSid: sid, To: to, From: from };
await post("voice", call);
await post("recording", { ...call, RecordingUrl: "mock:recording", RecordingDuration: "95" });
console.log(`Done. The call (${sid}) and its capture are in Customers → Calls and Meetings.`);
