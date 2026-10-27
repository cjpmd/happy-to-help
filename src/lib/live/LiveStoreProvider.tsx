import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type * as T from "../types";
import {
  StoreCtx,
  type Ctx,
  type DB,
  type ImportResult,
  type PublicFeedbackRequest,
} from "../storeContext";
import { useThemeState } from "../useThemeState";
import { defaultPreferences, defaultSharing, type Preferences, type Sharing } from "../workspace";
import type { ThemePref } from "../theme";
import { ALL_GROUPS, TABLE_GROUPS, emptyDb, loadGroups, type Group } from "./load";
import { mapLink, preferencesRow } from "./mappers";
import type { PublicForm, PublicHub } from "../links";
import { AgentError, enqueueJob, sendChatMessage, setLiveEstimates } from "../agentClient";

const COMPANY_KEY = "gumption-company";
/** How long the "Sol is typing" indicator waits for a reply before giving up. */
const TYPING_TIMEOUT_MS = 90_000;

const GUEST: T.Profile = { id: "", full_name: "", email: "", role: "founder" };

/** Work kinds the UI asks for, as agent job types (agent-service/src/jobs.ts). */
/** Short links go through the link Edge Function unless a branded short domain is set. */
const SHORT_LINK_BASE =
  (import.meta.env["VITE_SHORT_LINK_BASE"] as string | undefined) ||
  `${import.meta.env["VITE_SUPABASE_URL"] as string}/functions/v1/link`;

