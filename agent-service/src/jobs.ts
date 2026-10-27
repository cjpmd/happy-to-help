// The job types the worker knows, with their model tier, skills, credit estimate and cap.
// Estimates are what the founder sees before a run ("≈ N credits"); the cap is the most a run
// may reserve (CLAUDE.md rule 3: maxBudgetUsd = min(task cap, balance in USD)).
import type { ModelTier } from "./config.js";

export type Pillar = "build" | "grow" | "run" | "legal" | "raise";

export interface JobSpec {
  label: string;
  pillar: Pillar;
  tier: ModelTier;
  /** Skills loaded into the company workspace (agent-service/skills/<name>/SKILL.md). */
  skills: string[];
  /** The usual cost in credits, shown before running. */
  estimate: number;
  /** The most one run may reserve, in credits. */
  cap: number;
  maxTurns: number;
  /** Tools this job may use, by short name (see tools.ts). */
  tools: string[];
  prompt: (input: { title?: string; message?: string; target?: string }) => string;
}

const READ = ["get_company", "get_metrics", "list_posts", "list_tasks", "check_claims"];

export const JOBS: Record<string, JobSpec> = {
  chat: {
    label: "Chat with Sol",
    pillar: "run",
    tier: "routine",
    skills: [],
    estimate: 10,
    cap: 30,
    maxTurns: 4,
    tools: READ,
    prompt: ({ message }) =>
      `The founder wrote in chat:\n\n"${message ?? ""}"\n\nReply as Sol in two to four short sentences, in UK English. If they ask for work that would publish, send or spend, say you'll draft it for their approval.`,
  },
  social_post: {
    label: "Write social post",
    pillar: "grow",
    tier: "routine",
    skills: ["social-post", "claims-check"],
    estimate: 40,
    cap: 120,
    maxTurns: 12,
    tools: [...READ, "propose_post"],
    prompt: ({ title }) =>
      `${title ?? "Write today's social post"}. Use the social-post skill: choose the angle from the metrics, write the post, run the claims check, then propose it for approval.`,
  },
  email_reply: {
    label: "Draft email reply",
    pillar: "run",
    tier: "routine",
    skills: ["claims-check"],
    estimate: 30,
    cap: 90,
    maxTurns: 8,
    tools: [...READ, "get_email_thread", "propose_email"],
    prompt: ({ title, target }) =>
      `${title ?? "Draft a reply"} for email thread ${target ?? "(not given)"}. Read the thread, draft a helpful reply in the company's voice, run the claims check, and propose it for approval. Never promise refunds or make claims you can't support.`,
  },
  document_update: {
    label: "Update document",
    pillar: "run",
    tier: "planning",
    skills: ["claims-check"],
    estimate: 120,
    cap: 300,
    maxTurns: 10,
    tools: [...READ, "get_document", "propose_document_update"],
    prompt: ({ title, target }) =>
      `${title ?? "Update the document"} (document ${target ?? "not given"}). Read the current version and the company's evidence, then propose a new version with a one-line summary of what changed.`,
  },
  task: {
    label: "Run task",
    pillar: "build",
    tier: "planning",
    skills: ["claims-check"],
    estimate: 150,
    cap: 600,
    maxTurns: 20,
    tools: [...READ, "propose_site_change", "propose_post", "propose_email"],
    prompt: ({ title }) =>
      `Work on this task: ${title ?? "(untitled)"}. Plan briefly, do the parts you can do safely, and propose anything that publishes, sends or spends for approval. End with a short summary of what you did and what's left.`,
  },
  media_image: {
    label: "Generate image",
    pillar: "grow",
    tier: "routine",
    skills: [],
    estimate: 120,
    cap: 200,
    maxTurns: 4,
    tools: ["get_company"],
    prompt: ({ title }) => `Write a short image brief for: ${title ?? "(no prompt)"}.`,
  },
  media_video: {
    label: "Generate video",
    pillar: "grow",
    tier: "routine",
    skills: [],
    estimate: 400,
    cap: 600,
    maxTurns: 4,
    tools: ["get_company"],
    prompt: ({ title }) => `Write a short video storyboard for: ${title ?? "(no prompt)"}.`,
  },
  auto_mode: {
    label: "Auto Mode",
    pillar: "run",
    tier: "planning",
    skills: ["social-post", "claims-check"],
    estimate: 150,
    cap: 1200,
    maxTurns: 30,
    tools: [...READ, "propose_post", "propose_email", "propose_site_change"],
    prompt: ({ title }) =>
      `${title ?? "Auto Mode"}: pick the highest-leverage work for the current stage goal and do it, proposing anything external for approval. Stop when the budget is nearly used.`,
  },
};

