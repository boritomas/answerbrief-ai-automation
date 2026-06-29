You are working in the `boritomas/answerbrief-ai-automation` repo.

Goal:
Set up the first production-ready MVP workflow for AnswerBrief AI using Stripe Payment Links first, not custom Stripe Checkout.

Business context:
AnswerBrief AI sells role-specific interview prep packages for telecom and regulated-career candidates.

Packages:

* Quick Prep: $49
* Full Interview Brief: $149
* Premium Prep: $299

Task:
Update the app so the package buttons can use Stripe Payment Links from environment variables.

Requirements:

1. Keep the current package cards.
2. Add environment variables for:

   * NEXT_PUBLIC_STRIPE_QUICK_PREP_LINK
   * NEXT_PUBLIC_STRIPE_FULL_INTERVIEW_BRIEF_LINK
   * NEXT_PUBLIC_STRIPE_PREMIUM_PREP_LINK
3. Update the package buttons so each one links to the right environment variable.
4. If an environment variable is missing, show a disabled-looking button that says “Payment link coming soon.”
5. Keep the Stripe Checkout API route in place for future use, but do not make it the primary MVP path.
6. Update `.env.example`.
7. Update README with clear setup instructions.
8. Do not add real Stripe keys.
9. Do not remove privacy or guardrail language.
10. Confirm `npm run build` works.

Acceptance criteria:

* Home page loads.
* Package cards display.
* Buttons use Payment Link environment variables.
* Missing links do not break the page.
* `.env.example` includes the new variables.
* README explains how to add Stripe Payment Links.
* Open a PR with a short summary of what changed.
