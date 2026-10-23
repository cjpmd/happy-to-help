import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { PRODUCT_NAME } from "./brand";
import * as seed from "./seed";
import type * as T from "./types";
import { approvalText } from "./types";
import { sendChatMessage } from "./agentClient";
import { creditBalance, actionQuote, ACTION_COSTS, autoModeCost } from "./credits";
import {
  workspaceSeed,
  defaultLayout,
  defaultPreferences,
  defaultSharing,
  hasProof,
  checkClaims,
  monthlyCost,
  businessDefaults,
  type WorkspaceDB,
  type Routine,
  type LayoutItem,
  type Preferences,
  type Sharing,
  type Sector,
} from "./workspace";
import { simulateWork } from "./agentClient";
import { solStatus } from "./mission";

/**
 * In-memory data store shaped like the Supabase schema.
 * When the user's Supabase project is connected, replace these reads/writes with
 * queries + Realtime subscriptions; components only use the hooks below.
 */
type DB = WorkspaceDB & {
  companies: T.Company[];
  approvals: T.Approval[];
  agent_runs: T.AgentRun[];
  activity_events: T.ActivityEvent[];
  credit_ledger: T.LedgerEntry[];
  chat_messages: T.ChatMessage[];
  stage_gates: T.StageGate[];
  investors: T.Investor[];
  gate_comments: T.GateComment[];
  company_members: T.CompanyMember[];
  evidence_items: T.EvidenceItem[];
};

interface Ctx {
  db: DB;
  user: T.Profile;
  setUserId: (id: string) => void;
  companyId: string;
  setCompanyId: (id: string) => void;
  solTyping: boolean;
  decideApproval: (id: string, status: "approved" | "declined") => void;
  askWhy: (id: string) => void;
  sendChat: (companyId: string, text: string) => Promise<void>;
  approveGate: (gateId: string) => void;
  addComment: (companyId: string, text: string) => void;
  moveInvestor: (id: string, stage: T.InvestorStage) => void;
  createCompany: (
    c: Omit<
      T.Company,
      "id" | "slug" | "stage" | "website_live_url" | "website_preview_url" | "plan" | "created_by"
    >,
  ) => string;
  theme: "light" | "dark";
  toggleTheme: () => void;
  work: (
    cid: string,
    title: string,
    cost: number,
    kind?: string,
    target?: string,
  ) => Promise<boolean>;
  saveLayout: (layout: LayoutItem[]) => void;
  updatePreferences: (patch: Partial<Preferences>) => void;
  updateSharing: (patch: Partial<Sharing>) => void;
  addRoutine: (title: string, cadence: Routine["cadence"], credits: number) => void;
  toggleRoutine: (id: string) => boolean;
  proposeBudget: (budget: number, cap: number) => boolean;
  draftOutreach: (body: string, recipients: string) => boolean;
  invite: (email: string, role: T.CompanyMember["role"]) => void;
  markDone: (id: string) => boolean;
  stopAuto: () => void;
}

