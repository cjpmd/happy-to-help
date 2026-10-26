// GET /functions/v1/link/{code}: a tracked short link (Phase 13). Logs the click (time, coarse
// country, device class and referring site; no IP, no cookie) and redirects to the destination
// with its UTM tags. Public: deployed with verify_jwt = false.
import { createClient } from "npm:@supabase/supabase-js@2";
import { countryFrom, deviceClass, linkCode } from "../_shared/logic.ts";

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD")
    return new Response("Use GET", { status: 405 });
  const code = linkCode(new URL(req.url).pathname);
  const notFound = () =>
    new Response("This link doesn't exist or has been switched off.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  if (!code) return notFound();
  // The anon key is enough: follow_link is a public function that only logs and looks up.
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: destination, error } = await sb.rpc("follow_link", {
    p_code: code,
    p_referrer: req.headers.get("referer"),
    p_device: deviceClass(req.headers.get("user-agent")),
    p_country: countryFrom(req.headers),
  });
  if (error || !destination) return notFound();
  return new Response(null, {
    status: 302,
    headers: {
      Location: destination as string,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
});
