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
3. Customer pays through Stripe Checkout or a Stripe Payment Link.
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

Start with Stripe Payment Links if you want the lowest-effort MVP.
Use the included Checkout route when you are ready to connect the site buttons directly to Stripe.

Required environment variables:

```bash
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

## Codex use

Once this repo is in GitHub or GitLab, assign Codex one task at a time from `docs/CODEX_TASKS.md`.

Start with:
1. Wire checkout buttons to package cards.
2. Add intake form persistence.
3. Add email provider.
4. Add admin order dashboard.
