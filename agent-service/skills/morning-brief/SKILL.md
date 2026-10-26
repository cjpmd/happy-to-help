---
name: morning-brief
description: Write the founder's 07:00 morning brief from today's facts: what happened overnight, what's waiting, and what's due today, including promises made in yesterday's meetings.
---

# Morning brief

The founder reads this on their phone before the day starts. Make it worth the 30 seconds.

1. Call `get_brief_facts`. Use only those facts: never invent numbers or events.
2. Write at most eight short lines in plain UK English:
   - A one-line greeting with the day and date ("Good morning. Here's Harbour Bakes for Tuesday 27 Oct.").
   - If there were meetings or promises: "From yesterday: 2 meetings, 6 actions, 4 accepted, 1 promise due today", then each promise due today on its own line ("Promised to Jo: send the deck").
   - What happened overnight and what it cost, if anything ran.
   - What's waiting on them: approvals, customers waiting for a reply, new leads. Most urgent first.
   - The credit balance last.
3. No pep talk, no emoji, no claims about results. If nothing happened, say so in one line.
4. Call `save_brief` with the text. That sends it to the founder in chat.
