import type * as T from "./types";
import { GATE_TARGET_DAYS, STAGE_ORDER } from "./mission";

// Fixed "now" keeps server and browser renders identical for the demo.
export const NOW = new Date("2026-10-21T07:30:00Z");
const ago = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();
const ahead = (d: number) => new Date(NOW.getTime() + d * 86400_000).toISOString().slice(0, 10);

export const profiles: T.Profile[] = [
  { id: "u1", full_name: "Aisha Grant", role: "founder", email: "aisha.grant@example.com" },
  { id: "u2", full_name: "Dr Morag Fraser", role: "mentor", email: "morag.fraser@example.com" },
  { id: "u3", full_name: "Platform Admin", role: "admin", email: "admin@example.com" },
  { id: "u4", full_name: "Callum Reid", role: "founder", email: "callum.reid@example.com" },
];

export const companies: T.Company[] = [
  {
    id: "c1",
    started_at: ago(24 * 30),
    slug: "studybuddy",
    name: "StudyBuddy",
    description:
      "Bite-sized revision quizzes for Highers students. Personalised daily practice that adapts to what you get wrong.",
    customer_type: "B2C",
    stage: "build",
    website_live_url: "/site/studybuddy",
    website_preview_url: "/site/studybuddy?preview=1",
    plan: "founder",
    created_by: "u1",
    target_customer: "S5–S6 students sitting Highers",
    goal_90d: "500 weekly active students",
  },
  {
    id: "c2",
    started_at: ago(24 * 14),
    slug: "kelpie-energy",
    name: "Kelpie Energy",
    description: "Smart heating controls for tenement flats. Cuts bills without landlord rewiring.",
    customer_type: "B2C",
    stage: "evidence",
    website_live_url: "/site/kelpie-energy",
    website_preview_url: "/site/kelpie-energy?preview=1",
    plan: "starter",
    created_by: "u4",
  },
  {
    id: "c3",
    started_at: ago(24 * 50),
    slug: "thrift-loop",
    name: "Thrift Loop",
    description:
      "Inventory and resale software for charity shops. Lists donated stock online in seconds.",
    customer_type: "B2B",
    stage: "launch",
    website_live_url: "/site/thrift-loop",
    website_preview_url: "/site/thrift-loop?preview=1",
    plan: "growth",
    created_by: "u4",
  },
  {
    id: "c4",
    started_at: ago(24 * 5),
    slug: "croft-care",
    name: "Croft Care",
    description:
      "Rota and visit-logging for rural home-care agencies. Works offline in remote areas.",
    customer_type: "B2B",
    stage: "idea",
    website_live_url: "/site/croft-care",
    website_preview_url: "/site/croft-care?preview=1",
    plan: "starter",
    created_by: "u4",
  },
];

export const company_members: T.CompanyMember[] = [
  { company_id: "c1", user_id: "u1", role: "founder" },
  { company_id: "c2", user_id: "u1", role: "founder" },
  ...["c1", "c2", "c3", "c4"].map((c) => ({
    company_id: c,
    user_id: "u2",
    role: "mentor" as const,
  })),
];

export const cohorts: T.Cohort[] = [
  {
    id: "h1",
    name: "University Venture Programme",
    institution: "Taybridge University",
    credit_pool: 60000,
  },
];
export const cohort_companies: T.CohortCompany[] = [
  { cohort_id: "h1", company_id: "c1", credit_cap: 15000 },
  { cohort_id: "h1", company_id: "c2", credit_cap: 8000 },
  { cohort_id: "h1", company_id: "c3", credit_cap: 20000 },
  { cohort_id: "h1", company_id: "c4", credit_cap: 5000 },
];