const JOB_TYPES: Record<string, string> = {
  task: "task",
  image: "media_image",
  video: "media_video",
  document: "document_update",
  email: "email_reply",
  social: "social_post",
  auto: "auto_mode",
  voice: "voice_analysis",
  compliance: "compliance_review",
  investor: "investor_update",
  evidence: "evidence_plan",
  campaign: "campaign_plan",
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
    async (cid, rows, softOptIn = false) => {
      const r = await call(
        () =>
          sb.rpc("import_contacts_checked", {
            p_company: cid,
            p_rows: rows as unknown as Json,
            p_soft_opt_in_confirmed: softOptIn,
          }),
        ["contacts", "links", "activity_events", "people"],
      );
      return r ? (r as unknown as ImportResult) : null;
    },
    [sb, call],
  );
  const processInboxItem = useCallback<Ctx["processInboxItem"]>(
    async (id) =>
      (await call(() => sb.rpc("process_inbox_item", { p_item: id }), ["inbox", "agent_runs"])) !==
      false,
    [sb, call],
  );
  const closeInboxItem = useCallback<Ctx["closeInboxItem"]>(
    async (id, status = "closed") =>
      (await call(
        () => sb.rpc("close_inbox_item", { p_item: id, p_status: status }),
        ["inbox"],
      )) !== false,
    [sb, call],
  );
  const planCampaign = useCallback<Ctx["planCampaign"]>(
    async (cid, goal) => {
      if (!goal.trim()) return false;
      try {
        await enqueueJob(cid, "campaign_plan", { title: "Plan a campaign", target: goal.trim() });
      } catch (e) {
        toast.error(e instanceof AgentError ? e.message : "Couldn't queue the plan");
        return false;
      }
      void reload(["agent_runs"]);
      toast.success("Sol is planning the campaign. The plan will come to you for a GO.");
      return true;
    },
    [reload],
  );
  const cancelCampaign = useCallback<Ctx["cancelCampaign"]>(
    async (id) =>
      (await call(
        () => sb.rpc("cancel_campaign", { p_campaign: id }),
        ["campaigns", "approvals"],
      )) !== false,
    [sb, call],
  );
  const updateListening = useCallback<Ctx["updateListening"]>(
    async (cid, patch) =>
      (await call(
        () =>
          sb.rpc("update_listening_settings", {
            p_company: cid,
            ...(patch.social_comments !== undefined
              ? { p_social_comments: patch.social_comments }
              : {}),
            ...(patch.reviews !== undefined ? { p_reviews: patch.reviews } : {}),
            ...(patch.feedback_requests !== undefined
              ? { p_feedback_requests: patch.feedback_requests }
              : {}),
            ...(patch.feedback_delay_days !== undefined
              ? { p_feedback_delay_days: patch.feedback_delay_days }
              : {}),
          }),
        ["listening"],
      )) !== false,
    [sb, call],
  );
  const requestFeedback = useCallback<Ctx["requestFeedback"]>(
    async (contactId) => {
      const r = await call(
        () =>
          sb.rpc("request_feedback", { p_contact: contactId, p_origin: window.location.origin }),
        ["listening", "approvals"],
      );
      if (r === false) return false;
      toast.success("Feedback request drafted. It's waiting for your GO.");
      return true;
    },
    [sb, call],
  );
  const fetchFeedbackRequest = useCallback<Ctx["fetchFeedbackRequest"]>(
    async (token) => {
      const { data } = await sb.rpc("get_feedback_request", { p_token: token });
      return (data as unknown as PublicFeedbackRequest | null) ?? null;
    },
    [sb],
  );
  const submitFeedback = useCallback<Ctx["submitFeedback"]>(
    async (token, rating, comment) => {
      const { data, error } = await sb.rpc("submit_feedback", {
        p_token: token,
        p_rating: rating,
        p_comment: comment,
      });
      if (error) {
        toast.error(error.message);
        return false;
      }
      return data === true;
    },
    [sb],
  );
  const addVoiceSource = useCallback<Ctx["addVoiceSource"]>(
    async (cid, kind, content) =>
      (await call(
        () => sb.from("voice_sources").insert({ company_id: cid, kind, content }),
        [],
      )) !== false,
    [sb, call],
  );
  const learnVoice = useCallback<Ctx["learnVoice"]>(
    async (cid) => {
      try {
        await enqueueJob(cid, "voice_analysis", { title: "Learn the brand voice" });
      } catch (e) {
        toast.error(e instanceof AgentError ? e.message : "Couldn't queue the voice analysis");
        return false;
      }
      void reload(["agent_runs"]);
      toast.success("Sol is reading your writing. The proposed voice will come to you for a GO.");
      return true;
    },
    [reload],
  );
  const saveVoiceProfile = useCallback<Ctx["saveVoiceProfile"]>(
    async (cid, edit) =>
      (await call(
        () => sb.rpc("save_voice_profile", { p_company: cid, p_profile: edit as Json }),
        ["voice", "activity_events"],
      )) !== false,
    [sb, call],
  );
  const addVoiceExample = useCallback<Ctx["addVoiceExample"]>(
    async (cid, situation, body) =>
      (await call(
        () => sb.from("voice_examples").insert({ company_id: cid, situation, body: body.trim() }),
        ["voice"],
      )) !== false,
    [sb, call],
  );
  const removeVoiceExample = useCallback<Ctx["removeVoiceExample"]>(
    async (id) =>
      (await call(() => sb.from("voice_examples").delete().eq("id", id), ["voice"])) !== false,
    [sb, call],
  );
  const setResponsePolicy = useCallback<Ctx["setResponsePolicy"]>(
    async (cid, category, mode) =>
      (await call(
        () => sb.rpc("set_response_policy", { p_company: cid, p_category: category, p_mode: mode }),
        ["voice"],
      )) !== false,
    [sb, call],
  );
  const updateResponseSettings = useCallback<Ctx["updateResponseSettings"]>(
    async (cid, patch) =>
      (await call(
        () =>
          sb.rpc("update_response_settings", {
            p_company: cid,
            ...(patch.disclosure_text !== undefined
              ? { p_disclosure_text: patch.disclosure_text }
              : {}),
            ...(patch.disclosure_on_approved !== undefined
              ? { p_disclosure_on_approved: patch.disclosure_on_approved }
              : {}),
            ...(patch.mark_reviewed ? { p_mark_reviewed: true } : {}),
            ...(patch.inbox_daily_cap !== undefined
              ? { p_inbox_daily_cap: patch.inbox_daily_cap }
              : {}),
          }),
        ["voice"],
      )) !== false,
    [sb, call],
  );
  const createCapture = useCallback<Ctx["createCapture"]>(
    async (c) => {
      let audioPath: string | null = null;
      if (c.audio) {
        const ext = c.audio.type.includes("mp4")
          ? "m4a"
          : c.audio.type.split("/")[1]?.split(";")[0] || "webm";
        audioPath = `${c.companyId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await sb.storage
          .from("captures")
          .upload(audioPath, c.audio, { contentType: c.audio.type || "audio/webm" });
        if (error) {
          toast.error(`Couldn't upload the recording: ${error.message}`);
          return null;
        }
      }
      const id = await call(
        () =>
          sb.rpc("create_capture", {
            p_company: c.companyId,
            p_source: c.source,
            p_consent: c.consent,
            p_title: c.title ?? "",
            ...(c.text ? { p_text: c.text } : {}),
            ...(audioPath ? { p_audio_path: audioPath } : {}),
            ...(c.durationSeconds ? { p_duration_seconds: Math.ceil(c.durationSeconds) } : {}),
            p_participants: c.participants ?? [],
          }),
        ["captures", "agent_runs", "activity_events"],
      );
      return id || null;
    },
    [sb, call],
  );
  const decideItem = useCallback<Ctx["decideItem"]>(
    async (id, decision, changes = {}, fileSensitive = false) =>
      (await call(
        () =>
          sb.rpc("decide_extracted_item", {
            p_item: id,
            p_decision: decision,
            p_changes: changes as Json,
            p_file_sensitive: fileSensitive,
          }),
        ["captures", "tasks", "approvals", "agent_runs", "evidence_items", "activity_events"],
      )) !== false,
    [sb, call],
  );
  const acceptAllItems = useCallback<Ctx["acceptAllItems"]>(
    async (captureId) => {
      const n = await call(
        () => sb.rpc("accept_all_items", { p_capture: captureId }),
        ["captures", "tasks", "approvals", "agent_runs", "evidence_items", "activity_events"],
      );
      return n === false ? null : (n ?? 0);
    },
    [sb, call],
  );
  const shareItem = useCallback<Ctx["shareItem"]>(
    async (id, shared) =>
      (await call(
        () => sb.rpc("share_extracted_item", { p_item: id, p_shared: shared }),
        ["captures"],
      )) !== false,
    [sb, call],
  );
  const updateCaptureSettings = useCallback<Ctx["updateCaptureSettings"]>(
    async (cid, patch) =>
      (await call(
        () =>
          sb.rpc("update_capture_settings", {
            p_company: cid,
            ...(patch.keep_audio_days !== undefined
              ? { p_keep_audio_days: patch.keep_audio_days }
              : {}),
            ...(patch.auto_accept_own_notes !== undefined
              ? { p_auto_accept: patch.auto_accept_own_notes }
              : {}),
          }),
        ["captures"],
      )) !== false,
    [sb, call],
  );
  const setIdeaStatus = useCallback<Ctx["setIdeaStatus"]>(
    async (id, status) =>
      (await call(
        () => sb.rpc("set_idea_status", { p_idea: id, p_status: status }),
        ["captures"],
      )) !== false,
    [sb, call],
  );
  const completeCommitment = useCallback<Ctx["completeCommitment"]>(
    async (id, status = "done") =>
      (await call(
        () => sb.rpc("complete_commitment", { p_commitment: id, p_status: status }),
        ["captures"],
      )) !== false,
    [sb, call],
  );
  const createLink = useCallback<Ctx["createLink"]>(
    async (cid, l) => {
      const row = await call(
        () =>
          sb.rpc("create_tracked_link", {
            p_company: cid,
            p_destination: l.destination,
            p_label: l.label,
            p_channel: l.channel,
            p_campaign: l.campaign ?? "",
            p_medium: l.medium ?? "social",
            ...(l.content ? { p_content: l.content } : {}),
            ...(l.spend_gbp !== undefined ? { p_spend_gbp: l.spend_gbp } : {}),
          }),
        ["links"],
      );
      return row ? mapLink(row) : null;
    },
    [sb, call],
  );
  const updateLink = useCallback<Ctx["updateLink"]>(
    async (id, patch) =>
      (await call(
        () =>
          sb.rpc("update_tracked_link", {
            p_link: id,
            ...(patch.label !== undefined ? { p_label: patch.label } : {}),
            ...(patch.spend_gbp !== undefined ? { p_spend_gbp: patch.spend_gbp } : {}),
            ...(patch.archived !== undefined ? { p_archived: patch.archived } : {}),
          }),
        ["links"],
      )) !== false,
    [sb, call],
  );
  const saveHubPage = useCallback<Ctx["saveHubPage"]>(
    async (cid, patch) =>
      (await call(
        () => sb.rpc("save_hub_page", { p_company: cid, p_patch: patch as unknown as Json }),
        ["links", "activity_events"],
      )) !== false,
    [sb, call],
  );
  const saveForm = useCallback<Ctx["saveForm"]>(
    async (id, patch) =>
      (await call(() => sb.rpc("save_form", { p_form: id, p_patch: patch as Json }), ["links"])) !==
      false,
    [sb, call],
  );
  const setLeadStatus = useCallback<Ctx["setLeadStatus"]>(
    async (id, status) =>
      (await call(
        () => sb.rpc("set_lead_status", { p_lead: id, p_status: status }),
        ["links", "contacts"],
      )) !== false,
    [sb, call],
  );
  const withdrawMarketing = useCallback<Ctx["withdrawMarketing"]>(
    async (contactId) =>
      (await call(
        () =>
          sb.rpc("record_consent", {
            p_contact: contactId,
            p_purpose: "marketing",
            p_status: "withdrawn",
          }),
        ["links"],
      )) !== false,
    [sb, call],
  );
  // Public pages: these work signed out too (the RPCs are open to anonymous visitors).
  const fetchHub = useCallback<Ctx["fetchHub"]>(
    async (slug) => {
      const { data } = await sb.rpc("get_hub", { p_slug: slug });
      return (data as unknown as PublicHub | null) ?? null;
    },
    [sb],
  );
  const fetchForm = useCallback<Ctx["fetchForm"]>(
    async (id) => {
      const { data } = await sb.rpc("get_form", { p_form: id });
      return (data as unknown as PublicForm | null) ?? null;
    },
    [sb],
  );
  const submitLead = useCallback<Ctx["submitLead"]>(
    async (x) => {
      const { error } = await sb.rpc("submit_lead", {
        p_form: x.formId,
        p_name: x.name,
        p_email: x.email,
        p_message: x.message,
        p_marketing: x.marketing,
        ...(x.phone ? { p_phone: x.phone } : {}),
        ...(x.linkCode ? { p_link_code: x.linkCode } : {}),
        ...(x.page ? { p_page: x.page } : {}),
        ...(x.trap ? { p_trap: x.trap } : {}),
      });
      if (error) {
        toast.error(error.message);
        return false;
      }
      return true;
    },
    [sb],
  );
  const followLink = useCallback<Ctx["followLink"]>(
    async (code) => {
      const { data } = await sb.rpc("follow_link", {
        p_code: code,
        ...(document.referrer ? { p_referrer: document.referrer } : {}),
        p_device: /mobi|iphone|android/i.test(navigator.userAgent) ? "mobile" : "desktop",
      });
      return data ?? null;
    },
    [sb],
  );
  const startAutoMode = useCallback<Ctx["startAutoMode"]>(
    async (cid, hours, cap) => {
      const ok =
        (await call(
          () => sb.rpc("start_auto_mode", { p_company: cid, p_hours: hours, p_cap_credits: cap }),
          ["automation", "activity_events"],
        )) !== false;
      if (ok) toast.success(`Auto Mode is on for ${hours} ${hours === 1 ? "hour" : "hours"}.`);
      return ok;
    },
    [sb, call],
  );
  const stopAutoMode = useCallback<Ctx["stopAutoMode"]>(
    async (cid) =>
      (await call(
        () => sb.rpc("stop_auto_mode", { p_company: cid }),
        ["automation", "activity_events"],
      )) !== false,
    [sb, call],
  );
  const updateAutomation = useCallback<Ctx["updateAutomation"]>(
    async (cid, patch) =>
      (await call(
        () =>
          sb.rpc("update_automation", {
            p_company: cid,
            ...(patch.nightly_enabled !== undefined
              ? { p_nightly_enabled: patch.nightly_enabled }
              : {}),
            ...(patch.nightly_cap_credits !== undefined
              ? { p_nightly_cap: patch.nightly_cap_credits }
              : {}),
            ...(patch.voice_review_enabled !== undefined
              ? { p_voice_review: patch.voice_review_enabled }
              : {}),
          }),
        ["automation"],
      )) !== false,
    [sb, call],
  );
  const setIntegration = useCallback<Ctx["setIntegration"]>(
    async (cid, provider, enabled, config) =>
      (await call(
        () =>
          sb.rpc("set_integration", {
            p_company: cid,
            p_provider: provider,
            p_enabled: enabled,
            ...(config ? { p_config: config as Json } : {}),
          }),
        ["billing", "activity_events"],
      )) !== false,
    [sb, call],
  );
  const loadPlatformHealth = useCallback<Ctx["loadPlatformHealth"]>(async () => {
    const from = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const [errors, costs] = await Promise.all([
      sb
        .from("error_events")
        .select("id, source, message, created_at")
        .order("created_at", { ascending: false })
        .limit(25),
      sb.rpc("cost_reconciliation", {
        p_from: from,
        p_to: new Date().toISOString().slice(0, 10),
      }),
    ]);
    if (errors.error || costs.error) return null;
    return {
      errors: errors.data,
      costs: (costs.data ?? []).map((c) => ({
        day: c.day,
        model: c.model,
        runs: Number(c.runs),
        estimated_usd: Number(c.estimated_usd),
        actual_usd: Number(c.actual_usd),
        difference_pct: c.difference_pct === null ? null : Number(c.difference_pct),
      })),
    };
  }, [sb]);
  const estimateCapture = useCallback<Ctx["estimateCapture"]>(
    async (seconds) => {
      const { data } = await sb.rpc("capture_estimate", {
        ...(seconds ? { p_duration_seconds: Math.ceil(seconds) } : {}),
      });
      return data ?? 0;
    },
    [sb],
  );
  const loadTranscript = useCallback<Ctx["loadTranscript"]>(
    async (captureId) => {
      const { data } = await sb
        .from("transcripts")
        .select("text")
        .eq("capture_id", captureId)
        .maybeSingle();
      return data?.text ?? null;
    },
    [sb],
  );
  // Error monitoring: the app's own crashes are reported (a few per visit, deduplicated).
  useEffect(() => {
    if (auth !== "signed_in") return;
    const seen = new Set<string>();
    const report = (message: string, context: Record<string, string>) => {
      if (!message || seen.has(message) || seen.size >= 5) return;
      seen.add(message);
      void sb.rpc("report_client_error", {
        p_message: message,
        p_context: { ...context, page: window.location.pathname },
      });
    };
    const onError = (e: ErrorEvent) => report(e.message, { file: e.filename ?? "" });
    const onRejection = (e: PromiseRejectionEvent) =>
      report(e.reason instanceof Error ? e.reason.message : String(e.reason), { kind: "promise" });
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [auth, sb]);
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
      processInboxItem,
      closeInboxItem,
      planCampaign,
      cancelCampaign,
      updateListening,
      requestFeedback,
      fetchFeedbackRequest,
      submitFeedback,
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
      shortLinkBase: SHORT_LINK_BASE,
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
      processInboxItem,
      closeInboxItem,
      planCampaign,
      cancelCampaign,
      updateListening,
      requestFeedback,
      fetchFeedbackRequest,
      submitFeedback,
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
      themeState,
    ],
  );

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}
