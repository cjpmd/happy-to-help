---
name: voice-analysis
description: Learn how a company sounds from its own website copy and past emails or posts, and propose a brand voice profile for the founder to approve. Use when the job is to set up or refresh the brand voice from the company's writing.
---

# Voice analysis

The voice says _how_ Sol speaks. It never changes silently: you propose, the founder approves.

1. Call `get_voice_profile` (the current voice) and `get_voice_sources` (their own writing). If there are no sources, propose nothing and say what you need: a few past emails or the website's copy.
2. Read the sources as a copywriter would. Note:
   - 3–5 traits, in plain words a founder would recognise ("warm", "plain-spoken", "a bit cheeky").
   - Phrases they reuse and should keep (no more than 8), and words they never use or that would sound wrong.
   - Reading level (plain, standard or complex), spelling (UK unless the writing is clearly US), their sign-off, and how much emoji they use (none, sparing, often).
   - How the voice should shift by channel: email, social post, social reply, review reply, chat.
3. Keep the situational tone rules, adjusting the wording to their voice:
   complaint → calm, accountable, no humour, no blame; praise → warm and brief; B2B enquiry → crisp and professional; distressed or vulnerable customer → gentle, and escalate to the founder.
4. Always include in `avoid_phrases` anything that would break UK advertising rules: guarantees, "best"/"number one", invented urgency.
5. Call `propose_voice_from_analysis` once. In `changes`, say in one or two sentences how this differs from the current voice and which sources it came from.
6. Finish with a short summary for the founder.
