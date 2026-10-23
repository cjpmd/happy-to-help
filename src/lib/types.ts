// Shapes mirror the planned Supabase tables so the mock store can be swapped for real queries.
export type Role = "founder" | "mentor" | "admin";
export type Stage = "idea" | "evidence" | "build" | "launch" | "grow";
export type Plan = "starter" | "founder" | "growth";
export type Pillar = "build" | "grow" | "run" | "legal" | "raise";

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  email: string;
}
export interface Company {
  sector?: import("./workspace").Sector;
  channels?: string[];
  id: string;
  slug: string;
  name: string;
  description: string;
  customer_type: "B2B" | "B2C";
  stage: Stage;
  website_live_url: string;
  website_preview_url: string;
  plan: Plan;
  created_by: string;
  target_customer?: string;
  goal_90d?: string;
  /** Mission start (day 0 of the flight plan). */
  started_at?: string;
}
export interface CompanyMember {
  company_id: string;
  user_id: string;
  role: "founder" | "teammate" | "mentor" | "viewer";
}
export interface Cohort {
  id: string;
  name: string;
  institution: string;
  credit_pool: number;
}
export interface CohortCompany {
  cohort_id: string;
  company_id: string;
  credit_cap: number;
}
export interface GateCriterion {
  label: string;
  current: number;
  target: number;
}
export interface StageGate {
  id: string;
  company_id: string;
  stage: Stage;
  criteria: GateCriterion[];
  status: "locked" | "in_progress" | "ready" | "approved";
  approved_by?: string | null;
  approved_at?: string | null;
  /** When the gate should pass. */
  target_date?: string | null;
}
export interface EvidenceItem {
  id: string;
  company_id: string;
  type: "assumption" | "interview" | "waitlist" | "preorder";
  title: string;
  data: Record<string, unknown>;
  status: "untested" | "testing" | "validated" | "invalidated" | null;
}
export interface Task {
  id: string;
  company_id: string;
  pillar: Pillar;
  title: string;
  status: "todo" | "doing" | "done";
  estimated_credits: number;
  due?: string;
  /** A key task: shown as a milestone on the flight plan. */
  key?: boolean;
  /** The stage a key task belongs to. */
  stage?: Stage;
  completed_at?: string | null;
}
export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "needs_approval";
export interface RunStep {
  tool: string;
  summary: string;
  credits: number;
}
export interface AgentRun {
  id: string;
  company_id: string;
  task_id: string | null;
  task: string;
  pillar: Pillar;
  model: string;
  status: RunStatus;
  started_at: string | null;
  finished_at: string | null;
  cost_usd: number;
  credits_charged: number;
  usage: { input_tokens: number; output_tokens: number };
  steps: RunStep[];
}
// Each action type has its own payload. Narrow on `action_type` to read its fields.
interface PayloadBase {
  reason?: string;
}
export interface PublishPostPayload extends PayloadBase {
  channel: SocialPost["channel"];
  text: string;
  scheduled_for?: string;
  media_id?: string | undefined;
}
export interface SendEmailPayload extends PayloadBase {
  to: string;
  subject: string;
  body: string;
  outreach?: boolean;
}
export interface AdSpendPayload extends PayloadBase {
  platform: string;
  amount_gbp: number;
  duration: string;
  audience: string;
  creative: string;
  daily_budget?: number;
  hard_cap?: number;
}
export interface FileDocumentPayload extends PayloadBase {
  document: string;
  destination: string;
}
export interface PublishSitePayload extends PayloadBase {
  change: string;
  url: string;
}
export interface ApprovalPayloads {
  publish_post: PublishPostPayload;
  send_email: SendEmailPayload;
  ad_spend: AdSpendPayload;
  file_document: FileDocumentPayload;
  publish_site: PublishSitePayload;
}
export type ApprovalAction = keyof ApprovalPayloads;
interface ApprovalBase {
  id: string;
  company_id: string;
  run_id: string | null;
  estimated_credits: number;
  status: "pending" | "approved" | "declined";
  decided_by?: string | null;
  decided_at?: string | null;
  created_at: string;
}
export type ApprovalOf<K extends ApprovalAction> = ApprovalBase & {
  action_type: K;
  payload: ApprovalPayloads[K];
};
export type Approval = { [K in ApprovalAction]: ApprovalOf<K> }[ApprovalAction];

/** The public-facing text in an approval (a post or an email body), which the claims check reads. */
export function approvalText(a: Approval): string {
  if (a.action_type === "publish_post") return a.payload.text;
  if (a.action_type === "send_email") return a.payload.body;
  return "";
}
export interface ActivityEvent {
  id: string;
  company_id: string;
  type: string;
  summary: string;
  created_at: string;
}
export type LedgerType = "grant" | "topup" | "hold" | "release" | "usage" | "refund" | "expiry";
export interface LedgerEntry {
  id: string;
  company_id: string;
  entry_type: LedgerType;
  amount: number;
  run_id: string | null;
  note: string;
  created_at: string;
}
export interface ChatMessage {
  id: string;
  company_id: string;
  sender: "founder" | "sol";
  content: string;
  created_at: string;
}
export interface SocialPost {
  id: string;
  company_id: string;
  channel: "Instagram" | "TikTok" | "LinkedIn" | "X";
  text: string;
  angle: string;
  status: "draft" | "awaiting_approval" | "scheduled" | "published";
  scheduled_for: string;
  metrics: { clicks: number; signups: number };
}
export interface ComplianceItem {
  id: string;
  company_id: string;
  title: string;
  category: string;
  due_date: string;
  status: "done" | "in_progress" | "upcoming" | "overdue";
  /** A legal filing or fee with penalties if missed. */
  statutory?: boolean;
}
export type InvestorStage =
  "researching" | "contacted" | "meeting" | "diligence" | "committed" | "passed";
export interface Investor {
  id: string;
  company_id: string;
  name: string;
  firm: string;
  stage: InvestorStage;
  notes: string;
}
export interface MetricsDaily {
  company_id: string;
  date: string;
  visitors: number;
  signups: number;
  paying_customers: number;
  mrr: number;
}
export interface Contact {
  id: string;
  company_id: string;
  name: string;
  email: string;
  kind: "customer" | "lead";
  value: string;
  last: string;
}
export interface GateComment {
  id: string;
  company_id: string;
  author: string;
  text: string;
  created_at: string;
}
