# AnswerBrief AI Mobile v1 Release Readiness

AnswerBrief AI Mobile v1 is a companion app for existing AnswerBrief AI customers. Purchases, package selection, pricing, and checkout remain on the public website. The mobile app focuses on account access, Fit Check, post-purchase intake, document upload, order status, brief viewing, support, and account deletion requests.

## Store Review Notes

### App Store Connect Review Notes

AnswerBrief AI is an interview-preparation companion app. Users sign in with their email and one-time verification code to access existing AnswerBrief AI orders, submit post-purchase intake information, upload resume/job-posting documents, view order status, and open completed interview briefs.

The app does not sell digital goods or services, does not include Stripe checkout, does not include package pricing, does not include buy buttons, and does not direct users to external purchase flows. Purchases are completed separately on the AnswerBrief AI website before app use.

Reviewer test steps:

1. Open the app and select sign in.
2. Enter the provided reviewer email.
3. Enter the provided one-time code.
4. Open Orders to view the test order.
5. Open Intake to submit role details and optional documents.
6. Open Brief when a test brief is available.
7. Use Support or Account deletion request from the Account tab.

Required before submission:

- Provide Apple reviewer test email.
- Provide Apple reviewer OTP or enable a reviewer-specific OTP flow.
- Confirm the test account has at least one non-production/synthetic order.
- Confirm uploaded reviewer documents are deleted after review.

### Google Play Review Notes

AnswerBrief AI Mobile is a companion app for interview preparation customers. It supports login, Fit Check, intake, file upload, order status, completed brief viewing, support, and account deletion requests.

The app does not include in-app purchases, external purchase CTAs, checkout, or pricing pages. Purchases are handled by the website outside the mobile app.

Reviewer test steps match the App Store notes above.

## Store Listing Copy

### Short Description

Access your AnswerBrief AI interview prep, intake, order status, and completed brief from your phone.

### Full Description

AnswerBrief AI helps professionals prepare for interviews with structured, role-specific interview strategy briefs. The mobile companion app lets existing customers complete intake, upload resume and job-posting materials, track order progress, view completed briefs, and contact support.

Features:

- Email one-time-code sign in
- Free interview Fit Check
- Post-purchase intake
- Resume and job-posting upload
- Order status and timeline
- Completed brief viewer
- Brief sharing and download support
- Push notification registration for brief-ready updates
- Support and account deletion request flow
- Privacy, Terms, and Refund links

AnswerBrief AI provides interview preparation materials only. It does not guarantee interviews, job offers, promotions, or hiring outcomes.

## App Metadata

- Expo account: `tomasnieves`
- Expo project: `AnswerBrief AI`
- App display name: `AnswerBrief AI`
- iOS bundle identifier: `com.nieveslabs.answerbriefai`
- Android package name: `com.nieveslabs.answerbriefai`
- Version: `1.0.0`
- iOS build number: `1`
- Android version code: `1`
- Runtime version policy: app version
- Production API base URL: `https://www.answer-brief.com`
- Privacy policy URL: `https://www.answer-brief.com/privacy`
- Terms URL: `https://www.answer-brief.com/terms`
- Refund policy URL: `https://www.answer-brief.com/refund`
- Support email: `support@answer-brief.com`

## Assets

Included assets:

- `assets/icon.png`: 1024x1024 app icon
- `assets/adaptive-icon.png`: 1024x1024 Android adaptive icon foreground
- `assets/splash.png`: 2048x2048 splash image
- `assets/feature-graphic.png`: 1024x500 Google Play feature graphic draft

The feature graphic is suitable for internal testing setup. Final store marketing screenshots should still be captured from real device or simulator builds after EAS credentials are active.

## Screenshot Plan

Capture real device screenshots for:

1. Welcome/onboarding
2. Email sign in
3. Fit Check form
4. Fit Check results
5. Orders list
6. Order detail/status timeline
7. Intake and upload screen
8. Completed brief viewer
9. Support/account screen

Required sizes:

- iPhone 6.7-inch
- iPhone 6.5-inch or 6.1-inch fallback if required by App Store Connect
- iPad if listing as iPad-compatible
- Android phone
- Android tablet only if tablet distribution is enabled

## Privacy and Data Safety

Data collected or processed:

- Email address
- Name
- Resume or uploaded career documents
- Target role and target company
- Job posting text or uploaded job posting
- Interview date and notes
- Support messages
- Push notification token
- Order and brief status

Purpose:

- Account access
- Interview-preparation intake
- Order fulfillment
- Customer support
- Brief-ready notifications

Storage:

- Session token stored in device secure storage.
- Customer order and intake records are stored server-side.
- Uploaded documents are stored through the production Google Drive OAuth workflow when configured.

Data not collected:

- Payment card details in the mobile app
- Precise location
- Contacts
- Health data
- Advertising identifiers for ad tracking

Required store disclosures:

- User content: documents/files and text provided by the user
- Contact info: email address and optional name
- App activity: support/account actions if logged server-side
- Diagnostics: crash data if crash reporting is added before release

Account deletion:

- In-app account deletion request flow is available from Account.
- Users can also email support@answer-brief.com.

## Test Plan

### Functional

- Start auth with valid email
- Verify auth with valid OTP
- Reject invalid OTP
- Load current user
- Submit Fit Check
- Load empty order state
- Load order list for a customer with orders
- Load order detail
- Submit intake
- Upload resume
- Upload job posting
- Load events timeline
- View completed brief
- Share/open brief link
- Submit support request
- Register push token on physical device
- Request account deletion
- Log out

### Failure Handling

- API unavailable
- Expired token
- Unauthorized order access
- Missing required intake fields
- Upload too large
- Drive upload failure
- Brief not ready
- Support request failure
- Offline/poor network

### Accessibility

- VoiceOver/TalkBack navigation
- Large text readability
- Touch targets at least 44px high
- High contrast on primary actions
- Clear error and empty states
- No purchase or checkout language in mobile UI

## Security Checklist

- No secrets committed.
- No service-role keys in the mobile bundle.
- API base URL uses HTTPS.
- Session token uses Expo SecureStore.
- Mobile APIs require bearer token for customer/order data.
- Order access is checked against authenticated email.
- Logs do not print tokens, documents, or secrets.
- Uploaded files are sent only to authenticated order routes.

## Current Production Dependencies

- Production website and checkout: https://www.answer-brief.com
- Mobile API base URL: https://www.answer-brief.com
- Supabase-backed order storage
- Resend notifications
- Google Drive OAuth document storage
- Expo push notification credentials before production push delivery

## Known Release Blockers

- Apple Developer account access and legal agreements must be active before TestFlight upload.
- Google Play Console account access and legal agreements must be active before internal testing upload.
- EAS account/project authentication is required to generate cloud builds. This local environment currently returns `Not logged in` for `eas whoami`.
- `EXPO_PUBLIC_EAS_PROJECT_ID` must be set to the existing Expo project ID so EAS Update and Expo push tokens are project-bound in production builds.
- Reviewer test account and OTP instructions must be prepared before app submission.
- Push notification credentials must be configured for production push delivery.
