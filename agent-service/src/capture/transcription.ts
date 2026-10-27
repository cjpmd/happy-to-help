// Speech-to-text, behind one interface (SPEC M: a separate, non-Claude provider chosen for
// UK/EU data residency and speaker labels). The mock is the default; Speechmatics (UK company,
// EU processing region) is used when TRANSCRIPTION_PROVIDER=speechmatics and its key is set
// (HANDOFF 3). Audio is never sent anywhere by the mock.

export interface Segment {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

export interface Transcription {
  text: string;
  segments: Segment[];
  durationSeconds: number;
  /** What the provider charged, in USD. */
  costUsd: number;
}

export interface TranscriptionProvider {
  name: string;
  transcribe(
    audio: Blob,
    opts: { durationSeconds: number; usdPerMinute: number; language?: string },
  ): Promise<Transcription>;
}

const minutes = (s: number) => Math.max(1, Math.ceil(s / 60));

/** A fixed, plausible debrief, so the whole pipeline can run with no provider. */
export const mockTranscription: TranscriptionProvider = {
  name: "mock",
  async transcribe(_audio, { durationSeconds, usdPerMinute }) {
    const lines: [string, string][] = [
      ["S1", "We agreed to trial the new menu for two weeks."],
      ["S1", "I'll send the supplier the revised order by Friday."],
      ["S1", "Sol, can you draft a post announcing the trial?"],
      ["S2", "Maybe we could run a tasting evening at some point."],
      ["S1", "Who's checking the allergen labels?"],
    ];
    const step = Math.max(1, Math.floor(durationSeconds / lines.length));
    const segments = lines.map(([speaker, text], i) => ({
      speaker,
      start: i * step,
      end: (i + 1) * step,
      text,
    }));
    return {
      text: segments.map((s) => `${s.speaker}: ${s.text}`).join("\n"),
      segments,
      durationSeconds,
      costUsd: minutes(durationSeconds) * usdPerMinute,
    };
  },
};

interface SpeechmaticsWord {
  type: string;
  start_time: number;
  end_time: number;
  alternatives?: { content: string; speaker?: string }[];
}

/** Speechmatics batch API (v2), EU region by default, with speaker diarisation. */
export function speechmatics(
  apiKey: string,
  baseUrl = "https://eu1.asr.api.speechmatics.com/v2",
  pollMs = 3000,
): TranscriptionProvider {
  const headers = { Authorization: `Bearer ${apiKey}` };
  return {
    name: "speechmatics",
    async transcribe(audio, { durationSeconds, usdPerMinute, language = "en" }) {
      const form = new FormData();
      form.append("data_file", audio, "capture");
      form.append(
        "config",
        JSON.stringify({
          type: "transcription",
          transcription_config: { language, diarization: "speaker", operating_point: "enhanced" },
        }),
      );
      const created = await fetch(`${baseUrl}/jobs`, { method: "POST", headers, body: form });
      if (!created.ok) throw new Error(`Transcription upload failed (${created.status})`);
      const { id } = (await created.json()) as { id: string };
      // Poll until done; long recordings take a while.
      for (let i = 0; i < 400; i++) {
        const r = await fetch(`${baseUrl}/jobs/${id}`, { headers });
        if (!r.ok) throw new Error(`Transcription status failed (${r.status})`);
        const { job } = (await r.json()) as { job: { status: string } };
        if (job.status === "done") break;
        if (job.status === "rejected" || job.status === "deleted")
          throw new Error(`Transcription ${job.status}`);
        await new Promise((res) => setTimeout(res, pollMs));
      }
      const t = await fetch(`${baseUrl}/jobs/${id}/transcript?format=json-v2`, { headers });
      if (!t.ok) throw new Error(`Transcript download failed (${t.status})`);
      const { results } = (await t.json()) as { results: SpeechmaticsWord[] };
      const segments = toSegments(results);
      // Delete the job and its audio from the provider once we have the transcript.
      await fetch(`${baseUrl}/jobs/${id}`, { method: "DELETE", headers }).catch(() => {});
      return {
        text: segments.map((s) => `${s.speaker}: ${s.text}`).join("\n"),
        segments,
        durationSeconds,
        costUsd: minutes(durationSeconds) * usdPerMinute,
      };
    },
  };
}

/** Joins word-level results into one segment per change of speaker. */
export function toSegments(words: SpeechmaticsWord[]): Segment[] {
  const out: Segment[] = [];
  for (const w of words) {
    const alt = w.alternatives?.[0];
    if (!alt) continue;
    const speaker = alt.speaker ?? "S1";
    const last = out[out.length - 1];
    const glue = w.type === "punctuation" ? "" : " ";
    if (last && last.speaker === speaker) {
      last.text = `${last.text}${glue}${alt.content}`.trim();
      last.end = w.end_time;
    } else out.push({ speaker, start: w.start_time, end: w.end_time, text: alt.content });
  }
  return out;
}

export function transcriptionFromEnv(env = process.env): TranscriptionProvider {
  if (env["TRANSCRIPTION_PROVIDER"] === "speechmatics") {
    const key = env["SPEECHMATICS_API_KEY"];
    if (!key) throw new Error("TRANSCRIPTION_PROVIDER=speechmatics needs SPEECHMATICS_API_KEY");
    return speechmatics(key, env["SPEECHMATICS_URL"] || undefined);
  }
  return mockTranscription;
}
