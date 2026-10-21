import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as seed from "./seed";
import type * as T from "./types";
import { sendChatMessage } from "./agentClient";
import { creditBalance } from "./credits";

/**
 * In-memory data store shaped like the Supabase schema.
 * When the user's Supabase project is connected, replace these reads/writes with
 * queries + Realtime subscriptions; components only use the hooks below.
 */
type DB = {
  companies: T.Company[]; approvals: T.Approval[]; agent_runs: T.AgentRun[]; activity_events: T.ActivityEvent[];
  credit_ledger: T.LedgerEntry[]; chat_messages: T.ChatMessage[]; stage_gates: T.StageGate[]; investors: T.Investor[];
  gate_comments: T.GateComment[]; company_members: T.CompanyMember[]; evidence_items: T.EvidenceItem[];
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
  createCompany: (c: Omit<T.Company, "id" | "slug" | "stage" | "website_live_url" | "website_preview_url" | "plan" | "created_by">) => string;
  theme: "light" | "dark";
  toggleTheme: () => void;
}

const StoreCtx = createContext<Ctx | null>(null);
const iso = () => new Date().toISOString();
const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>(() => ({
    companies: seed.companies, approvals: seed.approvals, agent_runs: seed.agent_runs, activity_events: seed.activity_events,
    credit_ledger: seed.credit_ledger, chat_messages: seed.chat_messages, stage_gates: seed.stage_gates, investors: seed.investors,
    gate_comments: seed.gate_comments, company_members: seed.company_members, evidence_items: seed.evidence_items,
  }));
  const [userId, setUserId] = useState("u1");
  const [companyId, setCompanyId] = useState("c1");
  const [solTyping, setSolTyping] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const user = seed.profiles.find((p) => p.id === userId)!;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const decideApproval = useCallback((id: string, status: "approved" | "declined") => {
    setDb((d) => {
      const a = d.approvals.find((x) => x.id === id);
      if (!a) return d;
      return {
        ...d,
        approvals: d.approvals.map((x) => (x.id === id ? { ...x, status, decided_by: user.full_name, decided_at: iso() } : x)),
        agent_runs: d.agent_runs.map((r) => (r.id === a.run_id ? { ...r, status: status === "approved" ? "succeeded" : "failed" } : r)),
        activity_events: [{ id: uid("ev"), company_id: a.company_id, type: "approval", summary: `${user.full_name} ${status} ${labelFor(a)}`, created_at: iso() }, ...d.activity_events],
      };
    });
  }, [user.full_name]);

  const askWhy = useCallback((id: string) => {
    setDb((d) => {
      const a = d.approvals.find((x) => x.id === id);
      if (!a) return d;
      return { ...d, chat_messages: [...d.chat_messages,
        { id: uid("m"), company_id: a.company_id, sender: "founder", content: `Why should I approve: ${labelFor(a)}?`, created_at: iso() },
        { id: uid("m"), company_id: a.company_id, sender: "sol", content: a.payload.reason ?? "This moves your current stage goal forward.", created_at: iso() },
      ] };
    });
  }, []);

  const sendChat = useCallback(async (cid: string, text: string) => {
    setDb((d) => ({ ...d, chat_messages: [...d.chat_messages, { id: uid("m"), company_id: cid, sender: "founder", content: text, created_at: iso() }] }));
    setSolTyping(true);
    const { reply } = await sendChatMessage(cid, text);
    setSolTyping(false);
    setDb((d) => ({ ...d, chat_messages: [...d.chat_messages, { id: uid("m"), company_id: cid, sender: "sol", content: reply, created_at: iso() }] }));
  }, []);

  const approveGate = useCallback((gateId: string) => {
    setDb((d) => ({ ...d, stage_gates: d.stage_gates.map((g) => (g.id === gateId ? { ...g, status: "approved", approved_by: userId, approved_at: iso() } : g)) }));
  }, [userId]);

  const addComment = useCallback((cid: string, text: string) => {
    setDb((d) => ({ ...d, gate_comments: [...d.gate_comments, { id: uid("g"), company_id: cid, author: user.full_name, text, created_at: iso() }] }));
  }, [user.full_name]);

  const moveInvestor = useCallback((id: string, stage: T.InvestorStage) => {
    setDb((d) => ({ ...d, investors: d.investors.map((i) => (i.id === id ? { ...i, stage } : i)) }));
  }, []);

  const createCompany: Ctx["createCompany"] = useCallback((c) => {
    const id = uid("c");
    const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    setDb((d) => ({
      ...d,
      companies: [...d.companies, { ...c, id, slug, stage: "idea", plan: "starter", created_by: userId, website_live_url: `/site/${slug}`, website_preview_url: `/site/${slug}?preview=1` }],
      company_members: [...d.company_members, { company_id: id, user_id: userId, role: "founder" }],
      credit_ledger: [...d.credit_ledger, { id: uid("l"), company_id: id, entry_type: "grant", amount: 1500, run_id: null, note: "Starter plan — welcome grant", created_at: iso() }],
      chat_messages: [...d.chat_messages, { id: uid("m"), company_id: id, sender: "sol", content: `Welcome to Dawn. I've read your idea for ${c.name}. Tonight I'll draft your first assumptions to test and a simple landing page.`, created_at: iso() }],
    }));
    setCompanyId(id);
    return id;
  }, [userId]);

  const value = useMemo<Ctx>(() => ({
    db, user, setUserId, companyId, setCompanyId, solTyping, decideApproval, askWhy, sendChat, approveGate, addComment, moveInvestor, createCompany,
    theme, toggleTheme: () => setTheme((t) => (t === "light" ? "dark" : "light")),
  }), [db, user, companyId, solTyping, decideApproval, askWhy, sendChat, approveGate, addComment, moveInvestor, createCompany, theme]);

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
  return db.companies.find((c) => c.id === cid) ?? db.companies[0];
}

export function useMyCompanies() {
  const { db, user } = useStore();
  const ids = new Set(db.company_members.filter((m) => m.user_id === user.id).map((m) => m.company_id));
  return db.companies.filter((c) => ids.has(c.id));
}

export function useBalance(id?: string) {
  const { db, companyId } = useStore();
  return creditBalance(db.credit_ledger, id ?? companyId);
}

export function labelFor(a: T.Approval) {
  switch (a.action_type) {
    case "publish_post": return `${a.payload.channel} post`;
    case "send_email": return `email "${a.payload.subject}"`;
    case "ad_spend": return `£${a.payload.amount_gbp} ${a.payload.platform} ad spend`;
    case "file_document": return `filing: ${a.payload.document}`;
    case "publish_site": return `site change: ${a.payload.change}`;
  }
}
