// Features that need providers the platform hasn't set up yet. Off unless switched on at build
// time (docs/HANDOFF.md); the agent service and Edge Functions have their own switches.
const on = (k: string) => (import.meta.env[k] as string | undefined) === "true";

export const FLAGS = {
  /** Phase 18: the meeting notetaker (calendar, Recall.ai). */
  notetaker: on("VITE_NOTETAKER_ENABLED"),
  /** Phase 18: a company phone number with recorded calls (Twilio). */
  calls: on("VITE_CALLS_ENABLED"),
} as const;
