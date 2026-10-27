-- Phase 10 enum changes, on their own because a new enum value can't be used in the
-- transaction that adds it (the next migration uses them).

create type public.entry_path as enum ('start_up', 'keep_going');

-- Keep going companies arrive at Grow already trading: the gates before it are recorded as
-- imported rather than approved.
alter type public.gate_status add value 'imported';
