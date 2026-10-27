// Before Sol reads an uploaded recording, it's transcribed here, inside the same run, so the
// transcription is charged with the extraction (reserve → settle) and refunded with it if the
// platform fails. Audio is deleted once transcribed unless the company keeps it for a while.
import type { Db } from "../db/client.js";
import type { Json } from "../db/types.js";
import type { TranscriptionProvider } from "./transcription.js";

const BUCKET = "captures";

/**
 * A provider's recording (Phase 18): a Twilio recording is fetched with the account's
 * credentials; "mock:" URLs (local and tests) are an empty recording for the mock transcriber.
 */
export async function fetchExternalAudio(
  url: string,
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
): Promise<Blob> {
  if (url.startsWith("mock:")) return new Blob([]);
  const u = new URL(url);
  if (u.protocol !== "https:" || !/(^|\.)twilio\.com$/.test(u.hostname))
    throw new Error("recordings are only fetched from Twilio");
  const sid = env["TWILIO_ACCOUNT_SID"];
  const token = env["TWILIO_AUTH_TOKEN"];
  if (!sid || !token)
    throw new Error("calls aren't set up (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)");
  const res = await fetcher(url.endsWith(".mp3") ? url : `${url}.mp3`, {
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` },
  });
  if (!res.ok) throw new Error(`couldn't fetch the call recording (${res.status})`);
  return res.blob();
}

/**
 * Transcribes the capture if it's still audio. Returns the cost in USD: transcription, plus the
 * provider's minutes for a notetaker meeting or a call (Phase 18), so they're charged in credits
 * through the usual conversion.
 */
export async function prepareCapture(
  db: Db,
  provider: TranscriptionProvider,
  captureId: string,
): Promise<{ costUsd: number }> {
  const { data: cap, error } = await db
    .from("captures")
    .select("id, status, source, audio_path, external_audio_url, duration_seconds")
    .eq("id", captureId)
    .single();
  if (error || !cap) throw new Error(`capture not found: ${error?.message ?? captureId}`);
  const { data: cfg } = await db
    .from("credit_config")
    .select("transcription_usd_per_minute, notetaker_usd_per_minute, call_usd_per_minute")
    .single();
  const minutes = Math.ceil((cap.duration_seconds ?? 0) / 60);
  const providerUsd =
    minutes *
    Number(
      cap.source === "notetaker"
        ? (cfg?.notetaker_usd_per_minute ?? 0)
        : cap.source === "call"
          ? (cfg?.call_usd_per_minute ?? 0)
          : 0,
    );
  if (cap.status !== "transcribing") return { costUsd: providerUsd };
  if ((!cap.audio_path && !cap.external_audio_url) || !cap.duration_seconds)
    throw new Error("capture has no audio");
  let audio: Blob;
  if (cap.audio_path) {
    const { data, error: dl } = await db.storage.from(BUCKET).download(cap.audio_path);
    if (dl || !data) throw new Error(`couldn't read the recording: ${dl?.message ?? "missing"}`);
    audio = data;
  } else audio = await fetchExternalAudio(cap.external_audio_url!);
  const t = await provider.transcribe(audio, {
    durationSeconds: cap.duration_seconds,
    usdPerMinute: Number(cfg?.transcription_usd_per_minute ?? 0.01),
  });
  const { error: saveErr } = await db.rpc("save_transcript", {
    p_capture: captureId,
    p_text: t.text,
    p_segments: t.segments as unknown as Json,
    p_provider: provider.name,
  });
  if (saveErr) throw new Error(`save transcript: ${saveErr.message}`);
  await purgeExpiredAudio(db, captureId);
  if (cap.external_audio_url && !cap.external_audio_url.startsWith("mock:"))
    await deleteExternalAudio(db, captureId, cap.external_audio_url);
  return { costUsd: t.costUsd + providerUsd };
}

/** A call recording is deleted at Twilio once transcribed, unless the company keeps audio. */
async function deleteExternalAudio(
  db: Db,
  captureId: string,
  url: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const { data: cap } = await db
    .from("captures")
    .select("company_id, audio_delete_after")
    .eq("id", captureId)
    .single();
  const { data: s } = await db
    .from("capture_settings")
    .select("keep_audio_days")
    .eq("company_id", cap!.company_id)
    .maybeSingle();
  if ((s?.keep_audio_days ?? 0) > 0) return;
  const auth = Buffer.from(`${env["TWILIO_ACCOUNT_SID"]}:${env["TWILIO_AUTH_TOKEN"]}`).toString(
    "base64",
  );
  const res = await fetch(`${url.replace(/\.(mp3|wav|json)$/, "")}.json`, {
    method: "DELETE",
    headers: { Authorization: `Basic ${auth}` },
  });
  if (res.ok || res.status === 404)
    await db
      .from("captures")
      .update({ audio_deleted_at: new Date().toISOString() })
      .eq("id", captureId);
}

/** Deletes recordings whose keep period is over (one capture, or all that are due). */
export async function purgeExpiredAudio(db: Db, captureId?: string): Promise<number> {
  let q = db
    .from("captures")
    .select("id, audio_path")
    .not("audio_path", "is", null)
    .is("audio_deleted_at", null)
    .lte("audio_delete_after", new Date().toISOString());
  if (captureId) q = q.eq("id", captureId);
  const { data } = await q.limit(100);
  let n = 0;
  for (const c of data ?? []) {
    const { error } = await db.storage.from(BUCKET).remove([c.audio_path!]);
    if (error) continue;
    await db.from("captures").update({ audio_deleted_at: new Date().toISOString() }).eq("id", c.id);
    n++;
  }
  return n;
}

export async function failCapture(db: Db, captureId: string, error: string) {
  await db.from("captures").update({ status: "failed", error }).eq("id", captureId);
}
