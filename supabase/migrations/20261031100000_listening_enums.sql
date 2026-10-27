-- Phase 16 enum change, on its own: a public reply (to a comment on our own post, or a review)
-- is an approval like any other.
alter type public.approval_action add value 'reply_public';
