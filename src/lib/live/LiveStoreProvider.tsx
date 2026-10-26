import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type * as T from "../types";
import { StoreCtx, type Ctx, type DB } from "../storeContext";
import { useThemeState } from "../useThemeState";
import { defaultPreferences, defaultSharing, type Preferences, type Sharing } from "../workspace";
import type { ThemePref } from "../theme";
import { ALL_GROUPS, TABLE_GROUPS, emptyDb, loadGroups, type Group } from "./load";
import { preferencesRow } from "./mappers";
import { AgentError, enqueueJob, sendChatMessage, setLiveEstimates } from "../agentClient";

const COMPANY_KEY = "gumption-company";
/** How long the "Sol is typing" indicator waits for a reply before giving up. */
const TYPING_TIMEOUT_MS = 90_000;

const GUEST: T.Profile = { id: "", full_name: "", email: "", role: "founder" };

/** Work kinds the UI asks for, as agent job types (agent-service/src/jobs.ts). */
const JOB_TYPES: Record<string, string> = {
  task: "task",
  image: "media_image",
  video: "media_video",
  document: "document_update",
  email: "email_reply",
  social: "social_post",
  auto: "auto_mode",
};

/**
 * The live store: the same API as the demo store, backed by Supabase. Reads come straight from
 * the tables (row-level security applies) and stay fresh through Realtime; writes go through
 * the RPCs in supabase/migrations/*_app_rpcs.sql, which check the rules server-side.
 */
