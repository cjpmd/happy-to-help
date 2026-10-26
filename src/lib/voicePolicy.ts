// Brand voice and response policy (SPEC part G), shaped like the voice_profiles,
// voice_examples, response_policies and response_settings tables. Pure helpers, tested in
// src/test/voicePolicy.test.ts.

export type VoiceStatus = "proposed" | "approved" | "declined" | "superseded";
export type VoiceSource = "default" | "questionnaire" | "analysis" | "edits" | "manual";
export type ResponseMode = "auto_send" | "draft" | "escalate";

export interface VoiceProfile {
  id: string;
  company_id: string;
  version: number;
  status: VoiceStatus;
  source: VoiceSource;
  summary: string;
  traits: string[];
  use_phrases: string[];
  avoid_phrases: string[];
  reading_level: "plain" | "standard" | "complex";
  spelling: "UK" | "US";
  sign_off: string | null;
  emoji: "none" | "sparing" | "often";
  channel_variants: Record<string, string>;
  tone_rules: Record<string, string>;
  changes: string | null;
  created_at: string;
}

/** The fields a founder can change directly (save_voice_profile). */
export type VoiceEdit = Partial<
  Pick<
    VoiceProfile,
    "summary" | "traits" | "use_phrases" | "avoid_phrases" | "sign_off" | "emoji" | "reading_level"
  >
>;

export const SITUATIONS = [
  "general_enquiry",
  "pricing_question",
  "complaint",
  "refund_request",
  "booking",
  "review_positive",
  "review_negative",
  "praise",
  "b2b_enquiry",
  "other",
] as const;
export type Situation = (typeof SITUATIONS)[number];

export interface VoiceExample {
  id: string;
  company_id: string;
  situation: Situation;
  channel: "email" | "social_post" | "social_reply" | "review_reply" | "chat";
  body: string;
  created_at: string;
}

export const POLICY_CATEGORIES = [
  "general_enquiry",
  "pricing_question",
  "booking",
  "review_positive",
  "review_negative",
  "complaint",
  "refund_request",
  "legal_threat",
  "press",
  "spam",
] as const;
export type PolicyCategory = (typeof POLICY_CATEGORIES)[number];

/** Money and legal threats always go to the founder, whatever the settings (SPEC G). */
export const LOCKED_CATEGORIES: readonly PolicyCategory[] = ["refund_request", "legal_threat"];

export interface ResponsePolicy {
  company_id: string;
  category: PolicyCategory;
  mode: ResponseMode;
}

export interface ResponseSettings {
  company_id: string;
  disclosure_text: string;
  disclosure_on_approved: boolean;
  policy_reviewed_at: string | null;
}

export const CATEGORY_LABELS: Record<PolicyCategory | Situation, string> = {
  general_enquiry: "General enquiry",
  pricing_question: "Pricing question",
  booking: "Booking",
  review_positive: "Positive review",
  review_negative: "Negative review",
  complaint: "Complaint",
  refund_request: "Refund request",
  legal_threat: "Legal threat",
  press: "Press",
  spam: "Spam",
  praise: "Praise",
  b2b_enquiry: "Business enquiry",
  other: "Other",
};

export const MODE_LABELS: Record<ResponseMode, string> = {
  auto_send: "Send automatically",
  draft: "Draft for me to approve",
  escalate: "Send to me, no draft",
};

export function isLocked(category: PolicyCategory) {
  return LOCKED_CATEGORIES.includes(category);
}

/** The mode a category may be set to: locked categories only escalate. */
export function allowedModes(category: PolicyCategory): ResponseMode[] {
  return isLocked(category) ? ["escalate"] : ["auto_send", "draft", "escalate"];
}

export const DEFAULT_DISCLOSURE = "Drafted with our AI assistant";

