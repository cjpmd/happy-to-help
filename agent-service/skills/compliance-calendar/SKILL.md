---
name: compliance-calendar
description: Keep a UK small company's compliance calendar complete and current: Companies House, HMRC, ICO and PECR deadlines, with anything overdue flagged.
---

# Compliance calendar

1. Call `get_compliance`: the calendar as it is, and the usual UK deadlines worked out from when the company started.
2. Compare them. Add what's missing with `add_compliance_items` (title, category, due date, and whether it's a legal requirement). Don't add duplicates of anything already there, even worded differently.
3. Only add deadlines that apply. VAT returns and PAYE only if the company is registered for them (if you can't tell, say so rather than adding them). Don't invent deadlines.
4. Finish with two or three plain sentences: what's due in the next 60 days, what's overdue, and that dates should be confirmed with their accountant, especially the first year's accounts. This isn't tax or legal advice.