export function LiveStoreProvider({ children }: { children: ReactNode }) {
  const sb = getSupabase();
  const [session, setSession] = useState<Session | null>(null);
  const [auth, setAuth] = useState<Ctx["auth"]>("loading");
  const [db, setDb] = useState<DB>(emptyDb);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyIdState] = useState("");
  const [solTyping, setSolTyping] = useState(false);
  const [chatDraft, setChatDraft] = useState<Ctx["chatDraft"]>(null);
  const [now, setNow] = useState(() => new Date());
  const userId = session?.user.id ?? "";
  const pending = useRef(new Set<Group>());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [remoteTheme, setRemoteTheme] = useState<string | null>(null);

  const saveTheme = useCallback(
    (theme: ThemePref) => {
      if (!userId) return;
      void sb
        .from("user_preferences")
        .upsert({ user_id: userId, theme })
        .then(({ error }) => error && toast.error(`Couldn't save the theme: ${error.message}`));
    },
    [sb, userId],
  );
  const themeState = useThemeState(remoteTheme, saveTheme);

  // Session ---------------------------------------------------------------------------------
  useEffect(() => {
    let active = true;
    void sb.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setAuth(data.session ? "signed_in" : "signed_out");
    });
    const { data } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setAuth(s ? "signed_in" : "signed_out");
    });
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      active = false;
      data.subscription.unsubscribe();
      clearInterval(tick);
    };
  }, [sb]);

  // Loading ---------------------------------------------------------------------------------
  const reload = useCallback(
    async (groups: Group[]) => {
      if (!userId) return;
      try {
        const part = await loadGroups(sb, userId, groups);
        setDb((d) => ({ ...d, ...part }));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't load your data");
      }
    },
    [sb, userId],
  );

  useEffect(() => {
    if (!userId) {
      setDb(emptyDb());
      setLoading(auth === "loading");
      return;
    }
    let active = true;
    setLoading(true);
    void (async () => {
      // Invites sent to this email become memberships on first sign-in.
      await sb.rpc("accept_invites");
      const { data: prefs } = await sb.from("user_preferences").select("theme").maybeSingle();
      if (active && prefs) setRemoteTheme(prefs.theme);
      await reload(ALL_GROUPS);
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [sb, userId, auth, reload]);

  // Realtime: reload the affected group shortly after a change (changes often come in bursts).
  useEffect(() => {
    if (!userId) return;
    const flush = () => {
      const groups = [...pending.current];
      pending.current.clear();
      if (groups.length) void reload(groups);
    };
    const channel = sb.channel(`store-${userId}`);
    for (const [table, group] of Object.entries(TABLE_GROUPS)) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        if (!group) return;
        pending.current.add(group);
        if (flushTimer.current) clearTimeout(flushTimer.current);
        flushTimer.current = setTimeout(flush, 250);
      });
    }
    channel.subscribe();
    return () => {
      if (flushTimer.current) clearTimeout(flushTimer.current);
      void sb.removeChannel(channel);
    };
  }, [sb, userId, reload]);

  // The selected company: remembered in this browser, and always one the user can read.
  useEffect(() => {
    if (!db.companies.length) return;
    if (db.companies.some((c) => c.id === companyId)) return;
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(COMPANY_KEY);
    } catch {
      /* Storage blocked. */
    }
    const mine = db.company_members.find((m) => m.user_id === userId)?.company_id;
    const next = db.companies.find((c) => c.id === saved)?.id ?? mine ?? db.companies[0]?.id ?? "";
    setCompanyIdState(next);
  }, [db.companies, db.company_members, companyId, userId]);
  const setCompanyId = useCallback((id: string) => {
    setCompanyIdState(id);
    try {
      window.localStorage.setItem(COMPANY_KEY, id);
    } catch {
      /* Storage blocked: the choice lasts until reload. */
    }
  }, []);

  // Estimates for the agent client.
  useEffect(() => {
    if (db.job_types.length)
      setLiveEstimates(
        Object.fromEntries(db.job_types.map((j) => [j.job_type, j.estimate_credits])),
      );
  }, [db.job_types]);

  // A Sol reply ends the typing indicator.
  const lastSol = db.chat_messages.filter((m) => m.sender === "sol").at(-1)?.id;
  useEffect(() => {
    setSolTyping(false);
    if (typingTimer.current) clearTimeout(typingTimer.current);
  }, [lastSol]);

  const user = useMemo<T.Profile>(
    () => db.profiles.find((p) => p.id === userId) ?? { ...GUEST, id: userId },
    [db.profiles, userId],
  );

  // Calls an RPC; on failure shows the server's message (which is written for people).
  const call = useCallback(
    async <R,>(
      run: () => PromiseLike<{ data: R | null; error: { message: string } | null }>,
      after: Group[],
    ): Promise<R | null | false> => {
      const { data, error } = await run();
      if (error) {
        toast.error(error.message);
        return false;
      }
      void reload(after);
      return data;
    },
    [reload],
  );

  // Actions ---------------------------------------------------------------------------------
  const decideApproval = useCallback<Ctx["decideApproval"]>(
    async (id, status) =>
      (await call(
        () => sb.rpc("decide_approval", { p_approval: id, p_decision: status }),
        ["approvals", "agent_runs", "activity_events"],
      )) !== false,
    [sb, call],
  );
  const editApproval = useCallback<Ctx["editApproval"]>(
    async (id, changes) =>
      (await call(
        () => sb.rpc("edit_approval", { p_approval: id, p_changes: changes }),
        ["approvals"],
      )) !== false,
    [sb, call],
  );
  const askWhy = useCallback<Ctx["askWhy"]>(
    async (id) => {
      await call(() => sb.rpc("ask_why", { p_approval: id }), ["chat_messages"]);
    },
    [sb, call],
  );
  // Sol's reply streams from the chat Edge Function; the founder's message and the reply are
  // saved server-side and arrive through Realtime.
  const sendChat = useCallback<Ctx["sendChat"]>(
    async (cid, text) => {
      setSolTyping(true);
      setChatDraft({ companyId: cid, text: "" });
      void reload(["chat_messages"]);
      try {
        await sendChatMessage(cid, text, (delta) =>
          setChatDraft((d) => ({ companyId: cid, text: (d?.text ?? "") + delta })),
        );
      } catch (e) {
        toast.error(e instanceof AgentError ? e.message : "Sol couldn't reply. Please try again.");
      } finally {
        await reload(["chat_messages", "credit_ledger", "agent_runs"]);
        setChatDraft(null);
        setSolTyping(false);
      }
    },
    [reload],
  );
  const approveGate = useCallback<Ctx["approveGate"]>(
    async (gateId) =>
      (await call(
        () => sb.rpc("approve_gate", { p_gate: gateId }),
        ["stage_gates", "people", "activity_events"],
      )) !== false,
    [sb, call],
  );
  const addComment = useCallback<Ctx["addComment"]>(
    async (cid, text) =>
      (await call(
        () => sb.from("gate_comments").insert({ company_id: cid, body: text }),
        ["gate_comments"],
      )) !== false,
    [sb, call],
  );
  const moveInvestor = useCallback<Ctx["moveInvestor"]>(
    async (id, stage) => {
      setDb((d) => ({
        ...d,
        investors: d.investors.map((i) => (i.id === id ? { ...i, stage } : i)),
      }));
      return (
        (await call(() => sb.from("investors").update({ stage }).eq("id", id), ["investors"])) !==
        false
      );
    },
    [sb, call],
  );
  const createCompany = useCallback<Ctx["createCompany"]>(
    async (c) => {
      const id = await call(
        () =>
          sb.rpc("create_company", {
            p_name: c.name,
            p_description: c.description,
            p_customer_type: c.customer_type,
            p_sector: c.sector ?? "general",
            ...(c.target_customer ? { p_target_customer: c.target_customer } : {}),
            ...(c.goal_90d ? { p_goal_90d: c.goal_90d } : {}),
            ...(c.starting_stage ? { p_starting_stage: c.starting_stage } : {}),
            ...(c.existing_website_url ? { p_existing_website_url: c.existing_website_url } : {}),
            ...(c.cohort_code ? { p_cohort_code: c.cohort_code } : {}),
            ...(c.entry_path ? { p_entry_path: c.entry_path } : {}),
            ...(c.social_handles ? { p_social_handles: c.social_handles } : {}),
            ...(c.google_business_url ? { p_google_business_url: c.google_business_url } : {}),
          }),
        [],
      );
      if (!id) return null;
      await reload(ALL_GROUPS);
      setCompanyId(id);
      return id;
    },
    [sb, call, reload, setCompanyId],
  );
  const work = useCallback<Ctx["work"]>(
    async (cid, title, cost, kind = "task", target) => {
      const jobType = JOB_TYPES[kind] ?? "task";
      try {
        await enqueueJob(
          cid,
          jobType,
          { title, ...(target ? { target } : {}) },
          kind === "task" ? target : undefined,
          kind === "auto" ? cost : undefined,
        );
      } catch (e) {
        toast.error(e instanceof AgentError ? e.message : "Couldn't queue the work");
        return false;
      }
      void reload(["agent_runs"]);
      toast.success("Queued. Sol will pick it up shortly.");
      return true;
    },
    [reload],
  );
  const saveLayout = useCallback<Ctx["saveLayout"]>(
    (layout) => {
      setDb((d) => ({ ...d, layouts: { ...d.layouts, [userId]: layout } }));
      void sb
        .from("hq_layouts")
        .upsert({ user_id: userId, layout: layout as unknown as Json[] })
        .then(({ error }) => error && toast.error(`Couldn't save the layout: ${error.message}`));
    },
    [sb, userId],
  );
  const updatePreferences = useCallback<Ctx["updatePreferences"]>(
    (patch) => {
      let next: Preferences = defaultPreferences();
      setDb((d) => {
        next = { ...defaultPreferences(), ...d.preferences[userId], ...patch };
        return { ...d, preferences: { ...d.preferences, [userId]: next } };
      });
      void sb
        .from("user_preferences")
        .upsert({ user_id: userId, ...preferencesRow(next) })
        .then(({ error }) => error && toast.error(`Couldn't save settings: ${error.message}`));
    },
    [sb, userId],
  );
  const updateSharing = useCallback<Ctx["updateSharing"]>(
    (patch) => {
      const next: Sharing = { ...defaultSharing(), ...db.sharing[companyId], ...patch };
      setDb((d) => ({ ...d, sharing: { ...d.sharing, [companyId]: next } }));
      void sb
        .from("company_sharing")
        .upsert({ company_id: companyId, ...next })
        .then(({ error }) => error && toast.error(`Couldn't save sharing: ${error.message}`));
    },
    [sb, companyId, db.sharing],
  );
  const addRoutine = useCallback<Ctx["addRoutine"]>(
    async (title, cadence, credits) =>
      (await call(
        () => sb.from("routines").insert({ company_id: companyId, title, cadence, credits }),
        ["routines"],
      )) !== false,
    [sb, call, companyId],
  );
  const toggleRoutine = useCallback<Ctx["toggleRoutine"]>(
    async (id) => {
      const r = db.routines.find((x) => x.id === id);
      if (!r) return false;
      return (
        (await call(
          () => sb.from("routines").update({ enabled: !r.enabled }).eq("id", id),
          ["routines"],
        )) !== false
      );
    },
    [sb, call, db.routines],
  );
  const proposeBudget = useCallback<Ctx["proposeBudget"]>(
    async (budget, cap) =>
      (await call(
        () =>
          sb.rpc("request_ad_budget", {
            p_company: companyId,
            p_daily_budget: budget,
            p_hard_cap: cap,
          }),
        ["approvals"],
      )) !== false,
    [sb, call, companyId],
  );
  const draftOutreach = useCallback<Ctx["draftOutreach"]>(
    async (body, recipients) =>
      (await call(
        () =>
          sb.rpc("draft_outreach", {
            p_company: companyId,
            p_to: recipients,
            p_subject: "Pilot invitation",
            p_body: body,
          }),
        ["approvals"],
      )) !== false,
    [sb, call, companyId],
  );
  const invite = useCallback<Ctx["invite"]>(
    async (email, role) =>
      (await call(
        () =>
          sb
            .from("team_invites")
            .insert({ company_id: companyId, email: email.trim().toLowerCase(), role }),
        ["settings"],
      )) !== false,
    [sb, call, companyId],
  );
  const markDone = useCallback<Ctx["markDone"]>(
    async (id) =>
      (await call(() => sb.rpc("complete_task", { p_task: id }), ["tasks", "activity_events"])) !==
      false,
    [sb, call],
  );
  const stopAuto = useCallback(() => setSolTyping(false), []);
  const importContacts = useCallback<Ctx["importContacts"]>(
    async (cid, rows) => {
      const n = await call(
        () => sb.rpc("import_contacts", { p_company: cid, p_rows: rows as unknown as Json }),
        ["contacts", "activity_events"],
      );
      return n === false ? null : (n ?? 0);
    },
    [sb, call],
  );
  const addVoiceSource = useCallback<Ctx["addVoiceSource"]>(
    async (cid, kind, content) =>
      (await call(
        () => sb.from("voice_sources").insert({ company_id: cid, kind, content }),
        [],
      )) !== false,
    [sb, call],
  );
  const signIn = useCallback<Ctx["signIn"]>(
    async (email) => {
      const { error } = await sb.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/hq` },
      });
      return error ? error.message : null;
    },
    [sb],
  );
  const signOut = useCallback(async () => {
    await sb.auth.signOut();
    setDb(emptyDb());
  }, [sb]);

  const value = useMemo<Ctx>(
    () => ({
      mode: "live",
      auth,
      loading,
      now,
      db,
      user,
      setUserId: () => {},
      companyId,
      setCompanyId,
      signIn,
      signOut,
      solTyping,
      chatDraft,
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
      addVoiceSource,
      ...themeState,
    }),
    [
      auth,
      loading,
      now,
      db,
      user,
      companyId,
      setCompanyId,
      signIn,
      signOut,
      solTyping,
      chatDraft,
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
      addVoiceSource,
      themeState,
    ],
  );

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}