/** What every company starts with (matches private.seed_voice_and_policy). */
export function defaultVoice(companyId: string, createdAt: string): VoiceProfile {
  return {
    id: `voice-${companyId}-1`,
    company_id: companyId,
    version: 1,
    status: "approved",
    source: "default",
    summary: "Clear, encouraging and honest. UK spelling. No guarantees or unsupported claims.",
    traits: ["Clear", "Encouraging", "Honest"],
    use_phrases: [],
    avoid_phrases: ["guaranteed", "best", "world-leading"],
    reading_level: "plain",
    spelling: "UK",
    sign_off: null,
    emoji: "none",
    channel_variants: {
      email: "Short paragraphs, a friendly greeting and a sign-off.",
      social_post: "One idea per post, one call to action.",
      social_reply: "Brief and warm; move private matters to email.",
      review_reply: "Thank them by name; never argue in public.",
      chat: "Short and direct.",
    },
    tone_rules: {
      complaint: "Calm and accountable. No humour, no blame. Say what happens next.",
      praise: "Warm and brief.",
      b2b_enquiry: "Crisp and professional.",
      distressed: "Gentle. Don't try to solve it alone: escalate to the founder.",
    },
    changes: null,
    created_at: createdAt,
  };
}

export function defaultPolicies(companyId: string): ResponsePolicy[] {
  return POLICY_CATEGORIES.map((category) => ({
    company_id: companyId,
    category,
    mode: isLocked(category) ? "escalate" : "draft",
  }));
}

export function defaultSettings(companyId: string): ResponseSettings {
  return {
    company_id: companyId,
    disclosure_text: DEFAULT_DISCLOSURE,
    disclosure_on_approved: true,
    policy_reviewed_at: null,
  };
}

/** The company's voice in use, and a proposal waiting for approval if there is one. */
export function currentVoice(profiles: VoiceProfile[], companyId: string) {
  const mine = profiles.filter((p) => p.company_id === companyId);
  return {
    approved: mine.find((p) => p.status === "approved"),
    proposed: mine.filter((p) => p.status === "proposed").sort((a, b) => b.version - a.version)[0],
    history: mine.sort((a, b) => b.version - a.version),
  };
}

/**
 * The safety checklist before Sol replies to customers: an approved voice that isn't just the
 * starting default, and a reviewed policy. Auto-send stays off until both are done.
 */
export function replyReadiness(
  voice: VoiceProfile | undefined,
  settings: ResponseSettings | undefined,
) {
  const voiceApproved = !!voice && voice.source !== "default";
  const policyReviewed = !!settings?.policy_reviewed_at;
  return { voiceApproved, policyReviewed, ready: voiceApproved && policyReviewed };
}

/** A comma-separated list from a text box, trimmed, without blanks or duplicates. */
export function splitList(text: string, max = 20): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(",")) {
    const v = raw.trim();
    const key = v.toLowerCase();
    if (!v || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length === max) break;
  }
  return out;
}

/** An update_voice decision: GO makes the proposal the voice in use; NO-GO declines it. */
export function applyVoiceDecision(
  profiles: VoiceProfile[],
  profileId: string,
  approved: boolean,
): VoiceProfile[] {
  const target = profiles.find((p) => p.id === profileId && p.status === "proposed");
  if (!target) return profiles;
  return profiles.map((p) => {
    if (p.id === profileId) return { ...p, status: approved ? "approved" : "declined" };
    if (approved && p.company_id === target.company_id && p.status === "approved")
      return { ...p, status: "superseded" };
    return p;
  });
}

/** A new approved version from a founder's edit, superseding the current one. */
export function applyVoiceEdit(
  profiles: VoiceProfile[],
  companyId: string,
  edit: VoiceEdit,
  id: string,
  createdAt: string,
): VoiceProfile[] {
  const mine = profiles.filter((p) => p.company_id === companyId);
  const cur = mine.find((p) => p.status === "approved") ?? defaultVoice(companyId, createdAt);
  const version = Math.max(0, ...mine.map((p) => p.version)) + 1;
  const next: VoiceProfile = {
    ...cur,
    ...edit,
    id,
    version,
    status: "approved",
    source: "manual",
    changes: "Edited by the founder",
    created_at: createdAt,
  };
  return [
    ...profiles.map((p) =>
      p.company_id === companyId && p.status === "approved"
        ? { ...p, status: "superseded" as const }
        : p,
    ),
    next,
  ];
}
