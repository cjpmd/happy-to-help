// A first, rule-based read of a company's voice from its own writing (website copy and past
// emails), shown at Keep going onboarding. It stands in for the voice-analysis skill until a
// real run proposes a full profile (Phase 11), and its findings feed that skill. Pure, tested
// in src/test/voice.test.ts.

export interface VoiceRead {
  /** Average words per sentence. */
  sentenceLength: number;
  readingLevel: "plain" | "standard" | "complex";
  usesEmoji: boolean;
  /** The sign-off used most, e.g. "Best wishes". */
  signOff: string | null;
  spelling: "UK" | "US" | "unclear";
  /** Short, plain-English traits Sol will start from. */
  traits: string[];
  /** Phrases the company uses repeatedly. */
  phrases: string[];
  /** A short draft for the Brand & voice guide. */
  summary: string;
}

const UK =
  /\b(colour|favour|organis\w+|realis\w+|centre|licence|programme|apologis\w+|behaviour|cheque|enrol)\b/gi;
const US =
  /\b(color|favor|organiz\w+|realiz\w+|center|license|program|apologiz\w+|behavior|check|enroll)\b/gi;
const SIGN_OFFS = [
  "Best wishes",
  "Kind regards",
  "Many thanks",
  "Thanks",
  "Cheers",
  "Best",
  "Regards",
  "Warm wishes",
  "All the best",
  "Speak soon",
];
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const STOP = new Set(
  "the a an and or but to of in on for with at by from is are was were be been it this that we you our your i my me us they them their as so if not do does did can will just".split(
    " ",
  ),
);

export function analyseVoice(texts: string[]): VoiceRead | null {
  const all = texts.map((t) => t.trim()).filter(Boolean);
  if (!all.length) return null;
  const text = all.join("\n\n");
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => /\w/.test(s));
  const words = text.match(/[A-Za-z']+/g) ?? [];
  const sentenceLength = sentences.length ? Math.round(words.length / sentences.length) : 0;
  const longWords = words.filter((w) => w.length >= 9).length / Math.max(1, words.length);
  const readingLevel =
    sentenceLength <= 14 && longWords < 0.12
      ? "plain"
      : sentenceLength <= 22
        ? "standard"
        : "complex";
  const uk = text.match(UK)?.length ?? 0;
  const us = text.match(US)?.length ?? 0;
  const spelling = uk > us ? "UK" : us > uk ? "US" : "unclear";
  const signOffCounts = new Map<string, number>();
  for (const t of all)
    for (const s of SIGN_OFFS)
      if (new RegExp(`(^|\\n)\\s*${s}[,!.]?\\s*(\\n|$)`, "i").test(t)) {
        signOffCounts.set(s, (signOffCounts.get(s) ?? 0) + 1);
        break;
      }
  const signOff = [...signOffCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const usesEmoji = EMOJI.test(text);
  const exclaims = (text.match(/!/g) ?? []).length / Math.max(1, sentences.length);
  const questions = (text.match(/\?/g) ?? []).length / Math.max(1, sentences.length);
  const you =
    words.filter((w) => /^(you|your|you're)$/i.test(w)).length / Math.max(1, words.length);

  // Phrases of two to four words, within a sentence, that come up at least twice.
  const counts = new Map<string, number>();
  for (const sentence of sentences) {
    const lower = (sentence.match(/[A-Za-z']+/g) ?? []).map((w) => w.toLowerCase());
    for (let n = 2; n <= 4; n++)
      for (let i = 0; i + n <= lower.length; i++) {
        const gram = lower.slice(i, i + n);
        if (STOP.has(gram[0]!) || STOP.has(gram[n - 1]!)) continue;
        const key = gram.join(" ");
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
  }
  const phrases = [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[0].split(" ").length - a[0].split(" ").length || b[1] - a[1])
    .map(([p]) => p)
    .filter((p, i, arr) => !arr.slice(0, i).some((q) => q.includes(p)))
    .slice(0, 5);

  const traits = [
    readingLevel === "plain"
      ? "Plain and direct"
      : readingLevel === "standard"
        ? "Clear and considered"
        : "Detailed",
    exclaims > 0.15 || usesEmoji ? "Upbeat" : "Calm",
    you > 0.03 ? "Talks to the reader as “you”" : "Talks about the business",
    questions > 0.1 ? "Asks questions" : null,
  ].filter((t): t is string => t !== null);

  const summary = [
    `Traits: ${traits.join(", ")}.`,
    `Sentences average ${sentenceLength} words (${readingLevel} reading level).`,
    `Spelling: ${spelling === "unclear" ? "not clear from the samples; Sol will use UK spelling" : spelling}.`,
    usesEmoji ? "Uses emoji occasionally." : "Doesn't use emoji.",
    signOff ? `Signs off with “${signOff}”.` : "No regular sign-off.",
    phrases.length ? `Phrases you use: ${phrases.map((p) => `“${p}”`).join(", ")}.` : "",
    "Avoid: guarantees, unverifiable superlatives and claims the evidence doesn't support.",
  ]
    .filter(Boolean)
    .join("\n");

  return { sentenceLength, readingLevel, usesEmoji, signOff, spelling, traits, phrases, summary };
}

/** Parses a contacts CSV: a header row with name/email columns (any order), then rows. */
export function parseContactsCsv(csv: string): {
  rows: { name: string; email: string; kind: "customer" | "lead"; value: string }[];
  skipped: number;
} {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  const split = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"' && line[i + 1] === '"' && quoted) {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = !quoted;
      else if (ch === "," && !quoted) {
        out.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const header = split(lines[0] ?? "").map((h) => h.toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const iEmail = col("email", "e-mail");
  const iName = col("name");
  const iKind = col("type", "kind", "status", "stage");
  const iValue = col("value", "plan", "notes");
  if (iEmail < 0) return { rows: [], skipped: Math.max(0, lines.length - 1) };
  const rows: { name: string; email: string; kind: "customer" | "lead"; value: string }[] = [];
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const cells = split(line);
    const email = (cells[iEmail] ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      skipped++;
      continue;
    }
    rows.push({
      name: (iName >= 0 ? cells[iName] : "")?.trim() || email.split("@")[0]!,
      email,
      kind: /customer|paying|client/i.test(iKind >= 0 ? (cells[iKind] ?? "") : "")
        ? "customer"
        : "lead",
      value: (iValue >= 0 ? cells[iValue] : "")?.trim() ?? "",
    });
  }
  return { rows, skipped };
}
