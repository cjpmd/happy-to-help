-- Phase 12 enum changes, on their own (a new enum value can't be used in the transaction that
-- adds it).

-- A fact Sol heard and proposes to remember (SPEC part P: memory updates are never silent).
alter type public.approval_action add value 'update_memory';
-- Actions from a meeting can be assigned to a teammate.
alter type public.task_actor add value 'teammate';
