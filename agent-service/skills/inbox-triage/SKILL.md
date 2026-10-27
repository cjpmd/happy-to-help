---
name: inbox-triage
description: Read one customer message and record its category, sentiment, urgency, language and the flags that force escalation. No drafting.
---

# Inbox triage

1. Call `get_inbox_item`.
2. Choose one category: general_enquiry, pricing_question, complaint, refund_request, booking, review_positive, review_negative, legal_threat, press, spam.
3. Set the flags that apply, and err on the side of setting them. Any one sends the message to the founder:
   - `money`: refunds, charges, compensation, payment disputes.
   - `legal`: solicitors, court, trading standards, threats of action.
   - `safety`: allergic reactions, illness, injury, anything unsafe.
   - `vulnerable`: distress, bereavement, someone who seems at risk. Never treat these as routine.
   - `data_request`: access, correction or deletion of personal data (UK GDPR).
   - `unverified_claim`: they quote a claim we may have made ("your site said guaranteed…").
   - `spam`: unsolicited sales, scams.
4. Sentiment (positive, neutral, negative), urgency (high for safety, legal, distress or same-day needs) and the language code.
5. Call `save_triage` once. It applies the company's response policy and the hard rules; you don't decide whether to reply.
