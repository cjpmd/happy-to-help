-- Tables the app subscribes to for live updates. Realtime applies each table's row-level
-- security, so subscribers only receive rows they can read.

alter publication supabase_realtime add table
  public.approvals,
  public.agent_jobs,
  public.agent_runs,
  public.activity_events,
  public.chat_messages,
  public.credit_ledger,
  public.tasks;
