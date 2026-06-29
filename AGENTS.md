# AnswerBrief AI - Codex Instructions

## Business Summary

AnswerBrief AI is a service-first, AI-assisted interview prep business.

It creates role-specific interview prep packages based on a candidate's resume, target job posting, and career story.

Core promise:
Resume + job posting in. Interview brief out.

Target niches:

* Telecom
* Federal
* Finance
* Audit
* Compliance
* Operations
* Product
* Leadership roles

AnswerBrief AI should not be positioned as a cheap generic AI interview app. It should be positioned as a personalized interview brief service that sits between low-cost AI interview tools and expensive human coaching.

## Current MVP Pricing

Use Founding Customer Pricing:

1. Quick Prep - $49
   CTA: Start Quick Prep
   Purpose: A focused role-specific prep snapshot for one upcoming interview.

2. Full Interview Brief - $149
   CTA: Get Full Interview Brief
   Badge: Most Popular
   Purpose: The main offer and best-value package.

3. Premium Prep - $299
   CTA: Book Premium Prep
   Purpose: A deeper prep package for higher-stakes interviews or candidates who want extra support.

Do not use the old pricing:

* $99
* $249
* $499

## Stripe Payment Link Variables

Use these environment variables:

* NEXT_PUBLIC_STRIPE_QUICK_PREP_LINK
* NEXT_PUBLIC_STRIPE_FULL_INTERVIEW_BRIEF_LINK
* NEXT_PUBLIC_STRIPE_PREMIUM_PREP_LINK

If a payment link is missing, the page should not break. Show a disabled-looking button that says:
Payment link coming soon.

## Website Tone

Keep the tone:

* Clear
* Human
* Trustworthy
* Direct
* Plain English

Avoid:

* AI buzzwords
* Overpromising
* Corporate jargon
* Fake urgency
* Guaranteed job outcome claims

## Required Guardrails

Never add:

* Verizon-specific confidential content
* Employer-confidential material
* Customer confidential data
* Job guarantee language
* Claims that AnswerBrief guarantees interviews, offers, or hiring outcomes

The website must clearly warn users not to upload:

* SSNs
* Passwords
* Bank data
* Confidential employer files
* Sensitive personal documents

## Technical Guidance

Keep the MVP simple.

Prefer:

* Static website pages
* Simple package cards
* Stripe Payment Links
* Clear privacy language
* Easy future edits

Avoid unless explicitly requested:

* Complex backend flows
* Custom checkout logic
* Database setup
* User accounts
* API-heavy architecture
* Paid services beyond Stripe links and hosting

## Build Expectations

Before finishing any code task:

* Run install/build checks when available
* Confirm the page still loads
* Summarize changes in plain English
* Open a pull request when possible
