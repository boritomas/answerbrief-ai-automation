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
npm run build
```

`npm run build` runs `expo export --platform all`.

## EAS readiness

`app.config.ts` and `eas.json` are included. Before store builds:

1. Create an Expo/EAS project.
2. Set `EXPO_PUBLIC_EAS_PROJECT_ID` or let EAS inject the project ID.
3. Replace placeholder app icon and splash artwork with final production assets.
4. Configure Apple and Google signing credentials.
5. Provide a store-review test account and OTP instructions.

## Store policy position

Mobile v1 is a companion app only. It lets existing customers access Fit Check, intake, order status, and completed brief delivery. It does not direct users to external checkout or sell digital services inside the app.
