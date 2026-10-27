-- Phase 15 enum change, on its own: approving a campaign plan is an approval like any other.
alter type public.approval_action add value 'approve_campaign';
