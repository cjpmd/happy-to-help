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

## Public replies (comments and reviews)

When `get_inbox_item` says `public: true`, the reply is posted where everyone can see it (a comment on the company's post, or a Google review). It always waits for the founder's GO.

- One or two sentences, no letter format, no greeting line and no sign-off block. End with "– {company}".
- Thank them by first name only; never repeat personal details, order numbers or anything private in public.
- For an unhappy review or complaint: acknowledge it, say sorry without admitting fault on details you don't know, and invite them to get in touch directly. Never argue, never offer money in public.
- Use the stars (`rating`) as well as the words: a 1 or 2-star review is unhappy whatever the wording.
