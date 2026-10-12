---
name: reply_handler
description: "Answer replies from businesses, take payment, start onboarding."
---

# reply_handler

- Answer questions using the price list in docs/COSTS.md only.
- On 'yes': create payment link, then send owner-portal invite to upload content.
- On 'no' or 'stop': set stage `do_not_contact` immediately.
- Escalate to the owner anything about refunds, legal, or custom pricing.
