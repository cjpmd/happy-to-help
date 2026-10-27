import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { PRODUCT_NAME } from "./brand";
import * as seed from "./seed";
import type * as T from "./types";
import { approvalText } from "./types";
import { sendChatMessage, simulateWork } from "./agentClient";
import { creditBalance, actionQuote, ACTION_COSTS, autoModeCost } from "./credits";
import {
  workspaceSeed,
  defaultPreferences,
  defaultSharing,
  hasProof,
  checkClaims,
  unbuiltFeatures,
  monthlyCost,
  businessDefaults,
  type Routine,
  type LayoutItem,
  type Preferences,
  type Sharing,
} from "./workspace";
import { STAGE_ORDER, defaultGates } from "./mission";
import { isLiveMode } from "@/integrations/supabase/client";
import { LiveStoreProvider } from "./live/LiveStoreProvider";
import { StoreCtx, labelFor, type Ctx, type DB } from "./storeContext";
import { demoDb, isValidLayout } from "./demoDb";
import { useThemeState } from "./useThemeState";
import { analyseVoice } from "./voice";
import { applyVoiceDecision, applyVoiceEdit, currentVoice, isLocked } from "./voicePolicy";
import { captureEstimate } from "./capture";
import { demoSubmitLead } from "./demoLinks";
import { demoImport, demoProcess } from "./demoInbox";
import { demoCampaignDecided, demoCancelCampaign, demoPlanCampaign } from "./demoCampaigns";
import { taggedUrl, type PublicHub } from "./links";
import { demoAcceptAll, demoCreateCapture, demoDecideItem, type DemoCtx } from "./demoCapture";

export {
  useStore,
  useCompany,
  useMaybeCompany,
  useMyCompanies,
  useCompanyRole,
  useBalance,
  useSolStatus,
  useClaimsCheck,
  useEstimate,
  labelFor,
  personName,
  type Ctx,
  type DB,
} from "./storeContext";

/** Supabase when it's configured, otherwise the in-memory demo. */
export function StoreProvider({ children }: { children: ReactNode }) {
  return isLiveMode ? (
    <LiveStoreProvider>{children}</LiveStoreProvider>
  ) : (
    <DemoStoreProvider>{children}</DemoStoreProvider>
  );
}

const iso = () => new Date().toISOString();
const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const LAYOUTS_KEY = "gumption-hq-layouts";
const OLD_LAYOUTS_KEY = "dawn-hq-layouts";
/** The demo cohort's join code, as in supabase/seed.sql. */
const DEMO_COHORT_CODE = "TAYBRIDGE-2026";

/**
 * The demo: an in-memory store seeded from src/lib/seed.ts that resets on refresh. Its rules
 * mirror the database RPCs (supabase/migrations/*_app_rpcs.sql) closely enough to demo the
 * flows; the database is what enforces them for real.
 */
function DemoStoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>(demoDb);
  const [userId, setUserId] = useState("u1");
  const [companyId, setCompanyId] = useState("c1");
  const [solTyping, setSolTyping] = useState(false);
  const themeState = useThemeState();
  const user = seed.profiles.find((p) => p.id === userId) ?? seed.profiles[0];
  if (!user) throw new Error("Demo profiles missing");
  const [layoutLoaded, setLayoutLoaded] = useState(false);
  useEffect(() => {
    try {
      // Layouts saved before the rename used the old key: read it once, then drop it.
      const saved = JSON.parse(
        localStorage.getItem(LAYOUTS_KEY) ?? localStorage.getItem(OLD_LAYOUTS_KEY) ?? "{}",
      );
      localStorage.removeItem(OLD_LAYOUTS_KEY);
      const valid: Record<string, LayoutItem[]> = {};
      for (const [key, value] of Object.entries(saved)) {
        if (isValidLayout(value)) valid[key] = value;
      }
      setDb((d) => ({ ...d, layouts: valid }));
    } catch {
      /* Keep safe defaults for invalid saved layouts. */
    }
    setLayoutLoaded(true);
  }, []);
  useEffect(() => {
    if (layoutLoaded) localStorage.setItem(LAYOUTS_KEY, JSON.stringify(db.layouts));
  }, [db.layouts, layoutLoaded]);

  const decideApproval = useCallback(
    async (id: string, status: "approved" | "declined") => {
      const a = db.approvals.find((x) => x.id === id);
      if (!a || a.status !== "pending") {
        toast.error("This was already decided");
        return false;
      }
      if (status === "approved") {
        const c = db.companies.find((c) => c.id === a.company_id);
        const flags = checkClaims(
          approvalText(a),
          c?.sector,
          unbuiltFeatures(db.documents, a.company_id),
        );
        if (flags[0]) {
          toast.error(`The claims check flagged "${flags[0].phrase}". Edit the draft first.`);
          return false;
        }
        const balance = creditBalance(db.credit_ledger, a.company_id);
        if (!actionQuote(balance, a.estimated_credits).affordable) {
          toast.error(
            `Not enough credits: this needs ${a.estimated_credits} and the balance is ${balance}.`,
          );
          return false;
        }
        const ad = db.ads.find((x) => x.company_id === a.company_id);
        if (
          a.action_type === "ad_spend" &&
          a.payload.daily_budget !== undefined &&
          (!ad || a.payload.daily_budget > (a.payload.hard_cap ?? ad.hard_cap))
        ) {
          toast.error("The daily budget is over the hard cap");
          return false;
        }
      }
      setDb((d) => {
        const adChange =
          a.action_type === "ad_spend" && a.payload.daily_budget !== undefined ? a.payload : null;
        const outreach = a.action_type === "send_email" && a.payload.outreach ? a.payload : null;
        const approved = status === "approved";
        const next: DB = {
          ...d,
          credit_ledger: approved
            ? [
                ...d.credit_ledger,
                {
                  id: uid("l"),
                  company_id: a.company_id,
                  entry_type: "usage",
                  amount: -a.estimated_credits,
                  run_id: a.run_id,
                  note: labelFor(a),
                  created_at: iso(),
                },
              ]
            : d.credit_ledger,
          ads:
            approved && adChange?.daily_budget !== undefined
              ? d.ads.map((x) =>
                  x.company_id === a.company_id
                    ? {
                        ...x,
                        daily_budget: adChange.daily_budget ?? x.daily_budget,
                        hard_cap: adChange.hard_cap ?? x.hard_cap,
                      }
                    : x,
                )
              : d.ads,
          emails:
            approved && outreach
              ? [
                  ...d.emails,
                  {
                    id: uid("email"),
                    company_id: a.company_id,
                    subject: outreach.subject,
                    name: outreach.to,
                    address: outreach.to,
                    mode: "outreach",
                    messages: [{ direction: "sent", text: outreach.body, date: iso() }],
                  },
                ]
              : d.emails,
          voice_profiles:
            a.action_type === "update_voice"
              ? applyVoiceDecision(d.voice_profiles, a.payload.profile_id, approved)
              : d.voice_profiles,
          approvals: d.approvals.map((x) =>
            x.id === id
              ? {
                  ...x,
                  status,
                  decided_by: user.id,
                  decided_at: iso(),
                  // The demo carries approved actions out at once.
                  execution_status: status === "approved" ? "done" : "not_started",
                  executed_at: status === "approved" ? iso() : null,
                }
              : x,
          ),
          agent_runs: d.agent_runs.map((r) =>
            r.id === a.run_id && r.status === "needs_approval"
              ? { ...r, status: "succeeded", finished_at: r.finished_at ?? iso() }
              : r,
          ),
          activity_events: [
            {
              id: uid("ev"),
              company_id: a.company_id,
              type: "approval",
              summary: `${user.full_name} ${approved ? "gave GO:" : "said NO-GO:"} ${labelFor(a)}`,
              created_at: iso(),
            },
            ...d.activity_events,
          ],
        };
        return demoCampaignDecided(next, a, approved, { now: new Date(), uid });
      });
      return true;
    },
    [db, user],
  );

  const editApproval = useCallback(
    async (id: string, changes: Record<string, string>) => {
      const a = db.approvals.find((x) => x.id === id);
      const allowed =
        a?.action_type === "publish_post"
          ? ["text"]
          : a?.action_type === "send_email"
            ? ["subject", "body"]
            : [];
      if (!a || a.status !== "pending") {
        toast.error("Only pending drafts can be edited");
        return false;
      }
      if (!Object.entries(changes).every(([k, v]) => allowed.includes(k) && v.trim())) {
        toast.error("You can only change the wording of this draft");
        return false;
      }
      setDb((d) => ({
        ...d,
        approvals: d.approvals.map((x) =>
          x.id === id ? ({ ...x, payload: { ...x.payload, ...changes } } as T.Approval) : x,
        ),
      }));
      return true;
    },
    [db.approvals],
  );

  const askWhy = useCallback(async (id: string) => {
    setDb((d) => {
      const a = d.approvals.find((x) => x.id === id);
      if (!a) return d;
      return {
        ...d,
        chat_messages: [
          ...d.chat_messages,
          {
            id: uid("m"),
            company_id: a.company_id,
            sender: "founder",
            content: "Why should I approve this?",
            created_at: iso(),
          },
          {
            id: uid("m"),
            company_id: a.company_id,
            sender: "sol",
            content: a.payload.reason ?? "This moves your current stage goal forward.",
            created_at: iso(),
          },
        ],
      };
    });
  }, []);

  const sendChat = useCallback(
    async (cid: string, text: string) => {
      if (
        !actionQuote(creditBalance(db.credit_ledger, cid), ACTION_COSTS.chat).affordable ||
        solTyping
      )
        return;
      setDb((d) => ({
        ...d,
        credit_ledger: [
          ...d.credit_ledger,
          {
            id: uid("l"),
            company_id: cid,
            entry_type: "usage",
            amount: -ACTION_COSTS.chat,
            run_id: null,
            note: "Chat with Sol",
            created_at: iso(),
          },
        ],
        chat_messages: [
          ...d.chat_messages,
          { id: uid("m"), company_id: cid, sender: "founder", content: text, created_at: iso() },
        ],
      }));
      setSolTyping(true);
      const { reply } = await sendChatMessage(cid, text);
      setSolTyping(false);
      setDb((d) => ({
        ...d,
        chat_messages: [
          ...d.chat_messages,
          { id: uid("m"), company_id: cid, sender: "sol", content: reply, created_at: iso() },
        ],
      }));
    },
    [db.credit_ledger, solTyping],
  );

  // Approving a gate moves the company to the next stage and opens the next gate (bug B5).
  const approveGate = useCallback(
    async (gateId: string) => {
      const g = db.stage_gates.find((x) => x.id === gateId);
      if (!g || (g.status !== "in_progress" && g.status !== "ready")) {
        toast.error("This gate isn't open for approval");
        return false;
      }
      const next = STAGE_ORDER[STAGE_ORDER.indexOf(g.stage) + 1];
      if (!next) return false;
      setDb((d) => ({
        ...d,
        stage_gates: d.stage_gates.map((x) =>
          x.id === gateId
            ? { ...x, status: "approved", approved_by: userId, approved_at: iso() }
            : x.company_id === g.company_id && x.stage === next && x.status === "locked"
              ? { ...x, status: "in_progress" }
              : x,
        ),
        companies: d.companies.map((c) => (c.id === g.company_id ? { ...c, stage: next } : c)),
        activity_events: [
          {
            id: uid("ev"),
            company_id: g.company_id,
            type: "gate",
            summary: `Gate approved: ${next.charAt(0).toUpperCase() + next.slice(1)} phase begins`,
            created_at: iso(),
          },
          ...d.activity_events,
        ],
      }));
      return true;
    },
    [db.stage_gates, userId],
  );

  const addComment = useCallback(
    async (cid: string, text: string) => {
      setDb((d) => ({
        ...d,
        gate_comments: [
          ...d.gate_comments,
          { id: uid("g"), company_id: cid, author: user.full_name, text, created_at: iso() },
        ],
      }));
      return true;
    },
    [user.full_name],
  );

  const moveInvestor = useCallback(async (id: string, stage: T.InvestorStage) => {
    setDb((d) => ({
      ...d,
      investors: d.investors.map((i) => (i.id === id ? { ...i, stage } : i)),
    }));
    return true;
  }, []);

  const createCompany: Ctx["createCompany"] = useCallback(
    async ({ cohort_code, ...c }) => {
      const cohort = cohort_code?.trim()
        ? seed.cohorts.find(() => cohort_code.trim().toUpperCase() === DEMO_COHORT_CODE)
        : undefined;
      if (cohort_code?.trim() && !cohort) {
        toast.error("That cohort code isn't recognised. Check it with your programme lead.");
        return null;
      }
      const id = uid("c");
      const base = c.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const slug = db.companies.some((x) => x.slug === base) ? `${base}-${id.slice(-4)}` : base;
      const startedAt = iso();
      const company: T.Company = {
        ...c,
        channels: businessDefaults(c.customer_type),
        started_at: startedAt,
        id,
        slug,
        stage: "idea",
        plan: "starter",
        created_by: userId,
        website_live_url: `/site/${slug}`,
        website_preview_url: `/site/${slug}?preview=1`,
      };
      const keepGoing = c.entry_path === "keep_going";
      if (keepGoing) company.stage = "grow";
      const fresh = workspaceSeed([company], []);
      setDb((d) => ({
        ...d,
        stage_gates: [
          ...d.stage_gates,
          ...defaultGates(id, startedAt, "idea").map((g) =>
            keepGoing ? { ...g, status: "imported" as const, criteria: [] } : g,
          ),
        ],
        routines: [...d.routines, ...fresh.routines],
        documents: [...d.documents, ...fresh.documents],
        ads: [...d.ads, ...fresh.ads],
        companies: [...d.companies, company],
        company_members: [
          ...d.company_members,
          { company_id: id, user_id: userId, role: "founder" },
        ],
        cohort_companies: cohort
          ? [...d.cohort_companies, { cohort_id: cohort.id, company_id: id, credit_cap: 5000 }]
          : d.cohort_companies,
        // The demo starts new companies with Starter credits so the flows can be tried.
        // Live companies get credits from billing or their cohort.
        credit_ledger: [
          ...d.credit_ledger,
          {
            id: uid("l"),
            company_id: id,
            entry_type: "grant",
            amount: 1500,
            run_id: null,
            note: "Starter plan — welcome grant (demo)",
            created_at: iso(),
          },
        ],
        chat_messages: [
          ...d.chat_messages,
          {
            id: uid("m"),
            company_id: id,
            sender: "sol",
            content: `Welcome to ${PRODUCT_NAME}. I've read your idea for ${c.name}. Tonight I'll draft your first assumptions to test and a simple landing page.`,
            created_at: iso(),
          },
        ],
      }));
      setCompanyId(id);
      return id;
    },
    [db.companies, userId],
  );

  const work: Ctx["work"] = useCallback(
    async (cid, title, cost, kind = "task", target) => {
      if (solTyping || !actionQuote(creditBalance(db.credit_ledger, cid), cost).affordable)
        return false;
      if (kind === "auto") autoModeCost(cost / ACTION_COSTS.autoHour);
      const runId = uid("r");
      const assetId = target ?? uid("asset");
      setSolTyping(true);
      setDb((d) => ({
        ...d,
        credit_ledger: [
          ...d.credit_ledger,
          {
            id: uid("l"),
            company_id: cid,
            entry_type: "usage",
            amount: -cost,
            run_id: runId,
            note: title,
            created_at: iso(),
          },
        ],
        agent_runs: [
          {
            id: runId,
            company_id: cid,
            task_id: kind === "task" ? (target ?? null) : null,
            task: title,
            pillar: kind === "image" || kind === "video" ? "build" : "run",
            model: "Sol (demo)",
            status: "running",
            started_at: iso(),
            finished_at: null,
            cost_usd: 0,
            credits_charged: cost,
            usage: { input_tokens: 0, output_tokens: 0 },
            steps: [{ tool: "plan", summary: title, credits: cost }],
          },
          ...d.agent_runs,
        ],
        tasks: d.tasks.map((t) =>
          t.id === target && kind === "task" ? { ...t, status: "doing" } : t,
        ),
        media:
          kind === "image" || kind === "video"
            ? [
                ...d.media.filter((m) => m.id !== assetId),
                { id: assetId, company_id: cid, kind, title, status: "generating" },
              ]
            : d.media,
        activity_events: [
          { id: uid("ev"), company_id: cid, type: "work", summary: title + "…", created_at: iso() },
          ...d.activity_events,
        ],
      }));
      const result = await simulateWork(kind, title);
      setDb((d) => ({
        ...d,
        agent_runs: d.agent_runs.map((r) =>
          r.id === runId
            ? {
                ...r,
                status: result.success ? "succeeded" : "failed",
                finished_at: iso(),
                credits_charged: result.success ? cost : 0,
              }
            : r,
        ),
        credit_ledger: result.success
          ? d.credit_ledger
          : [
              ...d.credit_ledger,
              {
                id: uid("l"),
                company_id: cid,
                entry_type: "refund",
                amount: cost,
                run_id: runId,
                note: "Failed run auto-refund",
                created_at: iso(),
              },
            ],
        media: d.media.map((m) =>
          m.id === assetId
            ? {
                ...m,
                status: result.success ? "ready" : "failed",
                url: result.url,
                reason: result.reason,
              }
            : m,
        ),
        documents:
          kind === "document"
            ? d.documents.map((doc) =>
                doc.id === target
                  ? {
                      ...doc,
                      versions: [
                        ...doc.versions,
                        {
                          version: doc.versions.length + 1,
                          content:
                            (doc.versions.at(-1)?.content ?? "") +
                            "\n\nReview update: prioritise the next customer-tested outcome; no unsupported promises added.",
                          date: iso(),
                        },
                      ],
                    }
                  : doc,
              )
            : d.documents,
        approvals:
          kind === "social"
            ? [
                {
                  id: uid("a"),
                  company_id: cid,
                  run_id: runId,
                  action_type: "publish_post",
                  status: "pending",
                  estimated_credits: 40,
                  created_at: iso(),
                  payload: {
                    channel:
                      d.companies.find((c) => c.id === cid)?.customer_type === "B2B"
                        ? "LinkedIn"
                        : "Instagram",
                    text: "A small step forward: our next beta milestone is ready for feedback.",
                    reason:
                      "Customer feedback is more useful than unsupported launch promises. The next beta milestone gives us a specific topic to test.",
                    media_id: target,
                  },
                },
                ...d.approvals,
              ]
            : d.approvals,
        emails:
          kind === "email"
            ? d.emails.map((e) =>
                e.id === target
                  ? {
                      ...e,
                      messages: [
                        ...e.messages,
                        {
                          direction: "sent",
                          text: "Draft only — not sent. Thanks for your question. We will confirm beta access and privacy details before inviting your class.",
                          date: iso(),
                        },
                      ],
                    }
                  : e,
              )
            : d.emails,
        activity_events: [
          {
            id: uid("ev"),
            company_id: cid,
            type: result.success ? "work_done" : "refund",
            summary: result.success
              ? title + " — completed in demo"
              : title + " — failed, credits refunded",
            created_at: iso(),
          },
          ...d.activity_events,
        ],
      }));
      setSolTyping(false);
      return result.success;
    },
    [db.credit_ledger, solTyping],
  );
  const saveLayout = useCallback(
    (layout: LayoutItem[]) => setDb((d) => ({ ...d, layouts: { ...d.layouts, [userId]: layout } })),
    [userId],
  );
  const updatePreferences = useCallback(
    (patch: Partial<Preferences>) =>
      setDb((d) => ({
        ...d,
        preferences: {
          ...d.preferences,
          [userId]: { ...defaultPreferences(), ...d.preferences[userId], ...patch },
        },
      })),
    [userId],
  );
  const updateSharing = useCallback(
    (patch: Partial<Sharing>) =>
      setDb((d) => ({
        ...d,
        sharing: {
          ...d.sharing,
          [companyId]: { ...defaultSharing(), ...d.sharing[companyId], ...patch },
        },
      })),
    [companyId],
  );
  const addRoutine = useCallback(
    async (title: string, cadence: Routine["cadence"], credits: number) => {
      setDb((d) => ({
        ...d,
        routines: [
          ...d.routines,
          { id: uid("routine"), company_id: companyId, title, cadence, credits, enabled: false },
        ],
      }));
      return true;
    },
    [companyId],
  );
  const toggleRoutine = useCallback(
    async (id: string) => {
      const r = db.routines.find((r) => r.id === id);
      if (
        !r ||
        (!r.enabled &&
          !actionQuote(
            creditBalance(db.credit_ledger, r.company_id),
            monthlyCost(r.cadence, r.credits),
          ).affordable)
      )
        return false;
      setDb((d) => ({
        ...d,
        routines: d.routines.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)),
      }));
      return true;
    },
    [db.routines, db.credit_ledger],
  );
  const proposeBudget = useCallback(
    async (budget: number, cap: number) => {
      if (
        !Number.isFinite(budget) ||
        !Number.isFinite(cap) ||
        budget < 0 ||
        cap < 0 ||
        budget > cap
      )
        return false;
      setDb((d) => ({
        ...d,
        approvals: [
          {
            id: uid("a"),
            company_id: companyId,
            run_id: null,
            action_type: "ad_spend",
            estimated_credits: 90,
            status: "pending",
            created_at: iso(),
            requested_by: userId,
            payload: {
              platform: "Meta Ads",
              amount_gbp: budget,
              daily_budget: budget,
              hard_cap: cap,
              duration: "per day",
              audience: "Current audience",
              creative: "Current creative",
              reason: "A capped test limits downside while measuring acquisition.",
            },
          },
          ...d.approvals,
        ],
      }));
      return true;
    },
    [companyId, userId],
  );
  const draftOutreach = useCallback(
    async (body: string, recipients: string) => {
      if (!body.trim() || !recipients.trim()) return false;
      setDb((d) => ({
        ...d,
        approvals: [
          {
            id: uid("a"),
            company_id: companyId,
            run_id: null,
            action_type: "send_email",
            status: "pending",
            estimated_credits: 30,
            created_at: iso(),
            requested_by: userId,
            payload: {
              outreach: true,
              to: recipients,
              subject: "Pilot invitation",
              body,
              reason:
                "A small reviewed batch tests relevance without bulk sending. Consent or an applicable PECR exemption must be recorded for every recipient.",
            },
          },
          ...d.approvals,
        ],
      }));
      return true;
    },
    [companyId, userId],
  );
  const invite = useCallback(
    async (email: string, role: T.CompanyMember["role"]) => {
      setDb((d) => ({
        ...d,
        team: [
          ...d.team,
          { id: uid("invite"), company_id: companyId, email, role, status: "invited" },
        ],
      }));
      return true;
    },
    [companyId],
  );
  const markDone = useCallback(
    async (id: string) => {
      const task = db.tasks.find((t) => t.id === id);
      if (!task || ((task.actor ?? "sol") === "sol" && !hasProof(task.proof))) {
        toast.error("Sol's work needs proof before it's done.");
        return false;
      }
      setDb((d) => ({
        ...d,
        tasks: d.tasks.map((t) =>
          t.id === id ? { ...t, status: "done", completed_at: iso() } : t,
        ),
      }));
      return true;
    },
    [db.tasks],
  );
  const importContacts = useCallback<Ctx["importContacts"]>(
    async (cid, rows, softOptIn = false) => {
      const r = demoImport(db, cid, rows, softOptIn, { now: new Date(), uid });
      setDb(r.db);
      return r.result;
    },
    [db],
  );
  const processInboxItem = useCallback<Ctx["processInboxItem"]>(async (id) => {
    setDb((d) => demoProcess(d, id, { now: new Date(), uid }));
    return true;
  }, []);
  const closeInboxItem = useCallback<Ctx["closeInboxItem"]>(async (id, status = "closed") => {
    setDb((d) => ({
      ...d,
      inbox_items: d.inbox_items.map((i) => (i.id === id ? { ...i, status } : i)),
    }));
    return true;
  }, []);
  const planCampaign = useCallback<Ctx["planCampaign"]>(async (cid, goal) => {
    if (!goal.trim()) return false;
    setDb((d) => demoPlanCampaign(d, cid, goal, { now: new Date(), uid }));
    toast.success("Sol has proposed a plan. It's waiting for your GO.");
    return true;
  }, []);
  const cancelCampaign = useCallback<Ctx["cancelCampaign"]>(
    async (id) => {
      setDb((d) => demoCancelCampaign(d, id, user.id, { now: new Date(), uid }));
      return true;
    },
    [user],
  );
  const addVoiceSource = useCallback<Ctx["addVoiceSource"]>(async () => true, []);
  const isFounder = useCallback(
    (cid: string) => {
      const ok = db.company_members.some(
        (m) => m.company_id === cid && m.user_id === userId && m.role === "founder",
      );
      if (!ok) toast.error("Only a founder can change this");
      return ok;
    },
    [db.company_members, userId],
  );
  // The demo learns from the company's own sent emails, like the mock agent run does.
  const learnVoice = useCallback<Ctx["learnVoice"]>(
    async (cid) => {
      const sent = db.emails
        .filter((t) => t.company_id === cid)
        .flatMap((t) => t.messages.filter((m) => m.direction === "sent").map((m) => m.text));
      const read = analyseVoice(sent);
      if (!read) {
        toast.error("Sol needs a few past emails or your website copy to learn from first.");
        return false;
      }
      if (currentVoice(db.voice_profiles, cid).proposed) {
        toast.error("A proposed voice is already waiting for your GO.");
        return false;
      }
      const profileId = uid("voice");
      const version =
        Math.max(
          0,
          ...db.voice_profiles.filter((p) => p.company_id === cid).map((p) => p.version),
        ) + 1;
      const summary = read.summary.split("\n")[0] ?? "";
      const changes = `Learned from ${sent.length} pieces of your own writing.`;
      const base = currentVoice(db.voice_profiles, cid).approved;
      setDb((d) => ({
        ...d,
        voice_profiles: [
          ...d.voice_profiles,
          {
            ...(base ?? d.voice_profiles[0]!),
            id: profileId,
            company_id: cid,
            version,
            status: "proposed",
            source: "analysis",
            summary,
            traits: [...read.traits, "Honest", "Helpful"].slice(0, 5),
            use_phrases: read.phrases,
            reading_level: read.readingLevel,
            spelling: read.spelling === "US" ? "US" : "UK",
            sign_off: read.signOff,
            emoji: read.usesEmoji ? "sparing" : "none",
            changes,
            created_at: iso(),
          },
        ],
        approvals: [
          {
            id: uid("a"),
            company_id: cid,
            run_id: null,
            action_type: "update_voice",
            payload: {
              profile_id: profileId,
              version,
              summary,
              changes,
              reason: "Learned from your website and past emails, so replies sound like you.",
            },
            estimated_credits: 0,
            status: "pending",
            created_at: iso(),
          },
          ...d.approvals,
        ],
      }));
      toast.success("Sol has proposed a voice from your writing. It's waiting for your GO.");
      return true;
    },
    [db.emails, db.voice_profiles],
  );
  const saveVoiceProfile = useCallback<Ctx["saveVoiceProfile"]>(
    async (cid, edit) => {
      if (!isFounder(cid)) return false;
      setDb((d) => ({
        ...d,
        voice_profiles: applyVoiceEdit(d.voice_profiles, cid, edit, uid("voice"), iso()),
      }));
      return true;
    },
    [isFounder],
  );
  const addVoiceExample = useCallback<Ctx["addVoiceExample"]>(async (cid, situation, body) => {
    if (!body.trim()) return false;
    setDb((d) => ({
      ...d,
      voice_examples: [
        ...d.voice_examples,
        {
          id: uid("vx"),
          company_id: cid,
          situation,
          channel: "email",
          body: body.trim(),
          created_at: iso(),
        },
      ],
    }));
    return true;
  }, []);
  const removeVoiceExample = useCallback<Ctx["removeVoiceExample"]>(async (id) => {
    setDb((d) => ({ ...d, voice_examples: d.voice_examples.filter((x) => x.id !== id) }));
    return true;
  }, []);
  const setResponsePolicy = useCallback<Ctx["setResponsePolicy"]>(
    async (cid, category, mode) => {
      if (!isFounder(cid)) return false;
      if (isLocked(category) && mode !== "escalate") {
        toast.error("Refunds and legal threats always come to you");
        return false;
      }
      setDb((d) => ({
        ...d,
        response_policies: d.response_policies.map((p) =>
          p.company_id === cid && p.category === category ? { ...p, mode } : p,
        ),
      }));
      return true;
    },
    [isFounder],
  );
  const updateResponseSettings = useCallback<Ctx["updateResponseSettings"]>(
    async (cid, patch) => {
      if (!isFounder(cid)) return false;
      if (patch.disclosure_text !== undefined && patch.disclosure_text.trim().length < 3) {
        toast.error("The disclosure can be reworded but not removed");
        return false;
      }
      setDb((d) => ({
        ...d,
        response_settings: d.response_settings.map((s) =>
          s.company_id === cid
            ? {
                ...s,
                ...(patch.disclosure_text !== undefined
                  ? { disclosure_text: patch.disclosure_text.trim() }
                  : {}),
                ...(patch.disclosure_on_approved !== undefined
                  ? { disclosure_on_approved: patch.disclosure_on_approved }
                  : {}),
                ...(patch.mark_reviewed ? { policy_reviewed_at: iso() } : {}),
                ...(patch.inbox_daily_cap !== undefined
                  ? { inbox_daily_cap: patch.inbox_daily_cap }
                  : {}),
              }
            : s,
        ),
      }));
      return true;
    },
    [isFounder],
  );
  // Capture from conversation: the demo reads typed or pasted text straight away.
  const demoCtx = useCallback((): DemoCtx => ({ userId, now: new Date(), uid }), [userId]);
  const createCapture = useCallback<Ctx["createCapture"]>(
    async (c) => {
      if (c.audio || !c.text?.trim()) {
        toast.error("The demo can't transcribe audio. Type or paste the text instead.");
        return null;
      }
      const { db: next, id } = demoCreateCapture(db, c, demoCtx());
      setDb(next);
      return id;
    },
    [db, demoCtx],
  );
  const decideItem = useCallback<Ctx["decideItem"]>(
    async (id, decision, changes = {}, fileSensitive = false) => {
      const r = demoDecideItem(db, id, decision, changes, fileSensitive, demoCtx());
      if ("error" in r) {
        toast.error(r.error);
        return false;
      }
      setDb(r.db);
      return true;
    },
    [db, demoCtx],
  );
  const acceptAllItems = useCallback<Ctx["acceptAllItems"]>(
    async (captureId) => {
      const r = demoAcceptAll(db, captureId, demoCtx());
      setDb(r.db);
      return r.n;
    },
    [db, demoCtx],
  );
  const shareItem = useCallback<Ctx["shareItem"]>(async (id, shared) => {
    setDb((d) => ({
      ...d,
      extracted_items: d.extracted_items.map((x) => (x.id === id ? { ...x, shared } : x)),
    }));
    return true;
  }, []);
  const updateCaptureSettings = useCallback<Ctx["updateCaptureSettings"]>(
    async (cid, patch) => {
      if (!isFounder(cid)) return false;
      setDb((d) => {
        const cur = d.capture_settings.find((s) => s.company_id === cid) ?? {
          company_id: cid,
          keep_audio_days: 0,
          auto_accept_own_notes: false,
        };
        return {
          ...d,
          capture_settings: [
            ...d.capture_settings.filter((s) => s.company_id !== cid),
            { ...cur, ...patch },
          ],
        };
      });
      return true;
    },
    [isFounder],
  );
  const setIdeaStatus = useCallback<Ctx["setIdeaStatus"]>(async (id, status) => {
    setDb((d) => ({ ...d, ideas: d.ideas.map((i) => (i.id === id ? { ...i, status } : i)) }));
    return true;
  }, []);
  const completeCommitment = useCallback<Ctx["completeCommitment"]>(async (id, status = "done") => {
    setDb((d) => ({
      ...d,
      commitments: d.commitments.map((c) => (c.id === id ? { ...c, status } : c)),
    }));
    return true;
  }, []);
  const loadTranscript = useCallback<Ctx["loadTranscript"]>(async () => null, []);
  const loadPlatformHealth = useCallback<Ctx["loadPlatformHealth"]>(async () => null, []);
  // Link layer: the demo keeps links, hubs and leads in memory.
  const createLink = useCallback<Ctx["createLink"]>(async (cid, l) => {
    const code = Math.random()
      .toString(36)
      .slice(2, 10)
      .replace(/[^a-z0-9]/g, "x");
    const link = {
      id: uid("lk"),
      company_id: cid,
      code,
      destination: l.destination.trim(),
      label: l.label.trim(),
      channel: l.channel.trim().toLowerCase(),
      medium: (l.medium ?? "social").toLowerCase(),
      campaign: l.campaign?.trim() ?? "",
      content: l.content ?? null,
      spend_gbp: l.spend_gbp ?? null,
      created_by_sol: false,
      archived: false,
      created_at: iso(),
    };
    setDb((d) => ({
      ...d,
      tracked_links: [link, ...d.tracked_links],
      link_stats: [...d.link_stats, { link_id: link.id, clicks: 0, clicks_7d: 0, leads: 0 }],
    }));
    return link;
  }, []);
  const updateLink = useCallback<Ctx["updateLink"]>(async (id, patch) => {
    setDb((d) => ({
      ...d,
      tracked_links: d.tracked_links.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));
    return true;
  }, []);
  const saveHubPage = useCallback<Ctx["saveHubPage"]>(
    async (cid, patch) => {
      if (!isFounder(cid)) return false;
      setDb((d) => ({
        ...d,
        hub_pages: d.hub_pages.map((h) => (h.company_id === cid ? { ...h, ...patch } : h)),
      }));
      return true;
    },
    [isFounder],
  );
  const saveForm = useCallback<Ctx["saveForm"]>(
    async (id, patch) => {
      const f = db.forms.find((x) => x.id === id);
      if (!f || !isFounder(f.company_id)) return false;
      setDb((d) => ({ ...d, forms: d.forms.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
      return true;
    },
    [db.forms, isFounder],
  );
  const setLeadStatus = useCallback<Ctx["setLeadStatus"]>(async (id, status) => {
    setDb((d) => {
      const lead = d.leads.find((l) => l.id === id);
      return {
        ...d,
        leads: d.leads.map((l) => (l.id === id ? { ...l, status } : l)),
        contacts:
          status === "won" && lead
            ? d.contacts.map((c) => (c.id === lead.contact_id ? { ...c, kind: "customer" } : c))
            : d.contacts,
      };
    });
    return true;
  }, []);
  const withdrawMarketing = useCallback<Ctx["withdrawMarketing"]>(async (contactId) => {
    setDb((d) => ({
      ...d,
      current_consents: [
        ...d.current_consents.filter(
          (c) => !(c.contact_id === contactId && c.purpose === "marketing"),
        ),
        { contact_id: contactId, purpose: "marketing", status: "withdrawn", lawful_basis: null },
      ],
    }));
    return true;
  }, []);
  const fetchHub = useCallback<Ctx["fetchHub"]>(
    async (slug) => {
      const h = db.hub_pages.find((x) => x.slug === slug && x.enabled);
      const c = h && db.companies.find((x) => x.id === h.company_id);
      if (!h || !c) return null;
      const f = db.forms.find((x) => x.company_id === c.id && x.enabled);
      const hub: PublicHub = {
        slug: h.slug,
        name: c.name,
        headline: h.headline,
        bio: h.bio,
        links: h.links,
        website: c.website_live_url,
        socials: h.show_socials ? (c.social_handles ?? {}) : {},
        form: h.show_form && f ? f : null,
      };
      return hub;
    },
    [db.hub_pages, db.companies, db.forms],
  );
  const fetchForm = useCallback<Ctx["fetchForm"]>(
    async (id) => {
      const f = db.forms.find((x) => x.id === id && x.enabled);
      return f
        ? { ...f, company: db.companies.find((c) => c.id === f.company_id)?.name ?? "" }
        : null;
    },
    [db.forms, db.companies],
  );
  const submitLead = useCallback<Ctx["submitLead"]>(
    async (sub) => {
      const r = demoSubmitLead(db, sub, { now: new Date(), uid });
      if ("error" in r) {
        toast.error(r.error);
        return false;
      }
      setDb(r.db);
      return true;
    },
    [db],
  );
  // The demo previews one Auto Mode cycle, as before; the live store runs real sessions.
  const startAutoMode = useCallback<Ctx["startAutoMode"]>(
    (cid, hours, cap) => work(cid, `Auto Mode: ${hours}-hour plan`, cap, "auto"),
    [work],
  );
  const stopAutoMode = useCallback<Ctx["stopAutoMode"]>(async () => {
    setSolTyping(false);
    return true;
  }, []);
  const updateAutomation = useCallback<Ctx["updateAutomation"]>(async (cid, patch) => {
    setDb((d) => {
      const cur = d.company_automation.find((a) => a.company_id === cid) ?? {
        company_id: cid,
        nightly_enabled: false,
        nightly_cap_credits: 300,
        voice_review_enabled: false,
      };
      return {
        ...d,
        company_automation: [
          ...d.company_automation.filter((a) => a.company_id !== cid),
          { ...cur, ...patch },
        ],
      };
    });
    return true;
  }, []);
  const setIntegration = useCallback<Ctx["setIntegration"]>(
    async (cid, provider, enabled, config) => {
      if (!isFounder(cid)) return false;
      setDb((d) => {
        const cur = d.integration_settings.find(
          (x) => x.company_id === cid && x.provider === provider,
        );
        return {
          ...d,
          integration_settings: [
            ...d.integration_settings.filter((x) => x !== cur),
            { company_id: cid, provider, enabled, config: config ?? cur?.config ?? {} },
          ],
        };
      });
      return true;
    },
    [isFounder],
  );
  const followLink = useCallback<Ctx["followLink"]>(
    async (code) => {
      const l = db.tracked_links.find((x) => x.code === code && !x.archived);
      if (!l) return null;
      setDb((d) => ({
        ...d,
        link_stats: d.link_stats.map((x) =>
          x.link_id === l.id ? { ...x, clicks: x.clicks + 1, clicks_7d: x.clicks_7d + 1 } : x,
        ),
      }));
      return taggedUrl(l);
    },
    [db.tracked_links],
  );
  // The demo uses the default rates: 40 to read it, 3 a minute to transcribe.
  const estimateCapture = useCallback<Ctx["estimateCapture"]>(
    async (seconds) => captureEstimate(seconds ?? null, 3, 40),
    [],
  );
  const stopAuto = useCallback(() => {
    setSolTyping(false);
    setDb((d) => ({
      ...d,
      activity_events: [
        {
          id: uid("ev"),
          company_id: companyId,
          type: "idle",
          summary: "Auto Mode stopped — idle",
          created_at: iso(),
        },
        ...d.activity_events,
      ],
    }));
  }, [companyId]);

  const value = useMemo<Ctx>(
    () => ({
      mode: "demo",
      auth: "signed_in",
      loading: false,
      now: seed.NOW,
      db,
      user,
      setUserId,
      companyId,
      setCompanyId,
      signIn: async () => null,
      signOut: async () => {},
      solTyping,
      chatDraft: null,
      decideApproval,
      editApproval,
      askWhy,
      sendChat,
      approveGate,
      addComment,
      moveInvestor,
      createCompany,
      work,
      saveLayout,
      updatePreferences,
      updateSharing,
      addRoutine,
      toggleRoutine,
      proposeBudget,
      draftOutreach,
      invite,
      markDone,
      stopAuto,
      importContacts,
      processInboxItem,
      closeInboxItem,
      planCampaign,
      cancelCampaign,
      addVoiceSource,
      learnVoice,
      saveVoiceProfile,
      addVoiceExample,
      removeVoiceExample,
      setResponsePolicy,
      updateResponseSettings,
      createCapture,
      decideItem,
      acceptAllItems,
      shareItem,
      updateCaptureSettings,
      setIdeaStatus,
      completeCommitment,
      loadTranscript,
      estimateCapture,
      createLink,
      updateLink,
      saveHubPage,
      saveForm,
      setLeadStatus,
      withdrawMarketing,
      fetchHub,
      fetchForm,
      submitLead,
      followLink,
      setIntegration,
      startAutoMode,
      stopAutoMode,
      updateAutomation,
      loadPlatformHealth,
      shortLinkBase: typeof window === "undefined" ? "/l" : `${window.location.origin}/l`,
      ...themeState,
    }),
    [
      db,
      user,
      companyId,
      solTyping,
      decideApproval,
      editApproval,
      askWhy,
      sendChat,
      approveGate,
      addComment,
      moveInvestor,
      createCompany,
      themeState,
      work,
      saveLayout,
      updatePreferences,
      updateSharing,
      addRoutine,
      toggleRoutine,
      proposeBudget,
      draftOutreach,
      invite,
      markDone,
      stopAuto,
      importContacts,
      processInboxItem,
      closeInboxItem,
      planCampaign,
      cancelCampaign,
      addVoiceSource,
      learnVoice,
      saveVoiceProfile,
      addVoiceExample,
      removeVoiceExample,
      setResponsePolicy,
      updateResponseSettings,
      createCapture,
      decideItem,
      acceptAllItems,
      shareItem,
      updateCaptureSettings,
      setIdeaStatus,
      completeCommitment,
      loadTranscript,
      estimateCapture,
      createLink,
      updateLink,
      saveHubPage,
      saveForm,
      setLeadStatus,
      withdrawMarketing,
      fetchHub,
      fetchForm,
      submitLead,
      followLink,
      setIntegration,
      startAutoMode,
      stopAutoMode,
      updateAutomation,
      loadPlatformHealth,
    ],
  );

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}
