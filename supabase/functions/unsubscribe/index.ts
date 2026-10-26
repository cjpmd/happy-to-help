// GET or POST /functions/v1/unsubscribe?co=&e=&t= : the link in every marketing email (Phase 7,
// PECR). Checks the signed token and records the opt-out at once. POST is the one-click
// unsubscribe mail apps send (RFC 8058). Public: deployed with verify_jwt = false.
import { serviceClient } from "../_shared/http.ts";
import { checkUnsubscribeToken } from "../_shared/unsubscribe.ts";

const page = (title: string, text: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>` +
      `<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5"><h1 style="font-size:1.5rem">${title}</h1><p>${text}</p></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "POST")
    return new Response("Use GET or POST", { status: 405 });
  const q = new URL(req.url).searchParams;
  const company = q.get("co") ?? "";
  const email = (q.get("e") ?? "").toLowerCase();
  const token = q.get("t") ?? "";
  const secret = Deno.env.get("UNSUBSCRIBE_SECRET") ?? "local-only-unsubscribe-secret";
  if (!company || !email || !(await checkUnsubscribeToken(secret, company, email, token)))
    return page(
      "Link not recognised",
      "This unsubscribe link isn't valid. Reply to the email and ask to be removed instead.",
      400,
    );

  const admin = serviceClient();
  let { data: contact } = await admin
    .from("contacts")
    .select("id")
    .eq("company_id", company)
    .ilike("email", email)
    .limit(1)
    .maybeSingle();
  if (!contact) {
    const { data } = await admin
      .from("contacts")
      .insert({
        company_id: company,
        name: email.split("@")[0],
        email,
        kind: "lead",
        source: "email",
      })
      .select("id")
      .single();
    contact = data;
  }
  if (!contact)
    return page("Something went wrong", "Please reply to the email and ask to be removed.", 500);
  await admin.rpc("unsubscribe_contact", { p_contact: contact.id });
  return page(
    "You're unsubscribed",
    `We won't send marketing emails to ${email} again. You may still get replies to messages you send us.`,
  );
});
