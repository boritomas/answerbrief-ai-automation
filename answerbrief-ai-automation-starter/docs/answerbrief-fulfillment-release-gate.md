# AnswerBrief AI Fulfillment Release Gate

AnswerBrief AI is production-complete only when a paid order can move from payment to delivered brief without Tomas manually opening ChatGPT, downloading files, monitoring email, or starting generation.

## Release gate status

Current implementation adds the server-side fulfillment engine required for the gate:

- Versioned prompt registry: `lib/prompt-registry.ts`
- Interview Prep knowledge base reuse: `lib/interview-prep-knowledge.ts`
- Fulfillment job runner: `lib/answerbrief-fulfillment.ts`
- Package composer and QA validator: `lib/brief.ts`
- Order lifecycle integration: `lib/orders.ts`
- Synthetic journey verification: `/api/admin/storage-diagnostics?journey=1`

Do not mark the service fully automated unless the protected diagnostics journey passes in production with configured Supabase, Stripe webhook, Resend, and Google Drive OAuth.

## Required automated modules

- Resume Analyzer
- Job Description Analyzer
- Resume-to-Role Alignment Engine
- Company and Role Research Engine
- Interview Question Generator
- STAR Story Builder
- Strength and Risk Analyzer
- Interview Strategy Generator
- Executive Summary Generator
- AnswerBrief Composer
- QA Validator

## Prompt registry requirements

Each prompt record includes:

- prompt ID
- version
- purpose
- product/package scope
- input schema
- output schema
- model configuration
- dependencies
- change history
- active/inactive status

The registry is intentionally centralized so prompt and methodology changes can be versioned without rewriting the customer app.

## Synthetic end-to-end pass criteria

The protected diagnostics journey must prove:

- payment/order creation
- intake completion
- file retrieval or upload handling
- automatic fulfillment trigger
- Interview Prep knowledge reuse
- deliverable generation
- QA validation
- durable storage
- customer portal/admin visibility
- customer email
- owner notification
- workflow event logging
- retry behavior
- synthetic data cleanup

If any item fails, the gate is failed and AnswerBrief AI must not be reported as fully automated.

## Known limitations

- The first release uses deterministic, registry-driven generation. If `OPENAI_API_KEY` is later connected for model calls, the same registry should remain the source of truth.
- PDF/DOCX generation is not part of this release; final deliverables are Markdown uploaded to the configured secure Drive workspace.
- Company research is generated as targeted research guidance unless live research is explicitly authorized and implemented.
