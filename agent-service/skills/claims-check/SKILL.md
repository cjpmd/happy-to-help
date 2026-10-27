---
name: claims-check
description: Check any public-facing text (posts, emails, site copy, ads) against UK advertising rules before proposing it. Use this every time you write text a customer or the public will read.
---

# Claims check

Public text must pass the claims checker before the founder can approve it (the GO button stays disabled otherwise), so check it yourself first.

1. Call `check_claims` with the exact text you plan to propose (for an email, the subject and body together).
2. If it returns flags, rewrite each flagged phrase. Don't swap in a synonym that makes the same claim:
   - **Unverifiable superlative** ("best", "number one", "world-leading"): say what is specific and true instead ("built with 20 Highers students").
   - **Promises results** ("guaranteed", "will improve", "double your"): describe what the product does, not the outcome.
   - **Feature not built yet**: remove it, or say it's coming only if the roadmap shows it planned, without a date.
   - **Regulated claim needs supporting evidence** (regulated sectors: "proven", "clinically", "certified", "approved"): remove it unless CLAUDE.md links the evidence.
3. Run `check_claims` again on the rewrite. Only propose text that passes.
4. Beyond the checker, also avoid (UK CAP Code): invented statistics or testimonials, fake urgency or scarcity, pressure on children to buy, and anything that hides that it's an ad.
5. For email marketing (not replies), only propose sending to people with consent or a valid PECR soft opt-in, and include an unsubscribe line.
