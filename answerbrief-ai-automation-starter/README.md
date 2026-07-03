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
2. Customer can start with a free Interview Fit Check or pick a paid package.
3. Customer pays through a Stripe Payment Link when they choose a paid package.
4. Payment success triggers the next-step email.
5. Customer completes the intake form and submits allowed materials.
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
NEXT_PUBLIC_FREE_FIT_CHECK_LINK=
ADMIN_DASHBOARD_PASSWORD=
PREP_INTERVIEW_WORKSPACE_URL=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
GOOGLE_DRIVE_ROOT_FOLDER_ID=
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
GMAIL_SENDER_EMAIL=
```

In Stripe, create one Payment Link for each package:

- Quick Prep - $49
- Full Interview Brief - $149
- Premium Prep - $299

Paste those URLs into `.env.local`. If a Payment Link variable is blank, the matching package card will show `Payment link coming soon` instead of sending customers to a broken URL.

## Free Interview Fit Check setup

The homepage includes a lightweight free lead-generation offer:

```text
Free Interview Fit Check
```

The app includes a built-in `/fit-check` form for this offer. The homepage CTA reads from:

```bash
NEXT_PUBLIC_FREE_FIT_CHECK_LINK=
```

Recommended production value:

```bash
NEXT_PUBLIC_FREE_FIT_CHECK_LINK=https://answerbrief-ai-automation-riwu.vercel.app/fit-check
```

If the variable is blank, the homepage shows `Fit check link coming soon` so the page does not break.

The free fit check should collect only the minimum useful context:

- Resume
- Target role or job posting
- Optional interview notes

Do not request SSNs, passwords, bank data, confidential employer files, or sensitive personal documents.

## Closed-loop learning

Use the free fit check and paid delivery workflow to improve AnswerBrief AI over time:

- Track what candidates ask for
- Track which package they choose
- Ask what helped after delivery
- Use feedback to improve packages, pricing, and messaging

## Order and intake automation

Stripe sends paid orders to `app/api/stripe/webhook/route.ts`. When a `checkout.session.completed` event arrives, the app:

1. Creates a local order record in `data/orders.json`.
2. Marks the order as `Intake Pending`.
3. Builds a customer-specific intake link.
4. Sends the next-steps email placeholder with that intake link.

For local development, order and intake records are stored in `data/orders.json`. The `data` folder is ignored by git so customer details are not committed.

Set `PREP_INTERVIEW_WORKSPACE_URL` to the workspace you use for prep operations, such as a ChatGPT Project URL, Google Drive folder, or internal tracker. The app stores that link on new orders so the admin tracker can point you back to the prep workspace. ChatGPT Projects do not currently expose a direct app API for programmatically filing customer materials inside a personal ChatGPT folder, so this URL is a bridge until you add OpenAI file storage.

## Google Drive customer folders

For production file tracking, connect a Google service account to Drive and set:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_DRIVE_ROOT_FOLDER_ID`

Create a root Drive folder named `AnswerBrief AI`, share that folder with the service account email, and paste the root folder ID into `GOOGLE_DRIVE_ROOT_FOLDER_ID`.

When Drive is configured, paid orders create a provisional customer folder under the root folder. The app also creates:

- `01 Intake`
- `02 Source Materials`
- `03 Working Files`
- `04 Final Delivery`
- `05 Follow Up`

When the customer submits intake, the app renames the customer folder to:

```text
Customer Name - Target Role - YYYY-MM-DD
```

The order tracker stores and displays the customer Drive folder URL.

## Gmail next-step emails

The payment webhook sends the customer their private intake link with Gmail when these variables are set:

- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`
- `GMAIL_SENDER_EMAIL`

Use a Google OAuth client with Gmail API access and a refresh token for the sender account. The token must include permission to send mail. Do not commit those values; keep them in `.env.local` or your production host's secret manager.

If Gmail is not configured, the app logs the next-step email and intake link to the server console so local testing still works.

For local testing only, open the intake form directly at:

```text
http://localhost:3000/intake
```

In production, customers should normally reach intake from the payment success flow or the next-steps email after Stripe confirms payment.

Open the local admin order tracker at:

```text
http://localhost:3000/admin/orders?password=YOUR_ADMIN_DASHBOARD_PASSWORD
```

## Codex use

Once this repo is in GitHub or GitLab, assign Codex one task at a time from `docs/CODEX_TASKS.md`.

Start with:
1. Wire checkout buttons to package cards.
2. Add intake form persistence.
3. Add email provider.
4. Add admin order dashboard.
