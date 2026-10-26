// POST /functions/v1/resend-inbound: Resend's webhook for email received at a company's inbound
// address, {company-slug}@{INBOUND_DOMAIN} (Phase 7). Checks the Svix signature, finds the
// company, and files the message in its Customers inbox (receive_inbound_email). Phase 14 adds
// triage and drafted replies. Public: deployed with verify_jwt = false.
import { json, serviceClient } from "../_shared/http.ts";
import { verifySvix } from "../_shared/svix.ts";

interface Received {
  type: string;
  data: {
    email_id?: string;
    from?: string;
    to?: string[];
    subject?: string;
    text?: string;
    html?: string;
  };
}

/** "Rory MacKay <rory@x.co>" → { name, address }. */
function parseAddress(s: string) {
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1]!.trim(), address: m[2]!.trim() } : { name: "", address: s.trim() };
}

const stripHtml = (h: string) =>
  h
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  const domain = Deno.env.get("INBOUND_DOMAIN")?.toLowerCase();
  if (!secret || !domain) return json({ error: "Inbound email isn't set up" }, 503);
  const body = await req.text();
  const ok = await verifySvix(
    secret,
    {
      id: req.headers.get("svix-id"),
      timestamp: req.headers.get("svix-timestamp"),
      signature: req.headers.get("svix-signature"),
    },
    body,
    Math.floor(Date.now() / 1000),
  );
  if (!ok) return json({ error: "Bad signature" }, 400);
  const event = JSON.parse(body) as Received;
  if (event.type !== "email.received") return json({ ignored: event.type });

  const slug = (event.data.to ?? [])
    .map((t) => parseAddress(t).address.toLowerCase())
    .find((a) => a.endsWith(`@${domain}`))
    ?.split("@")[0];
  if (!slug) return json({ ignored: "not addressed to a company" });
  const admin = serviceClient();
  const { data: company } = await admin
    .from("companies")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!company) return json({ ignored: "unknown company" });

  // Some inbound events carry only metadata; fetch the body when there's an API key.
  let text = event.data.text ?? (event.data.html ? stripHtml(event.data.html) : "");
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!text && apiKey && event.data.email_id) {
    const res = await fetch(`https://api.resend.com/emails/receiving/${event.data.email_id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      const full = (await res.json()) as { text?: string; html?: string };
      text = full.text ?? (full.html ? stripHtml(full.html) : "");
    }
  }
  const from = parseAddress(event.data.from ?? "");
  const { data: thread, error } = await admin.rpc("receive_inbound_email", {
    p_company: company.id,
    p_from_address: from.address,
    p_from_name: from.name,
    p_subject: event.data.subject ?? "",
    p_body: text,
    p_message_id: event.data.email_id ?? req.headers.get("svix-id") ?? crypto.randomUUID(),
  });
  if (error) return json({ error: error.message }, 500);
  return json({ received: true, thread });
});