function gates(
  cid: string,
  stage: T.Stage,
  ev: T.GateCriterion[],
  build: T.GateCriterion[],
): T.StageGate[] {
  const idx = STAGE_ORDER.indexOf(stage);
  const start = new Date(companies.find((c) => c.id === cid)?.started_at ?? NOW).getTime();
  const onDay = (day: number) => new Date(start + day * 86_400_000).toISOString();
  return STAGE_ORDER.map((s, i) => ({
    id: `${cid}-${s}`,
    company_id: cid,
    stage: s,
    criteria: s === "evidence" ? ev : s === "build" ? build : [],
    status: i < idx ? "approved" : i === idx ? "in_progress" : "locked",
    approved_by: i < idx ? "u2" : null,
    approved_at: i < idx ? onDay(GATE_TARGET_DAYS[s]) : null,
    target_date: onDay(GATE_TARGET_DAYS[s]),
  }));
}
export const stage_gates: T.StageGate[] = [
  ...gates(
    "c1",
    "build",
    [
      { label: "Waitlist", current: 64, target: 50 },
      { label: "Interviews", current: 8, target: 8 },
    ],
    [
      { label: "Beta users", current: 23, target: 40 },
      { label: "Interviews", current: 5, target: 8 },
      { label: "Pre-orders", current: 12, target: 10 },
    ],
  ),
  ...gates(
    "c2",
    "evidence",
    [
      { label: "Waitlist", current: 31, target: 50 },
      { label: "Interviews", current: 5, target: 8 },
    ],
    [{ label: "Beta users", current: 0, target: 40 }],
  ),
  ...gates(
    "c3",
    "launch",
    [
      { label: "Waitlist", current: 120, target: 50 },
      { label: "Interviews", current: 12, target: 8 },
    ],
    [{ label: "Beta users", current: 46, target: 40 }],
  ),
  ...gates(
    "c4",
    "idea",
    [
      { label: "Waitlist", current: 4, target: 50 },
      { label: "Interviews", current: 1, target: 8 },
    ],
    [{ label: "Beta users", current: 0, target: 40 }],
  ),
];
// Kelpie is ready for mentor sign-off on Evidence
stage_gates.find((g) => g.id === "c2-evidence")!.status = "ready";

export const evidence_items: T.EvidenceItem[] = [
  {
    id: "e1",
    company_id: "c1",
    type: "assumption",
    title: "Students will revise on their phone for 10 minutes a day",
    data: { test: "7-day streak experiment with 20 beta users" },
    status: "validated",
  },
  {
    id: "e2",
    company_id: "c1",
    type: "assumption",
    title: "Parents will pay £4.99/month for exam-season access",
    data: { test: "Pre-order page with Stripe placeholder" },
    status: "testing",
  },
  {
    id: "e3",
    company_id: "c1",
    type: "assumption",
    title: "Teachers will recommend it to their classes",
    data: { test: "Outreach to 15 Taybridge schools" },
    status: "untested",
  },
  {
    id: "e4",
    company_id: "c1",
    type: "assumption",
    title: "Students prefer quizzes over flashcards",
    data: { test: "A/B test in beta" },
    status: "invalidated",
  },
  {
    id: "e5",
    company_id: "c1",
    type: "interview",
    title: "Ellie, S5, Taybridge Academy",
    data: {
      note: "Uses TikTok for revision tips. Hates long videos. Would share streaks with friends.",
      date: ago(24 * 9),
    },
    status: null,
  },
  {
    id: "e6",
    company_id: "c1",
    type: "interview",
    title: "Mark, parent of S6 student",
    data: {
      note: "Pays £30/hr for a maths tutor. Would pay for something that shows progress.",
      date: ago(24 * 6),
    },
    status: null,
  },
  {
    id: "e7",
    company_id: "c1",
    type: "interview",
    title: "Ms Khan, Chemistry teacher",
    data: {
      note: "Wants class-level dashboards. Budget sits with the department head.",
      date: ago(24 * 3),
    },
    status: null,
  },
  {
    id: "e8",
    company_id: "c1",
    type: "waitlist",
    title: "Waitlist",
    data: { count: 64 },
    status: null,
  },
  {
    id: "e9",
    company_id: "c1",
    type: "preorder",
    title: "Exam season pass pre-orders",
    data: { count: 12, value_gbp: 59.88 },
    status: null,
  },
];

