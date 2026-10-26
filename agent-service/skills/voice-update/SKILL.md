---
name: voice-update
description: Weekly review of the founder's edits to Sol's drafts, proposing changes to the brand voice when the edits show a pattern. Use for the weekly voice review.
---

# Voice update

1. Call `get_edit_events`. If there are fewer than three edits, or they're one-off fixes (a date, a name, a fact), propose nothing and say so.
2. Compare each original with the final. Look for patterns across edits, not single changes:
   - words or phrases the founder keeps adding (candidates for `use_phrases`) or removing (`avoid_phrases`);
   - sentences shortened or lengthened (reading level);
   - sign-offs changed; emoji added or removed; greetings made more or less formal.
3. Call `get_voice_profile` and keep everything the edits don't contradict.
4. Call `propose_voice_from_edits` once with the updated profile. In `changes`, list each change with the evidence ("removed 'awesome' in 4 of 5 edits").
5. Never propose loosening the claims rules or the escalation tone for distressed customers.
