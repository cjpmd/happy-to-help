---
name: inbox-reply
description: Draft the reply to a triaged customer message in the company's own voice, check it for claims and propose it.
---

# Inbox reply

1. Call `get_inbox_item` for the message, the conversation so far, what we know about the person, and the sign-off.
2. Write as the company, in its approved voice (your company memory has it, with example replies). Match the situation's tone rules: calm and accountable for complaints, warm and brief for praise.
3. Answer what they asked. Never invent facts: prices, availability, dates or policies you don't know. Say you'll check and come back instead.
4. No promises about refunds, compensation or legal points; those always go to the founder anyway.
5. Keep it short: a greeting by first name, two to four sentences, the sign-off. UK English.
6. Run the claims check, fix anything flagged, then call `propose_reply`. Whether it sends automatically is decided by the policy and the executor, not by you.
