# AnswerBrief AI Automation Starter

This repo is the first automation layer for AnswerBrief AI.

It includes:
- A simple Next.js website
- Package/pricing setup
- Stripe Checkout route
- Stripe webhook skeleton
- Customer intake workflow
- Email templates
- Codex task backlog
- Security and privacy guardrails
- LinkedIn launch content queue

## Recommended MVP flow

1. Customer lands on the website.
2. Customer picks a package.
3. Customer pays through a Stripe Payment Link.
4. Payment success triggers the next-step email.
5. Customer completes intake and uploads allowed materials.
6. AnswerBrief AI creates the interview prep package.
7. Delivery email sends the final brief.
8. Follow-up email asks for feedback/testimonial.

## Important boundaries

Do not use Verizon confidential materials.
Do not use employer-confidential documents.
Do not promise job placement.
Do not collect passwords, SSNs, bank details, or protected personal data.
Do not automate LinkedIn posting without review.

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000.

## Stripe setup

Start with Stripe Payment Links for the MVP. The package buttons read their Payment Link URLs from public environment variables, so the site can go live without custom Checkout logic.

The included Checkout API route is still available for a future custom Stripe Checkout flow, but it is not the primary MVP path.

Required environment variables:

```bash
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEXT_PUBLIC_STRIPE_QUICK_PREP_LINK=
NEXT_PUBLIC_STRIPE_FULL_INTERVIEW_BRIEF_LINK=
NEXT_PUBLIC_STRIPE_PREMIUM_PREP_LINK=
```

In Stripe, create one Payment Link for each package:

- Quick Prep - $99
- Full Interview Brief - $249
- Premium Prep - $499

Paste those URLs into `.env.local`. If a Payment Link variable is blank, the matching package card will show `Payment link coming soon` instead of sending customers to a broken URL.

## Codex use

Once this repo is in GitHub or GitLab, assign Codex one task at a time from `docs/CODEX_TASKS.md`.

Start with:
1. Wire checkout buttons to package cards.
2. Add intake form persistence.
3. Add email provider.
4. Add admin order dashboard.