export const tasks: T.Task[] = [
  {
    id: "t1",
    company_id: "c1",
    pillar: "build",
    title: "Add streak counter to quiz results page",
    status: "doing",
    estimated_credits: 150,
  },
  {
    id: "t2",
    company_id: "c1",
    pillar: "build",
    title: "Mobile layout for the pricing page",
    status: "todo",
    estimated_credits: 150,
  },
  {
    id: "t3",
    company_id: "c1",
    pillar: "grow",
    title: "Draft 5 TikTok scripts for prelims season",
    status: "done",
    estimated_credits: 200,
  },
  {
    id: "t4",
    company_id: "c1",
    pillar: "grow",
    title: "Welcome email sequence",
    status: "doing",
    estimated_credits: 90,
  },
  {
    id: "t5",
    company_id: "c1",
    pillar: "run",
    title: "Reply to 3 teacher enquiries",
    status: "todo",
    estimated_credits: 30,
    due: ahead(1),
  },
  {
    id: "t6",
    company_id: "c1",
    pillar: "run",
    title: "Send beta feedback survey",
    status: "todo",
    estimated_credits: 40,
    due: ahead(3),
  },
  {
    id: "t7",
    company_id: "c1",
    pillar: "legal",
    title: "Draft privacy policy (under-16 users)",
    status: "done",
    estimated_credits: 120,
  },
  {
    id: "t8",
    company_id: "c1",
    pillar: "raise",
    title: "Research 10 edtech angels",
    status: "done",
    estimated_credits: 200,
  },
  {
    id: "t9",
    company_id: "c1",
    pillar: "raise",
    title: "Tay Founders Award application draft",
    status: "doing",
    estimated_credits: 300,
    due: ahead(12),
  },
];

const run = (
  id: string,
  task: string,
  pillar: T.Pillar,
  status: T.RunStatus,
  h: number,
  mins: number,
  credits: number,
  steps: T.RunStep[],
  task_id: string | null = null,
): T.AgentRun => ({
  id,
  company_id: "c1",
  task_id,
  task,
  pillar,
  model: "claude-sonnet-4.5",
  status,
  started_at: ago(h),
  finished_at:
    status === "running" || status === "queued"
      ? null
      : new Date(new Date(ago(h)).getTime() + mins * 60000).toISOString(),
  cost_usd: +(credits * 0.0042).toFixed(2),
  credits_charged: status === "failed" ? 0 : credits,
  usage: { input_tokens: credits * 210, output_tokens: credits * 38 },
  steps,
});
export const agent_runs: T.AgentRun[] = [
  run(
    "r1",
    "Draft TikTok post: 'The 3-minute Higher Maths warm-up'",
    "grow",
    "needs_approval",
    7,
    2,
    40,
    [
      { tool: "web_search", summary: "Checked trending revision sounds", credits: 10 },
      { tool: "write", summary: "Drafted caption and script", credits: 30 },
    ],
  ),
  run(
    "r2",
    "Write welcome email for new waitlist signups",
    "grow",
    "needs_approval",
    6.5,
    3,
    30,
    [
      { tool: "read_crm", summary: "Pulled 9 new signups", credits: 5 },
      { tool: "write", summary: "Wrote email in StudyBuddy voice", credits: 25 },
    ],
    "t4",
  ),
  run("r3", "Plan £30 Instagram test campaign", "grow", "needs_approval", 6, 4, 90, [
    { tool: "analytics", summary: "Reviewed top-performing posts", credits: 30 },
    { tool: "ads_planner", summary: "Built audience: 16–18, Scotland", credits: 60 },
  ]),
  run(
    "r4",
    "Add streak counter to quiz results",
    "build",
    "succeeded",
    5,
    11,
    420,
    [
      { tool: "repo_read", summary: "Read results page", credits: 60 },
      { tool: "code_edit", summary: "Added streak component and storage", credits: 300 },
      { tool: "deploy_preview", summary: "Deployed to preview URL", credits: 60 },
    ],
    "t1",
  ),
  run("r5", "Generate Open Graph images for site", "build", "failed", 4.5, 1, 120, [
    { tool: "image_gen", summary: "Provider timeout after 3 retries", credits: 0 },
  ]),
  run("r6", "Summarise overnight inbox", "run", "succeeded", 3, 1, 25, [
    { tool: "inbox_read", summary: "Read 14 emails, flagged 3 teacher enquiries", credits: 25 },
  ]),
  run("r7", "Check ICO registration requirements", "legal", "succeeded", 2.5, 2, 60, [
    { tool: "web_search", summary: "Confirmed tier 1 fee applies (£52)", credits: 20 },
    { tool: "write", summary: "Prepared filing summary", credits: 40 },
  ]),
  run("r8", "Update investor pipeline from LinkedIn", "raise", "running", 0.3, 0, 80, [
    { tool: "web_search", summary: "Searching for edtech angels…", credits: 20 },
  ]),
];

