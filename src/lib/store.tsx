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
        return {
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
          approvals: d.approvals.map((x) =>
            x.id === id ? { ...x, status, decided_by: user.id, decided_at: iso() } : x,
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
      const fresh = workspaceSeed([company], []);
      setDb((d) => ({
        ...d,
        stage_gates: [...d.stage_gates, ...defaultGates(id, startedAt, "idea")],
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
    ],
  );

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}