JOBS["voice_analysis"] = {
  label: "Learn the brand voice",
  pillar: "grow",
  tier: "strategy",
  skills: ["voice-analysis"],
  estimate: 150,
  cap: 400,
  maxTurns: 10,
  tools: ["get_company", "get_voice_profile", "get_voice_sources", "propose_voice_from_analysis"],
  prompt: () =>
    "Use the voice-analysis skill: read the company's own writing and propose a voice profile for the founder to approve.",
};
JOBS["voice_update"] = {
  label: "Weekly voice review",
  pillar: "grow",
  tier: "strategy",
  skills: ["voice-update"],
  estimate: 80,
  cap: 250,
  maxTurns: 8,
  tools: ["get_voice_profile", "get_edit_events", "propose_voice_from_edits"],
  prompt: () =>
    "Use the voice-update skill: review this week's edits to your drafts and, if they show a pattern, propose a change to the voice for the founder to approve.",
};

JOBS["capture_process"] = {
  label: "Read a meeting or note",
  pillar: "run",
  tier: "planning",
  skills: ["capture-extract"],
  estimate: 40,
  cap: 200,
  maxTurns: 8,
  tools: ["get_capture", "get_capture_context", "propose_extraction"],
  prompt: ({ target }) =>
    `Use the capture-extract skill on capture ${target ?? "(missing)"}: read it, match what you find against existing tasks, ideas and contacts, and propose the items for the founder's review.`,
};
JOBS["commitment_followup"] = {
  label: "Draft a promised follow-up",
  pillar: "run",
  tier: "routine",
  skills: ["claims-check"],
  estimate: 20,
  cap: 60,
  maxTurns: 6,
  tools: ["get_company", "get_commitment", "propose_followup", "check_claims"],
  prompt: ({ target }) =>
    `The founder promised someone a follow-up (promise ${target ?? "(missing)"}). Read it with get_commitment and draft a short, warm follow-up in the brand voice that does exactly what was promised, then propose it with propose_followup. If something promised is an attachment you don't have, say in the email that it's attached and leave a [placeholder] for the founder.`,
};

JOBS["routine"] = {
  label: "Routine",
  pillar: "run",
  tier: "routine",
  skills: ["claims-check"],
  estimate: 30,
  cap: 120,
  maxTurns: 10,
  tools: [...READ, "propose_post", "propose_email", "propose_document_update"],
  prompt: ({ title }) =>
    `Run the founder's routine "${title ?? "routine"}". Do what it says for the company's current stage; propose anything that would publish or send.`,
};
JOBS["morning_brief"] = {
  label: "Morning brief",
  pillar: "run",
  tier: "routine",
  skills: ["morning-brief"],
  estimate: 25,
  cap: 60,
  maxTurns: 4,
  tools: ["get_brief_facts", "save_brief"],
  prompt: () =>
    "Write today's morning brief with the morning-brief skill: get the facts, then save a short brief in plain UK English.",
};
JOBS["nightly"] = {
  label: "Nightly work",
  pillar: "run",
  tier: "planning",
  skills: ["social-post", "claims-check"],
  estimate: 150,
  cap: 600,
  maxTurns: 20,
  tools: [
    ...READ,
    "propose_post",
    "propose_email",
    "propose_site_change",
    "propose_document_update",
  ],
  prompt: ({ title }) =>
    `It's the nightly loop. The highest-leverage open task for the current stage is "${title ?? "the next task"}". Make real progress on it, propose anything external for approval, and stop well within the budget.`,
};