export const approvals: T.Approval[] = [
  {
    id: "a1",
    company_id: "c1",
    run_id: "r1",
    action_type: "publish_post",
    estimated_credits: 40,
    status: "pending",
    created_at: ago(7),
    payload: {
      channel: "TikTok",
      scheduled_for: "21 Oct 2026, 16:30",
      text: "POV: it's 10 minutes before your Higher Maths prelim 😬 Here's the 3-minute warm-up that actually works 👇 #HighersRevision #SQA",
      reason:
        "Revision-hack posts drove 71% of last week's signups. 16:30 is when your audience is most active.",
    },
  },
  {
    id: "a2",
    company_id: "c1",
    run_id: "r2",
    action_type: "send_email",
    estimated_credits: 30,
    status: "pending",
    created_at: ago(6.5),
    payload: {
      to: "9 new waitlist signups",
      subject: "You're in — your first quiz is ready",
      body: "Hi {first_name},\n\nThanks for joining StudyBuddy. Your first 10-minute quiz is waiting, built around the topics most Highers students find hardest.\n\nKeep a 3-day streak and we'll unlock your personal weak-spots report.\n\nAisha, founder",
      reason:
        "Signups who get a welcome email within 24 hours are far more likely to try a first quiz.",
    },
  },
  {
    id: "a3",
    company_id: "c1",
    run_id: "r3",
    action_type: "ad_spend",
    estimated_credits: 90,
    status: "pending",
    created_at: ago(6),
    payload: {
      platform: "Instagram",
      amount_gbp: 30,
      duration: "5 days",
      audience: "Ages 16–18, Scotland, interests: exams, study",
      creative: "Reuse best-performing TikTok as Reel",
      reason: "Test whether paid reach converts at under £1.50 per signup before prelims.",
    },
  },
  {
    id: "a4",
    company_id: "c1",
    run_id: null,
    action_type: "file_document",
    estimated_credits: 20,
    status: "approved",
    decided_by: "Aisha Grant",
    decided_at: ago(30),
    created_at: ago(40),
    payload: {
      document: "Privacy policy v1",
      destination: "studybuddy.example/privacy",
      reason: "Required before collecting student emails.",
    },
  },
  {
    id: "a5",
    company_id: "c1",
    run_id: null,
    action_type: "publish_post",
    estimated_credits: 40,
    status: "declined",
    decided_by: "Aisha Grant",
    decided_at: ago(50),
    created_at: ago(60),
    payload: {
      channel: "X",
      text: "Revision is broken. We're fixing it.",
      reason: "Brand awareness",
    },
  },
  {
    id: "a6",
    company_id: "c2",
    run_id: null,
    action_type: "publish_site",
    estimated_credits: 150,
    status: "pending",
    created_at: ago(10),
    payload: {
      change: "New landing page hero and waitlist form",
      url: "/site/kelpie-energy?preview=1",
      reason: "Current page has no clear call to action.",
    },
  },
];

export const activity_events: T.ActivityEvent[] = [
  {
    id: "ev1",
    company_id: "c1",
    type: "build",
    summary: "Shipped streak counter to preview",
    created_at: ago(5),
  },
  {
    id: "ev2",
    company_id: "c1",
    type: "grow",
    summary: "Drafted TikTok post and welcome email for approval",
    created_at: ago(6.5),
  },
  {
    id: "ev3",
    company_id: "c1",
    type: "run",
    summary: "Triaged 14 emails — 3 teacher enquiries need you",
    created_at: ago(3),
  },
  {
    id: "ev4",
    company_id: "c1",
    type: "legal",
    summary: "Confirmed ICO fee: tier 1, £52, due 14 Nov 2026",
    created_at: ago(2.5),
  },
  {
    id: "ev5",
    company_id: "c1",
    type: "refund",
    summary: "OG image run failed — 120 credits refunded",
    created_at: ago(4.4),
  },
  {
    id: "ev6",
    company_id: "c1",
    type: "evidence",
    summary: "Waitlist passed 64 (+9 overnight)",
    created_at: ago(8),
  },
  {
    id: "ev7",
    company_id: "c2",
    type: "evidence",
    summary: "Logged interview with a tenant in a Taybridge tenement",
    created_at: ago(12),
  },
  {
    id: "ev8",
    company_id: "c3",
    type: "grow",
    summary: "Published 3 LinkedIn posts",
    created_at: ago(30),
  },
];

