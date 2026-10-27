-- Phase 11 enum changes, on their own (a new enum value can't be used in the transaction
-- that adds it).

-- A proposed change to the company's voice profile, approved like any other action
-- (SPEC part G: the voice never changes silently).
alter type public.approval_action add value 'update_voice';

create type public.voice_status as enum ('proposed', 'approved', 'declined', 'superseded');
create type public.response_mode as enum ('auto_send', 'draft', 'escalate');
