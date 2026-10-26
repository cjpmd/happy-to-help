---
name: social-post
description: Plan, write and propose a single social media post for the company, using its performance data to choose the angle. Use this whenever the task involves social media, marketing posts, growing a waitlist or audience, or "what should we post", even if a post isn't explicitly requested.
---

# Social post playbook

Follow these steps in order.

## 1. Decide the angle from evidence

- Call `get_metrics`. Rank past angles by signups per click, not by clicks alone.
- Reuse the winning angle with a fresh hook. Don't just repeat the old post.
- If there is no data yet, pick the angle closest to the customer's main pain in CLAUDE.md.
- Pick the channel the winning angle did best on, from the company's channels.

## 2. Write the post

- Follow the brand voice in CLAUDE.md. 40–80 words, one clear call to action.
- Add a tracked link: the website URL plus `?utm_source=<platform>&utm_medium=social&utm_campaign=<angle>`.
- One or two relevant hashtags at most.
- Never mention a feature listed under "Not built yet" in CLAUDE.md.

## 3. Check before proposing (UK rules)

Use the claims-check skill, then rewrite the draft if it:

- promises results or grades (misleading under the CAP Code);
- uses unverifiable superlatives ("best", "#1");
- invents statistics, testimonials or urgency;
- targets children directly with pressure to buy. Address parents for anything about payment.

## 4. Propose

- Call `propose_post` once with the channel, the final text, the angle and a one-sentence reason with the numbers behind it.
- It goes to the founder's GO / NO-GO queue. Don't try to publish it any other way, and don't propose the same post twice.

## 5. Report

Finish with: the angle chosen and why (one sentence with the numbers), the post, and that it's waiting for approval.
