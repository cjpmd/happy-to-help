// Before Sol reads an uploaded recording, it's transcribed here, inside the same run, so the
// transcription is charged with the extraction (reserve → settle) and refunded with it if the
// platform fails. Audio is deleted once transcribed unless the company keeps it for a while.
import type { Db } from "../db/client.js";
import type { Json } from "../db/types.js";
import type { TranscriptionProvider } from "./transcription.js";

const BUCKET = "captures";

/** Transcribes the capture if it's still audio. Returns the transcription cost in USD. */
export async function prepareCapture(
  db: Db,
  provider: TranscriptionProvider,
  captureId: string,
): Promise<{ costUsd: number }> {
  const { data: cap, error } = await db
    .from("captures")
    .select("id, status, audio_path, duration_seconds")
    .eq("id", captureId)
    .single();
  if (error || !cap) throw new Error(`capture not found: ${error?.message ?? captureId}`);
  if (cap.status !== "transcribing") return { costUsd: 0 };
  if (!cap.audio_path || !cap.duration_seconds) throw new Error("capture has no audio");
  const { data: audio, error: dl } = await db.storage.from(BUCKET).download(cap.audio_path);
  if (dl || !audio) throw new Error(`couldn't read the recording: ${dl?.message ?? "missing"}`);
  const { data: cfg } = await db
    .from("credit_config")
    .select("transcription_usd_per_minute")
    .single();
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
  return { costUsd: t.costUsd };
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
