import * as seed from "./seed";
import { demoJobTypes, type DB } from "./storeContext";
import { demoLinkData } from "./demoLinks";
import { demoInboxItems } from "./demoInbox";
import { demoFeedback, harbourHeard } from "./demoListening";
import { DEMO_BOT_TEMPLATES } from "./demoBots";
import { defaultPolicies, defaultSettings, defaultVoice } from "./voicePolicy";
import { businessDefaults, isLayout, workspaceSeed, type LayoutItem } from "./workspace";

/** The demo store's starting data, from src/lib/seed.ts. */
export function demoDb(): DB {
  return {
    ...withHarbour(workspaceSeed(seed.companies, seed.tasks)),
    profiles: seed.profiles,
    companies: seed.companies.map((c) => ({
      ...c,
      sector: c.id === "c1" ? ("education" as const) : ("general" as const),
      channels: businessDefaults(c.customer_type),
    })),
    approvals: seed.approvals,
    agent_runs: seed.agent_runs,
    activity_events: seed.activity_events,
    credit_ledger: seed.credit_ledger,
    chat_messages: seed.chat_messages,
    stage_gates: seed.stage_gates,
    investors: seed.investors,
    gate_comments: seed.gate_comments,
    company_members: seed.company_members,
    evidence_items: seed.evidence_items,
    social_posts: seed.social_posts,
    compliance_items: seed.compliance_items,
    metrics_daily: seed.metrics_daily,
    contacts: seed.contacts,
    grants: seed.grants,
    site_versions: seed.site_versions,
    cohorts: seed.cohorts,
    cohort_companies: seed.cohort_companies,
    cohort_mentors: seed.cohort_mentors,
    job_types: demoJobTypes(),
    voice_profiles: seed.companies.map((c) => defaultVoice(c.id, seed.NOW.toISOString())),
    voice_examples: [],
    response_policies: seed.companies.flatMap((c) => defaultPolicies(c.id)),
    response_settings: seed.companies.map((c) => defaultSettings(c.id)),
    captures: [],
    extracted_items: [],
    ideas: [],
    commitments: [],
    capture_settings: [],
    ...demoLinkData(seed.companies, seed.NOW),
    subscriptions: [],
    integration_settings: [],
    platform_integrations: [],
    auto_sessions: [],
    company_automation: [],
    briefs: [],
    inbox_items: demoInboxItems([...seed.harbour_emails, ...harbourHeard(seed.NOW)]),
    campaigns: [],
    campaign_assets: [],
    campaign_results: [],
    listening_settings: [],
    feedback: demoFeedback(seed.NOW),
    feedback_requests: [],
    bot_templates: DEMO_BOT_TEMPLATES,
    bots: [],
    bot_runs: [],
    calendar_connections: [],
    calendar_events: [],
    phone_numbers: [],
    call_sessions: [],
    ad_campaigns: [],
  };
}

/** A saved HQ layout is usable if it lists each card exactly once. */
export function isValidLayout(value: unknown): value is LayoutItem[] {
  return isLayout(value);
}

/** Harbour Bakes' seeded inbox replaces the empty one workspaceSeed gives other companies. */
function withHarbour(w: ReturnType<typeof workspaceSeed>) {
  return { ...w, emails: [...w.emails, ...seed.harbour_emails, ...harbourHeard(seed.NOW)] };
}