JOBS["compliance_review"] = {
  label: "Check the compliance calendar",
  pillar: "legal",
  tier: "routine",
  skills: ["compliance-calendar"],
  estimate: 20,
  cap: 60,
  maxTurns: 6,
  tools: ["get_compliance", "add_compliance_items"],
  prompt: () =>
    "Use the compliance-calendar skill: check the company's calendar against the usual UK deadlines, add what's missing, and flag anything overdue.",
};
JOBS["investor_update"] = {
  label: "Investor update",
  pillar: "raise",
  tier: "planning",
  skills: ["investor-update", "claims-check"],
  estimate: 60,
  cap: 200,
  maxTurns: 8,
  tools: ["get_investor_facts", "save_investor_update", "check_claims"],
  prompt: () =>
    "Use the investor-update skill: write this month's investor update from the facts and save it as a draft for the founder to send.",
};
JOBS["evidence_plan"] = {
  label: "Plan the evidence for an idea",
  pillar: "grow",
  tier: "planning",
  skills: ["evidence-plan"],
  estimate: 40,
  cap: 120,
  maxTurns: 6,
  tools: ["get_company", "add_assumptions"],
  prompt: ({ title, target }) =>
    `Use the evidence-plan skill on this idea: "${target ?? title ?? "(no idea given)"}". Turn it into testable assumptions and a smoke test, and add them to the evidence board.`,
};

// SPEC M: triage with the smallest model, drafting with the mid-tier one.
JOBS["inbox_triage"] = {
  label: "Triage a message",
  pillar: "run",
  tier: "routine",
  skills: ["inbox-triage"],
  estimate: 5,
  cap: 15,
  maxTurns: 4,
  tools: ["get_inbox_item", "save_triage"],
  prompt: ({ target }) =>
    `Use the inbox-triage skill on inbox item ${target ?? "(missing)"}: read it and save the triage. Don't draft anything.`,
};
JOBS["inbox_draft"] = {
  label: "Draft a reply",
  pillar: "run",
  tier: "planning",
  skills: ["inbox-reply", "claims-check"],
  estimate: 15,
  cap: 45,
  maxTurns: 6,
  tools: ["get_inbox_item", "propose_reply", "check_claims"],
  prompt: ({ target }) =>
    `Use the inbox-reply skill on inbox item ${target ?? "(missing)"}: draft the reply in the company's voice and propose it.`,
};

JOBS["campaign_plan"] = {
  label: "Plan a campaign",
  pillar: "grow",
  tier: "strategy",
  skills: ["campaign-plan"],
  estimate: 80,
  cap: 250,
  maxTurns: 8,
  tools: ["get_company", "get_metrics", "list_posts", "propose_campaign"],
  prompt: ({ title, target }) =>
    `Use the campaign-plan skill. The founder's goal: "${target ?? title ?? "grow"}". Propose one campaign plan for their approval.`,
};
JOBS["campaign_assets"] = {
  label: "Draft campaign assets",
  pillar: "grow",
  tier: "planning",
  skills: ["campaign-assets", "claims-check"],
  estimate: 120,
  cap: 400,
  maxTurns: 24,
  tools: [
    "get_company",
    "get_campaign",
    "create_campaign_link",
    "propose_campaign_asset",
    "check_claims",
  ],
  prompt: ({ target }) =>
    `Use the campaign-assets skill on approved campaign ${target ?? "(missing)"}: a tracked link per channel, then each asset for approval.`,
};

export function jobSpec(jobType: string): JobSpec | undefined {
  return JOBS[jobType];
}
