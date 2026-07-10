# AnswerBrief AI Mobile

React Native + Expo companion app for AnswerBrief AI.

This app is intentionally **not** a purchasing app. It does not include Stripe checkout, pricing pages, buy buttons, external purchase CTAs, or in-app purchases. Purchases remain on the web product at `https://www.answer-brief.com`.

## Features

- Welcome and onboarding
- Email OTP / magic-link-ready login flow
- Free Fit Check
- Post-purchase intake
- Resume and job posting document selection
- Resume and job-posting upload through the authenticated mobile API
- Order status and event timeline
- Brief viewer with open/share support
- Push token registration for brief-ready notifications
- Support request form
- Privacy, Terms, and Refund links
- Account deletion request flow

## Backend

The app uses the existing production mobile API:

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

## Local setup

```bash
cd mobile
npm install
cp .env.example .env
npm run start
```

Set `EXPO_PUBLIC_API_BASE_URL` to the API origin you want to test. The default is production:

```bash
EXPO_PUBLIC_API_BASE_URL=https://www.answer-brief.com
```

## Checks

```bash
npm run typecheck
npm run lint
npm run doctor
npm run build
```

`npm run build` exports iOS, Android, and web bundles sequentially.
`npm run lint` runs the mobile release policy check to keep checkout, pricing, local URLs, and server-only secrets out of the app bundle.

## EAS readiness

`app.config.ts` and `eas.json` are included for the existing Expo project owned by `tomasnieves`.

Before store builds:

1. Log in with `npx eas-cli login` using the `tomasnieves` Expo account.
2. Set `EXPO_PUBLIC_EAS_PROJECT_ID` to the existing Expo project ID for AnswerBrief AI.
3. Confirm Apple and Google signing credentials in EAS.
4. Provide a store-review test account and OTP instructions.

Production profiles:

- iOS bundle identifier: `com.nieveslabs.answerbrief`
- Android package: `com.nieveslabs.answerbrief`
- Version: `1.0.0`
- iOS build number: `1`
- Android version code: `1`
- Production API: `https://www.answer-brief.com`

## Store policy position

Mobile v1 is a companion app only. It lets existing customers access Fit Check, intake, order status, and completed brief delivery. It does not direct users to external checkout or sell digital services inside the app.
