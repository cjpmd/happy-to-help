---
name: investor-update
description: Draft the monthly investor update from the company's own numbers: headline metrics, wins, what's next and asks. A draft for the founder to send.
---

# Investor update

1. Call `get_investor_facts`. Use only those facts; never round up, guess or project.
2. Write in plain UK English, under 250 words, in this order:
   - Numbers: revenue (MRR) with the change on last month, visitors and signups, and the stage.
   - Wins: completed work that matters to an investor (customers, launches, hires), at most four.
   - What's next: the one or two goals for next month.
   - Asks: specific and small (an introduction to a type of customer, feedback on pricing).
3. Be honest about a bad month: say what happened and what's being done.
4. Run the claims check on the text and fix anything it flags (no "guaranteed", no unsupported "best").
5. Save it with `save_investor_update`. Nothing is sent: the founder reviews and sends it themselves.
