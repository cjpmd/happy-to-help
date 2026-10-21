// Shapes mirror the planned Supabase tables so the mock store can be swapped for real queries.
export type Role = "founder" | "mentor" | "admin";
export type Stage = "idea" | "evidence" | "build" | "launch" | "grow";
export type Plan = "starter" | "founder" | "growth";
export type Pillar = "build" | "grow" | "run" | "legal" | "raise";

export interface Profile { id: string; full_name: string; role: Role; email: string }
export interface Company {
  sector?: import("./workspace").Sector; channels?: string[];
  id: string; slug: string; name: string; description: string; customer_type: "B2B" | "B2C";
  stage: Stage; website_live_url: string; website_preview_url: string; plan: Plan; created_by: string;
  target_customer?: string; goal_90d?: string;
}
export interface CompanyMember { company_id: string; user_id: string; role: "founder" | "teammate" | "mentor" | "viewer" }
export interface Cohort { id: string; name: string; institution: string; credit_pool: number }
export interface CohortCompany { cohort_id: string; company_id: string; credit_cap: number }
export interface GateCriterion { label: string; current: number; target: number }
export interface StageGate {
  id: string; company_id: string; stage: Stage; criteria: GateCriterion[];
  status: "locked" | "in_progress" | "ready" | "approved"; approved_by?: string | null; approved_at?: string | null;
}
export interface EvidenceItem {
  id: string; company_id: string; type: "assumption" | "interview" | "waitlist" | "preorder";
  title: string; data: Record<string, unknown>; status: "untested" | "testing" | "validated" | "invalidated" | null;
}
export interface Task { id: string; company_id: string; pillar: Pillar; title: string; status: "todo" | "doing" | "done"; estimated_credits: number; due?: string }
export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "needs_approval";
export interface RunStep { tool: string; summary: string; credits: number }
export interface AgentRun {
  id: string; company_id: string; task_id: string | null; task: string; pillar: Pillar; model: string; status: RunStatus;
  started_at: string | null; finished_at: string | null; cost_usd: number; credits_charged: number;
  usage: { input_tokens: number; output_tokens: number }; steps: RunStep[];
}
export interface ApprovalPayload { channel?: any; scheduled_for?: any; text?: any; to?: any; subject?: any; body?: any; platform?: any; amount_gbp?: any; duration?: any; audience?: any; creative?: any; document?: any; destination?: any; change?: any; url?: any; reason?: any; daily_budget?: any; hard_cap?: any; outreach?: any; media_id?: any }
export type ApprovalAction = "publish_post" | "send_email" | "ad_spend" | "file_document" | "publish_site";
export interface Approval {
  id: string; company_id: string; run_id: string | null; action_type: ApprovalAction;
  payload: ApprovalPayload; estimated_credits: number; status: "pending" | "approved" | "declined";
  decided_by?: string | null; decided_at?: string | null; created_at: string;
}
export interface ActivityEvent { id: string; company_id: string; type: string; summary: string; created_at: string }
export type LedgerType = "grant" | "topup" | "hold" | "release" | "usage" | "refund" | "expiry";
export interface LedgerEntry { id: string; company_id: string; entry_type: LedgerType; amount: number; run_id: string | null; note: string; created_at: string }
export interface ChatMessage { id: string; company_id: string; sender: "founder" | "sol"; content: string; created_at: string }
export interface SocialPost {
  id: string; company_id: string; channel: "Instagram" | "TikTok" | "LinkedIn" | "X"; text: string; angle: string;
  status: "draft" | "awaiting_approval" | "scheduled" | "published"; scheduled_for: string; metrics: { clicks: number; signups: number };
}
export interface ComplianceItem { id: string; company_id: string; title: string; category: string; due_date: string; status: "done" | "in_progress" | "upcoming" | "overdue" }
export type InvestorStage = "researching" | "contacted" | "meeting" | "diligence" | "committed" | "passed";
export interface Investor { id: string; company_id: string; name: string; firm: string; stage: InvestorStage; notes: string }
export interface MetricsDaily { company_id: string; date: string; visitors: number; signups: number; paying_customers: number; mrr: number }
export interface Contact { id: string; company_id: string; name: string; email: string; kind: "customer" | "lead"; value: string; last: string }
export interface GateComment { id: string; company_id: string; author: string; text: string; created_at: string }
