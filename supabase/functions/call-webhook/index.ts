// POST /functions/v1/call-webhook?event=voice|status|recording: Twilio's voice webhooks for a
// company's phone number (Phase 18). Off unless CALLS_ENABLED=1. Checks Twilio's signature,
// answers with the spoken recording notice (TwiML), and records the call and its recording
// (record_call), which feeds the capture pipeline. Public: deployed with verify_jwt = false.
import { readBody, reportEdgeError, serviceClient } from "../_shared/http.ts";
import { callStatus, verifyTwilio, voiceResponse, type Routing } from "../_shared/telephony.ts";

const xml = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/xml" } });

Deno.serve(async (req) => {
  if (Deno.env.get("CALLS_ENABLED") !== "1") return new Response("Not found", { status: 404 });
  if (req.method !== "POST") return new Response("Use POST", { status: 405 });
  const token = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
  // Twilio signs the public URL it called, which isn't the URL the function sees behind the gateway.
  const base =
    Deno.env.get("CALLS_WEBHOOK_URL") ?? "http://127.0.0.1:54321/functions/v1/call-webhook";
  const url = base + new URL(req.url).search;
  const body = await readBody(req, 64 * 1024);
  if (body === null) return new Response("Too large", { status: 413 });
  const params = Object.fromEntries(new URLSearchParams(body));
  if (!(await verifyTwilio(url, params, req.headers.get("x-twilio-signature"), token)))
    return new Response("Bad signature", { status: 403 });

  const event = new URL(req.url).searchParams.get("event") ?? "voice";
  const admin = serviceClient();
  const call = {
    p_external_id: params["CallSid"] ?? "",
    p_to: params["To"] ?? params["Called"] ?? "",
    p_from: params["From"] ?? params["Caller"] ?? "",
  };
  try {
    if (event === "voice") {
      const { data } = await admin.rpc("call_routing", { p_to: call.p_to });
      const routing = data as Routing | null;
      if (!routing)
        return xml(
          `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="en-GB">This number isn't in use.</Say><Hangup/></Response>`,
        );
      const r = voiceResponse(routing, `${base}?event=recording`);
      const { error } = await admin.rpc("record_call", {
        ...call,
        p_status: "ringing",
        p_recorded: r.recorded,
      });
      if (error) throw new Error(error.message);
      return xml(r.twiml);
    }
    const { error } = await admin.rpc("record_call", {
      ...call,
      p_status: event === "recording" ? "completed" : callStatus(params["CallStatus"]),
      ...((params["RecordingDuration"] ?? params["CallDuration"])
        ? { p_duration_seconds: Number(params["RecordingDuration"] ?? params["CallDuration"]) }
        : {}),
      ...(event === "recording" && params["RecordingUrl"]
        ? { p_recording_url: params["RecordingUrl"] }
        : {}),
    });
    if (error) throw new Error(error.message);
    return xml(`<?xml version="1.0" encoding="UTF-8"?><Response/>`);
  } catch (e) {
    await reportEdgeError("call-webhook", e, { event, call: call.p_external_id });
    // Callers still hear something sensible.
    return xml(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="en-GB">Sorry, something went wrong. Please try again later.</Say></Response>`,
    );
  }
});
