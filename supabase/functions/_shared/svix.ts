// Svix webhook signatures (used by Resend): base64 HMAC-SHA256 of "{id}.{timestamp}.{body}"
// with the secret after its "whsec_" prefix (itself base64). The header can carry several
// space-separated "v1,<signature>" entries during secret rotation. WebCrypto only.

const b64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function sign(secret: string, content: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    unb64(secret.replace(/^whsec_/, "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(content)));
}

export async function svixSignature(secret: string, id: string, timestamp: number, body: string) {
  return `v1,${await sign(secret, `${id}.${timestamp}.${body}`)}`;
}

export async function verifySvix(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  nowSeconds: number,
  toleranceSeconds = 300,
): Promise<boolean> {
  const ts = Number(headers.timestamp);
  if (
    !headers.id ||
    !headers.signature ||
    !Number.isFinite(ts) ||
    Math.abs(nowSeconds - ts) > toleranceSeconds
  )
    return false;
  const expected = (await svixSignature(secret, headers.id, ts, body)).slice(3);
  return headers.signature
    .split(" ")
    .map((s) => s.split(",")[1] ?? "")
    .some((s) => s.length === expected.length && [...s].every((c, i) => c === expected[i]));
}
