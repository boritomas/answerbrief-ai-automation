# NAIP-OS Production Email Service

Resend is the official NAIP-OS outbound transactional email provider.

## Provider

- Provider: Resend
- Shared service: `lib/email.ts`
- Product templates: product-specific modules such as `lib/answerbrief-emails.ts`
- Production API key: `RESEND_API_KEY`

Gmail OAuth is not used for outbound transactional email.

## Product Configuration

Each product configures only:

- `PRODUCT_NAME`
- `FROM_ADDRESS`
- `FROM_NAME`
- `REPLY_TO`
- templates

AnswerBrief AI production values:

```text
PRODUCT_NAME=AnswerBrief AI
FROM_ADDRESS=hello@answer-brief.com
FROM_NAME=AnswerBrief AI
REPLY_TO=hello@answer-brief.com
```

## Sender Standard

Official AnswerBrief sender:

```text
AnswerBrief AI <hello@answer-brief.com>
```

Official Reply-To:

```text
hello@answer-brief.com
```

## Future Products

The following products should reuse `lib/email.ts` or a package extracted from it:

- AnswerBrief AI
- MixPilot AI
- Tax Buddy
- Tax Appeal Buddy
- Interview Coach
- Workforce Study
- Nieves AI Platform

Products should not implement provider-specific outbound email code. They should provide templates and product-level configuration only.

## DNS and Deliverability

The product domain must be verified in Resend before production use.

Required verification checks:

- Resend domain status: verified
- SPF passes
- DKIM passes
- Production message accepted by Resend
- Received `From` matches the product sender
- Received `Reply-To` matches the product reply address

## Fallback Behavior

If `RESEND_API_KEY` is missing, the service logs the intended message content and returns a skipped result. This supports local development without sending email.

Production must not rely on skipped email delivery.