export const credit_ledger: T.LedgerEntry[] = [
  {
    id: "l1",
    company_id: "c1",
    entry_type: "grant",
    amount: 5000,
    run_id: null,
    note: "Founder plan — October grant",
    created_at: "2026-10-01T00:00:00Z",
  },
  {
    id: "l2",
    company_id: "c1",
    entry_type: "topup",
    amount: 10000,
    run_id: null,
    note: "Launch Pack (build credits)",
    created_at: "2026-10-03T10:12:00Z",
  },
  {
    id: "l3",
    company_id: "c1",
    entry_type: "usage",
    amount: -6240,
    run_id: null,
    note: "Landing page and quiz engine build",
    created_at: "2026-10-08T03:00:00Z",
  },
  {
    id: "l4",
    company_id: "c1",
    entry_type: "usage",
    amount: -2180,
    run_id: null,
    note: "Week 2 overnight runs",
    created_at: "2026-10-15T03:00:00Z",
  },
  {
    id: "l5",
    company_id: "c1",
    entry_type: "usage",
    amount: -420,
    run_id: "r4",
    note: "Add streak counter",
    created_at: ago(5),
  },
  {
    id: "l6",
    company_id: "c1",
    entry_type: "hold",
    amount: -120,
    run_id: "r5",
    note: "Hold for OG images",
    created_at: ago(4.5),
  },
  {
    id: "l7",
    company_id: "c1",
    entry_type: "refund",
    amount: 120,
    run_id: "r5",
    note: "Auto-refund: run failed",
    created_at: ago(4.4),
  },
  {
    id: "l8",
    company_id: "c1",
    entry_type: "usage",
    amount: -25,
    run_id: "r6",
    note: "Inbox summary",
    created_at: ago(3),
  },
  {
    id: "l9",
    company_id: "c1",
    entry_type: "usage",
    amount: -60,
    run_id: "r7",
    note: "ICO research",
    created_at: ago(2.5),
  },
  {
    id: "l10",
    company_id: "c1",
    entry_type: "hold",
    amount: -80,
    run_id: "r8",
    note: "Hold for investor update",
    created_at: ago(0.3),
  },
  {
    id: "l11",
    company_id: "c2",
    entry_type: "grant",
    amount: 1500,
    run_id: null,
    note: "Starter plan — October grant",
    created_at: "2026-10-01T00:00:00Z",
  },
  {
    id: "l12",
    company_id: "c2",
    entry_type: "usage",
    amount: -1260,
    run_id: null,
    note: "Research and landing page",
    created_at: "2026-10-12T03:00:00Z",
  },
  {
    id: "l13",
    company_id: "c3",
    entry_type: "grant",
    amount: 12000,
    run_id: null,
    note: "Growth plan — October grant",
    created_at: "2026-10-01T00:00:00Z",
  },
  {
    id: "l14",
    company_id: "c3",
    entry_type: "usage",
    amount: -7400,
    run_id: null,
    note: "Month to date",
    created_at: "2026-10-18T03:00:00Z",
  },
  {
    id: "l15",
    company_id: "c4",
    entry_type: "grant",
    amount: 1500,
    run_id: null,
    note: "Starter plan — October grant",
    created_at: "2026-10-01T00:00:00Z",
  },
  {
    id: "l16",
    company_id: "c4",
    entry_type: "usage",
    amount: -90,
    run_id: null,
    note: "Idea brief",
    created_at: "2026-10-02T03:00:00Z",
  },
];

