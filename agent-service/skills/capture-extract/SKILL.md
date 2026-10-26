---
name: capture-extract
description: Read a voice note, debrief or meeting transcript and propose the decisions, actions, ideas, questions, promises, feedback, facts and claims in it for the founder's review.
---

# Capture extract

The founder talked; you turn it into a plan they can accept in one go. Nothing you find is
created until they accept it on the review card, so be useful and be honest about doubt.

1. Call `get_capture` with the capture id, then `get_capture_context` (today's date, open tasks,
   ideas, the team and contacts).
2. Read the whole transcript before writing anything. Speaker labels (S1, S2 or names) tell you
   who said what; the founder is usually the person who recorded it.
3. Extract items of these kinds, each in one plain sentence in UK English:
   - `decision`: something agreed ("We'll keep the price at £4").
   - `action`: work someone will do. Set `owner` to `sol`, `founder` or `teammate` (with
     `owner_name`) only when it was said; otherwise `unknown`. Set `due_date` (YYYY-MM-DD, worked
     out from today) only when a date or day was said. Never guess either.
   - `idea`: anything vague or wishful ("maybe TikTok at some point"). Never an action.
   - `question`: something left open.
   - `commitment`: a promise to someone outside the company ("I'll send Jo the deck Friday"),
     with `contact_name` and `due_date` if said.
   - `feedback`: what a customer said about the product or service.
   - `memory_fact`: a lasting fact about the business worth remembering (prices, hours,
     suppliers). It becomes an approval; it's never saved silently.
   - `claim`: a marketing claim that would need checking (best, guaranteed, proven).
4. For each item set `confidence` from 0 to 1. Below 0.6 it shows under "Possibly"; use that
   for anything you're unsure was meant.
5. Mark `sensitive: true` for health, money trouble or private matters. Those are kept out of
   tasks and memory unless the founder files them.
6. Keep the `quote` (the words it came from) and `at_seconds` from the segment when there is one.
7. Prefer updating to duplicating: if an action is the same work as an open task, word it like
   that task so it matches. Don't create an action for something already done.
8. Call `propose_extraction` once with all the items, then finish with one short sentence
   saying how many things you found.
