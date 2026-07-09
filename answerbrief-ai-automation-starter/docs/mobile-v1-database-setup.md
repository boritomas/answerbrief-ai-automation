# AnswerBrief AI Mobile v1.0 Database Setup

This guide prepares durable production storage for the future React Native + Expo companion app.

## 1. Create a Supabase project

1. Create a new Supabase project for AnswerBrief AI production.
2. Choose the same region you normally use for Vercel production when possible.
3. Wait for the project database to finish provisioning.
4. Open the SQL editor.

## 2. Apply the schema

1. Open `docs/sql/supabase-mobile-v1.sql`.
2. Paste the full SQL into the Supabase SQL editor.
3. Run the script.
4. Confirm these tables exist:
   - `users`
   - `orders`
   - `order_events`
   - `intake_submissions`
   - `uploads`
   - `briefs`
   - `push_tokens`
   - `support_requests`

## 3. Configure Vercel environment variables

Add these variables to the production Vercel project:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_ANON_KEY
```

Do not expose `SUPABASE_SERVICE_ROLE_KEY` to client-side code. It is only for server routes and storage adapters.

The app will use Supabase storage only when all three variables are present. If any are missing, it safely falls back to the existing JSON order store.

## 4. Verify the connection

1. Deploy the site after adding the variables.
2. Complete a low-risk checkout or replay a Stripe test event in a non-production environment.
3. Verify a row appears in the `orders` table.
4. Sign into a mobile API session in a staging environment and call:

```text
GET /api/mobile/orders
```

5. Confirm the endpoint returns the authenticated email's orders only.

## 5. Fallback behavior

If Supabase variables are not configured, the app keeps using:

```text
data/orders.json
```

This preserves the current website, Stripe webhook, intake flow, and admin order tracker while the mobile database is being prepared.

## 6. Rollback plan

If Supabase storage has a production issue:

1. Remove or temporarily unset `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, or `SUPABASE_ANON_KEY` in Vercel.
2. Redeploy production.
3. The storage selector will return to the JSON store.
4. Keep the Supabase project intact for inspection and data reconciliation.

## 7. Before the Expo app build

Complete these items before starting the mobile app:

- Migrate existing `data/orders.json` orders into Supabase.
- Connect real email OTP or magic-link delivery.
- Add production rate limiting.
- Add direct object storage for mobile uploads.
- Persist intake submissions, upload records, brief records, push tokens, and support requests in the database.
- Add monitoring for Supabase request failures.
- Keep purchases on the website and do not add mobile Stripe checkout links.