export const chat_messages: T.ChatMessage[] = [
  {
    id: "m1",
    company_id: "c1",
    sender: "founder",
    content: "Can you focus on prelims this week? Mocks start next month.",
    created_at: ago(14),
  },
  {
    id: "m2",
    company_id: "c1",
    sender: "sol",
    content:
      "On it. Tonight I'll draft prelim-themed posts, a welcome email for new signups, and a small ad test. Everything will be waiting for your approval.",
    created_at: ago(13.9),
  },
  {
    id: "m3",
    company_id: "c1",
    sender: "sol",
    content:
      "Morning Aisha ☀️ 3 things need you today. The streak counter is live on preview — have a look on mobile.",
    created_at: ago(0.5),
  },
];

export const social_posts: T.SocialPost[] = [
  {
    id: "p1",
    company_id: "c1",
    channel: "TikTok",
    text: "POV: 10 minutes before your Higher Maths prelim…",
    angle: "Revision hack",
    status: "awaiting_approval",
    scheduled_for: ahead(0),
    metrics: { clicks: 0, signups: 0 },
  },
  {
    id: "p2",
    company_id: "c1",
    channel: "Instagram",
    text: "Your weak spots, found in 10 minutes a day.",
    angle: "Product",
    status: "scheduled",
    scheduled_for: ahead(1),
    metrics: { clicks: 0, signups: 0 },
  },
  {
    id: "p3",
    company_id: "c1",
    channel: "TikTok",
    text: "Chemistry Higher: the 5 questions everyone gets wrong",
    angle: "Revision hack",
    status: "scheduled",
    scheduled_for: ahead(2),
    metrics: { clicks: 0, signups: 0 },
  },
  {
    id: "p4",
    company_id: "c1",
    channel: "LinkedIn",
    text: "Why we're building StudyBuddy for Scottish students first",
    angle: "Founder story",
    status: "draft",
    scheduled_for: ahead(4),
    metrics: { clicks: 0, signups: 0 },
  },
  {
    id: "p5",
    company_id: "c1",
    channel: "TikTok",
    text: "How I'd revise English Higher in 2 weeks",
    angle: "Revision hack",
    status: "published",
    scheduled_for: ahead(-2),
    metrics: { clicks: 412, signups: 21 },
  },
  {
    id: "p6",
    company_id: "c1",
    channel: "Instagram",
    text: "Streaks are coming 🔥",
    angle: "Product",
    status: "published",
    scheduled_for: ahead(-4),
    metrics: { clicks: 138, signups: 6 },
  },
  {
    id: "p7",
    company_id: "c1",
    channel: "X",
    text: "Prelims in 3 weeks. Here's a plan.",
    angle: "Revision hack",
    status: "published",
    scheduled_for: ahead(-6),
    metrics: { clicks: 54, signups: 2 },
  },
];

export const compliance_items: T.ComplianceItem[] = [
  {
    id: "k1",
    company_id: "c1",
    title: "Incorporate at Companies House",
    category: "Incorporation",
    due_date: "2026-09-02",
    status: "done",
  },
  {
    id: "k2",
    company_id: "c1",
    title: "Register for Corporation Tax",
    category: "Incorporation",
    due_date: "2026-10-02",
    status: "done",
    statutory: true,
  },
  {
    id: "k3",
    company_id: "c1",
    title: "Privacy policy (incl. under-16s)",
    category: "Data protection",
    due_date: "2026-10-20",
    status: "done",
  },
  {
    id: "k4",
    company_id: "c1",
    title: "Cookie notice",
    category: "Data protection",
    due_date: "2026-10-28",
    status: "in_progress",
  },
  {
    id: "k5",
    company_id: "c1",
    title: "Pay ICO data protection fee",
    category: "Data protection",
    due_date: "2026-11-14",
    status: "upcoming",
    statutory: true,
  },
  {
    id: "k6",
    company_id: "c1",
    title: "Confirmation statement",
    category: "Companies House",
    due_date: "2027-09-15",
    status: "upcoming",
    statutory: true,
  },
  {
    id: "k7",
    company_id: "c1",
    title: "First annual accounts",
    category: "Companies House",
    due_date: "2028-06-02",
    status: "upcoming",
    statutory: true,
  },
];

