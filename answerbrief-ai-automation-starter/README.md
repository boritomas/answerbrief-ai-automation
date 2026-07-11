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
APP_BASE_URL=http://localhost:3000
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEXT_PUBLIC_STRIPE_QUICK_PREP_LINK=
NEXT_PUBLIC_STRIPE_FULL_INTERVIEW_BRIEF_LINK=
NEXT_PUBLIC_STRIPE_PREMIUM_PREP_LINK=
ADMIN_DASHBOARD_PASSWORD=
PREP_INTERVIEW_WORKSPACE_URL=
SUPPORT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
GOOGLE_DRIVE_ROOT_FOLDER_ID=
GOOGLE_DRIVE_FOLDER_ROOT_ID=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
RESEND_API_KEY=
PRODUCT_NAME=AnswerBrief AI
FROM_ADDRESS=hello@answer-brief.com
FROM_NAME=AnswerBrief AI
REPLY_TO=hello@answer-brief.com
OPENAI_API_KEY=
```

In Stripe, create one Payment Link for each package:

- Interview Essentials - $49
- Interview Professional - $149
- Executive Interview Strategy - $299

Paste those URLs into `.env.local`. If a Payment Link variable is blank, the matching package card will show `Payment link coming soon` instead of sending customers to a broken URL.

## Order and intake automation

Stripe sends paid orders to `app/api/stripe/webhook/route.ts`. When a `checkout.session.completed` event arrives, the app:

1. Creates a local order record in `data/orders.json`.
2. Captures customer email, customer name when available, package, amount paid, and Stripe IDs.
3. Generates a secure intake token.
4. Creates a Google Drive workspace when Drive is configured.
5. Builds a customer-specific intake link.
6. Sends the next-steps email with that intake link.

For local development, order and intake records are stored in `data/orders.json`. The `data` folder is ignored by git so customer details are not committed.

Set `PREP_INTERVIEW_WORKSPACE_URL` to the workspace you use for prep operations, such as a ChatGPT Project URL, Google Drive folder, or internal tracker. The app stores that link on new orders so the admin tracker can point you back to the prep workspace. ChatGPT Projects do not currently expose a direct app API for programmatically filing customer materials inside a personal ChatGPT folder, so this URL is a bridge until you add OpenAI file storage.

## Google Drive customer folders

For production file tracking, connect Google Drive with either a service account or OAuth refresh token.

Service account variables:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_DRIVE_ROOT_FOLDER_ID`

OAuth variables:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `GOOGLE_DRIVE_FOLDER_ROOT_ID`

Create a root Drive folder named `AnswerBrief AI`, share that folder with the configured Google identity, and paste the root folder ID into `GOOGLE_DRIVE_FOLDER_ROOT_ID` or `GOOGLE_DRIVE_ROOT_FOLDER_ID`.

When Drive is configured, paid orders create a provisional customer folder under the root folder. The app also creates:

- `01 Intake`
- `02 Source Materials`
- `03 Working Files`
- `04 Final Delivery`
- `05 Follow Up`

When the customer submits intake, the app renames the customer folder to:

```text
AnswerBrief - Customer Name - Target Role - YYYY-MM-DD
```

The intake workflow uploads an intake summary plus submitted resume/job description files into the customer folder. The generated brief is uploaded there as Markdown.

## Brief generation and delivery

After intake is submitted, the app:

1. Marks intake complete.
2. Uploads allowed files to Drive when configured.
3. Starts brief generation.
4. Generates a structured Markdown brief.
5. Uploads the generated brief to Drive when configured.
6. Sends a delivery email with the Drive link when the NAIP-OS email service is configured.
7. Logs fallback/skipped states for manual review when email or Drive is not configured.

The current brief generator is a clean fallback implementation. It produces a structured, realistic interview-prep brief without claiming full AI resume parsing. `OPENAI_API_KEY` is reserved for a future real AI generation adapter.

## NAIP-OS transactional email

Resend is the official NAIP-OS outbound email provider. The payment webhook, intake workflow, delivery workflow, owner notifications, and mobile OTP flow send through Resend when these variables are set:

- `RESEND_API_KEY`
- `PRODUCT_NAME`
- `FROM_ADDRESS`
- `FROM_NAME`
- `REPLY_TO`

AnswerBrief AI production should use:

```text
PRODUCT_NAME=AnswerBrief AI
FROM_ADDRESS=hello@answer-brief.com
FROM_NAME=AnswerBrief AI
REPLY_TO=hello@answer-brief.com
```

Do not commit `RESEND_API_KEY`; keep it in `.env.local` or your production host's secret manager. If Resend is not configured, the app logs email content to the server console so local testing still works.

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
