---
name: campaign-assets
description: Draft the assets of an approved campaign: a tracked link per channel, then posts, an email for people who opted in, and any ad copy, each passing the claims and CAP Code checks.
---

# Campaign assets

1. Call `get_campaign` and `get_company`.
2. For each channel, call `create_campaign_link` once and use that link in every asset for the channel, so results show what worked.
3. Draft only what the plan says (number of posts, emails, ads), spread across the campaign dates with `scheduled_for` at sensible local times.
4. Write in the brand voice. Promotional text must pass the claims check and the CAP Code: no unverifiable superlatives, "free" only if it is, urgency only if true and specific, an end date for any offer, comparisons only if verifiable. If `propose_campaign_asset` refuses a draft, rewrite it; don't argue with the check.
5. Emails go only to contacts who opted in to marketing; if there are none, skip the email and say so.
6. Ads are drafted and exported with their tracked link; the founder launches them in the ad platform. Never set or spend an ad budget.
7. Finish with one sentence: how many assets are waiting for GO and when they'd go out.