export const investors: T.Investor[] = [
  {
    id: "i1",
    company_id: "c1",
    name: "Fiona MacLeod",
    firm: "Northgate Angels",
    stage: "meeting",
    notes: "Intro via the programme. Meeting next week.",
  },
  {
    id: "i2",
    company_id: "c1",
    name: "Tom Hughes",
    firm: "Firth Ventures",
    stage: "contacted",
    notes: "Sent the deck last week.",
  },
  {
    id: "i3",
    company_id: "c1",
    name: "Priya Shah",
    firm: "Angel (ex-travel-tech founder)",
    stage: "researching",
    notes: "Backs edtech and consumer apps.",
  },
  {
    id: "i4",
    company_id: "c1",
    name: "Gregor Wallace",
    firm: "Taybridge Growth Fund",
    stage: "diligence",
    notes: "Reviewing traction data.",
  },
  {
    id: "i5",
    company_id: "c1",
    name: "Laura Kent",
    firm: "Larchfield Equity",
    stage: "passed",
    notes: "Too early. Revisit at £5k MRR.",
  },
  {
    id: "i6",
    company_id: "c1",
    name: "Ross Begg",
    firm: "Angel",
    stage: "committed",
    notes: "£10k at SAFE terms.",
  },
  {
    id: "i7",
    company_id: "c1",
    name: "Hannah Ito",
    firm: "Lumen Impact Ventures",
    stage: "researching",
    notes: "Impact focus — education access.",
  },
];

export const grants = [
  {
    name: "Tay Founders Award",
    amount: "Up to £50,000",
    deadline: "2026-11-02",
    status: "Drafting",
  },
  {
    name: "Campus Spark Challenge",
    amount: "£10,000 + support",
    deadline: "2027-01-20",
    status: "Eligible",
  },
  {
    name: "Northern Innovation Fund",
    amount: "£25,000–£250,000",
    deadline: "2026-12-10",
    status: "Researching",
  },
];

export const contacts: T.Contact[] = [
  {
    id: "x1",
    company_id: "c1",
    name: "Ms Khan",
    email: "s.khan@example.com",
    kind: "lead",
    value: "School licence",
    last: ago(20),
  },
  {
    id: "x2",
    company_id: "c1",
    name: "Mark Daly",
    email: "mark.daly@example.com",
    kind: "customer",
    value: "£4.99/mo",
    last: ago(48),
  },
  {
    id: "x3",
    company_id: "c1",
    name: "Taybridge Academy (Maths dept)",
    email: "maths.dept@example.com",
    kind: "lead",
    value: "Pilot",
    last: ago(70),
  },
  {
    id: "x4",
    company_id: "c1",
    name: "Rachel Boyd",
    email: "rachel.boyd@example.com",
    kind: "customer",
    value: "£4.99/mo",
    last: ago(90),
  },
  {
    id: "x5",
    company_id: "c1",
    name: "Mr Patel",
    email: "r.patel@example.com",
    kind: "lead",
    value: "School licence",
    last: ago(110),
  },
];

function series(
  cid: string,
  base: [number, number, number, number],
  growth: number,
): T.MetricsDaily[] {
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(NOW.getTime() - (13 - i) * 86400_000);
    const g = 1 + growth * i;
    const wobble = 1 + ((i * 37) % 11) / 40 - 0.12;
    return {
      company_id: cid,
      date: d.toISOString().slice(0, 10),
      visitors: Math.round(base[0] * g * wobble),
      signups: Math.max(0, Math.round(base[1] * g * wobble)),
      paying_customers: Math.round(base[2] + i * (base[2] ? 0.4 : 0)),
      mrr: +(Math.round(base[2] + i * (base[2] ? 0.4 : 0)) * base[3]).toFixed(2),
    };
  });
}
export const metrics_daily: T.MetricsDaily[] = [
  ...series("c1", [140, 4, 7, 4.99], 0.06),
  ...series("c2", [40, 2, 0, 0], 0.03),
  ...series("c3", [320, 9, 14, 39], 0.04),
  ...series("c4", [8, 0, 0, 0], 0.01),
];

export const gate_comments: T.GateComment[] = [
  {
    id: "g1",
    company_id: "c1",
    author: "Dr Morag Fraser",
    text: "Great interview depth. Push on the parent-pays assumption before Launch.",
    created_at: ago(72),
  },
];
