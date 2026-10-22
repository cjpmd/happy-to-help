---
name: social-post
description: Plan, write and publish a single social media post for the company, using its performance data to choose the angle. Use this whenever the task involves social media, marketing posts, growing a waitlist or audience, or "what should we post", even if a post isn't explicitly requested.
---

# Social post playbook

Follow these steps in order.

## 1. Decide the angle from evidence
- Call the `get_metrics` tool. Rank past angles by signups per click, not by clicks alone.
- Reuse the winning angle with a fresh hook. Don't just repeat the old post.
- If there is no data yet, pick the angle closest to the customer's main pain in CLAUDE.md.

## 2. Write the post
- Follow the brand voice in CLAUDE.md. 40–80 words, one clear call to action.
- Add a tracked link: the website URL plus `?utm_source=<platform>&utm_medium=social&utm_campaign=<angle>`.
- One or two relevant hashtags at most.

## 3. Check before publishing (UK rules)
Reject and rewrite the draft if it:
- promises results or grades (misleading under the CAP Code);
- uses unverifiable superlatives ("best", "#1");
- invents statistics, testimonials or urgency;
- targets children directly with pressure to buy. Address parents for anything about payment.

## 4. Publish
- Call `publish_post` once with the final text, the platform and the angle.
- The founder must approve it. If she declines, do not retry. Report the draft and ask what she'd change.

## 5. Report
Finish with: the angle chosen and why (one sentence with the numbers), the post, and whether it was published.
