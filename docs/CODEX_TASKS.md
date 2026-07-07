# Codex Task Backlog

Use one task per Codex run.

## Task 1: Fix checkout UX
Goal: Replace the current direct API links with proper client-side checkout buttons.

Acceptance criteria:
- Package cards show one button each.
- Button redirects to Stripe Checkout.
- Invalid package names show a clean error.
- Build passes.

## Task 2: Add intake form
Goal: Add a real intake form after payment.

Acceptance criteria:
- Form collects name, email, target role, company, interview date, career lane, notes.
- Uses Zod validation.
- Stores data in a local JSON file for dev or a database for production.
- Shows privacy warning before submit.

## Task 3: Add order tracker
Goal: Create basic admin order dashboard.

Acceptance criteria:
- Dashboard shows customer email, package, status, created date, and delivery date.
- Status values: Paid, Intake Pending, In Progress, Delivered, Follow-up Sent.
- Admin page is protected by a simple password or auth provider.

## Task 4: Wire email provider
Goal: Replace console email placeholder with a real provider.

Acceptance criteria:
- Uses environment variables for API keys.
- Sends payment next-steps email.
- Sends delivery email.
- Sends follow-up email after delivery.
- No API keys committed.

## Task 5: Add Google Drive customer folder automation
Goal: Create customer folder after paid order.

Acceptance criteria:
- Folder name format: Customer Name - Target Role - YYYY-MM-DD.
- Folder contains subfolders: Intake, Working Files, Final Delivery.
- Order record stores the folder URL.
- No shared public access by default.

## Task 6: Content calendar generator
Goal: Add a script that generates one month of LinkedIn post drafts.

Acceptance criteria:
- Posts stored in /content/linkedin.
- Topics rotate across telecom, career transition, interview prep, STAR stories, role-fit, and leadership.
- Posts are drafts only. They are not auto-posted.
