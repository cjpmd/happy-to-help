// Unsubscribe links for marketing email (PECR: every marketing message carries one, honoured at
// once). The token is an HMAC of the company and address with UNSUBSCRIBE_SECRET, so links
// can't be forged or used for someone else. Shared by the agent service (which writes the link)
// and the unsubscribe Edge Function (which checks it). WebCrypto only: runs in Node and Deno.

async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function unsubscribeToken(secret: string, companyId: string, email: string) {
  return (await hmacHex(secret, `${companyId}:${email.trim().toLowerCase()}`)).slice(0, 32);
}

export async function unsubscribeUrl(
  base: string,
  secret: string,
  companyId: string,
  email: string,
) {
  const q = new URLSearchParams({
    co: companyId,
    e: email.trim().toLowerCase(),
    t: await unsubscribeToken(secret, companyId, email),
  });
  return `${base.replace(/\/$/, "")}/functions/v1/unsubscribe?${q}`;
}

export async function checkUnsubscribeToken(
  secret: string,
  companyId: string,
  email: string,
  token: string,
) {
  const expected = await unsubscribeToken(secret, companyId, email);
  return token.length === expected.length && [...token].every((c, i) => c === expected[i]);
}
