// Resend: sends the company's approved emails (Phase 7). One platform account sends from each
// company's address on the platform's verified sending domain; replies go to the founder.
import type { Providers, SendEmailInput } from "../executor/providers.js";

export function resendEmail(
  apiKey: string,
  sender: { from: string; replyTo?: string | undefined },
  fetcher: typeof fetch = fetch,
): Providers["email"] {
  return {
    async send(i: SendEmailInput) {
      const res = await fetcher("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          // A retried approval sends once.
          "Idempotency-Key": `${i.approvalId}:${i.to.join(",")}`.slice(0, 256),
        },
        body: JSON.stringify({
          from: sender.from,
          to: i.to,
          subject: i.subject,
          text: i.body,
          ...(sender.replyTo ? { reply_to: sender.replyTo } : {}),
          ...(i.headers ? { headers: i.headers } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok || !data.id)
        throw new Error(
          `Resend refused the email (${res.status}): ${data.message ?? "no reason given"}`,
        );
      return { messageIds: [data.id] };
    },
  };
}
