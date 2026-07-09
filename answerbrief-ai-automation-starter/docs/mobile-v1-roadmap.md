# AnswerBrief AI Mobile v1.0 Roadmap

## Recommendation

Build AnswerBrief AI Mobile v1.0 as a React Native + Expo companion app for iOS and Android.

The app should support Fit Check, secure intake, order status, brief viewing, support, privacy, terms, and refund access. It should not include App Store, Google Play, Stripe, or external purchase links in v1.0.

## Companion App Model

Mobile v1.0 should be a companion to the existing website purchase flow:

1. Customer purchases on the website.
2. Stripe webhook creates the order.
3. Customer signs into the mobile app with email OTP or magic link.
4. The app shows orders that match the authenticated email.
5. The customer completes intake, uploads documents, tracks status, and views the completed brief.

This keeps the first mobile release focused on customer experience without introducing store payment policy risk.

## Payment Policy Position

Use option A for v1.0: keep purchases on the website and make the app a companion app.

Do not implement Apple or Google in-app purchases for v1.0. Do not place Stripe payment links, pricing checkout buttons, or external purchase CTAs inside mobile flows.

Reasons:

- AnswerBrief AI sells a digital interview preparation deliverable, which creates App Store and Google Play billing risk if purchased inside the app.
- A companion app can safely let customers access orders and content purchased elsewhere when the app does not steer users to external payment.
- In-app purchases would add product mapping, refunds, entitlement sync, store review complexity, and margin impact before the mobile product has proven demand.

## Backend Upgrades Required

Phase 1 in this repository adds the foundation:

- Order storage adapter interface.
- Current JSON file order store behind the adapter.
- Database-ready models for users, orders, order events, intake submissions, uploads, briefs, and push tokens.
- Mobile-safe API route stubs.
- Placeholder OTP session flow that does not expose admin passwords or permanent intake tokens.
- Customer order access controlled by authenticated email.

Before building the app, move production storage from `data/orders.json` to a durable database such as Supabase Postgres, Neon Postgres, or another managed Postgres provider.

## Mobile API List

- `POST /api/mobile/auth/start`
- `POST /api/mobile/auth/verify`
- `GET /api/mobile/me`
- `POST /api/mobile/fit-check`
- `GET /api/mobile/orders`
- `GET /api/mobile/orders/[id]`
- `POST /api/mobile/orders/[id]/intake`
- `POST /api/mobile/uploads/presign`
- `POST /api/mobile/orders/[id]/uploads`
- `GET /api/mobile/orders/[id]/brief`
- `GET /api/mobile/orders/[id]/events`
- `POST /api/mobile/push-token`
- `POST /api/mobile/support`

## Authentication Plan

Use email OTP or magic link authentication for customers.

Rules:

- Never expose admin passwords to mobile.
- Do not use permanent query-string intake tokens as mobile login.
- Match order access by authenticated customer email.
- Use short-lived bearer tokens or secure mobile sessions.
- Add rate limiting before production mobile launch.
- Add audit logging for sign-in attempts and sensitive actions.

Current implementation includes safe placeholder logic:

- OTP start accepts an email and returns a generic response.
- OTP verify only issues a token when `MOBILE_AUTH_SECRET` and `MOBILE_AUTH_STUB_OTP` are configured.
- This should be replaced with a real OTP provider before mobile release.

## Store Checklist

### App Store

- App name and subtitle.
- App icon in required sizes.
- iPhone screenshots.
- iPad screenshots if iPad support is enabled.
- Privacy policy URL.
- Terms URL.
- Support URL.
- App Privacy nutrition labels.
- Sign-in demo account for review.
- No purchase or external checkout CTA inside the app.
- Clear explanation that existing customers can access their purchased interview prep.
- Accessibility review for font scaling, contrast, labels, and touch targets.

### Google Play

- App name and short description.
- Feature graphic.
- Phone screenshots.
- Tablet screenshots if tablet support is enabled.
- Privacy policy URL.
- Data Safety form.
- Support contact.
- Test account for review.
- No in-app external payment steering for digital services.
- Content rating questionnaire.
- Closed testing track before production.

## Required Mobile Assets

- App icon.
- Adaptive Android icon.
- Splash screen.
- Light theme color palette.
- Screenshots for:
  - Fit Check
  - Intake
  - Order status
  - Brief viewer
  - Support/privacy
- Optional short app preview video after MVP is stable.

## Risks and Blockers

- `data/orders.json` is not durable enough for production mobile use.
- Direct mobile upload storage is not configured yet.
- Push tokens are accepted by a route stub but not persisted.
- Support messages are accepted by a route stub but not routed to email/helpdesk.
- Brief viewing currently depends on generated Drive URLs.
- OTP delivery is not connected to a provider yet.
- Rate limiting and abuse protection are still required.
- The brief generation workflow currently supports fallback generation and should be upgraded before a broader mobile launch.
- Store review risk increases if any mobile flow includes purchase, pricing checkout, Stripe links, or instructions to buy elsewhere.

## Suggested Development Phases

### Phase 1: Backend hardening

- Add storage adapter and database-ready models.
- Add mobile route stubs.
- Add email-matched customer access rules.
- Document the mobile architecture.

### Phase 2: Durable data and auth

- Move orders to Postgres.
- Add user table and OTP provider.
- Add secure object storage for uploads.
- Persist push tokens and support requests.
- Add rate limiting and audit logs.

### Phase 3: Expo app MVP

- Create React Native + Expo app.
- Add onboarding and OTP login.
- Add Fit Check.
- Add order list and order detail.
- Add intake form and uploads.
- Add brief viewer/download.
- Add support, privacy, terms, and refund screens.

### Phase 4: Mobile polish and store readiness

- Add push notifications for order status.
- Add analytics and crash reporting.
- Complete accessibility pass.
- Prepare screenshots, icons, and review notes.
- Submit TestFlight and Google Play closed testing.

### Phase 5: Launch

- Release to a small customer group.
- Monitor auth, uploads, delivery status, crashes, and support requests.
- Iterate before wider App Store and Google Play promotion.