const StoreCtx = createContext<Ctx | null>(null);
const iso = () => new Date().toISOString();
const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const LAYOUTS_KEY = "gumption-hq-layouts";
const OLD_LAYOUTS_KEY = "dawn-hq-layouts";

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>(() => ({
    ...workspaceSeed(seed.companies, seed.tasks),
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
  }));
  const [userId, setUserId] = useState("u1");
  const [companyId, setCompanyId] = useState("c1");
  const [solTyping, setSolTyping] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
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
        if (
          Array.isArray(value) &&
          value.length === defaultLayout().length &&
          new Set(value.map((x) => x.id)).size === value.length &&
          value.every(
            (x) => defaultLayout().some((y) => y.id === x.id) && typeof x.visible === "boolean",
          )
        )
          valid[key] = value;
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

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const decideApproval = useCallback(
    (id: string, status: "approved" | "declined") => {
      setDb((d) => {
        const a = d.approvals.find((x) => x.id === id);
        if (!a || a.status !== "pending") return d;
        const c = d.companies.find((c) => c.id === a.company_id);
        const text = approvalText(a);
        if (
          status === "approved" &&
          (!actionQuote(creditBalance(d.credit_ledger, a.company_id), a.estimated_credits)
            .affordable ||
            checkClaims(text, c?.sector).length)
        )
          return d;
        const ad = d.ads.find((x) => x.company_id === a.company_id);
        const adChange =
          a.action_type === "ad_spend" && a.payload.daily_budget !== undefined ? a.payload : null;
        const outreach = a.action_type === "send_email" && a.payload.outreach ? a.payload : null;
        if (
          status === "approved" &&
          adChange?.daily_budget !== undefined &&
          (!ad || adChange.daily_budget > (adChange.hard_cap ?? ad.hard_cap))
        )
          return d;
        return {
          ...d,
          credit_ledger:
            status === "approved"
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
            status === "approved" && adChange?.daily_budget !== undefined
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
            status === "approved" && outreach
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
            x.id === id ? { ...x, status, decided_by: user.full_name, decided_at: iso() } : x,
          ),
          agent_runs: d.agent_runs.map((r) =>
            r.id === a.run_id
              ? { ...r, status: status === "approved" ? "succeeded" : "failed" }
              : r,
          ),
          activity_events: [
            {
              id: uid("ev"),
              company_id: a.company_id,
              type: "approval",
              summary: `${user.full_name} ${status} ${labelFor(a)}`,
              created_at: iso(),
            },
            ...d.activity_events,
          ],
        };
      });
    },
    [user.full_name],
  );

  const askWhy = useCallback((id: string) => {
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
            content: `Why should I approve: ${labelFor(a)}?`,
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
      }));
      setDb((d) => ({
        ...d,
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

  const approveGate = useCallback(
    (gateId: string) => {
      setDb((d) => ({
        ...d,
        stage_gates: d.stage_gates.map((g) =>
          g.id === gateId
            ? { ...g, status: "approved", approved_by: userId, approved_at: iso() }
            : g,
        ),
      }));
    },
    [userId],
  );

  const addComment = useCallback(
    (cid: string, text: string) => {
      setDb((d) => ({
        ...d,
        gate_comments: [
          ...d.gate_comments,
          { id: uid("g"), company_id: cid, author: user.full_name, text, created_at: iso() },
        ],
      }));
    },
    [user.full_name],
  );

  const moveInvestor = useCallback((id: string, stage: T.InvestorStage) => {
    setDb((d) => ({
      ...d,
      investors: d.investors.map((i) => (i.id === id ? { ...i, stage } : i)),
    }));
  }, []);

  const createCompany: Ctx["createCompany"] = useCallback(
    (c) => {
      const id = uid("c");
      const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      setDb((d) => ({
        ...d,
        routines: [
          ...d.routines,
          ...workspaceSeed(
            [
              {
                ...c,
                id,
                slug,
                stage: "idea",
                plan: "starter",
                created_by: userId,
                website_live_url: `/site/${slug}`,
                website_preview_url: `/site/${slug}?preview=1`,
              },
            ],
            [],
          ).routines,
        ],
        documents: [
          ...d.documents,
          ...workspaceSeed(
            [
              {
                ...c,
                id,
                slug,
                stage: "idea",
                plan: "starter",
                created_by: userId,
                website_live_url: `/site/${slug}`,
                website_preview_url: `/site/${slug}?preview=1`,
              },
            ],
            [],
          ).documents,
        ],
        ads: [
          ...d.ads,
          {
            company_id: id,
            status: "not_connected",
            daily_budget: 0,
            hard_cap: 50,
            spend: 0,
            clicks: 0,
            signups: 0,
          },
        ],
        companies: [
          ...d.companies,
          {
            ...c,
            channels: businessDefaults(c.customer_type),
            started_at: iso(),
            id,
            slug,
            stage: "idea",
            plan: "starter",
            created_by: userId,
            website_live_url: `/site/${slug}`,
            website_preview_url: `/site/${slug}?preview=1`,
          },
        ],
        company_members: [
          ...d.company_members,
          { company_id: id, user_id: userId, role: "founder" },
        ],
        credit_ledger: [
          ...d.credit_ledger,
          {
            id: uid("l"),
            company_id: id,
            entry_type: "grant",
            amount: 1500,
            run_id: null,
            note: "Starter plan — welcome grant",
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
    [userId],
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
            model: "Sol mock",
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
    (title: string, cadence: Routine["cadence"], credits: number) =>
      setDb((d) => ({
        ...d,
        routines: [
          ...d.routines,
          { id: uid("routine"), company_id: companyId, title, cadence, credits, enabled: false },
        ],
      })),
    [companyId],
  );
  const toggleRoutine = useCallback(
    (id: string) => {
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
    (budget: number, cap: number) => {
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
            payload: {
              platform: "Meta Ads",
              amount_gbp: budget,
              daily_budget: budget,
              hard_cap: cap,
              duration: "per day",
              audience: "Current audience",
              creative: "Current creative",
              reason:
                "A capped test limits downside while measuring acquisition. Existing demo results provide the comparison baseline.",
            },
          },
          ...d.approvals,
        ],
      }));
      return true;
    },
    [companyId],
  );
  const draftOutreach = useCallback(
    (body: string, recipients: string) => {
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
    [companyId],
  );
  const invite = useCallback(
    (email: string, role: T.CompanyMember["role"]) =>
      setDb((d) => ({
        ...d,
        team: [
          ...d.team,
          { id: uid("invite"), company_id: companyId, email, role, status: "invited" },
        ],
      })),
    [companyId],
  );
  const markDone = useCallback(
    (id: string) => {
      const task = db.tasks.find((t) => t.id === id);
      if (!hasProof(task?.proof)) return false;
      setDb((d) => ({
        ...d,
        tasks: d.tasks.map((t) => (t.id === id ? { ...t, status: "done" } : t)),
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
      db,
      user,
      setUserId,
      companyId,
      setCompanyId,
      solTyping,
      decideApproval,
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
      theme,
      toggleTheme: () => setTheme((t) => (t === "light" ? "dark" : "light")),
    }),
    [
      db,
      user,
      companyId,
      solTyping,
      decideApproval,
      askWhy,
      sendChat,
      approveGate,
      addComment,
      moveInvestor,
      createCompany,
      theme,
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

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("useStore outside StoreProvider");
  return c;
}

export function useCompany(id?: string) {
  const { db, companyId } = useStore();
  const cid = id ?? companyId;
  const c = db.companies.find((c) => c.id === cid) ?? db.companies[0];
  if (!c) throw new Error("No companies");
  return c;
}

export function useMyCompanies() {
  const { db, user } = useStore();
  const ids = new Set(
    db.company_members.filter((m) => m.user_id === user.id).map((m) => m.company_id),
  );
  return db.companies.filter((c) => ids.has(c.id));
}

export function useBalance(id?: string) {
  const { db, companyId } = useStore();
  return creditBalance(db.credit_ledger, id ?? companyId);
}

export function useSolStatus(id?: string) {
  const { db, companyId, solTyping } = useStore();
  return solStatus({
    companyId: id ?? companyId,
    runs: db.agent_runs,
    approvals: db.approvals,
    events: db.activity_events,
    solTyping,
  });
}

export function labelFor(a: T.Approval) {
  switch (a.action_type) {
    case "publish_post":
      return `${a.payload.channel} post`;
    case "send_email":
      return `email "${a.payload.subject}"`;
    case "ad_spend":
      return `£${a.payload.amount_gbp} ${a.payload.platform} ad spend`;
    case "file_document":
      return `filing: ${a.payload.document}`;
    case "publish_site":
      return `site change: ${a.payload.change}`;
  }
}
