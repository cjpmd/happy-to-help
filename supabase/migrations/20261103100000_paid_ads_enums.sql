-- Phase 19 enum change, on its own: launching a paid ad is an approval like any other.
alter type public.approval_action add value 'launch_ad';
