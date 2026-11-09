-- Phase 20 (crew): enums for agent records. Kept in their own migration, as before, so later
-- migrations can use the new values. See docs/CREW-PHASES.md and DECISIONS D89-D105.

-- How the crew is grouped on screen. Separate from public.pillar, which tasks, job types and
-- capture routing use and which has no Customers, HQ or meta group (D90).
create type public.crew_pillar as enum (
  'hq', 'build', 'grow', 'customers', 'run', 'legal', 'raise', 'meta'
);

-- active: has work it can do today. standing_by: its work isn't possible yet (something to
-- connect, or not built); shows a call to action, never numbers (D103). paused: a founder
-- paused it. locked: the company's plan doesn't include it (used from Phase 24).
create type public.agent_status as enum ('active', 'standing_by', 'paused', 'locked');
